// Security regression coverage: LOGIN (A) and ACCOUNT LOCKOUT (C).
// Exercises the real authRouter/auth.controller.js end to end against a
// throwaway in-memory MongoDB (see authTestHelpers.js) -- never the real,
// persistent database, and never a real administrator account.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { UserModel } from './user.model.js';
import { setupTestEnv, teardownTestEnv, createTestUser, TEST_PASSWORD } from './authTestHelpers.js';

let env;

before(async () => {
  env = await setupTestEnv();
});

after(async () => {
  await teardownTestEnv(env);
});

async function login(email, password) {
  return fetch(`${env.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

// --- A. LOGIN ---------------------------------------------------------

test('successful authentication with valid credentials returns a full session', async () => {
  const user = await createTestUser({ email: 'login-success@example.test' });
  const res = await login('login-success@example.test', TEST_PASSWORD);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.ok(body.data.accessToken, 'must return an access token');
  assert.equal(body.data.user.id, String(user._id));
  assert.equal(body.data.user.email, 'login-success@example.test');
  assert.ok(res.headers.get('set-cookie')?.includes('vyoma_refresh='), 'must set the refresh cookie');
});

test('invalid password is rejected with a generic error', async () => {
  await createTestUser({ email: 'login-badpw@example.test' });
  const res = await login('login-badpw@example.test', 'TotallyWrongPassword1!');
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, 'INVALID_CREDENTIALS');
});

test('unknown user is rejected with the exact same generic error (no account-existence leak)', async () => {
  const res = await login('no-such-user@example.test', TEST_PASSWORD);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, 'INVALID_CREDENTIALS');
  assert.equal(body.message, 'Incorrect email or password.');
});

test('a disabled user is rejected with the same generic error as a wrong password, not a distinct "disabled" error', async () => {
  await createTestUser({ email: 'login-disabled@example.test', status: 'disabled' });
  const res = await login('login-disabled@example.test', TEST_PASSWORD);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, 'INVALID_CREDENTIALS');
});

test('missing email or password is rejected with a validation error', async () => {
  const resNoPassword = await login('login-success@example.test', '');
  assert.equal(resNoPassword.status, 422);
  assert.equal((await resNoPassword.json()).code, 'VALIDATION_ERROR');

  const resNoEmail = await login('', TEST_PASSWORD);
  assert.equal(resNoEmail.status, 422);
  assert.equal((await resNoEmail.json()).code, 'VALIDATION_ERROR');
});

// --- C. ACCOUNT LOCKOUT -------------------------------------------------

test('the failed-login counter increments on each wrong password, and resets to 0 on the next successful login', async () => {
  const email = 'lockout-counter@example.test';
  await createTestUser({ email });

  for (let i = 1; i <= 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await login(email, 'wrong-password');
    // eslint-disable-next-line no-await-in-loop
    assert.equal(res.status, 401);
    // eslint-disable-next-line no-await-in-loop
    const fresh = await UserModel.findOne({ email });
    assert.equal(fresh.failedLoginAttempts, i, `after ${i} wrong attempts, counter should be ${i}`);
  }

  const okRes = await login(email, TEST_PASSWORD);
  assert.equal(okRes.status, 200);
  const afterSuccess = await UserModel.findOne({ email });
  assert.equal(afterSuccess.failedLoginAttempts, 0, 'a successful login must reset the failed-attempt counter');
  assert.equal(afterSuccess.lockedUntil, null);
});

test('the account locks after 5 consecutive failed attempts, blocking even a subsequent CORRECT password', async () => {
  const email = 'lockout-threshold@example.test';
  await createTestUser({ email });

  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await login(email, 'wrong-password');
    // eslint-disable-next-line no-await-in-loop
    assert.equal(res.status, 401, `attempt ${i + 1} should still be a plain invalid-credentials rejection`);
  }

  const lockedUser = await UserModel.findOne({ email });
  assert.ok(lockedUser.lockedUntil > new Date(), 'lockedUntil must be set in the future after the 5th failure');
  assert.equal(lockedUser.failedLoginAttempts, 0, 'the counter resets once the lock itself is applied');

  const res = await login(email, TEST_PASSWORD);
  assert.equal(res.status, 423, 'a locked account must reject even the correct password');
  assert.equal((await res.json()).code, 'ACCOUNT_LOCKED');
});

test('lockout expires once lockedUntil is in the past, allowing a correct-password login through again', async () => {
  const email = 'lockout-expired@example.test';
  const user = await createTestUser({ email });
  user.lockedUntil = new Date(Date.now() - 60_000); // already expired
  user.failedLoginAttempts = 0;
  await user.save();

  const res = await login(email, TEST_PASSWORD);
  assert.equal(res.status, 200, 'an expired lock must not block a correct-password login');
});
