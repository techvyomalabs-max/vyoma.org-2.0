// Security regression coverage: ROLE-BASED ACCESS CONTROL (F).
// Drives real admin routes through the real adminRouter (requireAuth once
// at the mount point, then per-route requireRole/requirePermission -- see
// src/routes/admin.routes.js) against freshly minted tokens for throwaway
// users. No real administrator account is used anywhere in this file.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { RoleModel } from './role.model.js';
import { signAccessToken } from './auth.service.js';
import { setupTestEnv, teardownTestEnv, createTestUser } from './authTestHelpers.js';

let env;
let adminRole;
let superAdminRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  superAdminRole = await RoleModel.findOne({ key: 'super_admin' });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function get(path, token) {
  return fetch(`${env.baseUrl}${path}`, { headers: authHeader(token) });
}

async function post(path, token, body = {}) {
  return fetch(`${env.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(token) },
    body: JSON.stringify(body),
  });
}

test('an unauthenticated request to any admin route is rejected with 401', async () => {
  const res = await get('/api/v1/admin/users', undefined);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).code, 'UNAUTHENTICATED');
});

test('insufficient permissions on a permission-gated route return 403', async () => {
  // A role with zero permissions, to isolate requirePermission's 403 from
  // any specific business logic.
  await RoleModel.create({ key: 'no_perms_role', name: 'No Perms', permissions: [], mfaRequired: false });
  const user = await createTestUser({ email: 'rbac-no-perms@example.test', roleKey: 'no_perms_role' });
  const role = await RoleModel.findOne({ key: 'no_perms_role' });
  const token = signAccessToken(user, role);

  const res = await get('/api/v1/admin/content/types', token);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, 'FORBIDDEN');
});

test('Super Admin (permissions: ["*"]) passes both requireRole and requirePermission gates', async () => {
  const user = await createTestUser({ email: 'rbac-super@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const usersRes = await get('/api/v1/admin/users', token);
  assert.equal(usersRes.status, 200, 'Super Admin must pass the requireRole(super_admin) gate on user management');

  const contentRes = await get('/api/v1/admin/content/types', token);
  assert.equal(contentRes.status, 200, 'Super Admin\'s wildcard permission must pass a requirePermission gate too');

  const auditRes = await get('/api/v1/admin/audit-logs', token);
  assert.equal(auditRes.status, 200, 'Super Admin must pass the audit-log role gate');
});

test('Admin role permissions (content/forms/donations/media/redirects/settings/blog) are enforced and sufficient where granted', async () => {
  const user = await createTestUser({ email: 'rbac-admin-perms@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const contentRes = await get('/api/v1/admin/content/types', token);
  assert.equal(contentRes.status, 200, 'admin has content:read and must pass');
});

test('Admin is blocked (403) from Super-Admin-only user management and audit-log routes', async () => {
  const user = await createTestUser({ email: 'rbac-admin-blocked@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const listUsersRes = await get('/api/v1/admin/users', token);
  assert.equal(listUsersRes.status, 403);
  assert.equal((await listUsersRes.json()).code, 'FORBIDDEN');

  const createUserRes = await post('/api/v1/admin/users', token, { name: 'X', email: 'x@example.test', password: 'abcdefghij', roleKey: 'admin' });
  assert.equal(createUserRes.status, 403);

  const auditRes = await get('/api/v1/admin/audit-logs', token);
  assert.equal(auditRes.status, 403, 'admin must not be able to read the audit log');
});

test('a disabled user cannot access a protected endpoint even with an otherwise still-valid, unexpired access token', async () => {
  const user = await createTestUser({ email: 'rbac-disabled@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  // Sanity check: the token works before the account is disabled.
  const before = await get('/api/v1/auth/me', token);
  assert.equal(before.status, 200);

  user.status = 'disabled';
  await user.save();

  const after = await get('/api/v1/auth/me', token);
  assert.equal(after.status, 401, 'requireAuth\'s live DB check must reject a token for a now-disabled account');
  assert.equal((await after.json()).code, 'UNAUTHENTICATED');

  const adminRouteAfter = await get('/api/v1/admin/content/types', token);
  assert.equal(adminRouteAfter.status, 401, 'the same must hold for admin routes, before any role/permission check even runs');
});

test('Super Admin can both list and create users; a freshly created Super Admin user then has the same access', async () => {
  const superUser = await createTestUser({ email: 'rbac-super-acting@example.test', roleKey: 'super_admin' });
  const superToken = signAccessToken(superUser, superAdminRole);

  const createRes = await post('/api/v1/admin/users', superToken, {
    name: 'New Admin',
    email: 'rbac-newly-created@example.test',
    password: 'aBrandNewPassword1!',
    roleKey: 'admin',
  });
  assert.equal(createRes.status, 201);

  const listRes = await get('/api/v1/admin/users', superToken);
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.ok(listBody.data.some((u) => u.email === 'rbac-newly-created@example.test'));
});
