// Task 7M — regression coverage for the password-reset/change flow
// (forgotPassword, resetPassword, changePassword in auth.controller.js) and
// a confirming test for logout()'s actual behavior. Previously had zero
// dedicated test coverage anywhere in the repo (confirmed by audit) despite
// being a classic account-takeover attack surface (token reuse, expiry
// bypass, account enumeration).
//
// Calls the controller functions DIRECTLY against a disposable
// mongodb-memory-server, bypassing Express routing entirely -- the same
// established pattern as blog.admin.controller.structuralGuard.test.js.
// This is deliberate, not just convenient: /password/forgot and
// /password/reset share ONE real rate limiter (forgotLimiter, max 5 requests
// per 60-minute window -- see auth.routes.js), which a full HTTP-level test
// suite covering this many scenarios would immediately exhaust (the window
// cannot be fast-forwarded in a test). Direct controller invocation
// exercises the exact same business logic with no such ceiling. A real
// HTTP-level smoke test already exists implicitly via this same pattern
// being proven correct elsewhere in the suite; route wiring itself
// (rate limiter + controller attached to the right path) is a one-line,
// low-risk fact already visible by reading auth.routes.js.
//
// SMTP is never configured in this test environment (testEnvDefaults.mjs
// only sets ALLOW_LOCAL_DEV_DEFAULTS), so sendMail() always takes its
// already-safe "log instead of send" branch -- no real email is ever sent,
// and no mock is needed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let UserModel;
let AuditLogModel;
let hashPassword;
let verifyPassword;
let generateResetToken;
let hashResetToken;
let forgotPassword;
let resetPassword;
let changePassword;
let logout;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ UserModel } = await import('./user.model.js'));
  ({ AuditLogModel } = await import('../audit/auditLog.model.js'));
  ({ hashPassword, verifyPassword, generateResetToken, hashResetToken } = await import('./auth.service.js'));
  ({ forgotPassword, resetPassword, changePassword, logout } = await import('./auth.controller.js'));
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

let counter = 0;
async function createUser(overrides = {}) {
  counter += 1;
  return UserModel.create({
    name: 'Reset Flow User',
    email: `reset-flow-${counter}@example.test`,
    passwordHash: await hashPassword('OriginalPassw0rd!'),
    roleKey: 'admin',
    status: 'active',
    ...overrides,
  });
}

// `next` re-throws synchronously, turning the controller's own `next(err)`
// call (inside its catch block) into a real rejection `assert.rejects` can
// catch -- same convention as blog.admin.controller.structuralGuard.test.js.
function fakeReqRes(body, userId) {
  let statusCode;
  let payload;
  const req = { body, user: userId ? { id: String(userId) } : undefined };
  const res = {
    status(code) { statusCode = code; return res; },
    json(p) { payload = p; return res; },
  };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getStatus: () => statusCode, getPayload: () => payload };
}

// --- forgotPassword ---

test('forgotPassword with an unknown email responds with the same generic message and writes no token/audit entry (no account enumeration)', async () => {
  const before_ = await AuditLogModel.countDocuments({ action: 'auth.password_reset_requested' });
  const { req, res, next, getStatus, getPayload } = fakeReqRes({ email: 'no-such-account@example.test' });
  await forgotPassword(req, res, next);
  assert.equal(getStatus(), 200);
  assert.match(getPayload().data.message, /If that email exists/);

  const after_ = await AuditLogModel.countDocuments({ action: 'auth.password_reset_requested' });
  assert.equal(after_, before_, 'an unknown email must never trigger an audit entry (would itself leak account existence)');
});

test('forgotPassword with a missing email is rejected with 422', async () => {
  const { req, res, next } = fakeReqRes({});
  await assert.rejects(() => forgotPassword(req, res, next), (err) => err.status === 422 && err.code === 'VALIDATION_ERROR');
});

test('forgotPassword with a disabled account\'s email responds with the same generic message (status filter is enforced)', async () => {
  const user = await createUser({ status: 'disabled' });
  const { req, res, next, getStatus, getPayload } = fakeReqRes({ email: user.email });
  await forgotPassword(req, res, next);
  assert.equal(getStatus(), 200);
  assert.match(getPayload().data.message, /If that email exists/);

  const reloaded = await UserModel.findById(user._id);
  assert.ok(!reloaded.passwordResetTokenHash, 'a disabled account must never get a real reset token issued');
});

