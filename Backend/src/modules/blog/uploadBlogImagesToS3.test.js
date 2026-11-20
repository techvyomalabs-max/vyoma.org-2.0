// Task 7F.8A — regression tests for the one-time S3 upload script
// (Backend/scripts/wordpress/import/uploadBlogImagesToS3.mjs). No real AWS
// connection or upload, and no real HTTP request, happens anywhere in this
// file: every network-shaped call goes through an injected, fully synthetic
// `s3Ops`/`fetchImpl`/`loadLocalImage`. The one test that DOES read real
// local files (file-inventory/signature reconfirmation) is read-only, skips
// cleanly when the gitignored manifest/assets are absent, and never touches
// the network either.
//
// Section 8b added in Task 7F.8C: regression tests for the conditional-write
// (IfNoneMatch: '*') race-protection hardening -- see that section and the
// "Task 7F.8C hardening" comment in uploadBlogImagesToS3.mjs itself.
//
// No database connection, no MongoDB, no real S3 object created, read, or
// deleted anywhere in this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  UPLOAD_STATE_PATH,
  PRODUCTION_URL_MAP_OUTPUT_PATH,
  buildBlogImageKey,
  assertSafeObjectKey,
  sha256Hex,
  planUploads,
  loadAndValidateLocalImage,
  loadUploadState,
  withRetries,
  verifyPubliclyRetrievable,
  runUploadPlan,
  buildProductionUrlRows,
  rollbackFailedUploads,
  createRealS3Ops,
} from '../../../scripts/wordpress/import/uploadBlogImagesToS3.mjs';
import { loadBlogImageManifest, MANIFEST_PATH } from '../../../scripts/wordpress/import/blogImageManifest.js';
import { isS3Configured } from '../../../src/config/env.js';

const manifestExists = fs.existsSync(MANIFEST_PATH);
const MANIFEST_SKIP = 'Backend/.local-media/blog-image-manifest.json is absent (gitignored) -- skipping; not a confirmation image mapping works.';

function noopSleep() {
  return Promise.resolve();
}

// Returns a loadLocalImage() stand-in whose sha256 is the REAL sha256Hex()
// of its own fake buffer -- runUploadPlan()'s verify step independently
// recomputes sha256Hex(readBackBuffer) and compares it against this value,
// so a fabricated/mismatched sha256 here would make verification fail for
// reasons unrelated to whatever the test is actually exercising.
function fakeLocalImage(label = 'fixed') {
  const buffer = Buffer.from(`fake-bytes-${label}`);
  return () => ({ ok: true, buffer, sha256: sha256Hex(buffer) });
}

const MOCK_BASE_URL = 'https://mock-bucket.s3.us-east-1.amazonaws.com/';

// A realistic, stateful, in-memory fake S3 -- modeling the real
// put/get/delete semantics this script actually depends on (an absent key
// reads back as `null`, a present key reads back exactly what was last
// written to it) rather than a grab-bag of one-off canned responses. This
// is what makes it possible to test the new preflight/overwrite-protection
// behavior precisely: the SAME store backs the preflight read, the
// post-upload verify read, and (via mockFetchFromStore below) the public
// fetch, exactly as a real bucket would.
//
// Task 7F.8C: putObject() also models S3's real IfNoneMatch: '*' semantics
// -- if `key` is already present in the store at PUT time (whether from an
// earlier call in the same test, or because a test deliberately writes into
// the store from inside a putObject override to simulate a concurrent
// process winning a race), it returns `{ conditionalConflict: true }`
// instead of silently overwriting, exactly like createRealS3Ops()'s real
// putObject() does on a live 412 from S3.
function createFakeS3({ putFailuresRemaining = {} } = {}) {
  const store = new Map(); // key -> Buffer
  const calls = { put: [], get: [], delete: [] };
  const remaining = { ...putFailuresRemaining };

  return {
    store,
    calls,
    async putObject({ key, buffer }) {
      calls.put.push(key);
      if ((remaining[key] || 0) > 0) {
        remaining[key] -= 1;
        throw new Error(`simulated transient S3 error for ${key}`);
      }
      if (store.has(key)) {
        return { conditionalConflict: true };
      }
      store.set(key, buffer);
      return { url: `${MOCK_BASE_URL}${key}` };
    },
    async getObject({ key }) {
      calls.get.push(key);
      if (!store.has(key)) return null;
      return { buffer: store.get(key), url: `${MOCK_BASE_URL}${key}` };
    },
    async deleteObject({ key }) {
      calls.delete.push(key);
      store.delete(key);
    },
  };
}

