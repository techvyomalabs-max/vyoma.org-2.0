// Task 7M — regression coverage for users.admin.controller.js (Super
// Admin-only account lifecycle: list/create/disable/enable). Previously had
// zero dedicated test coverage anywhere in the repo (confirmed by audit) —
// only indirectly touched by auth.rbac.test.js's generic permission-gate
// smoke test. Uses the same disposable mongodb-memory-server + real
// createApp() + real HTTP request pattern already established by
// settings.controller.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from './authTestHelpers.js';
import { signAccessToken } from './auth.service.js';
import { RoleModel } from './role.model.js';
import { UserModel } from './user.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';

let env;
let superAdminRole;
let adminRole; // seeded 'admin' role -- has no user-management permission at all

before(async () => {
  env = await setupTestEnv();
  superAdminRole = await RoleModel.findOne({ key: 'super_admin' });
  adminRole = await RoleModel.findOne({ key: 'admin' });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function superAdminToken(overrides = {}) {
  const user = await createTestUser({ roleKey: 'super_admin', ...overrides });
  return { user, token: signAccessToken(user, superAdminRole) };
}

async function listUsers(token, query = '') {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/users${query}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function createUser(token, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/users`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function disableUser(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/users/${id}/disable`, { method: 'PATCH', headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function enableUser(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/users/${id}/enable`, { method: 'PATCH', headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function login(email, password) {
  const res = await fetch(`${env.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- GET /admin/users — RBAC ---

test('GET /admin/users is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await listUsers(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/users is rejected with 403 for a regular Admin (no user-management permission at all)', async () => {
  const user = await createTestUser({ email: 'users-get-admin-role@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await listUsers(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('GET /admin/users succeeds for Super Admin and never leaks passwordHash/mfaSecret', async () => {
  const { token } = await superAdminToken({ email: 'users-get-superadmin@example.test' });
  const { res, body } = await listUsers(token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.meta.page === 1 && body.meta.limit === 50);
  for (const u of body.data) {
    assert.equal('passwordHash' in u, false);
    assert.equal('mfaSecret' in u, false);
    assert.equal('mfaRecoveryCodesHashed' in u, false);
  }
});

test('GET /admin/users?q= filters by case-insensitive name/email match', async () => {
  const { token } = await superAdminToken({ email: 'users-q-super@example.test' });
  await createTestUser({ email: 'findme-regression@example.test', name: 'Findme Regression', roleKey: 'admin' });
  await createTestUser({ email: 'unrelated-other@example.test', name: 'Someone Else', roleKey: 'admin' });

  const { res, body } = await listUsers(token, '?q=findme');
  assert.equal(res.status, 200);
  assert.ok(body.data.some((u) => u.email === 'findme-regression@example.test'));
  assert.ok(!body.data.some((u) => u.email === 'unrelated-other@example.test'));
});

test('GET /admin/users?q= with a regex-special-character query does not throw (input is escaped, not interpreted as regex)', async () => {
  const { token } = await superAdminToken({ email: 'users-q-regex-super@example.test' });
  const { res, body } = await listUsers(token, `?q=${encodeURIComponent('a.*(b')}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
});

// --- POST /admin/users ---

test('POST /admin/users is rejected with 403 for a regular Admin', async () => {
  const user = await createTestUser({ email: 'users-post-admin-role@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await createUser(token, { name: 'New Person', email: 'new-person@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('POST /admin/users rejects a missing name with 422', async () => {
  const { token } = await superAdminToken({ email: 'users-post-missing-name@example.test' });
  const { res, body } = await createUser(token, { email: 'x@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(body.fieldErrors.name);
});

test('POST /admin/users rejects an invalid email format with 422', async () => {
  const { token } = await superAdminToken({ email: 'users-post-bad-email@example.test' });
  const { res, body } = await createUser(token, { name: 'X', email: 'not-an-email', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.email);
});

test('POST /admin/users rejects a password shorter than 10 characters with 422', async () => {
  const { token } = await superAdminToken({ email: 'users-post-short-pw@example.test' });
  const { res, body } = await createUser(token, { name: 'X', email: 'shortpw@example.test', password: 'short1', roleKey: 'admin' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.password);
});

test('POST /admin/users rejects an unknown roleKey with 422', async () => {
  const { token } = await superAdminToken({ email: 'users-post-bad-role@example.test' });
  const { res, body } = await createUser(token, { name: 'X', email: 'badrole@example.test', password: 'LongEnough123!', roleKey: 'not_a_real_role' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.roleKey);
});

test('POST /admin/users succeeds, returns a safe user shape, and the new account can actually log in', async () => {
  const { token } = await superAdminToken({ email: 'users-post-success-super@example.test' });
  const { res, body } = await createUser(token, { name: 'Brand New Admin', email: 'brand-new-admin@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 201);
  assert.equal(body.data.email, 'brand-new-admin@example.test');
  assert.equal(body.data.roleKey, 'admin');
  assert.equal('passwordHash' in body.data, false);

  const loginResult = await login('brand-new-admin@example.test', 'LongEnough123!');
  assert.equal(loginResult.res.status, 200);
  assert.ok(loginResult.body.data.accessToken);
});

test('POST /admin/users rejects a duplicate email with 409 EMAIL_IN_USE', async () => {
  const { token } = await superAdminToken({ email: 'users-post-dup-super@example.test' });
  await createUser(token, { name: 'First', email: 'duplicate-target@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  const { res, body } = await createUser(token, { name: 'Second', email: 'duplicate-target@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 409);
  assert.equal(body.code, 'EMAIL_IN_USE');
});

test('POST /admin/users on success records a users.created audit log entry', async () => {
  const { user: actor, token } = await superAdminToken({ email: 'users-post-audit-super@example.test' });
  const before = await AuditLogModel.countDocuments({ action: 'users.created' });
  const { res, body } = await createUser(token, { name: 'Audited User', email: 'audited-user@example.test', password: 'LongEnough123!', roleKey: 'admin' });
  assert.equal(res.status, 201);

  const logs = await AuditLogModel.find({ action: 'users.created' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, actor.email);
  assert.equal(logs[0].targetType, 'User');
  assert.equal(String(logs[0].targetId), String(body.data.id));
  assert.equal(logs[0].details.email, 'audited-user@example.test');
});

// --- PATCH /admin/users/:id/disable ---

test('PATCH /admin/users/:id/disable is rejected with 403 for a regular Admin', async () => {
  const target = await createTestUser({ email: 'users-disable-target-1@example.test', roleKey: 'admin' });
  const actor = await createTestUser({ email: 'users-disable-actor-admin@example.test', roleKey: 'admin' });
  const token = signAccessToken(actor, adminRole);
  const { res, body } = await disableUser(token, target._id);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('PATCH /admin/users/:id/disable returns 404 for a nonexistent user id', async () => {
  const { token } = await superAdminToken({ email: 'users-disable-404-super@example.test' });
  const { res, body } = await disableUser(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'USER_NOT_FOUND');
});

test('PATCH /admin/users/:id/disable blocks a Super Admin from disabling their own account', async () => {
  const { user, token } = await superAdminToken({ email: 'users-disable-self@example.test' });
  const { res, body } = await disableUser(token, user._id);
  assert.equal(res.status, 400);
  assert.equal(body.code, 'CANNOT_DISABLE_SELF');
});

test('PATCH /admin/users/:id/disable succeeds, flips status, bumps refreshTokenVersion, and invalidates the disabled user\'s existing session', async () => {
  const { token: superToken } = await superAdminToken({ email: 'users-disable-actor-super@example.test' });
  const target = await createTestUser({ email: 'users-disable-target-2@example.test', roleKey: 'admin', password: 'TargetPassw0rd!' });

  // The target logs in for real first, to get a real refresh cookie.
  const targetLogin = await fetch(`${env.baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: target.email, password: 'TargetPassw0rd!' }),
  });
  assert.equal(targetLogin.status, 200);
  const setCookie = targetLogin.headers.getSetCookie?.() || [targetLogin.headers.get('set-cookie')].filter(Boolean);
  const refreshCookie = setCookie.find((c) => c.startsWith('vyoma_refresh='))?.split(';')[0];
  assert.ok(refreshCookie, 'expected the target to receive a real refresh cookie on login');

  const { res, body } = await disableUser(superToken, target._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'disabled');

  const reloaded = await UserModel.findById(target._id);
  assert.equal(reloaded.status, 'disabled');
  assert.equal(reloaded.refreshTokenVersion, target.refreshTokenVersion + 1);

  // The disabled user's existing refresh token must no longer be honored.
  const refreshAttempt = await fetch(`${env.baseUrl}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { cookie: refreshCookie },
  });
  assert.equal(refreshAttempt.status, 401, 'a disabled user\'s pre-existing refresh token must be invalidated, not just blocked from future logins');
});

test('PATCH /admin/users/:id/disable on success records a users.disabled audit log entry', async () => {
  const { user: actor, token } = await superAdminToken({ email: 'users-disable-audit-super@example.test' });
  const target = await createTestUser({ email: 'users-disable-audit-target@example.test', roleKey: 'admin' });
  const before = await AuditLogModel.countDocuments({ action: 'users.disabled' });

  const { res } = await disableUser(token, target._id);
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'users.disabled' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, actor.email);
  assert.equal(String(logs[0].targetId), String(target._id));
});

// --- PATCH /admin/users/:id/enable ---

test('PATCH /admin/users/:id/enable is rejected with 403 for a regular Admin', async () => {
  const target = await createTestUser({ email: 'users-enable-target-1@example.test', roleKey: 'admin', status: 'disabled' });
  const actor = await createTestUser({ email: 'users-enable-actor-admin@example.test', roleKey: 'admin' });
  const token = signAccessToken(actor, adminRole);
  const { res, body } = await enableUser(token, target._id);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('PATCH /admin/users/:id/enable returns 404 for a nonexistent user id', async () => {
  const { token } = await superAdminToken({ email: 'users-enable-404-super@example.test' });
  const { res, body } = await enableUser(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'USER_NOT_FOUND');
});

test('PATCH /admin/users/:id/enable rejects re-enabling an already-active account with 400 USER_NOT_DISABLED', async () => {
  const { token } = await superAdminToken({ email: 'users-enable-not-disabled-super@example.test' });
  const target = await createTestUser({ email: 'users-enable-active-target@example.test', roleKey: 'admin', status: 'active' });
  const { res, body } = await enableUser(token, target._id);
  assert.equal(res.status, 400);
  assert.equal(body.code, 'USER_NOT_DISABLED');
});

test('PATCH /admin/users/:id/enable succeeds and does not reset MFA/password/refreshTokenVersion state', async () => {
  const { token } = await superAdminToken({ email: 'users-enable-success-super@example.test' });
  const target = await createTestUser({
    email: 'users-enable-success-target@example.test',
    roleKey: 'admin',
    status: 'disabled',
    mfaEnabled: true,
    mfaSecret: 'FAKESECRETFORTESTONLY',
  });
  const refreshVersionBefore = target.refreshTokenVersion;

  const { res, body } = await enableUser(token, target._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'active');

  const reloaded = await UserModel.findById(target._id);
  assert.equal(reloaded.status, 'active');
  assert.equal(reloaded.mfaEnabled, true, 're-enabling must never silently reset MFA state');
  assert.equal(reloaded.mfaSecret, 'FAKESECRETFORTESTONLY');
  assert.equal(reloaded.refreshTokenVersion, refreshVersionBefore, 're-enabling has nothing to invalidate -- must not bump refreshTokenVersion');
});

test('PATCH /admin/users/:id/enable on success records a users.enabled audit log entry', async () => {
  const { user: actor, token } = await superAdminToken({ email: 'users-enable-audit-super@example.test' });
  const target = await createTestUser({ email: 'users-enable-audit-target@example.test', roleKey: 'admin', status: 'disabled' });
  const before = await AuditLogModel.countDocuments({ action: 'users.enabled' });

  const { res } = await enableUser(token, target._id);
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'users.enabled' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, actor.email);
  assert.equal(String(logs[0].targetId), String(target._id));
});