test('forgotPassword with a real active user generates a reset token, sets an expiry, and records an audit entry', async () => {
  const user = await createUser();
  const { req, res, next, getStatus } = fakeReqRes({ email: user.email });
  await forgotPassword(req, res, next);
  assert.equal(getStatus(), 200);

  const reloaded = await UserModel.findById(user._id);
  assert.ok(reloaded.passwordResetTokenHash, 'expected a reset token hash to be set');
  assert.ok(reloaded.passwordResetExpires > new Date(), 'expected a future expiry');

  const logs = await AuditLogModel.find({ action: 'auth.password_reset_requested', actorEmail: user.email });
  assert.equal(logs.length, 1);
});

// --- resetPassword ---

test('resetPassword with a missing token or newPassword is rejected with 422', async () => {
  const { req, res, next } = fakeReqRes({ newPassword: 'LongEnough123!' });
  await assert.rejects(() => resetPassword(req, res, next), (err) => err.status === 422 && err.code === 'VALIDATION_ERROR');
});

test('resetPassword rejects a newPassword shorter than 10 characters with 422, before even looking up the token', async () => {
  const { req, res, next } = fakeReqRes({ token: 'whatever-token-value', newPassword: 'short1' });
  await assert.rejects(() => resetPassword(req, res, next), (err) => err.status === 422 && err.code === 'VALIDATION_ERROR');
});

test('resetPassword with a token that matches no user is rejected with 400 RESET_TOKEN_INVALID', async () => {
  const { req, res, next } = fakeReqRes({ token: 'completely-made-up-token-value', newPassword: 'LongEnough123!' });
  await assert.rejects(() => resetPassword(req, res, next), (err) => err.status === 400 && err.code === 'RESET_TOKEN_INVALID');
});

test('resetPassword with an expired token is rejected with 400 RESET_TOKEN_INVALID', async () => {
  const user = await createUser();
  const { token, hash } = generateResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() - 1000); // already expired
  await user.save();

  const { req, res, next } = fakeReqRes({ token, newPassword: 'LongEnough123!' });
  await assert.rejects(() => resetPassword(req, res, next), (err) => err.status === 400 && err.code === 'RESET_TOKEN_INVALID');

  const reloaded = await UserModel.findById(user._id);
  assert.ok(await verifyPassword('OriginalPassw0rd!', reloaded.passwordHash), 'an expired-token attempt must never actually change the password');
});

test('resetPassword with a valid token succeeds: changes the password, clears the token, bumps refreshTokenVersion, resets lockout state, and records an audit entry', async () => {
  const user = await createUser({ failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 60000) });
  const refreshVersionBefore = user.refreshTokenVersion;
  const { token, hash } = generateResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const { req, res, next, getStatus } = fakeReqRes({ token, newPassword: 'BrandNewPassw0rd!' });
  await resetPassword(req, res, next);
  assert.equal(getStatus(), 200);

  const reloaded = await UserModel.findById(user._id);
  assert.equal(reloaded.passwordResetTokenHash, null);
  assert.equal(reloaded.passwordResetExpires, null);
  assert.equal(reloaded.refreshTokenVersion, refreshVersionBefore + 1, 'resetting the password must invalidate every outstanding session');
  assert.equal(reloaded.failedLoginAttempts, 0);
  assert.equal(reloaded.lockedUntil, null);
  assert.ok(await verifyPassword('BrandNewPassw0rd!', reloaded.passwordHash));
  assert.ok(!(await verifyPassword('OriginalPassw0rd!', reloaded.passwordHash)), 'the old password must no longer work');

  const logs = await AuditLogModel.find({ action: 'auth.password_reset_completed', actorEmail: user.email });
  assert.equal(logs.length, 1);
});

test('resetPassword rejects reusing the same token a second time (single-use)', async () => {
  const user = await createUser();
  const { token, hash } = generateResetToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const first = fakeReqRes({ token, newPassword: 'FirstNewPassw0rd!' });
  await resetPassword(first.req, first.res, first.next);
  assert.equal(first.getStatus(), 200);

  const second = fakeReqRes({ token, newPassword: 'SecondNewPassw0rd!' });
  await assert.rejects(() => resetPassword(second.req, second.res, second.next), (err) => err.status === 400 && err.code === 'RESET_TOKEN_INVALID');
});