// A fetchImpl stand-in that reads from the SAME fake-S3 store -- so a test
// never has to keep two independent "what's in the bucket" fictions in
// sync. Returns a 404-shaped failure for a key the store doesn't have,
// exactly like a real anonymous GET against a nonexistent/not-yet-public
// object would.
function mockFetchFromStore(store) {
  return async (url) => {
    const key = url.startsWith(MOCK_BASE_URL) ? url.slice(MOCK_BASE_URL.length) : null;
    if (key === null || !store.has(key)) {
      return { ok: false, status: 404 };
    }
    const buffer = store.get(key);
    return { ok: true, status: 200, arrayBuffer: async () => buffer };
  };
}

function item(key, overrides = {}) {
  const [, postSlug] = key.match(/^media\/blog\/([^/]+)\//);
  return { postSlug, originalUrl: `https://x.test/${postSlug}`, localFilename: `${postSlug}.png`, key, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Pure helpers
// ---------------------------------------------------------------------------

test('buildBlogImageKey produces the expected deterministic, namespaced key', () => {
  assert.equal(buildBlogImageKey('ramanavami', 1), 'media/blog/ramanavami/inline-1.png');
  assert.equal(buildBlogImageKey('guru-purnima', 2), 'media/blog/guru-purnima/inline-2.png');
});

test('assertSafeObjectKey accepts only the exclusive media/blog/<slug>/inline-<n>.png namespace', () => {
  assert.doesNotThrow(() => assertSafeObjectKey('media/blog/ramanavami/inline-1.png'));
  assert.throws(() => assertSafeObjectKey('media/evil.png'));
  assert.throws(() => assertSafeObjectKey('media/blog/../other/x.png'));
  assert.throws(() => assertSafeObjectKey('media/blog/Ramanavami/inline-1.png')); // uppercase
  assert.throws(() => assertSafeObjectKey('media/blog/ramanavami/inline-1.jpg')); // wrong extension
  assert.throws(() => assertSafeObjectKey('media/blog/ramanavami/inline-0.png')); // index must be >= 1
  assert.throws(() => assertSafeObjectKey('media/<timestamp>-abc.png')); // the UNRELATED admin-upload key shape
});

test('sha256Hex is deterministic and sensitive to content', () => {
  const a = sha256Hex(Buffer.from('hello'));
  const b = sha256Hex(Buffer.from('hello'));
  const c = sha256Hex(Buffer.from('world'));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a, crypto.createHash('sha256').update('hello').digest('hex'));
});

test('planUploads selects only non-already-safe-host inline rows and assigns sequential per-slug keys', () => {
  const manifest = {
    rows: [
      { type: 'inline', postSlug: 'a', originalUrl: 'https://vyoma.org/x.png', localFilename: 'x.png' }, // already-safe -- excluded
      { type: 'inline', postSlug: 'a', originalUrl: 'https://lh7.googleusercontent.com/1', localFilename: 'a1.png' },
      { type: 'inline', postSlug: 'a', originalUrl: 'https://lh7.googleusercontent.com/2', localFilename: 'a2.png' },
      { type: 'featured', postSlug: 'b', originalUrl: 'https://lh7.googleusercontent.com/3', localFilename: 'b1.png' }, // featured -- excluded
      { type: 'inline', postSlug: 'c', originalUrl: 'https://lh7.googleusercontent.com/4', localFilename: 'c1.png' },
    ],
  };
  const plan = planUploads(manifest);
  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((p) => p.key),
    ['media/blog/a/inline-1.png', 'media/blog/a/inline-2.png', 'media/blog/c/inline-1.png']
  );
});

test('planUploads throws rather than silently proceeding when a row would produce an out-of-namespace key', () => {
  const manifest = { rows: [{ type: 'inline', postSlug: '../evil', originalUrl: 'https://lh7.googleusercontent.com/1', localFilename: 'x.png' }] };
  assert.throws(() => planUploads(manifest), /media\/blog/);
});

test('planUploads returns an empty plan for a null/empty manifest, never throws', () => {
  assert.deepEqual(planUploads(null), []);
  assert.deepEqual(planUploads({ rows: [] }), []);
});

// ---------------------------------------------------------------------------
// 2. Local file loading (synthetic, then real-file reconfirmation)
// ---------------------------------------------------------------------------

test('loadAndValidateLocalImage rejects a missing file and an unsafe filename', () => {
  const missing = loadAndValidateLocalImage({ localFilename: 'does-not-exist-aaaa.png' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /missing/i);

  const unsafe = loadAndValidateLocalImage({ localFilename: '../../etc/passwd' });
  assert.equal(unsafe.ok, false);
  assert.match(unsafe.error, /[Uu]nsafe/);
});

// Task 7F.8A requirement 3: reconfirm all 8 local PNG assets exist and pass
// image signature validation -- via the real planUploads()/
// loadAndValidateLocalImage() pipeline this script actually uses, not a
// parallel ad-hoc check.
test('all 8 planned real uploads have an existing, valid-PNG local file', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  const manifest = loadBlogImageManifest();
  const plan = planUploads(manifest);
  assert.equal(plan.length, 8, 'expected exactly the 8 known Google-hosted images to be planned');
  for (const planned of plan) {
    const local = loadAndValidateLocalImage(planned);
    assert.equal(local.ok, true, `expected a valid local PNG for "${planned.key}": ${local.error || ''}`);
    assert.equal(local.sha256.length, 64, 'expected a hex sha256 digest');
  }
});

// ---------------------------------------------------------------------------
// 3. Run-state persistence
// ---------------------------------------------------------------------------

test('loadUploadState returns {} when the file is absent (expected until a real run has happened)', () => {
  assert.equal(fs.existsSync(UPLOAD_STATE_PATH), false, 'this task must never introduce this file into the repo');
  assert.deepEqual(loadUploadState(), {});
});

test('loadUploadState throws on a malformed (present but invalid) file -- never silently treated as absent', () => {
  if (fs.existsSync(UPLOAD_STATE_PATH)) {
    return; // never touch a real state file if one unexpectedly already exists here
  }
  fs.mkdirSync(path.dirname(UPLOAD_STATE_PATH), { recursive: true });
  try {
    fs.writeFileSync(UPLOAD_STATE_PATH, JSON.stringify([1, 2, 3])); // valid JSON, wrong shape (array, not object)
    assert.throws(() => loadUploadState(), /malformed/);
  } finally {
    fs.unlinkSync(UPLOAD_STATE_PATH);
  }
});

// ---------------------------------------------------------------------------
// 4. withRetries
// ---------------------------------------------------------------------------

test('withRetries returns the first successful result without exhausting attempts', async () => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls += 1;
      return 'ok';
    },
    { maxAttempts: 5, sleep: noopSleep }
  );
  assert.equal(result, 'ok');
  assert.equal(calls, 1);
});

