// Regression coverage for the concurrency guard on POST /api/v1/admin/media
// (a different axis from media.rateLimiting.test.js's 60-per-15-minute
// limiter: this one bounds how many uploads can be buffering a file in
// memory AT THE SAME MOMENT).
//
// Three complementary strategies:
// 1. Unit tests calling the real `makeConcurrencyLimiter` middleware
//    function directly against hand-built req/res objects -- the only
//    reliable way to prove idempotent release and fail-safe keyGenerator
//    behavior without depending on real HTTP/event-loop timing at all.
// 2. Behavioral tests against a minimal standalone Express app, using
//    deferred promises (not fixed sleep durations) as explicit
//    synchronization barriers: a request "arrives" at the dummy handler
//    only once it has genuinely acquired a slot, and stays held open until
//    the test explicitly releases it -- this makes multi-request overlap
//    deterministic instead of timing-dependent.
// 3. Source-assertion tests pinning the real production wiring in
//    media.admin.routes.js, plus one sequential (never-concurrent, so the
//    new guard never engages) regression test against the REAL admin media
//    endpoint confirming mediaUploadLimiter's existing 429 behavior is
//    unchanged by the new guard sitting next to it in the chain.
//
// S3 is deliberately left unconfigured throughout (no AWS_* env vars are
// set anywhere in this file) -- no real AWS call is ever made, and the one
// real-endpoint test here never reaches persistent MongoDB writes either
// (it reaches the pre-existing 503 MEDIA_NOT_CONFIGURED stage, exactly as
// in media.admin.upload.test.js).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { makeConcurrencyLimiter } from '../../middleware/concurrencyLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- 1. Unit tests: direct middleware invocation, no HTTP, no timing ---

test('calling the released slot\'s callback twice does not corrupt the counters (idempotent release)', () => {
  const limiter = makeConcurrencyLimiter({ perUserMax: 1, globalMax: 1, keyGenerator: () => 'user-1' });

  let closeCallback;
  let firstNextCalled = false;
  limiter({}, { once: (event, cb) => { if (event === 'close') closeCallback = cb; } }, () => {
    firstNextCalled = true;
  });
  assert.equal(firstNextCalled, true, 'the first request should acquire the single slot and proceed');
  assert.equal(typeof closeCallback, 'function');

  // While the slot is held, a second request must be rejected.
  const res2 = { status() { return this; }, json(body) { this.body = body; return this; } };
  limiter({}, res2, () => assert.fail('second request must not reach next() while capacity is exhausted'));
  assert.equal(res2.body.code, 'UPLOAD_CAPACITY_EXCEEDED');
  assert.equal(res2.body.success, false);

  // Release the one held slot TWICE.
  closeCallback();
  closeCallback();

  // A third request should now succeed exactly once (capacity restored to
  // 1, not 2 or negative).
  let thirdNextCalled = false;
  limiter({}, { once() {} }, () => { thirdNextCalled = true; });
  assert.equal(thirdNextCalled, true);

  // A fourth, concurrent with the third still held open, must still be
  // rejected -- proving the earlier double-release did not grant extra
  // phantom capacity.
  const res4 = { status() { return this; }, json(body) { this.body = body; return this; } };
  limiter({}, res4, () => assert.fail('fourth request must not reach next() -- capacity must still be exactly 1'));
  assert.equal(res4.body.code, 'UPLOAD_CAPACITY_EXCEEDED');
});

test('a keyGenerator that throws (missing/invalid user id) fails safely without consuming or corrupting capacity', () => {
  let shouldThrow = true;
  const keyGenerator = () => {
    if (shouldThrow) throw new Error('boom: missing user id');
    return 'user-1';
  };
  const limiter = makeConcurrencyLimiter({ perUserMax: 1, globalMax: 1, keyGenerator });

  assert.throws(() => limiter({}, { once() {} }, () => {}), /boom: missing user id/);

  // The failed attempt happened before tryAcquire ever ran, so it must not
  // have consumed any capacity.
  shouldThrow = false;
  let nextCalled = false;
  limiter({}, { once() {} }, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'capacity must be fully available -- a keyGenerator failure must never touch the counters');
});

