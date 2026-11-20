// Task 7M — regression coverage for redirects.controller.js's admin CRUD
// endpoints. Previously had zero test coverage anywhere (confirmed by
// audit) — resolveRedirect.test.js only covers the pure lookup function,
// never the HTTP layer that actually creates/updates/deletes rules,
// including the loop-prevention logic that is the most failure-prone part
// of this controller.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';

let env;
let adminRole; // seeded 'admin' role already has redirects:read + redirects:write
let noPermsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noPermsRole = await RoleModel.create({ key: 'no_redirects_perms_role', name: 'No Redirects Perms', permissions: ['content:read'], mfaRequired: false });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function adminToken(emailSuffix) {
  const user = await createTestUser({ email: `redirects-${emailSuffix}@example.test`, roleKey: 'admin' });
  return signAccessToken(user, adminRole);
}

async function listRedirects(token) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/redirects`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function createRedirect(token, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/redirects`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function updateRedirect(token, id, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/redirects/${id}`, {
    method: 'PATCH',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function deleteRedirect(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/redirects/${id}`, { method: 'DELETE', headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- RBAC ---

test('GET /admin/redirects is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await listRedirects(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('POST /admin/redirects is rejected with 403 for a role without redirects:write', async () => {
  const user = await createTestUser({ email: 'redirects-noperm-post@example.test', roleKey: 'no_redirects_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await createRedirect(token, { fromPath: '/old', toPath: '/new' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- POST /admin/redirects: validation ---

test('POST /admin/redirects rejects a missing fromPath with 422', async () => {
  const token = await adminToken('post-missing-from');
  const { res, body } = await createRedirect(token, { toPath: '/new' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.fromPath);
});

test('POST /admin/redirects rejects a fromPath that does not start with "/" with 422', async () => {
  const token = await adminToken('post-bad-from');
  const { res, body } = await createRedirect(token, { fromPath: 'no-leading-slash', toPath: '/new' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.fromPath);
});

test('POST /admin/redirects accepts an absolute http(s) URL as toPath', async () => {
  const token = await adminToken('post-absolute-to');
  const { res, body } = await createRedirect(token, { fromPath: '/external-redirect', toPath: 'https://sanskritfromhome.org/' });
  assert.equal(res.status, 201);
  assert.equal(body.data.toPath, 'https://sanskritfromhome.org/');
});

test('POST /admin/redirects rejects a toPath that is neither site-relative nor an absolute http(s) URL with 422', async () => {
  const token = await adminToken('post-bad-to');
  const { res, body } = await createRedirect(token, { fromPath: '/bad-to-target', toPath: 'not-a-path-or-url' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.toPath);
});

test('POST /admin/redirects rejects a statusCode other than 301/302 with 422', async () => {
  const token = await adminToken('post-bad-status');
  const { res, body } = await createRedirect(token, { fromPath: '/bad-status', toPath: '/new', statusCode: 307 });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.statusCode);
});

test('POST /admin/redirects defaults statusCode to 301 when omitted', async () => {
  const token = await adminToken('post-default-status');
  const { res, body } = await createRedirect(token, { fromPath: '/default-status', toPath: '/new' });
  assert.equal(res.status, 201);
  assert.equal(body.data.statusCode, 301);
});

test('POST /admin/redirects rejects fromPath === toPath (self-loop) with 422', async () => {
  const token = await adminToken('post-self-loop');
  const { res, body } = await createRedirect(token, { fromPath: '/same-path', toPath: '/same-path' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.toPath);
});

test('POST /admin/redirects rejects a direct two-rule reversal loop (existing A->B, new B->A) with 422', async () => {
  const token = await adminToken('post-reversal');
  const first = await createRedirect(token, { fromPath: '/loop-a', toPath: '/loop-b' });
  assert.equal(first.res.status, 201);

  const { res, body } = await createRedirect(token, { fromPath: '/loop-b', toPath: '/loop-a' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.toPath);
  assert.match(body.message, /redirect loop/);
});

test('POST /admin/redirects rejects a duplicate fromPath with 409 REDIRECT_EXISTS', async () => {
  const token = await adminToken('post-dup');
  await createRedirect(token, { fromPath: '/duplicate-source', toPath: '/first-target' });
  const { res, body } = await createRedirect(token, { fromPath: '/duplicate-source', toPath: '/second-target' });
  assert.equal(res.status, 409);
  assert.equal(body.code, 'REDIRECT_EXISTS');
});

test('POST /admin/redirects on success records a redirects.created audit log entry', async () => {
  const user = await createTestUser({ email: 'redirects-audit-create@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await AuditLogModel.countDocuments({ action: 'redirects.created' });

  const { res, body } = await createRedirect(token, { fromPath: '/audit-create-source', toPath: '/audit-create-target' });
  assert.equal(res.status, 201);

  const logs = await AuditLogModel.find({ action: 'redirects.created' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(String(logs[0].targetId), String(body.data._id));
});

// --- PATCH /admin/redirects/:id ---

test('PATCH /admin/redirects/:id returns 404 for a nonexistent id', async () => {
  const token = await adminToken('patch-404');
  const { res, body } = await updateRedirect(token, '507f1f77bcf86cd799439011', { toPath: '/new' });
  assert.equal(res.status, 404);
  assert.equal(body.code, 'REDIRECT_NOT_FOUND');
});

test('PATCH /admin/redirects/:id updates only the given fields, preserving the rest', async () => {
  const token = await adminToken('patch-partial');
  const created = await createRedirect(token, { fromPath: '/patch-partial-source', toPath: '/patch-partial-original', statusCode: 301, notes: 'original note' });
  const { res, body } = await updateRedirect(token, created.body.data._id, { toPath: '/patch-partial-updated' });
  assert.equal(res.status, 200);
  assert.equal(body.data.toPath, '/patch-partial-updated');
  assert.equal(body.data.fromPath, '/patch-partial-source');
  assert.equal(body.data.notes, 'original note');
});

test('PATCH /admin/redirects/:id: a no-op re-save of a rule\'s own unchanged values is never rejected as a self-conflict (excludeId works)', async () => {
  const token = await adminToken('patch-loop-exclude-selfsave');
  const rule = await createRedirect(token, { fromPath: '/patch-loop-self-a', toPath: '/patch-loop-self-b' });
  const { res } = await updateRedirect(token, rule.body.data._id, { toPath: '/patch-loop-self-b' });
  assert.equal(res.status, 200, 'saving a rule with its own existing toPath must not be rejected as colliding with itself');
});

test('PATCH /admin/redirects/:id: updating a rule into a genuine reversal of a DIFFERENT existing rule is still blocked (excludeId only excuses the document\'s own row)', async () => {
  const token = await adminToken('patch-loop-exclude-genuine');
  await createRedirect(token, { fromPath: '/patch-loop-other-e', toPath: '/patch-loop-other-f' });
  const ruleToChange = await createRedirect(token, { fromPath: '/patch-loop-other-g', toPath: '/patch-loop-other-h' });

  const { res, body } = await updateRedirect(token, ruleToChange.body.data._id, { fromPath: '/patch-loop-other-f', toPath: '/patch-loop-other-e' });
  assert.equal(res.status, 422, 'this would create a genuine two-rule reversal with a DIFFERENT existing rule -- excludeId must not excuse that');
  assert.ok(body.fieldErrors.toPath);
});

test('PATCH /admin/redirects/:id rejects a change that collides with another rule\'s fromPath with 409', async () => {
  const token = await adminToken('patch-dup');
  await createRedirect(token, { fromPath: '/patch-dup-existing', toPath: '/patch-dup-target-1' });
  const toChange = await createRedirect(token, { fromPath: '/patch-dup-changeable', toPath: '/patch-dup-target-2' });

  const { res, body } = await updateRedirect(token, toChange.body.data._id, { fromPath: '/patch-dup-existing' });
  assert.equal(res.status, 409);
  assert.equal(body.code, 'REDIRECT_EXISTS');
});

test('PATCH /admin/redirects/:id on success records a redirects.updated audit log entry', async () => {
  const user = await createTestUser({ email: 'redirects-audit-update@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createRedirect(token, { fromPath: '/audit-update-source', toPath: '/audit-update-original' });
  const before = await AuditLogModel.countDocuments({ action: 'redirects.updated' });

  const { res } = await updateRedirect(token, created.body.data._id, { toPath: '/audit-update-new' });
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'redirects.updated' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
});

// --- DELETE /admin/redirects/:id ---

test('DELETE /admin/redirects/:id is rejected with 403 for a role without redirects:write', async () => {
  const writer = await adminToken('delete-setup');
  const created = await createRedirect(writer, { fromPath: '/delete-noperm-source', toPath: '/delete-noperm-target' });

  const noPermUser = await createTestUser({ email: 'redirects-noperm-delete@example.test', roleKey: 'no_redirects_perms_role' });
  const noPermToken = signAccessToken(noPermUser, noPermsRole);
  const { res, body } = await deleteRedirect(noPermToken, created.body.data._id);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('DELETE /admin/redirects/:id returns 404 for a nonexistent id', async () => {
  const token = await adminToken('delete-404');
  const { res, body } = await deleteRedirect(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'REDIRECT_NOT_FOUND');
});

test('DELETE /admin/redirects/:id succeeds, actually removes the document, and records a redirects.deleted audit log entry', async () => {
  const user = await createTestUser({ email: 'redirects-audit-delete@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createRedirect(token, { fromPath: '/delete-success-source', toPath: '/delete-success-target' });
  const before = await AuditLogModel.countDocuments({ action: 'redirects.deleted' });

  const { res, body } = await deleteRedirect(token, created.body.data._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.deleted, true);

  const { res: listRes, body: listBody } = await listRedirects(token);
  assert.equal(listRes.status, 200);
  assert.ok(!listBody.data.some((r) => r._id === created.body.data._id), 'the deleted redirect must no longer appear in the list');

  const logs = await AuditLogModel.find({ action: 'redirects.deleted' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.fromPath, '/delete-success-source');
});

// --- GET /admin/redirects ---

test('GET /admin/redirects succeeds for a role with redirects:read, and supports pagination', async () => {
  const token = await adminToken('list-paginate');
  for (let i = 0; i < 3; i += 1) {
    await createRedirect(token, { fromPath: `/list-paginate-${i}`, toPath: `/target-${i}` });
  }
  const { res, body } = await fetch(`${env.baseUrl}/api/v1/admin/redirects?page=1&limit=2`, { headers: authHeader(token) }).then(async (r) => ({ res: r, body: await r.json() }));
  assert.equal(res.status, 200);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.data.length, 2);
});