test('withRetries retries a transient failure and succeeds before exhausting attempts', async () => {
  let calls = 0;
  const result = await withRetries(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('transient');
      return 'ok-on-third';
    },
    { maxAttempts: 5, sleep: noopSleep }
  );
  assert.equal(result, 'ok-on-third');
  assert.equal(calls, 3);
});

test('withRetries throws the last error after exhausting all attempts', async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withRetries(
        async () => {
          calls += 1;
          throw new Error(`persistent-failure-${calls}`);
        },
        { maxAttempts: 3, sleep: noopSleep }
      ),
    /persistent-failure-3/
  );
  assert.equal(calls, 3);
});

// ---------------------------------------------------------------------------
// 5. verifyPubliclyRetrievable (Task 7F.8A requirement 6)
// ---------------------------------------------------------------------------

test('verifyPubliclyRetrievable rejects a non-https URL without ever calling fetch', async () => {
  let fetchCalled = false;
  await assert.rejects(
    () =>
      verifyPubliclyRetrievable('http://mock-bucket.s3.us-east-1.amazonaws.com/x.png', {
        fetchImpl: async () => {
          fetchCalled = true;
          return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('x') };
        },
      }),
    /https/
  );
  assert.equal(fetchCalled, false);
});

test('verifyPubliclyRetrievable rejects a non-ok HTTP response (e.g. AccessDenied from a non-public bucket)', async () => {
  await assert.rejects(
    () => verifyPubliclyRetrievable('https://mock-bucket.s3.us-east-1.amazonaws.com/x.png', { fetchImpl: async () => ({ ok: false, status: 403 }) }),
    /403/
  );
});

test('verifyPubliclyRetrievable rejects content that does not match the expected sha256', async () => {
  await assert.rejects(
    () =>
      verifyPubliclyRetrievable('https://mock-bucket.s3.us-east-1.amazonaws.com/x.png', {
        fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('wrong-bytes') }),
        expectedSha256: sha256Hex(Buffer.from('right-bytes')),
      }),
    /match/
  );
});

test('verifyPubliclyRetrievable resolves when the URL is https, reachable, and content matches', async () => {
  const buf = Buffer.from('right-bytes');
  await assert.doesNotReject(() =>
    verifyPubliclyRetrievable('https://mock-bucket.s3.us-east-1.amazonaws.com/x.png', {
      fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => buf }),
      expectedSha256: sha256Hex(buf),
    })
  );
});

// ---------------------------------------------------------------------------
// 6. runUploadPlan — dry-run makes zero s3Ops/fetch calls
// ---------------------------------------------------------------------------