test('per-user counter entries are removed once a user\'s active count reaches zero (no stale entries)', () => {
  const limiter = makeConcurrencyLimiter({ perUserMax: 1, globalMax: 20, keyGenerator: () => 'user-1' });

  let closeCallback;
  limiter({}, { once: (event, cb) => { closeCallback = cb; } }, () => {});
  closeCallback(); // back to 0 for user-1

  // Must be able to acquire again immediately -- proves no stale leftover
  // state (e.g. a count stuck above 0) was left behind for this key.
  let nextCalled = false;
  limiter({}, { once() {} }, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

// --- 2. Behavioral tests: minimal standalone app, deferred-promise barriers ---

function startTestApp({ perUserMax, globalMax, keyGenerator }) {
  const app = express();
  const limiter = makeConcurrencyLimiter({ perUserMax, globalMax, keyGenerator });

  let arrivedCount = 0;
  const waiters = []; // { count, resolve }
  const held = []; // completion callbacks for currently-parked requests

  app.post('/upload', limiter, (req, res) => {
    arrivedCount += 1;
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (arrivedCount >= waiters[i].count) {
        waiters[i].resolve();
        waiters.splice(i, 1);
      }
    }
    // Wrapped in try/catch: if this particular request was aborted by the
    // client before being released, the underlying connection is already
    // gone, and writing to it is harmless to no-op rather than letting an
    // exception escape this handler.
    held.push(() => {
      try {
        res.status(200).json({ success: true });
      } catch {
        /* connection already closed (client disconnected) -- nothing to do */
      }
    });
  });

  // Also exposes an error-response path, to test that a downstream error
  // (not just success) still releases the slot via the same 'close' hook.
  app.post('/upload-error', limiter, (req, res) => {
    arrivedCount += 1;
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (arrivedCount >= waiters[i].count) {
        waiters[i].resolve();
        waiters.splice(i, 1);
      }
    }
    held.push(() => {
      try {
        res.status(500).json({ success: false, code: 'SIMULATED_DOWNSTREAM_ERROR' });
      } catch {
        /* connection already closed (client disconnected) -- nothing to do */
      }
    });
  });

  function waitForArrivals(count) {
    if (arrivedCount >= count) return Promise.resolve();
    return new Promise((resolve) => waiters.push({ count, resolve }));
  }

  function releaseOne() {
    const fn = held.shift();
    if (fn) fn();
  }

  function releaseAll() {
    while (held.length) releaseOne();
  }

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, waitForArrivals, releaseOne, releaseAll });
    });
  });
}

