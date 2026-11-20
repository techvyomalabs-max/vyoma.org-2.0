// Security regression coverage: MANDATORY MFA ENROLLMENT.
// Fixes the previously-confirmed defect (see git history: the prior
// "KNOWN GAP" test in auth.mfa.test.js) where Role.mfaRequired (seeded true
// for super_admin) was never enforced -- a Super Admin with mfaEnabled:false
// could log in and receive a full, privileged session with no MFA step at
// all. Split into its own file (rather than growing auth.mfa.test.js) so
// this file's request volume against the shared /login-funnel rate limiter
// (20 per 15 min, see auth.routes.js's loginLimiter) stays isolated from
// auth.mfa.test.js's own volume -- each *.test.js file gets its own fresh
// app/limiter instance (node --test runs each file in its own process).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import { UserModel } from './user.model.js';
import { RoleModel } from './role.model.js';
import { generateTotpSecret, signRefreshToken, signMfaEnrollmentToken } from './auth.service.js';
import { setupTestEnv, teardownTestEnv, createTestUser, TEST_PASSWORD } from './authTestHelpers.js';

let env;

before(async () => {
  env = await setupTestEnv();
});

after(async () => {
  await teardownTestEnv(env);
});

async function login(email, password) {
  const res = await fetch(`${env.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return { res, body: await res.json() };
}

async function loginMfa(payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/auth/login/mfa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, body: await res.json() };
}

async function enrollSetup(enrollmentToken) {
  const res = await fetch(`${env.baseUrl}/api/v1/auth/mfa/enroll/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enrollmentToken }),
  });
  return { res, body: await res.json() };
}

async function enrollVerify(payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/auth/mfa/enroll/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, body: await res.json() };
}

test('FIXED: a Super Admin with mfaEnabled=false does NOT receive a privileged session from /login -- only an enrollmentToken', async () => {
  const superAdminRole = await RoleModel.findOne({ key: 'super_admin' });
  assert.equal(superAdminRole.mfaRequired, true, 'sanity check: the role itself is flagged as requiring MFA');

  await createTestUser({ email: 'super-admin-no-mfa@example.test', roleKey: 'super_admin', mfaEnabled: false });
  const { res, body } = await login('super-admin-no-mfa@example.test', TEST_PASSWORD);

  assert.equal(res.status, 200);
  assert.equal(body.data.mfaEnrollmentRequired, true);
  assert.equal(body.data.accessToken, undefined, '/login must never hand out a real session while mandatory enrollment is pending');
  assert.equal(body.data.mfaRequired, undefined, 'this is a distinct state from the already-enrolled MFA challenge');
  assert.ok(body.data.enrollmentToken);
  assert.ok(!res.headers.get('set-cookie')?.includes('vyoma_refresh='), 'no refresh cookie must be issued either');
});

test('mandatory MFA enrollment can be completed end to end, and permits the normal login flow afterward', async () => {
  await createTestUser({ email: 'enroll-happy-path@example.test', roleKey: 'super_admin', mfaEnabled: false });
  const { body: loginBody } = await login('enroll-happy-path@example.test', TEST_PASSWORD);
  const { enrollmentToken } = loginBody.data;

  const setupRes = await enrollSetup(enrollmentToken);
  assert.equal(setupRes.res.status, 200);
  assert.ok(setupRes.body.data.secret);
  assert.ok(setupRes.body.data.otpauthUri.includes(setupRes.body.data.secret));

  const code = authenticator.generate(setupRes.body.data.secret);
  const verifyRes = await enrollVerify({ enrollmentToken, code });
  assert.equal(verifyRes.res.status, 200);
  assert.ok(verifyRes.body.data.accessToken, 'completing enrollment must issue a full session, finishing the login');
  assert.ok(Array.isArray(verifyRes.body.data.recoveryCodes) && verifyRes.body.data.recoveryCodes.length > 0);
  assert.ok(verifyRes.res.headers.get('set-cookie')?.includes('vyoma_refresh='), 'a refresh cookie must now be issued too');

  const user = await UserModel.findOne({ email: 'enroll-happy-path@example.test' });
  assert.equal(user.mfaEnabled, true);
  assert.ok(user.mfaSecret);
  assert.equal(user.mfaRecoveryCodesHashed.length, verifyRes.body.data.recoveryCodes.length);

  // The account is now a normal MFA-enabled account: a subsequent login must
  // go through the ordinary (already-enrolled) challenge, not enrollment again.
  const secondLogin = await login('enroll-happy-path@example.test', TEST_PASSWORD);
  assert.equal(secondLogin.body.data.mfaRequired, true);
  assert.equal(secondLogin.body.data.mfaEnrollmentRequired, undefined);
});