test('runUploadPlan in dry-run mode never calls s3Ops or fetchImpl at all', async () => {
  const plan = [item('media/blog/a/inline-1.png')];
  const fakeS3 = createFakeS3();
  let fetchCalled = false;
  const fetchImpl = async () => {
    fetchCalled = true;
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('x') };
  };

  const { results } = await runUploadPlan(plan, { s3Ops: fakeS3, commit: false, fetchImpl, loadLocalImage: fakeLocalImage('sha-a') });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, 'planned-dry-run');
  assert.equal(fakeS3.calls.put.length, 0);
  assert.equal(fakeS3.calls.get.length, 0);
  assert.equal(fetchCalled, false);
});

// ---------------------------------------------------------------------------
// 7. runUploadPlan — commit happy path (mocked, via the fake S3 store)
// ---------------------------------------------------------------------------

test('runUploadPlan: a mocked happy-path commit uploads, authenticated-verifies, and publicly-verifies every item', async () => {
  const plan = [item('media/blog/a/inline-1.png'), item('media/blog/b/inline-1.png')];
  const loadLocalImage = (planned) => {
    const buffer = Buffer.from(`content-${planned.key}`);
    return { ok: true, buffer, sha256: sha256Hex(buffer) };
  };
  const fakeS3 = createFakeS3();

  const { results, nextState } = await runUploadPlan(plan, { s3Ops: fakeS3, commit: true, loadLocalImage, fetchImpl: mockFetchFromStore(fakeS3.store), sleep: noopSleep });
  assert.equal(results.length, 2);
  for (const r of results) {
    assert.equal(r.status, 'uploaded-and-verified');
    assert.match(r.url, /^https:\/\/mock-bucket\.s3\.us-east-1\.amazonaws\.com\//);
  }
  // Each item: 1 preflight getObject (finds nothing) + 1 putObject + 1 post-upload getObject (verify).
  assert.equal(fakeS3.calls.put.length, 2);
  assert.equal(fakeS3.calls.get.length, 4);
  assert.equal(nextState['media/blog/a/inline-1.png'].status, 'uploaded-and-verified');
  assert.equal(nextState['media/blog/b/inline-1.png'].status, 'uploaded-and-verified');
});

// ---------------------------------------------------------------------------
// 8. Overwrite protection (Task 7F.8A requirement 3)
// ---------------------------------------------------------------------------

test('runUploadPlan: an existing object at the deterministic key with DIFFERENT content is never overwritten', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  fakeS3.store.set(key, Buffer.from('some-unrelated-pre-existing-content'));

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), fetchImpl: mockFetchFromStore(fakeS3.store), sleep: noopSleep });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'conflict');
  assert.equal(results[0].putSucceeded, false);
  assert.equal(fakeS3.calls.put.length, 0, 'putObject must never be called when a conflicting object already exists at this key');
  // The unrelated object must still be exactly what it was.
  assert.deepEqual(fakeS3.store.get(key), Buffer.from('some-unrelated-pre-existing-content'));
});

test('runUploadPlan: an existing object with MATCHING content is recognized live and never re-uploaded', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  const matchingBuffer = Buffer.from('fake-bytes-sha-a');
  fakeS3.store.set(key, matchingBuffer);

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), fetchImpl: mockFetchFromStore(fakeS3.store), sleep: noopSleep });
  assert.equal(results[0].status, 'already-present-and-verified');
  assert.equal(fakeS3.calls.put.length, 0, 'an already-correct object must never be re-uploaded');
});

// ---------------------------------------------------------------------------
// 8b. Conditional-write (IfNoneMatch) race handling (Task 7F.8C)
// ---------------------------------------------------------------------------

test('runUploadPlan: a race where another process wins with IDENTICAL content between preflight and PUT resolves safely as already-present, never overwritten', async () => {
  const key = 'media/blog/a/inline-1.png';
  const loadLocalImage = fakeLocalImage('race-same');
  const localBuffer = Buffer.from('fake-bytes-race-same');
  const fakeS3 = createFakeS3();
  const realPutObject = fakeS3.putObject.bind(fakeS3);
  fakeS3.putObject = async (args) => {
    // Simulates another process winning the race and writing the IDENTICAL
    // content to this exact key in the window between this script's own
    // preflight read (which found nothing) and this PUT call -- the fake's
    // own IfNoneMatch modeling (see createFakeS3 above) then rejects this
    // PUT exactly like a live S3 412 would.
    fakeS3.store.set(args.key, localBuffer);
    return realPutObject(args);
  };

  const { results } = await runUploadPlan([item(key)], {
    s3Ops: fakeS3,
    commit: true,
    loadLocalImage,
    fetchImpl: mockFetchFromStore(fakeS3.store),
    sleep: noopSleep,
  });
  assert.equal(results[0].status, 'already-present-and-verified');
  assert.equal(fakeS3.calls.put.length, 1, 'exactly one PUT was attempted and rejected -- no retry/second PUT for a 412');
  assert.deepEqual(fakeS3.store.get(key), localBuffer, 'the winning process\'s object must be the one left in place, never overwritten by a second PUT');
});