test('up to 3 simultaneous uploads from one user are accepted; the 4th is rejected with 503', async () => {
  const { server, baseUrl, waitForArrivals, releaseAll } = await startTestApp({
    perUserMax: 3,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const p1 = fetch(`${baseUrl}/upload`, { method: 'POST' });
    const p2 = fetch(`${baseUrl}/upload`, { method: 'POST' });
    const p3 = fetch(`${baseUrl}/upload`, { method: 'POST' });
    await waitForArrivals(3); // deterministic: all three genuinely hold a slot now

    const fourth = await fetch(`${baseUrl}/upload`, { method: 'POST' });
    assert.equal(fourth.status, 503);
    assert.deepEqual(await fourth.json(), {
      success: false,
      code: 'UPLOAD_CAPACITY_EXCEEDED',
      message: 'Upload capacity is temporarily unavailable. Please try again shortly.',
    });

    releaseAll();
    const results = await Promise.all([p1, p2, p3]);
    for (const r of results) assert.equal(r.status, 200);
  } finally {
    server.close();
  }
});

test('up to 20 simultaneous uploads globally are accepted (shared across different users); the 21st is rejected with 503', async () => {
  const { server, baseUrl, waitForArrivals, releaseAll } = await startTestApp({
    perUserMax: 100, // high enough that no single user's own limit is the binding constraint here
    globalMax: 20,
    keyGenerator: (req) => req.headers['x-test-user'],
  });
  try {
    const pending = [];
    for (let i = 0; i < 20; i += 1) {
      pending.push(fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': `user-${i}` } }));
    }
    await waitForArrivals(20);

    const overflow = await fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': 'user-overflow' } });
    assert.equal(overflow.status, 503);

    releaseAll();
    const results = await Promise.all(pending);
    for (const r of results) assert.equal(r.status, 200);
  } finally {
    server.close();
  }
});

test('different users have independent per-user quotas, while sharing the same global capacity pool', async () => {
  const { server, baseUrl, waitForArrivals, releaseAll } = await startTestApp({
    perUserMax: 2,
    globalMax: 20,
    keyGenerator: (req) => req.headers['x-test-user'],
  });
  try {
    const a1 = fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': 'userA' } });
    const a2 = fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': 'userA' } });
    await waitForArrivals(2);

    const aThird = await fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': 'userA' } });
    assert.equal(aThird.status, 503, 'userA should be at their own per-user limit of 2');

    const bFirst = fetch(`${baseUrl}/upload`, { method: 'POST', headers: { 'x-test-user': 'userB' } });
    await waitForArrivals(3);

    releaseAll();
    const [r1, r2, rB] = await Promise.all([a1, a2, bFirst]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(rB.status, 200, 'userB must be unaffected by userA independently exhausting their own per-user quota');
  } finally {
    server.close();
  }
});

test('a slot is released after a successful response, freeing it for a new request', async () => {
  const { server, baseUrl, waitForArrivals, releaseOne } = await startTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const first = fetch(`${baseUrl}/upload`, { method: 'POST' });
    await waitForArrivals(1);

    const blocked = await fetch(`${baseUrl}/upload`, { method: 'POST' });
    assert.equal(blocked.status, 503);

    releaseOne();
    const firstResult = await first;
    assert.equal(firstResult.status, 200);

    // A second request arriving (acquiring the slot) is itself the
    // deterministic proof that the slot was freed -- waitForArrivals only
    // resolves once this actually happens, no timing guess involved.
    const second = fetch(`${baseUrl}/upload`, { method: 'POST' });
    await waitForArrivals(2);
    releaseOne();
    const secondResult = await second;
    assert.equal(secondResult.status, 200, 'the slot must be released after a successful completion, not leaked');
  } finally {
    server.close();
  }
});

test('a slot is released after the downstream handler responds with an error', async () => {
  const { server, baseUrl, waitForArrivals, releaseOne } = await startTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const first = fetch(`${baseUrl}/upload-error`, { method: 'POST' });
    await waitForArrivals(1);

    releaseOne(); // completes the held request with a simulated 500
    const firstResult = await first;
    assert.equal(firstResult.status, 500);

    const second = fetch(`${baseUrl}/upload`, { method: 'POST' });
    await waitForArrivals(2); // only resolves once the slot was actually freed
    releaseOne();
    const secondResult = await second;
    assert.equal(secondResult.status, 200, 'the slot must be released after a downstream error, not leaked');
  } finally {
    server.close();
  }
});

// This dummy handler never calls req.takeUploadSlotOwnership() (see section
// 2b below for that), so it represents a disconnect BEFORE any handler ever
// takes ownership of the slot -- equivalent to a client disconnecting while
// Multer is still reading the multipart body, before createMedia ever runs.
// The guard's own pre-ownership 'close' safety net must release it in this
// case, since no further downstream work survives it.
test('an aborted request (client disconnect before any handler takes ownership) releases its slot, preventing a leak', async () => {
  const { server, baseUrl, waitForArrivals, releaseAll } = await startTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const controller = new AbortController();
    const aborted = fetch(`${baseUrl}/upload`, { method: 'POST', signal: controller.signal }).catch(() => null);
    await waitForArrivals(1); // the request reached the handler and genuinely holds the one slot

    controller.abort(); // simulate a client disconnect -- the handler is never explicitly resolved
    await aborted;

    // A new request successfully arriving (acquiring the now-sole slot) is
    // the deterministic proof that the aborted request's slot was released,
    // not leaked -- this would hang forever (never resolve) if it were.
    const after = fetch(`${baseUrl}/upload`, { method: 'POST' });
    await waitForArrivals(2);
    releaseAll(); // completes whichever entries are still live in `held`
    const afterResult = await after;
    assert.equal(afterResult.status, 200, 'the slot held by the aborted request must be released, not leaked');
  } finally {
    server.close();
  }
});

// --- 2b. Ownership-handoff tests: a second minimal app whose handlers
// mirror createMedia's actual shape (req.takeUploadSlotOwnership() as the
// first synchronous statement, real work in a try, release in a finally) --
// this is what proves the fix for the confirmed bug: a client disconnect
// while real downstream work (S3/Mongo-equivalent) is still active must NOT
// release the slot early.

