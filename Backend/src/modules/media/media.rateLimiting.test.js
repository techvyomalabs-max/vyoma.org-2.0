// Regression coverage for per-user rate limiting on POST /api/v1/admin/media
// (security finding: unlimited repeated uploads from a permissioned admin
// account were possible, with no throttle anywhere in the chain -- see
// authRateLimiting.test.js for the precedent this file mirrors).
//
// Two complementary strategies, same split as authRateLimiting.test.js:
// 1. Behavioral tests against the real Express app (createApp()), real
//    auth/RBAC, and a disposable in-memory MongoDB (mongodb-memory-server) --
//    proves the actual production wiring enforces the limit, keys per user
//    (not IP), and that auth/permission failures never consume quota.
// 2. A minimal standalone Express app (no DB, no auth) wired with the real
//    `makeRateLimiter` factory directly, to prove the new keyGenerator
//    support and window-reset behavior in isolation, at a window short
//    enough to actually observe a reset within a test's lifetime.
// 3. Source-assertion tests pinning the actual wiring in
//    media.admin.routes.js and confirming every pre-existing
//    makeRateLimiter caller (auth/donations/forms) is untouched.
//
// S3 is deliberately left unconfigured throughout (no AWS_* env vars are set
// anywhere in this file) -- every non-rate-limited, non-rejected request
// here reaches the pre-existing 503 MEDIA_NOT_CONFIGURED stage, exactly as
// in media.admin.upload.test.js. No real AWS call is ever made.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { makeRateLimiter } from '../../middleware/rateLimit.js';
import { mediaUploadRateLimitKey } from './media.admin.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let env;
let adminRole;
let noMediaPermsRole;
let MediaModel;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noMediaPermsRole = await RoleModel.create({
    key: 'no_media_perms_role_ratelimit',
    name: 'No Media Perms (rate limit test)',
    permissions: ['content:read', 'content:write'],
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

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);

async function uploadFile({ token, filename = 'test.png', mimeType = 'image/png', bytes = PNG_BYTES } = {}) {
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

// --- mediaUploadRateLimitKey: unit coverage for the fail-safe behavior ---

test('mediaUploadRateLimitKey returns a stable string key for a normal authenticated request', () => {
  assert.equal(mediaUploadRateLimitKey({ user: { id: '64f1a2b3c4d5e6f7a8b9c0d1' } }), '64f1a2b3c4d5e6f7a8b9c0d1');
});

test('mediaUploadRateLimitKey throws (fails closed) rather than returning a shared/undefined key when req.user.id is missing', () => {
  assert.throws(() => mediaUploadRateLimitKey({}), /req\.user\.id is required/);
  assert.throws(() => mediaUploadRateLimitKey({ user: {} }), /req\.user\.id is required/);
  assert.throws(() => mediaUploadRateLimitKey({ user: { id: '' } }), /req\.user\.id is required/);
  assert.throws(() => mediaUploadRateLimitKey({ user: null }), /req\.user\.id is required/);
});

// --- Behavioral coverage against the real admin media endpoint ---

test('requests within the 60-per-15-minute limit succeed; the 61st is rejected with HTTP 429, while a different authenticated user (same IP) is unaffected', async () => {
  const userA = await createTestUser({ email: 'media-ratelimit-userA@example.test', roleKey: 'admin' });
  const tokenA = signAccessToken(userA, adminRole);
  const before = await mediaCount();

  for (let i = 0; i < 60; i += 1) {
    const { res, body } = await uploadFile({ token: tokenA, filename: `userA-${i}.png` });
    assert.equal(res.status, 503, `userA request ${i + 1} of 60 should not be rate-limited`);
    assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
  }

  const exceeded = await uploadFile({ token: tokenA, filename: 'userA-61.png' });
  assert.equal(exceeded.res.status, 429);
  assert.deepEqual(exceeded.body, {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
  });
  assert.equal(await mediaCount(), before, 'a rate-limited request must never create a Media record');

  const userB = await createTestUser({ email: 'media-ratelimit-userB@example.test', roleKey: 'admin' });
  const tokenB = signAccessToken(userB, adminRole);
  const forUserB = await uploadFile({ token: tokenB, filename: 'userB-1.png' });
  assert.equal(forUserB.res.status, 503, 'a different authenticated user must have an independent quota, even from the same IP');
  assert.equal(forUserB.body.code, 'MEDIA_NOT_CONFIGURED');
});

test('rate limiting occurs before Multer buffers the file: an oversized/invalid 61st request is still rejected with 429, not 413 or 422', async () => {
  const user = await createTestUser({ email: 'media-ratelimit-before-multer@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  for (let i = 0; i < 60; i += 1) {
    const { res } = await uploadFile({ token, filename: `pre-${i}.png` });
    assert.equal(res.status, 503);
  }

  const oversized = Buffer.alloc(16 * 1024 * 1024); // > the existing 15MB limit -- would be 413 if Multer ran first
  const { res, body } = await uploadFile({ token, bytes: oversized, mimeType: 'image/png', filename: 'oversized.png' });
  assert.equal(res.status, 429, 'rate limiting must reject the 61st request before Multer ever attempts to buffer a file this large');
  assert.equal(body.code, 'RATE_LIMITED');
  assert.equal(await mediaCount(), before);

  const unsupported = await uploadFile({ token, mimeType: 'application/x-msdownload', filename: 'evil.exe', bytes: Buffer.from('not a real exe') });
  assert.equal(unsupported.res.status, 429, 'rate limiting must also precede MIME-type validation -- would be 422 if createMedia ran first');
  assert.equal(unsupported.body.code, 'RATE_LIMITED');
});

test('unauthenticated requests are never rate-limited and never escalate past 401 (requireAuth runs before the limiter)', async () => {
  for (let i = 0; i < 70; i += 1) {
    const { res, body } = await uploadFile({ token: undefined, filename: `unauth-${i}.png` });
    assert.equal(res.status, 401, `request ${i + 1} should be unauthenticated, not rate-limited`);
    assert.equal(body.code, 'UNAUTHENTICATED');
  }
});

test('requests rejected for missing media:write permission do not consume the rate-limit quota (requirePermission runs before the limiter)', async () => {
  const user = await createTestUser({ email: 'media-ratelimit-noperm@example.test', roleKey: 'no_media_perms_role_ratelimit' });
  const token = signAccessToken(user, noMediaPermsRole);

  for (let i = 0; i < 70; i += 1) {
    const { res, body } = await uploadFile({ token, filename: `noperm-${i}.png` });
    assert.equal(res.status, 403, `request ${i + 1} should be forbidden, not rate-limited`);
    assert.equal(body.code, 'FORBIDDEN');
  }
});

// --- Isolated window-reset / keyGenerator coverage (minimal standalone app,
// mirroring authRateLimiting.test.js's own pattern, at a short window so a
// reset can actually be observed within a test) ---

async function startTestApp() {
  const app = express();
  const limiter = makeRateLimiter({ windowMs: 200, max: 2, keyGenerator: (req) => req.headers['x-test-user'] || 'anonymous' });
  app.post('/test', limiter, (req, res) => res.status(200).json({ success: true }));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test('a keyGenerator-enabled limiter still keys independently per generated key', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'u1' } });
      assert.equal(res.status, 200);
    }
    const exhausted = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'u1' } });
    assert.equal(exhausted.status, 429, 'u1 should now be rate-limited');

    const otherUser = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'u2' } });
    assert.equal(otherUser.status, 200, 'a different generated key must have its own independent quota');
  } finally {
    server.close();
  }
});