test('runUploadPlan: a race where another process wins with DIFFERENT content is a conflict, never overwritten and never deleted by cleanup', async () => {
  const key = 'media/blog/a/inline-1.png';
  const loadLocalImage = fakeLocalImage('race-mine');
  const winningContent = Buffer.from('someone-elses-different-content-from-a-racing-process');
  const fakeS3 = createFakeS3();
  const realPutObject = fakeS3.putObject.bind(fakeS3);
  fakeS3.putObject = async (args) => {
    fakeS3.store.set(args.key, winningContent);
    return realPutObject(args);
  };

  const { results } = await runUploadPlan([item(key)], {
    s3Ops: fakeS3,
    commit: true,
    loadLocalImage,
    fetchImpl: mockFetchFromStore(fakeS3.store),
    sleep: noopSleep,
  });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'conflict');
  assert.equal(results[0].putSucceeded, false, 'our own PUT never actually wrote anything -- S3 rejected it atomically');

  // Task 7F.8C requirement 7: cleanup must never be able to delete an
  // object created by another process after this script's own upload --
  // putSucceeded:false on this result is exactly what structurally
  // prevents that.
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.deepEqual(rolledBack, []);
  assert.deepEqual(fakeS3.store.get(key), winningContent, 'the racing process\'s object must still be exactly what it was');
});

test('runUploadPlan: a 409 ConditionalRequestConflict-shaped putObject failure is retried like a transient error, not treated as a stable conflict', async () => {
  // AWS documents 409 ConditionalRequestConflict (a genuinely racing
  // concurrent write, distinct from 412's "already exists") as "on a 409
  // failure you should retry the upload" -- so, unlike a 412 (which
  // createRealS3Ops().putObject() catches and turns into a non-throwing
  // `{ conditionalConflict: true }` sentinel, see that function), a 409 is
  // deliberately left to propagate as a normal thrown error, which
  // withRetries() -- already wrapping every s3Ops.putObject() call in
  // runUploadPlan() -- retries exactly like any other transient failure.
  // This test exercises that contract at the s3Ops boundary runUploadPlan()
  // actually depends on, the same boundary every other retry/overwrite
  // test in this file uses.
  const key = 'media/blog/a/inline-1.png';
  let putAttempts = 0;
  const fakeS3 = createFakeS3();
  const realPutObject = fakeS3.putObject.bind(fakeS3);
  fakeS3.putObject = async (args) => {
    putAttempts += 1;
    if (putAttempts === 1) {
      const err = new Error('ConditionalRequestConflict');
      err.$metadata = { httpStatusCode: 409 };
      throw err;
    }
    return realPutObject(args);
  };

  const { results } = await runUploadPlan([item(key)], {
    s3Ops: fakeS3,
    commit: true,
    loadLocalImage: fakeLocalImage('sha-a'),
    fetchImpl: mockFetchFromStore(fakeS3.store),
    maxAttempts: 2,
    sleep: noopSleep,
  });
  assert.equal(results[0].status, 'uploaded-and-verified');
  assert.equal(putAttempts, 2);
});

// ---------------------------------------------------------------------------
// 9. Retries on transient failures
// ---------------------------------------------------------------------------

test('runUploadPlan retries a transient putObject failure and succeeds', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3({ putFailuresRemaining: { [key]: 1 } });

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), fetchImpl: mockFetchFromStore(fakeS3.store), sleep: noopSleep });
  assert.equal(results[0].status, 'uploaded-and-verified');
  assert.equal(fakeS3.calls.put.length, 2); // 1 failed attempt + 1 success
});

test('runUploadPlan: a persistent preflight-check failure never falls through to a blind upload', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  fakeS3.getObject = async () => {
    throw new Error('simulated persistent network error on preflight read');
  };

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), maxAttempts: 2, sleep: noopSleep });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'preflight-check');
  assert.equal(fakeS3.calls.put.length, 0, 'a failed preflight read must never be treated as "absent, safe to upload"');
});

// ---------------------------------------------------------------------------
// 10. Partial failure must never allow a misleading "complete" production map
// ---------------------------------------------------------------------------