function startOwnershipAwareTestApp({ perUserMax, globalMax, keyGenerator }) {
  const app = express();
  const limiter = makeConcurrencyLimiter({ perUserMax, globalMax, keyGenerator });

  let arrivedCount = 0; // counts requests that reached the controller and took ownership
  const waiters = []; // { count, resolve }
  const heldDownstream = []; // settle functions for currently-held simulated S3/Mongo work

  function notifyArrival() {
    arrivedCount += 1;
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (arrivedCount >= waiters[i].count) {
        waiters[i].resolve();
        waiters.splice(i, 1);
      }
    }
  }

  // Mirrors createMedia exactly: takes ownership synchronously (before any
  // await), awaits a test-controlled "downstream operation" standing in for
  // uploadObject()/MediaModel.create(), and releases in a finally --
  // regardless of whether the client is still connected to see the result.
  app.post('/controller-success', limiter, async (req, res) => {
    req.takeUploadSlotOwnership();
    try {
      await new Promise((resolve) => {
        heldDownstream.push({ resolve });
        notifyArrival();
      });
      try {
        res.status(201).json({ success: true });
      } catch {
        /* client already disconnected -- nothing to do */
      }
    } finally {
      req.releaseUploadSlot();
    }
  });

  // Same shape, but the simulated downstream operation REJECTS (standing in
  // for an S3 or MongoDB failure) instead of resolving.
  app.post('/controller-downstream-error', limiter, async (req, res) => {
    req.takeUploadSlotOwnership();
    try {
      try {
        await new Promise((resolve, reject) => {
          heldDownstream.push({ reject });
          notifyArrival();
        });
      } catch {
        res.status(500).json({ success: false, code: 'SIMULATED_DOWNSTREAM_ERROR' });
      }
    } finally {
      req.releaseUploadSlot();
    }
  });

  // Takes ownership, then fails synchronously (mirrors createMedia's own
  // !req.file / ALLOWED_MIME / matchesDeclaredFileType checks, which all
  // throw before any `await`) -- no held promise involved at all.
  app.post('/controller-sync-validation-error', limiter, (req, res) => {
    req.takeUploadSlotOwnership();
    try {
      throw new Error('simulated synchronous validation error');
    } catch {
      res.status(422).json({ success: false, code: 'SIMULATED_VALIDATION_ERROR' });
    } finally {
      req.releaseUploadSlot();
    }
  });

  // Never calls req.takeUploadSlotOwnership() at all -- mirrors a Multer-
  // style failure (oversized file, malformed multipart) that ends the
  // request before createMedia is ever reached. The guard's own
  // pre-ownership 'close' safety net is what must release this slot.
  app.post('/pre-controller-error', limiter, (req, res) => {
    res.status(422).json({ success: false, code: 'SIMULATED_MULTER_ERROR' });
  });

  function waitForArrivals(count) {
    if (arrivedCount >= count) return Promise.resolve();
    return new Promise((resolve) => waiters.push({ count, resolve }));
  }

  function resolveDownstream() {
    const entry = heldDownstream.shift();
    if (entry?.resolve) entry.resolve();
  }

  function rejectDownstream() {
    const entry = heldDownstream.shift();
    if (entry?.reject) entry.reject(new Error('simulated downstream failure'));
  }

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, waitForArrivals, resolveDownstream, rejectDownstream });
    });
  });
}

// This is the exact scenario confirmed as a bug during final security review
// and the direct reproduction of the fix, following the task's prescribed
// steps a-i precisely.
test('BUG FIX VERIFICATION: a client disconnect during active downstream work does not release the slot prematurely', async () => {
  const { server, baseUrl, waitForArrivals, resolveDownstream } = await startOwnershipAwareTestApp({
    perUserMax: 1,
    globalMax: 1,
    keyGenerator: () => 'user-1',
  });
  try {
    // a. Start an upload that enters the controller.
    const controller = new AbortController();
    const first = fetch(`${baseUrl}/controller-success`, { method: 'POST', signal: controller.signal }).catch(() => null);
    // b. Hold a simulated downstream S3 operation open -- waitForArrivals
    // only resolves once the controller has taken ownership and is awaiting it.
    await waitForArrivals(1);

    // c. Disconnect the client.
    controller.abort();
    await first;

    // d./e. Attempt another upload that would exceed capacity (globalMax: 1,
    // already held by the disconnected request's still-active downstream work).
    const blocked = await fetch(`${baseUrl}/controller-success`, { method: 'POST' });
    // f. Confirm it is rejected with 503 -- the slot must still be occupied.
    assert.equal(blocked.status, 503, 'the slot must remain occupied while the orphaned request\'s downstream work is still active');
    assert.deepEqual(await blocked.json(), {
      success: false,
      code: 'UPLOAD_CAPACITY_EXCEEDED',
      message: 'Upload capacity is temporarily unavailable. Please try again shortly.',
    });

    // g. Release the simulated S3 operation.
    resolveDownstream();

    // h./i. Confirm the slot is then released and another upload can now
    // proceed -- proven deterministically: this only resolves once capacity
    // actually frees up, never by guessing a wait duration.
    const second = fetch(`${baseUrl}/controller-success`, { method: 'POST' });
    await waitForArrivals(2);
    resolveDownstream();
    const secondResult = await second;
    assert.equal(secondResult.status, 201);
  } finally {
    server.close();
  }
});