test('the rate-limit window resets after it elapses', async () => {
  const { server, baseUrl } = await startTestApp();
  try {
    for (let i = 0; i < 2; i += 1) {
      const res = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'reset-check' } });
      assert.equal(res.status, 200);
    }
    const exhausted = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'reset-check' } });
    assert.equal(exhausted.status, 429);

    await new Promise((resolve) => setTimeout(resolve, 300)); // wait out the 200ms window

    const afterReset = await fetch(`${baseUrl}/test`, { method: 'POST', headers: { 'x-test-user': 'reset-check' } });
    assert.equal(afterReset.status, 200, 'the window should have reset, allowing a new request');
  } finally {
    server.close();
  }
});

// --- Source assertions: pin the actual production wiring ---

const mediaRoutesSource = fs.readFileSync(path.join(__dirname, 'media.admin.routes.js'), 'utf8');

test('mediaUploadLimiter is configured with the documented 60-per-15-minute window', () => {
  assert.match(mediaRoutesSource, /const mediaUploadLimiter = makeRateLimiter\(\{/);
  assert.match(mediaRoutesSource, /windowMs:\s*15 \* 60 \* 1000/);
  assert.match(mediaRoutesSource, /max:\s*60/);
  assert.match(mediaRoutesSource, /keyGenerator:\s*mediaUploadRateLimitKey/);
});

test('mediaUploadLimiter is attached only to POST /, not to GET / or DELETE /:id', () => {
  assert.match(
    mediaRoutesSource,
    /mediaAdminRouter\.post\('\/', requirePermission\('media:write'\), mediaUploadLimiter, uploadMiddleware, createMedia\)/
  );
  const getLine = mediaRoutesSource.split('\n').find((l) => l.includes("mediaAdminRouter.get('/'"));
  const deleteLine = mediaRoutesSource.split('\n').find((l) => l.includes("mediaAdminRouter.delete("));
  assert.doesNotMatch(getLine, /mediaUploadLimiter/);
  assert.doesNotMatch(deleteLine, /mediaUploadLimiter/);
});

test('requirePermission still runs before mediaUploadLimiter, which runs before uploadMiddleware (order unchanged from the task spec)', () => {
  const postLine = mediaRoutesSource.split('\n').find((l) => l.includes("mediaAdminRouter.post('/'"));
  const permIndex = postLine.indexOf('requirePermission');
  const limiterIndex = postLine.indexOf('mediaUploadLimiter');
  const uploadIndex = postLine.indexOf('uploadMiddleware');
  assert.ok(permIndex < limiterIndex && limiterIndex < uploadIndex, 'expected order: requirePermission -> mediaUploadLimiter -> uploadMiddleware');
});

const authRoutesSource = fs.readFileSync(path.join(__dirname, '../auth/auth.routes.js'), 'utf8');
const donationsRoutesSource = fs.readFileSync(path.join(__dirname, '../donations/donations.routes.js'), 'utf8');
const formsRoutesSource = fs.readFileSync(path.join(__dirname, '../forms/forms.routes.js'), 'utf8');

test('pre-existing makeRateLimiter callers (auth, donations, forms) are untouched -- still IP-keyed, no keyGenerator added', () => {
  assert.match(authRoutesSource, /const loginLimiter = makeRateLimiter\(\{ windowMs: 15 \* 60 \* 1000, max: 20 \}\)/);
  assert.match(authRoutesSource, /const forgotLimiter = makeRateLimiter\(\{ windowMs: 60 \* 60 \* 1000, max: 5 \}\)/);
  assert.doesNotMatch(authRoutesSource, /keyGenerator/);

  assert.match(donationsRoutesSource, /const donationLimiter = makeRateLimiter\(\{ windowMs: 15 \* 60 \* 1000, max: 30 \}\)/);
  assert.doesNotMatch(donationsRoutesSource, /keyGenerator/);

  assert.match(formsRoutesSource, /const submissionLimiter = makeRateLimiter\(\{ windowMs: 15 \* 60 \* 1000, max: 20 \}\)/);
  assert.doesNotMatch(formsRoutesSource, /keyGenerator/);
});

const rateLimitSource = fs.readFileSync(path.join(__dirname, '../../middleware/rateLimit.js'), 'utf8');

test('makeRateLimiter defaults keyGenerator to express-rate-limit\'s own built-in (IP-based) behavior when omitted', () => {
  assert.match(rateLimitSource, /export function makeRateLimiter\(\{ windowMs = 15 \* 60 \* 1000, max = 20, keyGenerator \} = \{\}\)/);
  assert.match(rateLimitSource, /\.\.\.\(keyGenerator \? \{ keyGenerator \} : \{\}\)/);
});