test('runUploadPlan: a persistent putObject failure for one item marks it failed without affecting the others', async () => {
  const plan = [item('media/blog/a/inline-1.png'), item('media/blog/b/inline-1.png')];
  const fakeS3 = createFakeS3({ putFailuresRemaining: { 'media/blog/b/inline-1.png': 99 } });
  const loadLocalImage = (planned) => {
    const buffer = Buffer.from(planned.key);
    return { ok: true, buffer, sha256: sha256Hex(buffer) };
  };

  const { results } = await runUploadPlan(plan, { s3Ops: fakeS3, commit: true, loadLocalImage, fetchImpl: mockFetchFromStore(fakeS3.store), maxAttempts: 2, sleep: noopSleep });
  const a = results.find((r) => r.postSlug === 'a');
  const b = results.find((r) => r.postSlug === 'b');
  assert.equal(a.status, 'uploaded-and-verified');
  assert.equal(b.status, 'failed');
  assert.equal(b.stage, 'upload');
  assert.equal(b.putSucceeded, false);

  // This is the invariant Task 7F.8A requirement 5/9 cares about: the
  // caller (main()) must see this as NOT fully ok, and must never proceed
  // to buildProductionUrlRows()/writeProductionUrlMap() on a result set
  // like this one.
  const allOk = results.every((r) => r.status === 'uploaded-and-verified' || r.status === 'already-present-and-verified');
  assert.equal(allOk, false);
});

test('runUploadPlan: a verify-step failure (bad read-back) is marked failed with putSucceeded:true, distinct from an upload failure', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  const realGetObject = fakeS3.getObject.bind(fakeS3);
  let getCallCount = 0;
  fakeS3.getObject = async (args) => {
    getCallCount += 1;
    if (getCallCount === 1) return realGetObject(args); // preflight: genuinely absent
    return { buffer: Buffer.from('CORRUPTED-DIFFERENT-BYTES'), url: `${MOCK_BASE_URL}${key}` }; // post-upload verify: corrupted
  };

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), maxAttempts: 2, sleep: noopSleep });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'verify');
  assert.equal(results[0].putSucceeded, true);
  assert.ok(results[0].url, 'the object WAS uploaded even though verification failed');
});

test('runUploadPlan: a public-retrievability failure (e.g. a non-public bucket) is marked failed, distinct from an authenticated-verify failure', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  const fetchImpl = async () => ({ ok: false, status: 403 }); // simulates AccessDenied: bucket not actually public-read

  const { results } = await runUploadPlan([item(key)], { s3Ops: fakeS3, commit: true, loadLocalImage: fakeLocalImage('sha-a'), fetchImpl, maxAttempts: 2, sleep: noopSleep });
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'public-retrieval');
  assert.equal(results[0].putSucceeded, true, 'the object genuinely was uploaded -- only its public reachability failed');
  assert.ok(results[0].url);
});

// ---------------------------------------------------------------------------
// 11. Duplicate execution / anti-staleness (Task 7F.8A requirement 4)
// ---------------------------------------------------------------------------

test('runUploadPlan: a genuinely-unchanged rerun finds the object live and skips re-upload, without trusting local state alone', async () => {
  const key = 'media/blog/a/inline-1.png';
  const loadLocalImage = fakeLocalImage('sha-a');

  const firstS3Ops = createFakeS3();
  const { nextState: stateAfterFirstRun } = await runUploadPlan([item(key)], {
    s3Ops: firstS3Ops,
    commit: true,
    loadLocalImage,
    fetchImpl: mockFetchFromStore(firstS3Ops.store),
    sleep: noopSleep,
  });
  assert.equal(firstS3Ops.calls.put.length, 1);

  // Second run, against a FRESH fake-S3 instance that nonetheless already
  // has the same object (simulating "the object really is still there,
  // unchanged, from the first run") -- putObject must never be called
  // again, but the live preflight read (getObject) IS expected to happen.
  const secondS3Ops = createFakeS3();
  secondS3Ops.store.set(key, firstS3Ops.store.get(key));
  const { results: secondResults } = await runUploadPlan([item(key)], {
    s3Ops: secondS3Ops,
    commit: true,
    state: stateAfterFirstRun,
    loadLocalImage,
    fetchImpl: mockFetchFromStore(secondS3Ops.store),
    sleep: noopSleep,
  });
  assert.equal(secondResults[0].status, 'already-present-and-verified');
  assert.equal(secondS3Ops.calls.put.length, 0);
  assert.ok(secondS3Ops.calls.get.length > 0, 'a live preflight read must still happen even on a verified rerun');
});

