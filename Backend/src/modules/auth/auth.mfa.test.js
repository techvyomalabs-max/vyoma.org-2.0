// Security regression coverage: MFA (D) -- already-enrolled login challenge
// and voluntary/optional MFA. Mandatory-enrollment coverage for accounts
// that have NOT yet enabled MFA (Role.mfaRequired) lives in its own file,
// auth.mfaEnrollment.test.js -- see that file's header comment for why.
// Exercises the real /login and /login/mfa endpoints end to end, using
// otplib's own authenticator.generate() to produce genuinely valid TOTP
// codes for a freshly generated secret -- no hardcoded/fake codes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import { UserModel } from './user.model.js';
import { generateTotpSecret, generateRecoveryCodes, hashRecoveryCodes } from './auth.service.js';
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

test('an Admin without MFA enabled logs in directly with no MFA step (MFA is optional for Admin)', async () => {
  await createTestUser({ email: 'mfa-admin-off@example.test', roleKey: 'admin', mfaEnabled: false });
  const { res, body } = await login('mfa-admin-off@example.test', TEST_PASSWORD);
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken, 'must receive a full session immediately, no MFA gate');
});

test('a user with MFA enabled does NOT receive a session from /login alone -- only an mfaToken (no bypass via the plain login endpoint)', async () => {
  const secret = generateTotpSecret();
  await createTestUser({ email: 'mfa-on-no-bypass@example.test', roleKey: 'admin', mfaEnabled: true, mfaSecret: secret });
  const { res, body } = await login('mfa-on-no-bypass@example.test', TEST_PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(body.data.mfaRequired, true);
  assert.equal(body.data.accessToken, undefined, '/login must never hand out a real session while MFA is pending');
  assert.ok(body.data.mfaToken);
});

test('a valid TOTP code completes login and issues a full session', async () => {
  const secret = generateTotpSecret();
  await createTestUser({ email: 'mfa-totp-valid@example.test', roleKey: 'admin', mfaEnabled: true, mfaSecret: secret });
  const { body: loginBody } = await login('mfa-totp-valid@example.test', TEST_PASSWORD);
  const code = authenticator.generate(secret);

  const { res, body } = await loginMfa({ mfaToken: loginBody.data.mfaToken, code });
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
});

test('an invalid TOTP code is rejected', async () => {
  const secret = generateTotpSecret();
  await createTestUser({ email: 'mfa-totp-invalid@example.test', roleKey: 'admin', mfaEnabled: true, mfaSecret: secret });
  const { body: loginBody } = await login('mfa-totp-invalid@example.test', TEST_PASSWORD);

  const { res, body } = await loginMfa({ mfaToken: loginBody.data.mfaToken, code: '000000' });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'MFA_INVALID');
});

test('a valid recovery code completes login', async () => {
  const secret = generateTotpSecret();
  const codes = generateRecoveryCodes(4);
  const hashed = await hashRecoveryCodes(codes);
  await createTestUser({
    email: 'mfa-recovery-valid@example.test',
    roleKey: 'admin',
    mfaEnabled: true,
    mfaSecret: secret,
    mfaRecoveryCodesHashed: hashed,
  });
  const { body: loginBody } = await login('mfa-recovery-valid@example.test', TEST_PASSWORD);

  const { res, body } = await loginMfa({ mfaToken: loginBody.data.mfaToken, recoveryCode: codes[0] });
  assert.equal(res.status, 200);
  assert.ok(body.data.accessToken);
});

test('a recovery code is single-use -- reusing an already-consumed code is rejected', async () => {
  const secret = generateTotpSecret();
  const codes = generateRecoveryCodes(4);
  const hashed = await hashRecoveryCodes(codes);
  await createTestUser({
    email: 'mfa-recovery-singleuse@example.test',
    roleKey: 'admin',
    mfaEnabled: true,
    mfaSecret: secret,
    mfaRecoveryCodesHashed: hashed,
  });

  const first = await login('mfa-recovery-singleuse@example.test', TEST_PASSWORD);
  const firstUse = await loginMfa({ mfaToken: first.body.data.mfaToken, recoveryCode: codes[0] });
  assert.equal(firstUse.res.status, 200, 'first use of the recovery code must succeed');

  const second = await login('mfa-recovery-singleuse@example.test', TEST_PASSWORD);
  const secondUse = await loginMfa({ mfaToken: second.body.data.mfaToken, recoveryCode: codes[0] });
  assert.equal(secondUse.res.status, 401, 'reusing the same recovery code must be rejected');
  assert.equal(secondUse.body.code, 'MFA_INVALID');

  const freshUser = await UserModel.findOne({ email: 'mfa-recovery-singleuse@example.test' });
  assert.equal(freshUser.mfaRecoveryCodesHashed.length, 3, 'the consumed code must be removed from storage');
});

test('MFA bypass attempt: an expired or garbage mfaToken is rejected', async () => {
  const { res, body } = await loginMfa({ mfaToken: 'not-a-real-token', code: '123456' });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'MFA_TOKEN_INVALID');
});

test('MFA bypass attempt: an mfaToken for a user whose MFA was since disabled is rejected', async () => {
  const secret = generateTotpSecret();
  const user = await createTestUser({ email: 'mfa-disabled-after-token@example.test', roleKey: 'admin', mfaEnabled: true, mfaSecret: secret });
  const { body: loginBody } = await login('mfa-disabled-after-token@example.test', TEST_PASSWORD);

  // Simulate MFA having been turned off (e.g. by a Super Admin) between the
  // password step and the code step.
  user.mfaEnabled = false;
  await user.save();

  const code = authenticator.generate(secret);
  const { res, body } = await loginMfa({ mfaToken: loginBody.data.mfaToken, code });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'MFA_TOKEN_INVALID');
});