test('a slot is released after successful controller processing (ownership-aware)', async () => {
  const { server, baseUrl, waitForArrivals, resolveDownstream } = await startOwnershipAwareTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const first = fetch(`${baseUrl}/controller-success`, { method: 'POST' });
    await waitForArrivals(1);
    resolveDownstream();
    const firstResult = await first;
    assert.equal(firstResult.status, 201);

    const second = fetch(`${baseUrl}/controller-success`, { method: 'POST' });
    await waitForArrivals(2);
    resolveDownstream();
    const secondResult = await second;
    assert.equal(secondResult.status, 201, 'the slot must be released after success, not leaked');
  } finally {
    server.close();
  }
});

test('a slot is released after a downstream (S3/Mongo-style) failure (ownership-aware)', async () => {
  const { server, baseUrl, waitForArrivals, rejectDownstream } = await startOwnershipAwareTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const first = fetch(`${baseUrl}/controller-downstream-error`, { method: 'POST' });
    await waitForArrivals(1);
    rejectDownstream();
    const firstResult = await first;
    assert.equal(firstResult.status, 500);

    const second = fetch(`${baseUrl}/controller-downstream-error`, { method: 'POST' });
    await waitForArrivals(2);
    rejectDownstream();
    const secondResult = await second;
    assert.equal(secondResult.status, 500); // still a simulated failure, but the slot itself was free to acquire
  } finally {
    server.close();
  }
});

test('a slot is released after a synchronous controller validation failure (ownership-aware)', async () => {
  const { server, baseUrl } = await startOwnershipAwareTestApp({
    perUserMax: 1,
    globalMax: 20,
    keyGenerator: () => 'user-1',
  });
  try {
    const first = await fetch(`${baseUrl}/controller-sync-validation-error`, { method: 'POST' });
    assert.equal(first.status, 422);

    // No held promise is involved here (the failure is synchronous), so the
    // slot is already free by the time this resolves -- a direct await is
    // sufficient and deterministic, no barrier needed.
    const second = await fetch(`${baseUrl}/controller-sync-validation-error`, { method: 'POST' });
    assert.equal(second.status, 422, 'the slot must be released after a synchronous validation failure, not leaked');
  } finally {
    server.close();
  }
});

test('repeated pre-controller failures never leak capacity (no cumulative leak when createMedia is never entered)', async () => {
  const { server, baseUrl } = await startOwnershipAwareTestApp({
    perUserMax: 100,
    globalMax: 5,
    keyGenerator: (req) => req.headers['x-test-user'],
  });
  try {
    // Each of these requests fails immediately via /pre-controller-error,
    // which never calls req.takeUploadSlotOwnership() and never holds a
    // slot open -- firing far more than globalMax of them sequentially (each
    // fully completing, including its slot's release, before the next
    // starts) would eventually saturate global capacity and start
    // returning 503 instead of 422 if any of them leaked their slot.
    for (let i = 0; i < 25; i += 1) {
      const res = await fetch(`${baseUrl}/pre-controller-error`, {
        method: 'POST',
        headers: { 'x-test-user': `user-${i}` },
      });
      assert.equal(res.status, 422, `request ${i + 1} should fail with its simulated error, not 503 from leaked capacity`);
    }

    // Capacity must still be fully available afterward.
    const healthy = await fetch(`${baseUrl}/controller-sync-validation-error`, {
      method: 'POST',
      headers: { 'x-test-user': 'final-check' },
    });
    assert.equal(healthy.status, 422, 'capacity must be fully intact after 25 pre-controller failures');
  } finally {
    server.close();
  }
});

// --- 3. Source assertions + one real-endpoint sequential regression check ---

const mediaRoutesSource = fs.readFileSync(path.join(__dirname, 'media.admin.routes.js'), 'utf8');