test('runUploadPlan: a STALE local state record (claims verified) is never trusted when the real object is actually gone', async () => {
  const key = 'media/blog/a/inline-1.png';
  const loadLocalImage = fakeLocalImage('sha-a');
  // The state file claims this key was already uploaded-and-verified, but
  // the fake S3 store below starts EMPTY -- simulating the object having
  // been deleted (or never really having existed) out from under a stale
  // local record. This is exactly the scenario Task 7F.8A requirement 4
  // asks to be protected against.
  const staleState = { [key]: { status: 'uploaded-and-verified', url: `${MOCK_BASE_URL}${key}`, sha256: 'whatever-the-stale-record-happened-to-say' } };
  const fakeS3 = createFakeS3();

  const { results } = await runUploadPlan([item(key)], {
    s3Ops: fakeS3,
    commit: true,
    state: staleState,
    loadLocalImage,
    fetchImpl: mockFetchFromStore(fakeS3.store),
    sleep: noopSleep,
  });
  assert.equal(results[0].status, 'uploaded-and-verified', 'must re-upload for real, never trust the stale state record alone');
  assert.equal(fakeS3.calls.put.length, 1);
});

test('runUploadPlan: a changed local file (different content) triggers a conflict against the still-present old object, not a silent overwrite', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  fakeS3.store.set(key, Buffer.from('fake-bytes-old-content')); // what a prior run actually uploaded
  const state = { [key]: { status: 'uploaded-and-verified', url: `${MOCK_BASE_URL}${key}`, sha256: 'old-sha-recorded-previously' } };

  const { results } = await runUploadPlan([item(key)], {
    s3Ops: fakeS3,
    commit: true,
    state,
    loadLocalImage: fakeLocalImage('new-content'), // the local file has since changed
    fetchImpl: mockFetchFromStore(fakeS3.store),
    sleep: noopSleep,
  });
  // A changed local file against a still-present, DIFFERENT remote object
  // is correctly treated as a conflict -- this script never silently
  // overwrites what's actually in the bucket just because the local file
  // changed. (An operator who genuinely wants to replace it must delete
  // the object out-of-band first; this script does not do that itself.)
  assert.equal(results[0].status, 'failed');
  assert.equal(results[0].stage, 'conflict');
  assert.equal(fakeS3.calls.put.length, 0);
});

// ---------------------------------------------------------------------------
// 12. buildProductionUrlRows shape
// ---------------------------------------------------------------------------

test('buildProductionUrlRows produces exactly the {postSlug, originalUrl, productionUrl} shape the Task 7F.7 loader expects', () => {
  const results = [
    { postSlug: 'a', originalUrl: 'https://x.test/1', key: 'media/blog/a/inline-1.png', status: 'uploaded-and-verified', url: 'https://mock-bucket.s3.us-east-1.amazonaws.com/media/blog/a/inline-1.png' },
  ];
  const rows = buildProductionUrlRows(results);
  assert.deepEqual(rows, [{ postSlug: 'a', originalUrl: 'https://x.test/1', productionUrl: 'https://mock-bucket.s3.us-east-1.amazonaws.com/media/blog/a/inline-1.png' }]);
});

// ---------------------------------------------------------------------------
// 13. Rollback / recovery (Task 7F.8A requirement 7 — mocked only, never a real delete)
// ---------------------------------------------------------------------------

test('rollbackFailedUploads deletes only items that were actually PUT but failed verification, never a never-uploaded or conflicting failure', async () => {
  const bufA = Buffer.from('content-a-unchanged-since-upload');
  const bufB = Buffer.from('content-b-unchanged-since-upload');
  const fakeS3 = createFakeS3();
  fakeS3.store.set('media/blog/a/inline-1.png', bufA);
  fakeS3.store.set('media/blog/b/inline-1.png', bufB);

  const results = [
    { key: 'media/blog/a/inline-1.png', status: 'failed', stage: 'verify', putSucceeded: true, sha256: sha256Hex(bufA) },
    { key: 'media/blog/b/inline-1.png', status: 'failed', stage: 'public-retrieval', putSucceeded: true, sha256: sha256Hex(bufB) },
    { key: 'media/blog/c/inline-1.png', status: 'failed', stage: 'upload', putSucceeded: false },
    { key: 'media/blog/d/inline-1.png', status: 'failed', stage: 'conflict', putSucceeded: false }, // a pre-existing UNRELATED object -- must never be touched
    { key: 'media/blog/e/inline-1.png', status: 'uploaded-and-verified' },
  ];
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.deepEqual(
    rolledBack.map((r) => r.key).sort(),
    ['media/blog/a/inline-1.png', 'media/blog/b/inline-1.png']
  );
  assert.deepEqual(fakeS3.calls.delete.sort(), ['media/blog/a/inline-1.png', 'media/blog/b/inline-1.png']);
});

test('rollbackFailedUploads in dry-run mode reports intent but never calls deleteObject', async () => {
  const results = [{ key: 'media/blog/a/inline-1.png', status: 'failed', stage: 'verify', putSucceeded: true, sha256: 'whatever' }];
  const fakeS3 = createFakeS3();
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: false });
  assert.deepEqual(rolledBack, [{ key: 'media/blog/a/inline-1.png', status: 'would-delete-dry-run' }]);
  assert.equal(fakeS3.calls.delete.length, 0);
});

