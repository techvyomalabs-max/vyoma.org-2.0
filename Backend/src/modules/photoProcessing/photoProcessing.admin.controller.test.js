// Regression coverage for photoProcessing.admin.controller.js: the
// media:write permission boundary on both routes, the local-dev-only
// 503 gate, sourceUrl validation, the GET /:id job-view shape/404/422
// handling, and the full enqueue -> async worker -> terminal-status
// lifecycle for a successful 202 enqueue.
//
// The one enqueue-success test that lets the real background worker
// (backgroundRemoval.service.js's workLoop) run never reaches any real
// external host: env.port is temporarily pointed at this test's own
// already-running disposable server (the same one setupTestEnv() already
// started), and the sourceUrl uses assertSafeSourceUrl's explicit
// "localhost + env.port + /local-media/" dev-host allowance, which skips
// DNS entirely. The worker's subsequent fetch lands on our own test
// server's real (but file-less) /local-media/processed static route,
// resolving deterministically to a 404 -> job marked 'failed' -- no real
// network/DNS call ever happens, and the test polls (never sleeps a fixed
// duration) until that settles before moving on, so MongoMemoryServer is
// never torn down while the background worker might still be writing to it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { PhotoProcessingJobModel } from './photoProcessingJob.model.js';
import { env } from '../../config/env.js';
import { assertSafeSourceUrl } from './backgroundRemoval.service.js';
import { enqueuePhotoProcessing } from './photoProcessing.admin.controller.js';
import { ApiError } from '../../utils/apiResponse.js';

// --- Direct unit coverage of the fix itself: assertSafeSourceUrl() must
// throw real ApiError instances, not plain Error objects decorated with
// .status/.code properties -- that mismatch is exactly what made
// errorHandler.js's `err instanceof ApiError` check miss these and fall
// back to a generic 500 (see the HTTP-level regression tests further below
// for the end-to-end confirmation of the fix). No HTTP/DB involved here. ---