test('mediaUploadConcurrencyGuard is configured with the documented 3-per-user / 20-global limits', () => {
  assert.match(mediaRoutesSource, /const mediaUploadConcurrencyGuard = makeConcurrencyLimiter\(\{/);
  assert.match(mediaRoutesSource, /perUserMax:\s*3/);
  assert.match(mediaRoutesSource, /globalMax:\s*20/);
  assert.match(mediaRoutesSource, /keyGenerator:\s*mediaUploadRateLimitKey/);
});

test('the POST / route wires requirePermission -> mediaUploadLimiter -> mediaUploadConcurrencyGuard -> uploadMiddleware -> createMedia, in that order', () => {
  const match = mediaRoutesSource.match(/mediaAdminRouter\.post\(\s*'\/',([\s\S]*?)\);/);
  assert.ok(match, 'expected to find the POST / route registration');
  const args = match[1];
  const permIndex = args.indexOf('requirePermission');
  const rateIndex = args.indexOf('mediaUploadLimiter');
  const concurrencyIndex = args.indexOf('mediaUploadConcurrencyGuard');
  const uploadIndex = args.indexOf('uploadMiddleware');
  const createIndex = args.indexOf('createMedia');
  assert.ok(
    permIndex < rateIndex && rateIndex < concurrencyIndex && concurrencyIndex < uploadIndex && uploadIndex < createIndex,
    'expected order: requirePermission -> mediaUploadLimiter -> mediaUploadConcurrencyGuard -> uploadMiddleware -> createMedia'
  );
});

test('mediaUploadConcurrencyGuard is attached only to POST /, not to GET / or DELETE /:id', () => {
  const getLine = mediaRoutesSource.split('\n').find((l) => l.includes("mediaAdminRouter.get('/'"));
  const deleteLine = mediaRoutesSource.split('\n').find((l) => l.includes('mediaAdminRouter.delete('));
  assert.doesNotMatch(getLine, /mediaUploadConcurrencyGuard/);
  assert.doesNotMatch(deleteLine, /mediaUploadConcurrencyGuard/);
});

test('the existing 60-per-15-minute rate limit configuration is unchanged by this addition', () => {
  assert.match(mediaRoutesSource, /const mediaUploadLimiter = makeRateLimiter\(\{/);
  assert.match(mediaRoutesSource, /windowMs:\s*15 \* 60 \* 1000/);
  assert.match(mediaRoutesSource, /max:\s*60/);
});

// Real end-to-end check: sequential requests (never concurrent, so the new
// concurrency guard never engages at all) must still hit the pre-existing
// 429 behavior exactly as before -- proves the new guard sitting next to
// mediaUploadLimiter in the chain doesn't alter its behavior.
let env;
let adminRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);

async function uploadFile({ token, filename = 'test.png' } = {}) {
  const form = new FormData();
  form.set('file', new Blob([PNG_BYTES], { type: 'image/png' }), filename);
  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, { method: 'POST', headers: authHeader(token), body: form });
  const body = await res.json().catch(() => null);
  return { res, body };
}

test('sequential uploads (never overlapping) still trigger the existing 429 rate limit at request 61, unaffected by the new concurrency guard', async () => {
  const user = await createTestUser({ email: 'media-concurrency-ratelimit-unchanged@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  for (let i = 0; i < 60; i += 1) {
    const { res } = await uploadFile({ token, filename: `seq-${i}.png` });
    assert.equal(res.status, 503, `request ${i + 1} of 60 should reach the S3-unconfigured stage, not be blocked by either limiter`);
  }

  const { res, body } = await uploadFile({ token, filename: 'seq-61.png' });
  assert.equal(res.status, 429, 'the 61st sequential request must still be rate-limited exactly as before');
  assert.deepEqual(body, { success: false, code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
});

// Real end-to-end check for item 18's "oversized uploads" case specifically:
// a genuine Multer-rejected (413) request against the real app, confirming
// its slot is correctly released (never takes controller ownership, since
// createMedia is never reached) so a subsequent real upload from the same
// user is unaffected.
test('a real oversized upload (413, rejected by Multer before createMedia) releases its slot for a subsequent real upload', async () => {
  const user = await createTestUser({ email: 'media-concurrency-oversized@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const oversized = Buffer.alloc(16 * 1024 * 1024); // > the existing 15MB limit
  const form = new FormData();
  form.set('file', new Blob([oversized], { type: 'image/png' }), 'oversized.png');
  const oversizedRes = await fetch(`${env.baseUrl}/api/v1/admin/media`, { method: 'POST', headers: authHeader(token), body: form });
  assert.equal(oversizedRes.status, 413);

  const { res, body } = await uploadFile({ token, filename: 'after-oversized.png' });
  assert.equal(res.status, 503, 'a normal upload right after a Multer-rejected oversized one must not be blocked by a leaked slot');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});
