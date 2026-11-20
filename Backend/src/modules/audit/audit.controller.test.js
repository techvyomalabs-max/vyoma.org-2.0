// Regression coverage for GET /api/v1/admin/audit-logs (audit.controller.js):
// the super_admin-only access boundary (this route uses requireRole, not
// requirePermission -- an 'admin' role with '*'-free permissions must still
// be refused even though it can reach most other admin routes), pagination,
// and every optional filter (action, actorEmail, targetType, dateFrom/dateTo).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from './auditLog.model.js';

let env;
let superAdminRole;
let adminRole;

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

async function listAuditLogs(token, query = '') {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/audit-logs${query}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function seedLog(overrides = {}) {
  return AuditLogModel.create({
    actorId: null,
    actorEmail: 'seed-actor@example.test',
    action: 'settings.updated',
    targetType: 'SiteSettings',
    targetId: null,
    details: null,
    ip: null,
    ...overrides,
  });
}

test('GET /admin/audit-logs is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await listAuditLogs(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/audit-logs is rejected with 403 for the admin role (requireRole is exact-match, not permission-based)', async () => {
  const user = await createTestUser({ email: 'audit-admin-role-forbidden@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await listAuditLogs(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('GET /admin/audit-logs succeeds for the super_admin role', async () => {
  await seedLog({ action: 'audit-smoke-test.event' });
  const user = await createTestUser({ email: 'audit-super-admin@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token);
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.meta);
  assert.ok('page' in body.meta && 'limit' in body.meta && 'total' in body.meta);
});

test('results are sorted newest first and paginated with the documented defaults/caps, deterministically even when timestamps tie', async () => {
  await AuditLogModel.deleteMany({ action: 'audit-pagination-test.event' });
  // All 5 rows share one identical createdAt -- forcing the real-world tie
  // scenario deterministically on every run, rather than depending on
  // incidental millisecond timing. Pre-fix, MongoDB's order among these ties
  // was unspecified (observed in CI: an intermittent off-by-one row swap at
  // a page boundary); the only thing that can now distinguish them is the
  // _id secondary sort key, in creation order.
  const tiedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await seedLog({ action: 'audit-pagination-test.event', actorEmail: `page-${i}@example.test`, createdAt: tiedCreatedAt });
  }
  const user = await createTestUser({ email: 'audit-pagination@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { res, body } = await listAuditLogs(token, '?action=audit-pagination-test.event&limit=2&page=1');
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 2);
  assert.equal(body.meta.page, 1);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.meta.total, 5);
  // Newest first: the last-seeded row (page-4) must come before page-3, even
  // though both share the exact same createdAt.
  assert.equal(body.data[0].actorEmail, 'page-4@example.test');
  assert.equal(body.data[1].actorEmail, 'page-3@example.test');

  const second = await listAuditLogs(token, '?action=audit-pagination-test.event&limit=2&page=2');
  assert.equal(second.body.data.length, 2);
  assert.equal(second.body.data[0].actorEmail, 'page-2@example.test');
  assert.equal(second.body.data[1].actorEmail, 'page-1@example.test');

  // The full reverse-insertion order, confirmed across every page: no row is
  // duplicated onto two pages or omitted from all of them.
  const third = await listAuditLogs(token, '?action=audit-pagination-test.event&limit=2&page=3');
  assert.equal(third.body.data.length, 1);
  assert.equal(third.body.data[0].actorEmail, 'page-0@example.test');
});

test('limit is capped at 100 even when a larger value is requested', async () => {
  const user = await createTestUser({ email: 'audit-limit-cap@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token, '?limit=500');
  assert.equal(res.status, 200);
  assert.equal(body.meta.limit, 100);
});

test('page below 1 is clamped to page 1', async () => {
  const user = await createTestUser({ email: 'audit-page-floor@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token, '?page=0');
  assert.equal(res.status, 200);
  assert.equal(body.meta.page, 1);
});

test('the action filter returns only exact matches', async () => {
  await seedLog({ action: 'audit-filter-exact.match' });
  await seedLog({ action: 'audit-filter-exact.other' });
  const user = await createTestUser({ email: 'audit-filter-action@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { body } = await listAuditLogs(token, '?action=audit-filter-exact.match');
  assert.ok(body.data.length >= 1);
  assert.ok(body.data.every((row) => row.action === 'audit-filter-exact.match'));
});

test('the actorEmail filter is case-insensitive', async () => {
  await seedLog({ action: 'audit-filter-email.event', actorEmail: 'mixedcase@example.test' });
  const user = await createTestUser({ email: 'audit-filter-actoremail@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { body } = await listAuditLogs(token, '?actorEmail=MixedCase@Example.Test');
  assert.ok(body.data.some((row) => row.actorEmail === 'mixedcase@example.test'));
});

test('the targetType filter returns only exact matches', async () => {
  await seedLog({ action: 'audit-filter-target.event', targetType: 'PhotoProcessingJob' });
  const user = await createTestUser({ email: 'audit-filter-targettype@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { body } = await listAuditLogs(token, '?targetType=PhotoProcessingJob');
  assert.ok(body.data.every((row) => row.targetType === 'PhotoProcessingJob'));
});

test('GET /admin/audit-logs rejects an operator-shaped action query parameter (NoSQL injection attempt) with 422', async () => {
  const user = await createTestUser({ email: 'audit-filter-action-injection@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { res, body } = await listAuditLogs(token, '?action[$regex]=.*&action[$options]=i');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/audit-logs rejects an operator-shaped targetType query parameter with 422', async () => {
  const user = await createTestUser({ email: 'audit-filter-targettype-injection@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const { res, body } = await listAuditLogs(token, '?targetType[$ne]=null');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('dateFrom/dateTo filter on createdAt, inclusive of the boundary', async () => {
  const marker = await seedLog({ action: 'audit-filter-date.event' });
  const user = await createTestUser({ email: 'audit-filter-date@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);

  const createdAt = new Date(marker.createdAt);
  const from = new Date(createdAt.getTime() - 60_000).toISOString();
  const to = new Date(createdAt.getTime() + 60_000).toISOString();

  const { body } = await listAuditLogs(token, `?action=audit-filter-date.event&dateFrom=${from}&dateTo=${to}`);
  assert.ok(body.data.some((row) => row.action === 'audit-filter-date.event'));

  const tooLate = new Date(createdAt.getTime() + 60_000).toISOString();
  const tooLateFrom = new Date(createdAt.getTime() + 120_000).toISOString();
  const { body: empty } = await listAuditLogs(token, `?action=audit-filter-date.event&dateFrom=${tooLateFrom}`);
  assert.equal(empty.data.filter((row) => row.action === 'audit-filter-date.event').length, 0);
  void tooLate;
});

test('an invalid dateFrom is rejected with 422', async () => {
  const user = await createTestUser({ email: 'audit-bad-datefrom@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token, '?dateFrom=not-a-date');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('an invalid dateTo is rejected with 422', async () => {
  const user = await createTestUser({ email: 'audit-bad-dateto@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token, '?dateTo=not-a-date');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('omitting all filters preserves the prior behavior of returning every row, newest first', async () => {
  const user = await createTestUser({ email: 'audit-no-filters@example.test', roleKey: 'super_admin' });
  const token = signAccessToken(user, superAdminRole);
  const { res, body } = await listAuditLogs(token, '?limit=100');
  assert.equal(res.status, 200);
  const total = await AuditLogModel.countDocuments({});
  assert.equal(body.meta.total, total);
  for (let i = 1; i < body.data.length; i += 1) {
    assert.ok(
      new Date(body.data[i - 1].createdAt).getTime() >= new Date(body.data[i].createdAt).getTime(),
      'rows must be sorted newest first'
    );
  }
});