test('an invalid code during enrollment is rejected, and enrollment can be retried', async () => {
  await createTestUser({ email: 'enroll-retry@example.test', roleKey: 'super_admin', mfaEnabled: false });
  const { body: loginBody } = await login('enroll-retry@example.test', TEST_PASSWORD);
  const { enrollmentToken } = loginBody.data;

  const { body: setupBody } = await enrollSetup(enrollmentToken);
  const badAttempt = await enrollVerify({ enrollmentToken, code: '000000' });
  assert.equal(badAttempt.res.status, 401);
  assert.equal(badAttempt.body.code, 'MFA_INVALID');

  const user = await UserModel.findOne({ email: 'enroll-retry@example.test' });
  assert.equal(user.mfaEnabled, false, 'a failed attempt must not enable MFA');

  // Retry with the correct code for the same still-pending secret.
  const goodCode = authenticator.generate(setupBody.data.secret);
  const retry = await enrollVerify({ enrollmentToken, code: goodCode });
  assert.equal(retry.res.status, 200);
});

test('a restricted enrollment token cannot access /auth/me or any Admin API', async () => {
  const user = await createTestUser({ email: 'enroll-token-scope@example.test', roleKey: 'super_admin', mfaEnabled: false });
  const { body: loginBody } = await login('enroll-token-scope@example.test', TEST_PASSWORD);
  const { enrollmentToken } = loginBody.data;

  const meRes = await fetch(`${env.baseUrl}/api/v1/auth/me`, { headers: { authorization: `Bearer ${enrollmentToken}` } });
  assert.equal(meRes.status, 401, 'an enrollment token must not be usable as a Bearer access token anywhere');

  const adminRes = await fetch(`${env.baseUrl}/api/v1/admin/users`, { headers: { authorization: `Bearer ${enrollmentToken}` } });
  assert.equal(adminRes.status, 401, 'nor against any Admin CMS / privileged route');

  // Sanity: the account genuinely has no real access token issued anywhere
  // in this flow yet.
  assert.equal(user.mfaEnabled, false);
});

test('MFA bypass attempt: a garbage or expired enrollmentToken is rejected by both enroll endpoints', async () => {
  const setupRes = await enrollSetup('not-a-real-token');
  assert.equal(setupRes.res.status, 401);
  assert.equal(setupRes.body.code, 'MFA_ENROLLMENT_TOKEN_INVALID');

  const verifyRes = await enrollVerify({ enrollmentToken: 'not-a-real-token', code: '123456' });
  assert.equal(verifyRes.res.status, 401);
  assert.equal(verifyRes.body.code, 'MFA_ENROLLMENT_TOKEN_INVALID');
});

test('MFA bypass attempt: an already-enrolled account cannot be re-enrolled with a stale enrollmentToken', async () => {
  const secret = generateTotpSecret();
  await createTestUser({ email: 'already-enrolled@example.test', roleKey: 'super_admin', mfaEnabled: true, mfaSecret: secret });
  // Forge what an enrollment token for this now-already-enrolled user would
  // look like (e.g. a stale token issued before MFA was enabled).
  const user = await UserModel.findOne({ email: 'already-enrolled@example.test' });
  const staleToken = signMfaEnrollmentToken(user);

  const setupRes = await enrollSetup(staleToken);
  assert.equal(setupRes.res.status, 409);
  assert.equal(setupRes.body.code, 'MFA_ALREADY_ENABLED');
});

test('an Admin role (mfaRequired: false) logging in without MFA enabled is completely unaffected by mandatory enrollment', async () => {
  await createTestUser({ email: 'admin-unaffected@example.test', roleKey: 'admin', mfaEnabled: false });
  const { res, body } = await login('admin-unaffected@example.test', TEST_PASSWORD);
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
  assert.equal(body.data.mfaEnrollmentRequired, undefined);
});

test('a Super Admin who already has MFA enabled is unaffected by mandatory enrollment and still uses the normal TOTP challenge', async () => {
  const secret = generateTotpSecret();
  await createTestUser({ email: 'super-admin-already-mfa@example.test', roleKey: 'super_admin', mfaEnabled: true, mfaSecret: secret });
  const { body: loginBody } = await login('super-admin-already-mfa@example.test', TEST_PASSWORD);
  assert.equal(loginBody.data.mfaRequired, true);
  assert.equal(loginBody.data.mfaEnrollmentRequired, undefined);

  const code = authenticator.generate(secret);
  const { res, body } = await loginMfa({ mfaToken: loginBody.data.mfaToken, code });
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
});

test('refresh-token behavior cannot bypass mandatory MFA enrollment', async () => {
  // Simulates a refresh token issued before this fix existed (or one
  // otherwise obtained) for a Super Admin who still hasn't enrolled.
  const user = await createTestUser({ email: 'refresh-cannot-bypass@example.test', roleKey: 'super_admin', mfaEnabled: false });
  const staleRefreshToken = signRefreshToken(user);

  const res = await fetch(`${env.baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { cookie: `vyoma_refresh=${staleRefreshToken}` },
  });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, 'MFA_ENROLLMENT_REQUIRED');
});
