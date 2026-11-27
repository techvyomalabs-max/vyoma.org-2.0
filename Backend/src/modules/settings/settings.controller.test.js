// Regression coverage for the site-settings admin/public endpoints
// (settings.controller.js): permission boundaries on the admin routes,
// validation of every field updateSettings accepts, the partial-merge
// behavior of socialLinks/donationBankDetails, the public endpoint's
// PUBLIC_KEYS allowlist shaping, and the audit-log write on a successful
// update. Uses the same disposable mongodb-memory-server + real createApp()
// + real HTTP request pattern already established by
// media.rateLimiting.test.js / media.concurrency.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';

let env;
let adminRole; // seeded 'admin' role already has settings:read + settings:write
let readOnlyRole;
let noSettingsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  readOnlyRole = await RoleModel.create({
    key: 'settings_read_only_role',
    name: 'Settings Read Only',
    permissions: ['settings:read'],
    mfaRequired: false,
  });
  noSettingsRole = await RoleModel.create({
    key: 'no_settings_perms_role',
    name: 'No Settings Perms',
    permissions: ['content:read'],
    mfaRequired: false,
  });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function getAdminSettings(token) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/settings`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function putAdminSettings(token, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/settings`, {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getPublicSettings() {
  const res = await fetch(`${env.baseUrl}/api/v1/public/settings`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- GET /api/v1/admin/settings ---

test('GET /admin/settings is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await getAdminSettings(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/settings is rejected with 403 for a role without settings:read', async () => {
  const user = await createTestUser({ email: 'settings-get-noperm@example.test', roleKey: 'no_settings_perms_role' });
  const token = signAccessToken(user, noSettingsRole);
  const { res, body } = await getAdminSettings(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('GET /admin/settings creates the singleton document with defaults on first read', async () => {
  const user = await createTestUser({ email: 'settings-get-first@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const { res, body } = await getAdminSettings(token);
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.contactInboxEmail, null);
  assert.equal(body.data.financeContactEmail, null);
  assert.equal(body.data.maintenanceMode, false);
  assert.deepEqual(body.data.socialLinks, { linkedin: null, x: null, youtube: null, instagram: null, facebook: null });
  assert.deepEqual(body.data.donationBankDetails, {
    indiaAccountName: null,
    indiaBankName: null,
    fcraAccountName: null,
    fcraBankName: null,
  });
  assert.ok(body.data._id);

  // A second read must return the same singleton row, not create another.
  const second = await getAdminSettings(token);
  assert.equal(second.body.data._id, body.data._id);
});

// --- PUT /api/v1/admin/settings ---

test('PUT /admin/settings is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await putAdminSettings(undefined, { maintenanceMode: true });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('PUT /admin/settings is rejected with 403 for a role with settings:read but not settings:write', async () => {
  const user = await createTestUser({ email: 'settings-put-readonly@example.test', roleKey: 'settings_read_only_role' });
  const token = signAccessToken(user, readOnlyRole);
  const { res, body } = await putAdminSettings(token, { maintenanceMode: true });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('PUT /admin/settings rejects an unknown top-level key with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-unknown-key@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { notARealSetting: 'x' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNKNOWN_SETTING');
  assert.match(body.message, /notARealSetting/);
  assert.match(body.fieldErrors.setting, /Allowed keys:/);
});

test('PUT /admin/settings rejects an empty body with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-empty@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, {});
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('PUT /admin/settings rejects an invalid contactInboxEmail with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-bad-contact-email@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { contactInboxEmail: 'not-an-email' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('PUT /admin/settings accepts null for contactInboxEmail (explicit clear)', async () => {
  const user = await createTestUser({ email: 'settings-put-null-contact-email@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const set = await putAdminSettings(token, { contactInboxEmail: 'hello@vyoma.org' });
  assert.equal(set.res.status, 200);
  assert.equal(set.body.data.contactInboxEmail, 'hello@vyoma.org');

  const cleared = await putAdminSettings(token, { contactInboxEmail: null });
  assert.equal(cleared.res.status, 200);
  assert.equal(cleared.body.data.contactInboxEmail, null);
});

test('PUT /admin/settings rejects an unknown socialLinks sub-key with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-unknown-social-key@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { socialLinks: { tiktok: 'https://tiktok.com/@vyoma' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNKNOWN_SETTING');
  assert.match(body.message, /tiktok/);
  assert.match(body.fieldErrors.socialLinks, /Allowed keys:/);
});

test('PUT /admin/settings merges a partial socialLinks update instead of replacing the whole sub-object', async () => {
  const user = await createTestUser({ email: 'settings-put-social-merge@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const first = await putAdminSettings(token, { socialLinks: { linkedin: 'https://linkedin.com/company/vyoma' } });
  assert.equal(first.res.status, 200);
  assert.equal(first.body.data.socialLinks.linkedin, 'https://linkedin.com/company/vyoma');

  const second = await putAdminSettings(token, { socialLinks: { x: 'https://x.com/vyoma' } });
  assert.equal(second.res.status, 200);
  assert.equal(second.body.data.socialLinks.x, 'https://x.com/vyoma');
  assert.equal(
    second.body.data.socialLinks.linkedin,
    'https://linkedin.com/company/vyoma',
    'a partial socialLinks update must not wipe out a sibling key set by an earlier update'
  );
});

test('PUT /admin/settings rejects an unknown donationBankDetails sub-key with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-unknown-bank-key@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { donationBankDetails: { swiftCode: 'ABCD1234' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNKNOWN_SETTING');
  assert.match(body.message, /swiftCode/);
  assert.match(body.fieldErrors.donationBankDetails, /Allowed keys:/);
});

test('PUT /admin/settings merges a partial donationBankDetails update instead of replacing the whole sub-object', async () => {
  const user = await createTestUser({ email: 'settings-put-bank-merge@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const first = await putAdminSettings(token, { donationBankDetails: { indiaAccountName: 'Vyoma Linguistic Labs' } });
  assert.equal(first.res.status, 200);

  const second = await putAdminSettings(token, { donationBankDetails: { fcraAccountName: 'Vyoma FCRA' } });
  assert.equal(second.res.status, 200);
  assert.equal(second.body.data.donationBankDetails.fcraAccountName, 'Vyoma FCRA');
  assert.equal(
    second.body.data.donationBankDetails.indiaAccountName,
    'Vyoma Linguistic Labs',
    'a partial donationBankDetails update must not wipe out a sibling key set by an earlier update'
  );
});

test('PUT /admin/settings rejects an invalid financeContactEmail with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-bad-finance-email@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { financeContactEmail: 'nope' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('PUT /admin/settings rejects a non-boolean maintenanceMode with 422', async () => {
  const user = await createTestUser({ email: 'settings-put-bad-maintenance@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await putAdminSettings(token, { maintenanceMode: 'yes' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('PUT /admin/settings on success records an audit log entry with the updated keys', async () => {
  const user = await createTestUser({ email: 'settings-put-audit@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const before = await AuditLogModel.countDocuments({ action: 'settings.updated' });
  const { res } = await putAdminSettings(token, { maintenanceMode: true, financeContactEmail: 'finance@vyoma.org' });
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'settings.updated' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].targetType, 'SiteSettings');
  assert.ok(logs[0].details.keys.includes('maintenanceMode'));
  assert.ok(logs[0].details.keys.includes('financeContactEmail'));
});

// --- GET /api/v1/public/settings ---

test('GET /public/settings requires no authentication', async () => {
  const { res, body } = await getPublicSettings();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
});

test('GET /public/settings exposes only the PUBLIC_KEYS allowlist, never maintenanceMode', async () => {
  const { body } = await getPublicSettings();
  assert.deepEqual(Object.keys(body.data).sort(), ['contactInboxEmail', 'donationBankDetails', 'financeContactEmail', 'socialLinks'].sort());
  assert.equal('maintenanceMode' in body.data, false);
});

test('GET /public/settings reflects a value written through the admin PUT endpoint', async () => {
  const user = await createTestUser({ email: 'settings-public-reflects@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  await putAdminSettings(token, { contactInboxEmail: 'public-check@vyoma.org' });

  const { body } = await getPublicSettings();
  assert.equal(body.data.contactInboxEmail, 'public-check@vyoma.org');
});