test('assertSafeSourceUrl throws an ApiError (422 VALIDATION_ERROR) for a malformed URL', async () => {
  await assert.rejects(() => assertSafeSourceUrl('not a valid url'), (err) => {
    assert.ok(err instanceof ApiError, 'expected an ApiError instance, not a plain decorated Error');
    assert.equal(err.status, 422);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
});

test('assertSafeSourceUrl throws an ApiError (422 VALIDATION_ERROR) for a non-http(s) protocol', async () => {
  await assert.rejects(() => assertSafeSourceUrl('ftp://vyoma.org/image.png'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
});

test('assertSafeSourceUrl throws an ApiError (422 UNTRUSTED_HOST) for a disallowed hostname', async () => {
  await assert.rejects(() => assertSafeSourceUrl('https://evil.example.com/image.png'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 422);
    assert.equal(err.code, 'UNTRUSTED_HOST');
    return true;
  });
});

// Note: a "resolves for an allowed host" happy-path test is deliberately not
// included here -- for any non-local-dev-host, assertSafeSourceUrl() performs
// a real dns.lookup() as its DNS-rebinding guard (see backgroundRemoval.
// service.js), which would be a real external network call. The localhost
// dev-host path (which skips DNS) is already covered end-to-end by the
// enqueue-success test further below.

let env_;
let adminRole; // seeded 'admin' role already has media:write
let noMediaPermsRole;

before(async () => {
  env_ = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noMediaPermsRole = await RoleModel.create({
    key: 'no_media_perms_role_photoproc',
    name: 'No Media Perms (photo processing test)',
    permissions: ['content:read', 'content:write'],
    mfaRequired: false,
  });
});

after(async () => {
  await teardownTestEnv(env_);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function enqueue(token, body) {
  const res = await fetch(`${env_.baseUrl}/api/v1/admin/photo-processing`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => null);
  return { res, body: json };
}

async function getStatus(token, id) {
  const res = await fetch(`${env_.baseUrl}/api/v1/admin/photo-processing/${id}`, { headers: authHeader(token) });
  const json = await res.json().catch(() => null);
  return { res, body: json };
}

function withNodeEnv(value, fn) {
  const backup = env.nodeEnv;
  env.nodeEnv = value;
  return fn().finally(() => {
    env.nodeEnv = backup;
  });
}

// --- POST /admin/photo-processing: auth/permission boundary ---

test('POST /admin/photo-processing is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await enqueue(undefined, { sourceUrl: 'https://vyoma.org/x.png' });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('POST /admin/photo-processing is rejected with 403 for a role without media:write', async () => {
  const user = await createTestUser({ email: 'photoproc-post-noperm@example.test', roleKey: 'no_media_perms_role_photoproc' });
  const token = signAccessToken(user, noMediaPermsRole);
  const { res, body } = await enqueue(token, { sourceUrl: 'https://vyoma.org/x.png' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- Storage-availability gate (Task 7D.2: dev OR S3-configured, not dev-only) ---

function withS3Config(overrides, fn) {
  const backup = { ...env.s3 };
  Object.assign(env.s3, overrides);
  return fn().finally(() => {
    Object.assign(env.s3, backup);
  });
}

// QA Bug 7 Stage C follow-up: this file never otherwise touches
// env.backendPublicUrl, so it stays at its real process.env.BACKEND_PUBLIC_URL
// value (unset in this test environment) unless a test explicitly overrides
// it -- exactly like withS3Config/withNodeEnv above, always restored on exit.
function withBackendPublicUrl(value, fn) {
  const backup = env.backendPublicUrl;
  env.backendPublicUrl = value;
  return fn().finally(() => {
    env.backendPublicUrl = backup;
  });
}

// QA Bug 7 Stage C: this test used to expect 503 here, because at the time
// dev OR S3-configured were the only two recognized storage paths. Since
// Stage C added a third path (Mongo-backed persistent storage,
// isMongoProcessedImageStorageAllowed() in backgroundRemoval.service.js),
// and this file's own setupTestEnv() keeps a real, connected
// mongodb-memory-server for the whole suite, that third path is genuinely
// available here even with dev off and S3 unconfigured -- so 503 is no
// longer the correct outcome for this exact combination. Updated to expect
// the now-correct 202, using the same env.port + waitForJobSettled pattern
// already proven by the "S3 looks configured" test directly below (no real
// external network access).
//
// QA Bug 7 Stage C follow-up: the gate now uses isMongoProcessedImageStorageReady()
// (Mongo connected AND BACKEND_PUBLIC_URL set), not the narrower
// isMongoProcessedImageStorageAllowed() -- this test must therefore supply a
// valid test-only backendPublicUrl for the gate to let it through at all.
// Genuine "Mongo connected but public URL missing" and "nothing at all is
// available" coverage live in the two tests further below.
test('POST /admin/photo-processing is allowed past the gate outside local development when S3 is not configured but MongoDB storage is available (QA Bug 7 Stage C)', async () => {
  const user = await createTestUser({ email: 'photoproc-post-prod-mongo@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const testPort = new URL(env_.baseUrl).port;
  const portBackup = env.port;
  env.port = Number(testPort);

  try {
    await withNodeEnv('production', async () => {
      await withS3Config({ region: null, bucket: null, accessKeyId: null, secretAccessKey: null }, async () => {
        await withBackendPublicUrl('https://qa-backend.example.test', async () => {
          const sourceUrl = `http://localhost:${testPort}/local-media/processed/does-not-exist-7c-mongo.png`;
          const { res, body } = await enqueue(token, { sourceUrl });
          assert.equal(res.status, 202, 'the gate must allow this through once Mongo-backed storage is genuinely ready, even without S3');
          assert.equal(body.success, true);
          assert.equal(body.data.status, 'queued');

          // Let the background worker settle (deterministic 404 against our
          // own test server, no real external request) before this test (and
          // the eventual env.port/env.nodeEnv/env.s3/env.backendPublicUrl
          // restoration) proceeds.
          const settled = await waitForJobSettled(body.data.id);
          assert.equal(settled.status, 'failed');
          assert.match(settled.errorMessage, /Could not fetch the source image/);
        });
      });
    });
  } finally {
    env.port = portBackup;
  }
});

// QA Bug 7 Stage C follow-up: Mongo is connected (the only recognized path
// here -- dev off, S3 unconfigured) but BACKEND_PUBLIC_URL is missing, so the
// job is already known to be unable to ever succeed. The upfront gate must
// now reject it immediately with 503, before a job row is even created --
// not accept it and let it fail asynchronously once the worker runs.
test('POST /admin/photo-processing returns 503 BACKGROUND_REMOVAL_NOT_CONFIGURED when Mongo is connected but BACKEND_PUBLIC_URL is missing and no other storage is available', async () => {
  const user = await createTestUser({ email: 'photoproc-post-prod-mongo-no-url@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  await withNodeEnv('production', async () => {
    await withS3Config({ region: null, bucket: null, accessKeyId: null, secretAccessKey: null }, async () => {
      await withBackendPublicUrl(null, async () => {
        const before = await PhotoProcessingJobModel.countDocuments({});
        const { res, body } = await enqueue(token, { sourceUrl: 'https://vyoma.org/x.png' });
        assert.equal(res.status, 503);
        assert.equal(body.code, 'BACKGROUND_REMOVAL_NOT_CONFIGURED');
        assert.equal(
          await PhotoProcessingJobModel.countDocuments({}),
          before,
          'a job that is already known to be unable to succeed must never be created'
        );
      });
    });
  });
});

// QA Bug 7 Stage C: genuine "no usable storage backend at all" 503 coverage.
//
// A true "dev off AND S3 unconfigured AND Mongo disconnected" state cannot
// be safely produced through the full HTTP stack in this file: requireAuth's
// own DB check (UserModel.exists -- see middleware/requireAuth.js) shares
// this file's one real mongodb-memory-server connection, so disconnecting it
// would also break authentication before the request ever reached this
// controller's own gate -- turning the test into a 401 (or a flaky
// buffered-query wait), never a clean 503. Calling enqueuePhotoProcessing()
// directly -- the same direct-function-call technique already used above for
// assertSafeSourceUrl -- exercises the real gate logic with no auth layer in
// the way, so the disconnect-then-reconnect-in-`finally` pattern already
// proven safe in backgroundRemoval.worker.test.js can be reused here without
// risking any other test in this file.
test('enqueuePhotoProcessing() rejects with a real 503 BACKGROUND_REMOVAL_NOT_CONFIGURED ApiError when dev, S3, and MongoDB storage are all unavailable', async () => {
  await withNodeEnv('production', async () => {
    await withS3Config({ region: null, bucket: null, accessKeyId: null, secretAccessKey: null }, async () => {
      await mongoose.disconnect();
      try {
        const fakeReq = { body: { sourceUrl: 'https://vyoma.org/x.png' }, user: { id: 'fake-user-id', email: 'fake@example.test' } };
        let capturedErr;
        await enqueuePhotoProcessing(fakeReq, {}, (err) => { capturedErr = err; });

        assert.ok(capturedErr instanceof ApiError, 'expected a real ApiError instance, not a generic Error');
        assert.equal(capturedErr.status, 503);
        assert.equal(capturedErr.code, 'BACKGROUND_REMOVAL_NOT_CONFIGURED');
      } finally {
        await mongoose.connect(env_.mem.getUri());
      }
    });
  });
});

// Task 7D.2: the gate itself must let the request through once S3 looks
// configured, even in production -- proven here WITHOUT ever attempting a
// real S3 upload, AWS network call, or any other real external network
// call. `sourceUrl` deliberately uses the exact same safe pattern the
// full-lifecycle success test further below relies on: localhost + this
// test's own already-running disposable server's port +
// "/local-media/..." (assertSafeSourceUrl's explicit dev-host allowance,
// which skips its DNS-rebinding lookup entirely) pointed at a file that
// does not exist. The async worker therefore fails deterministically at
// the "fetch source image" step (a 404 from our own test server) --
// never reaching persistProcessedImage()'s S3 upload at all -- so this
// proves only the gate's behavior, not a real upload, with zero risk of
// any real AWS or external network access.
test('POST /admin/photo-processing is allowed past the gate in production once S3 looks configured (no real AWS or external network access)', async () => {
  const user = await createTestUser({ email: 'photoproc-post-prod-s3@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const testPort = new URL(env_.baseUrl).port;
  const portBackup = env.port;
  env.port = Number(testPort);

  try {
    await withNodeEnv('production', async () => {
      await withS3Config({ region: 'ap-south-1', bucket: 'fake-test-bucket', accessKeyId: 'fake', secretAccessKey: 'fake' }, async () => {
        const sourceUrl = `http://localhost:${testPort}/local-media/processed/does-not-exist-7d2.png`;
        const { res, body } = await enqueue(token, { sourceUrl });
        assert.equal(res.status, 202, 'the gate must allow this through once S3 looks configured, even in production');
        assert.equal(body.success, true);
        assert.equal(body.data.status, 'queued');

        // Let the background worker settle (deterministic 404 against our
        // own test server, no real external request) before this test (and
        // the eventual env.port/env.nodeEnv/env.s3 restoration) proceeds.
        const settled = await waitForJobSettled(body.data.id);
        assert.equal(settled.status, 'failed');
        assert.match(settled.errorMessage, /Could not fetch the source image/);
      });
    });
  } finally {
    env.port = portBackup;
  }
});

// --- sourceUrl validation ---

test('POST /admin/photo-processing rejects a missing sourceUrl with 422', async () => {
  const user = await createTestUser({ email: 'photoproc-post-missing-url@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await enqueue(token, {});
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.fieldErrors.sourceUrl, 'Required.');
});

test('POST /admin/photo-processing rejects a whitespace-only sourceUrl with 422', async () => {
  const user = await createTestUser({ email: 'photoproc-post-blank-url@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await enqueue(token, { sourceUrl: '   ' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

// These three never reach a DNS lookup or network call at all: each is
// rejected by assertSafeSourceUrl() synchronously, before enqueueJob() ever
// creates a job row. Regression coverage for the fixed bug (Phase 1 Task 1
// follow-up): assertSafeSourceUrl() used to throw a plain Error decorated
// with .status/.code properties, which errorHandler.js's `instanceof
// ApiError` check didn't recognize, so every one of these returned a generic
// 500 INTERNAL_ERROR instead of its intended 422 code. Now that
// assertSafeSourceUrl() throws real ApiError instances, all three must
// return their intended status/code.
test('POST /admin/photo-processing rejects an invalid sourceUrl with 422 VALIDATION_ERROR, not a generic 500', async () => {
  const user = await createTestUser({ email: 'photoproc-post-invalid-url@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await PhotoProcessingJobModel.countDocuments({});

  const { res, body } = await enqueue(token, { sourceUrl: 'not a valid url' });
  assert.equal(await PhotoProcessingJobModel.countDocuments({}), before, 'an invalid-URL rejection must never create a job row');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.success, false);
});

test('POST /admin/photo-processing rejects an unsupported protocol with 422 VALIDATION_ERROR, not a generic 500', async () => {
  const user = await createTestUser({ email: 'photoproc-post-bad-protocol@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await PhotoProcessingJobModel.countDocuments({});

  const { res, body } = await enqueue(token, { sourceUrl: 'ftp://vyoma.org/image.png' });
  assert.equal(await PhotoProcessingJobModel.countDocuments({}), before, 'an unsupported-protocol rejection must never create a job row');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(body.success, false);
});

test('POST /admin/photo-processing rejects a sourceUrl on an untrusted host with 422 UNTRUSTED_HOST, not a generic 500, and creates no job row', async () => {
  const user = await createTestUser({ email: 'photoproc-post-untrusted-host@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await PhotoProcessingJobModel.countDocuments({});

  const { res, body } = await enqueue(token, { sourceUrl: 'https://evil.example.com/image.png' });
  assert.equal(await PhotoProcessingJobModel.countDocuments({}), before, 'an untrusted-host rejection must never create a job row');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNTRUSTED_HOST');
  assert.equal(body.success, false);
});

// --- GET /admin/photo-processing/:id: auth/permission boundary + shape ---

test('GET /admin/photo-processing/:id is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await getStatus(undefined, new mongoose.Types.ObjectId().toString());
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/photo-processing/:id is rejected with 403 for a role without media:write', async () => {
  const user = await createTestUser({ email: 'photoproc-get-noperm@example.test', roleKey: 'no_media_perms_role_photoproc' });
  const token = signAccessToken(user, noMediaPermsRole);
  const { res, body } = await getStatus(token, new mongoose.Types.ObjectId().toString());
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('GET /admin/photo-processing/:id rejects a malformed id with 422', async () => {
  const user = await createTestUser({ email: 'photoproc-get-bad-id@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await getStatus(token, 'not-an-object-id');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/photo-processing/:id returns 404 for a well-formed id that does not exist', async () => {
  const user = await createTestUser({ email: 'photoproc-get-missing@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await getStatus(token, new mongoose.Types.ObjectId().toString());
  assert.equal(res.status, 404);
  assert.equal(body.code, 'JOB_NOT_FOUND');
});

test('GET /admin/photo-processing/:id returns the full job-view shape for an existing job', async () => {
  const user = await createTestUser({ email: 'photoproc-get-shape@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const job = await PhotoProcessingJobModel.create({
    sourceUrl: 'https://vyoma.org/leadership/jane-doe.jpg',
    status: 'done',
    resultUrl: 'http://localhost:4000/local-media/processed/result.png',
    createdBy: new mongoose.Types.ObjectId(),
    createdByEmail: 'creator@example.test',
  });

  const { res, body } = await getStatus(token, job._id.toString());
  assert.equal(res.status, 200);
  assert.deepEqual(body.data, {
    id: job._id.toString(),
    status: 'done',
    sourceUrl: 'https://vyoma.org/leadership/jane-doe.jpg',
    resultUrl: 'http://localhost:4000/local-media/processed/result.png',
    errorMessage: null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
});

test('GET /admin/photo-processing/:id surfaces a failed job\'s errorMessage', async () => {
  const user = await createTestUser({ email: 'photoproc-get-failed@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const job = await PhotoProcessingJobModel.create({
    sourceUrl: 'https://vyoma.org/leadership/broken.jpg',
    status: 'failed',
    errorMessage: 'Could not fetch the source image (HTTP 404).',
    createdBy: new mongoose.Types.ObjectId(),
    createdByEmail: 'creator@example.test',
  });

  const { res, body } = await getStatus(token, job._id.toString());
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'failed');
  assert.equal(body.data.errorMessage, 'Could not fetch the source image (HTTP 404).');
  assert.equal(body.data.resultUrl, null);
});

// --- Full enqueue -> background worker -> terminal status lifecycle ---

async function waitForJobSettled(jobId, { timeoutMs = 10000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await PhotoProcessingJobModel.findById(jobId);
    if (job && job.status !== 'queued' && job.status !== 'processing') return job;
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for photo-processing job ${jobId} to leave 'queued'/'processing'.`);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

test('POST /admin/photo-processing enqueues a job, returns 202 immediately, and records an audit entry', async () => {
  const user = await createTestUser({ email: 'photoproc-post-success@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  // Point env.port at this test's own already-running disposable server, so
  // assertSafeSourceUrl()'s local-dev-host allowance (localhost + env.port +
  // "/local-media/") matches it exactly -- see file header for why this is
  // the only safe way to exercise the real success path with no DNS/real
  // external request at all.
  const testPort = new URL(env_.baseUrl).port;
  const portBackup = env.port;
  env.port = Number(testPort);

  try {
    const before = await AuditLogModel.countDocuments({ action: 'photoProcessing.enqueued' });
    const sourceUrl = `http://localhost:${testPort}/local-media/processed/does-not-exist.png`;

    const { res, body } = await enqueue(token, { sourceUrl });
    assert.equal(res.status, 202);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'queued');
    assert.equal(body.data.sourceUrl, sourceUrl);
    assert.equal(body.data.resultUrl, null);
    assert.ok(body.data.id);

    const stored = await PhotoProcessingJobModel.findById(body.data.id);
    assert.ok(stored, 'the job must be persisted immediately, before the background worker runs');
    assert.equal(stored.createdByEmail, user.email);

    const logs = await AuditLogModel.find({ action: 'photoProcessing.enqueued' }).sort({ createdAt: -1 });
    assert.equal(logs.length, before + 1);
    assert.equal(logs[0].actorEmail, user.email);
    assert.equal(logs[0].targetType, 'PhotoProcessingJob');
    assert.equal(logs[0].targetId, body.data.id);
    assert.equal(logs[0].details.sourceUrl, sourceUrl);

    // Let the background worker settle (it will fail -- the referenced file
    // does not exist -- deterministically, against our own test server, with
    // no real external request) before this test (and later teardown) proceeds.
    const settled = await waitForJobSettled(body.data.id);
    assert.equal(settled.status, 'failed');
    assert.match(settled.errorMessage, /Could not fetch the source image/);
  } finally {
    env.port = portBackup;
  }
});
