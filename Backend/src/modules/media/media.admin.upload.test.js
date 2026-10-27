// Regression coverage for the multer 2.4.0 -> 2.5.0 upgrade (resolved
// GHSA-q7qp-rjg7-q26m) and the existing media-upload endpoint's behavior.
// Exercises the real Express app (createApp()) and the real multer/busboy
// multipart parsing path (via Node's native FormData/Blob + fetch, not a
// hand-rolled or mocked multipart body) against a disposable in-memory
// MongoDB -- reuses auth/authTestHelpers.js, the same infrastructure the
// auth/RBAC test suite already uses.
//
// S3 is deliberately left unconfigured (no AWS_* env vars are set anywhere
// in this file) -- uploadObject() then returns null and createMedia()
// responds 503 MEDIA_NOT_CONFIGURED, exactly as it does today for any real
// admin running this server without AWS credentials configured. For an
// otherwise-fully-valid request (authorized, correct MIME type, under the
// size limit), reaching that 503 -- rather than 401/403/422/413 -- is what
// "passed every validation this endpoint performs" looks like without
// AWS credentials. This is NOT a claim that the file was actually stored:
// no S3 write ever happens, and no test in this file asserts a 201 or
// inspects a stored object's contents. Testing a genuine end-to-end 201
// would require either real AWS credentials (forbidden here) or adding an
// injectable seam to s3.adapter.js/media.admin.controller.js, which this
// task's scope explicitly excludes ("do not modify media upload controller
// logic", "do not modify S3 configuration"). That gap is called out
// explicitly in this task's report rather than papered over.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';

let env;
let adminRole;
let noMediaPermsRole;
let MediaModel;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noMediaPermsRole = await RoleModel.create({
    key: 'no_media_perms_role',
    name: 'No Media Perms',
    permissions: ['content:read', 'content:write'], // has *some* permissions, just not media:*
    mfaRequired: false,
  });
  ({ MediaModel } = await import('./media.model.js'));
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function uploadFile({ token, filename = 'test.png', mimeType = 'image/png', bytes = Buffer.from('not-a-real-image-but-thats-fine') } = {}) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mimeType }), filename);
  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, {
    method: 'POST',
    headers: authHeader(token),
    body: form,
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function mediaCount() {
  return MediaModel.countDocuments();
}

test('an unauthenticated upload request is rejected with 401', async () => {
  const before = await mediaCount();
  const { res, body } = await uploadFile({ token: undefined });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
  assert.equal(await mediaCount(), before, 'no Media record may be created for a rejected request');
});

test('an authenticated user without media:write permission is rejected with 403', async () => {
  const user = await createTestUser({ email: 'media-no-perms@example.test', roleKey: 'no_media_perms_role' });
  const token = signAccessToken(user, noMediaPermsRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
  assert.equal(await mediaCount(), before);
});

test('an authorized upload of a supported MIME type passes validation (reaches the S3-unconfigured stage, not a MIME rejection)', async () => {
  const user = await createTestUser({ email: 'media-admin-ok@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token, mimeType: 'image/png' });
  assert.equal(res.status, 503, 'must NOT be rejected as an unsupported file type');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
  assert.equal(await mediaCount(), before, 'no Media record is created either way, since S3 remains unconfigured in this test environment');
});

test('an unsupported MIME type is rejected with 422, before the S3-configuration check is ever reached', async () => {
  const user = await createTestUser({ email: 'media-admin-badtype@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token, mimeType: 'application/x-msdownload', filename: 'evil.exe' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before);
});

test('a plain SVG upload is rejected with 422 (image/svg+xml is no longer in ALLOWED_MIME)', async () => {
  const user = await createTestUser({ email: 'media-admin-svg-plain@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const plainSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  const { res, body } = await uploadFile({ token, bytes: plainSvg, mimeType: 'image/svg+xml', filename: 'icon.svg' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before, 'no Media record may be created for a rejected SVG upload');
});

test('an SVG containing a <script> tag and an onload handler is rejected with 422, identically to a benign SVG', async () => {
  const user = await createTestUser({ email: 'media-admin-svg-malicious@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const maliciousSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>alert(document.domain)</script></svg>'
  );
  const { res, body } = await uploadFile({ token, bytes: maliciousSvg, mimeType: 'image/svg+xml', filename: 'malicious.svg' });
  assert.equal(res.status, 422, 'rejection happens at the MIME-type check, before any file content is ever inspected');
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before, 'the malicious SVG must never reach Media creation or S3');
});

test('an oversized file is rejected with the existing 413 FILE_TOO_LARGE response', async () => {
  const user = await createTestUser({ email: 'media-admin-oversized@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const oversized = Buffer.alloc(16 * 1024 * 1024); // > the existing 15MB limit
  const { res, body } = await uploadFile({ token, bytes: oversized, mimeType: 'image/png' });
  assert.equal(res.status, 413);
  assert.equal(body.code, 'FILE_TOO_LARGE');
  assert.equal(await mediaCount(), before);
});

test('a malformed multipart request fails safely (a clean error response, not a crash or hang)', async () => {
  const user = await createTestUser({ email: 'media-admin-malformed@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  // A Content-Type claiming multipart/form-data with a boundary that never
  // actually appears in the body -- busboy can never find a complete part,
  // so no req.file is ever populated.
  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'multipart/form-data; boundary=----ThisBoundaryNeverAppearsInTheBody',
    },
    body: 'this is not a valid multipart body at all',
  });
  assert.ok(res.status >= 400 && res.status < 500, `expected a clean 4xx, got ${res.status}`);
  assert.equal(await mediaCount(), before, 'a malformed request must never create a Media record');
});

test('existing media listing behavior is unaffected by the multer upgrade', async () => {
  const user = await createTestUser({ email: 'media-admin-list@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, { headers: authHeader(token) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
});
