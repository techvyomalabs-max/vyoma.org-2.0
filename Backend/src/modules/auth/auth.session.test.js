// Security regression coverage: SESSION SECURITY (E).
// Covers refresh-token validation/rejection, refreshTokenVersion-based bulk
// invalidation (used by both password change and, in production, by
// disabling a user), and logout's cookie-clearing behavior.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { UserModel } from './user.model.js';
import { signAccessToken } from './auth.service.js';
import { RoleModel } from './role.model.js';
import { env } from '../../config/env.js';
import { setupTestEnv, teardownTestEnv, createTestUser, extractCookie, TEST_PASSWORD } from './authTestHelpers.js';

let envCtx;

before(async () => {
  envCtx = await setupTestEnv();
});

after(async () => {
  await teardownTestEnv(envCtx);
});

async function login(email, password) {
  const res = await fetch(`${envCtx.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  const refreshCookie = extractCookie(res, 'vyoma_refresh');
  return { res, body, refreshCookie };
}

async function refresh(cookie) {
  const res = await fetch(`${envCtx.baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });
  return { res, body: await res.json() };
}

test('a valid refresh cookie issues a new access token and a new refresh cookie', async () => {
  await createTestUser({ email: 'session-refresh-ok@example.test' });
  const { refreshCookie } = await login('session-refresh-ok@example.test', TEST_PASSWORD);
  assert.ok(refreshCookie);

  const { res, body } = await refresh(refreshCookie);
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
  assert.ok(extractCookie(res, 'vyoma_refresh'), 'refresh must re-issue a refresh cookie too');
});

test('no refresh cookie present is rejected', async () => {
  const { res, body } = await refresh(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('a garbage/invalid refresh token is rejected', async () => {
  const { res, body } = await refresh('vyoma_refresh=not-a-real-token');
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('an expired refresh token is rejected', async () => {
  const user = await createTestUser({ email: 'session-refresh-expired@example.test' });
  const expired = jwt.sign({ sub: String(user._id), v: user.refreshTokenVersion }, env.auth.refreshTokenSecret, { expiresIn: '-10s' });
  const { res, body } = await refresh(`vyoma_refresh=${expired}`);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('bumping refreshTokenVersion invalidates every outstanding refresh token', async () => {
  await createTestUser({ email: 'session-version-bump@example.test' });
  const { refreshCookie } = await login('session-version-bump@example.test', TEST_PASSWORD);

  const user = await UserModel.findOne({ email: 'session-version-bump@example.test' });
  user.refreshTokenVersion += 1;
  await user.save();

  const { res, body } = await refresh(refreshCookie);
  assert.equal(res.status, 401, 'the old refresh token, now at a stale version, must be rejected');
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('FIXED: logout returns success and immediately expires the refresh cookie (not a future Expires from maxAge)', async () => {
  // First see what attributes the cookie actually has when SET (issueSession),
  // so the cleared cookie can be checked against reality instead of an
  // assumption about this test run's NODE_ENV.
  await createTestUser({ email: 'session-logout-attrs@example.test' });
  const { res: loginRes } = await login('session-logout-attrs@example.test', TEST_PASSWORD);
  const setCookieOnLogin = loginRes.headers.get('set-cookie');
  const wasSecure = /;\s*Secure/i.test(setCookieOnLogin);

  const res = await fetch(`${envCtx.baseUrl}/api/v1/auth/logout`, { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.data.loggedOut, true);

  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie?.startsWith('vyoma_refresh=;'), 'must clear the correct cookie (by name) and empty its value');
  assert.match(setCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i, 'must expire immediately, not at some future date');
  assert.doesNotMatch(setCookie, /Max-Age=\d/, 'no positive Max-Age may remain on the cleared cookie');

  // Identity attributes must still match the cookie that was originally set
  // (issueSession), or browsers won't actually clear it.
  assert.match(setCookie, /Path=\/api\/v1\/auth/i);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.equal(/;\s*Secure/i.test(setCookie), wasSecure, 'Secure attribute on the cleared cookie must match the one it was set with');
});

test('the cleared cookie cannot be reused to refresh a session', async () => {
  const res = await fetch(`${envCtx.baseUrl}/api/v1/auth/logout`, { method: 'POST' });
  const setCookie = res.headers.get('set-cookie');

  const rejectRes = await refresh(setCookie.split(';')[0]);
  assert.equal(rejectRes.res.status, 401, 'the emptied cookie must not be accepted by /refresh');
});

test('logout succeeds with no refresh cookie present at all (no valid session required to clear it)', async () => {
  const res = await fetch(`${envCtx.baseUrl}/api/v1/auth/logout`, { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.loggedOut, true);
});

test('logout succeeds even with an expired or garbage refresh cookie already present', async () => {
  const user = await createTestUser({ email: 'session-logout-garbage-cookie@example.test' });
  const expired = jwt.sign({ sub: String(user._id), v: user.refreshTokenVersion }, env.auth.refreshTokenSecret, { expiresIn: '-10s' });

  const garbageRes = await fetch(`${envCtx.baseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { cookie: 'vyoma_refresh=not-a-real-token' },
  });
  assert.equal(garbageRes.status, 200);

  const expiredRes = await fetch(`${envCtx.baseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    headers: { cookie: `vyoma_refresh=${expired}` },
  });
  assert.equal(expiredRes.status, 200);
});

test('changing password bumps refreshTokenVersion, invalidating any refresh token issued before the change', async () => {
  const user = await createTestUser({ email: 'session-password-change@example.test' });
  const { refreshCookie } = await login('session-password-change@example.test', TEST_PASSWORD);
  const role = await RoleModel.findOne({ key: 'admin' });
  const accessToken = signAccessToken(user, role);

  const changeRes = await fetch(`${envCtx.baseUrl}/api/v1/auth/password/change`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword: TEST_PASSWORD, newPassword: 'ANewPassword123!' }),
  });
  assert.equal(changeRes.status, 200);

  const { res } = await refresh(refreshCookie);
  assert.equal(res.status, 401, 'a refresh token issued before a password change must no longer work');
});