test('hashResetToken is deterministic for the same raw token (required for the lookup-by-hash to ever match)', () => {
  const { token } = generateResetToken();
  assert.equal(hashResetToken(token), hashResetToken(token));
});

// --- changePassword ---

test('changePassword with a missing field is rejected with 422', async () => {
  const user = await createUser();
  const { req, res, next } = fakeReqRes({ currentPassword: 'OriginalPassw0rd!' }, user._id);
  await assert.rejects(() => changePassword(req, res, next), (err) => err.status === 422 && err.code === 'VALIDATION_ERROR');
});

test('changePassword rejects a newPassword shorter than 10 characters with 422', async () => {
  const user = await createUser();
  const { req, res, next } = fakeReqRes({ currentPassword: 'OriginalPassw0rd!', newPassword: 'short1' }, user._id);
  await assert.rejects(() => changePassword(req, res, next), (err) => err.status === 422 && err.code === 'VALIDATION_ERROR');
});

test('changePassword rejects an incorrect currentPassword with 401, and never changes the real password', async () => {
  const user = await createUser();
  const { req, res, next } = fakeReqRes({ currentPassword: 'TotallyWrongPassword!', newPassword: 'BrandNewPassw0rd!' }, user._id);
  await assert.rejects(() => changePassword(req, res, next), (err) => err.status === 401 && err.code === 'INVALID_CREDENTIALS');

  const reloaded = await UserModel.findById(user._id);
  assert.ok(await verifyPassword('OriginalPassw0rd!', reloaded.passwordHash));
});

test('changePassword with the correct currentPassword succeeds: changes the password, bumps refreshTokenVersion, and records an audit entry', async () => {
  const user = await createUser();
  const refreshVersionBefore = user.refreshTokenVersion;
  const { req, res, next, getStatus } = fakeReqRes({ currentPassword: 'OriginalPassw0rd!', newPassword: 'BrandNewPassw0rd!' }, user._id);
  await changePassword(req, res, next);
  assert.equal(getStatus(), 200);

  const reloaded = await UserModel.findById(user._id);
  assert.equal(reloaded.refreshTokenVersion, refreshVersionBefore + 1, 'changing the password must invalidate every outstanding session');
  assert.ok(await verifyPassword('BrandNewPassw0rd!', reloaded.passwordHash));
  assert.ok(!(await verifyPassword('OriginalPassw0rd!', reloaded.passwordHash)));

  const logs = await AuditLogModel.find({ action: 'auth.password_changed', actorEmail: user.email });
  assert.equal(logs.length, 1);
});

// --- logout() -- confirming test, not a "fix" ---

// Found during this audit: logout() only ever clears the refresh cookie --
// it never looks up the user or bumps refreshTokenVersion, unlike
// resetPassword/changePassword above (both of which deliberately do). This
// test documents that as the CURRENT, real behavior, not a bug this task is
// fixing (per Task 7M's own instruction: report a suspected bug, don't fix
// it unprompted) -- flagged prominently in the task report for a product/
// security decision: a refresh token that was already exfiltrated before a
// legitimate "logout" remains valid (within its own TTL) after that logout,
// since only the cookie is cleared, not server-side session state.
test('finding: logout() clears only the cookie -- it does not invalidate the refresh token server-side (refreshTokenVersion is untouched)', async () => {
  const user = await createUser();
  const versionBefore = user.refreshTokenVersion;

  const req = { body: {} };
  let clearedCookieName;
  const res = {
    clearCookie(name) { clearedCookieName = name; },
    status() { return res; },
    json() { return res; },
  };
  const next = (err) => { if (err) throw err; };
  await logout(req, res, next);

  assert.equal(clearedCookieName, 'vyoma_refresh');
  const reloaded = await UserModel.findById(user._id);
  assert.equal(reloaded.refreshTokenVersion, versionBefore, 'logout() does not bump refreshTokenVersion -- confirmed current behavior, not asserted here as either correct or incorrect');
});