// Task 7F.8C: cleanup must never delete an object another process wrote to
// this exact key AFTER this uploader's own successful PUT (e.g. during the
// window between a verify/public-retrieval failure and a later
// --cleanup-failed run) -- only a live, content-matching re-check may
// authorize a delete.

test('rollbackFailedUploads refuses to delete when the object at the key no longer matches what this uploader wrote (overwritten by another process since)', async () => {
  const key = 'media/blog/a/inline-1.png';
  const whatThisScriptUploaded = Buffer.from('what-this-script-actually-uploaded');
  const anotherProcessContent = Buffer.from('a-later-process-own-unrelated-content');
  const fakeS3 = createFakeS3();
  fakeS3.store.set(key, anotherProcessContent);

  const results = [{ key, status: 'failed', stage: 'verify', putSucceeded: true, sha256: sha256Hex(whatThisScriptUploaded) }];
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.equal(rolledBack[0].status, 'delete-skipped-content-changed');
  assert.equal(fakeS3.calls.delete.length, 0);
  assert.deepEqual(fakeS3.store.get(key), anotherProcessContent, "the later process's object must be left completely untouched");
});

test('rollbackFailedUploads refuses to delete when the key has since been deleted entirely by another process', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3(); // store starts empty -- key already absent
  const results = [{ key, status: 'failed', stage: 'public-retrieval', putSucceeded: true, sha256: sha256Hex(Buffer.from('whatever-was-uploaded')) }];
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.equal(rolledBack[0].status, 'delete-skipped-content-changed');
  assert.equal(fakeS3.calls.delete.length, 0);
});

test('rollbackFailedUploads refuses to delete when the recorded result carries no sha256 to verify against (defensive default)', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  fakeS3.store.set(key, Buffer.from('anything-at-all'));
  const results = [{ key, status: 'failed', stage: 'verify', putSucceeded: true }]; // no sha256
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.equal(rolledBack[0].status, 'delete-skipped-content-changed');
  assert.equal(fakeS3.calls.delete.length, 0);
});

test('rollbackFailedUploads skips (never deletes blindly) when the live re-check read itself fails', async () => {
  const key = 'media/blog/a/inline-1.png';
  const fakeS3 = createFakeS3();
  fakeS3.getObject = async () => {
    throw new Error('simulated network error during cleanup recheck');
  };
  const results = [{ key, status: 'failed', stage: 'verify', putSucceeded: true, sha256: sha256Hex(Buffer.from('x')) }];
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.equal(rolledBack[0].status, 'delete-skipped-recheck-failed');
  assert.equal(fakeS3.calls.delete.length, 0);
});

test('rollbackFailedUploads still deletes normally when the object is unchanged since this uploader wrote it', async () => {
  const key = 'media/blog/a/inline-1.png';
  const buffer = Buffer.from('exactly-what-this-script-uploaded');
  const fakeS3 = createFakeS3();
  fakeS3.store.set(key, buffer);
  const results = [{ key, status: 'failed', stage: 'public-retrieval', putSucceeded: true, sha256: sha256Hex(buffer) }];
  const rolledBack = await rollbackFailedUploads(results, { s3Ops: fakeS3, commit: true });
  assert.equal(rolledBack[0].status, 'deleted');
  assert.equal(fakeS3.calls.delete.length, 1);
  assert.equal(fakeS3.store.has(key), false);
});

// ---------------------------------------------------------------------------
// 14. The real S3 ops wrapper, exercised ONLY in its safe "unconfigured"
// path — proves it never attempts a real network call when AWS_* env vars
// are absent (as they are in this test environment), without needing to
// mock anything.
// ---------------------------------------------------------------------------

test('createRealS3Ops reflects isS3Configured() and never attempts a network call when unconfigured', async () => {
  const s3Ops = createRealS3Ops();
  assert.equal(s3Ops.isConfigured(), isS3Configured());
  if (isS3Configured()) {
    return; // this checkout has real AWS env vars set -- do not proceed further here
  }
  const putResult = await s3Ops.putObject({ key: 'media/blog/a/inline-1.png', buffer: Buffer.from('x'), mimeType: 'image/png' });
  assert.equal(putResult, null, 'uploadObject() must return null (not throw, not call AWS) when unconfigured');
  const getResult = await s3Ops.getObject({ key: 'media/blog/a/inline-1.png' });
  assert.equal(getResult, null, 'getObject() must return null (not throw, not call AWS) when unconfigured');
});

// Final sanity: this task must never leave a production-data file behind.
test('this test run never produced a real blog-image-production-urls.json', () => {
  assert.equal(fs.existsSync(PRODUCTION_URL_MAP_OUTPUT_PATH), false);
});
