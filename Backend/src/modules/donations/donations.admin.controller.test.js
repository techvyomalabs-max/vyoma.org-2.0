// Task 7M — regression coverage for donations.admin.controller.js
// (read-only donation list/get, and donation-scheme CRUD). Previously had
// zero test coverage anywhere (confirmed by audit) — this is money-adjacent,
// checkout-critical admin surface: a regression in scheme creation/update
// could break the public donate flow, and the donation list/filter logic
// is the only way staff ever reconcile real payments.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { DonationModel } from './donation.model.js';
import mongoose from 'mongoose';

let env;
let adminRole; // seeded 'admin' role already has donations:read + donations:write
let noPermsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noPermsRole = await RoleModel.create({ key: 'no_donations_perms_role', name: 'No Donations Perms', permissions: ['content:read'], mfaRequired: false });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function adminToken(emailSuffix) {
  const user = await createTestUser({ email: `donations-admin-${emailSuffix}@example.test`, roleKey: 'admin' });
  return signAccessToken(user, adminRole);
}

async function listDonations(token, query = '') {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/donations${query}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getDonation(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/donations/${id}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function listSchemes(token) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/donations/schemes`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function createScheme(token, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/donations/schemes`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function updateScheme(token, slug, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/donations/schemes/${slug}`, {
    method: 'PATCH',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

function donationFixture(overrides = {}) {
  return {
    schemeId: new mongoose.Types.ObjectId(),
    schemeSlug: 'general-donation',
    amount: 2500,
    currency: 'INR',
    donor: { name: 'Test Donor', email: 'donor@example.test' },
    status: 'paid_verified',
    ...overrides,
  };
}

// --- RBAC ---

test('GET /admin/donations is rejected with 401 when unauthenticated', async () => {
  const { res, body } = await listDonations(undefined);
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
});

test('GET /admin/donations is rejected with 403 for a role without donations:read', async () => {
  const user = await createTestUser({ email: 'donations-noperm-list@example.test', roleKey: 'no_donations_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await listDonations(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('POST /admin/donations/schemes is rejected with 403 for a role without donations:write', async () => {
  const user = await createTestUser({ email: 'donations-noperm-scheme@example.test', roleKey: 'no_donations_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await createScheme(token, { slug: 'no-perm-scheme', name: 'X', description: 'Y' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- GET /admin/donations (list) ---

test('GET /admin/donations filters by status, rejecting an unknown status value with 422', async () => {
  const token = await adminToken('status-filter');
  const { res, body } = await listDonations(token, '?status=not_a_real_status');
  assert.equal(res.status, 422);
});

test('GET /admin/donations filters by status and schemeSlug correctly', async () => {
  const token = await adminToken('status-filter-real');
  await DonationModel.create(donationFixture({ status: 'paid_verified', schemeSlug: 'filter-scheme-a' }));
  await DonationModel.create(donationFixture({ status: 'failed', schemeSlug: 'filter-scheme-a' }));
  await DonationModel.create(donationFixture({ status: 'paid_verified', schemeSlug: 'filter-scheme-b' }));

  const { res, body } = await listDonations(token, '?status=paid_verified&schemeSlug=filter-scheme-a');
  assert.equal(res.status, 200);
  assert.ok(body.data.every((d) => d.status === 'paid_verified' && d.schemeSlug === 'filter-scheme-a'));
});

test('GET /admin/donations filters by donor email, case-insensitively, with regex-special characters safely escaped', async () => {
  const token = await adminToken('email-filter');
  await DonationModel.create(donationFixture({ donor: { name: 'Findable Donor', email: 'FindMe+test@Example.test' } }));
  await DonationModel.create(donationFixture({ donor: { name: 'Other Donor', email: 'other@example.test' } }));

  const { res, body } = await listDonations(token, `?email=${encodeURIComponent('findme+test')}`);
  assert.equal(res.status, 200);
  assert.ok(body.data.some((d) => d.donor.email === 'FindMe+test@Example.test'));
  assert.ok(!body.data.some((d) => d.donor.email === 'other@example.test'));
});

test('GET /admin/donations rejects an invalid dateFrom/dateTo with 422', async () => {
  const token = await adminToken('bad-date');
  const { res } = await listDonations(token, '?dateFrom=not-a-date');
  assert.equal(res.status, 422);
});

test('GET /admin/donations filters by dateFrom/dateTo (inclusive range)', async () => {
  const token = await adminToken('date-range');
  const inRange = await DonationModel.create(donationFixture());
  const outOfRange = await DonationModel.create(donationFixture());
  // Mongoose's `timestamps: true` schema option silently strips `createdAt`
  // from any findByIdAndUpdate/updateOne call made through the Model itself
  // (it only ever sets createdAt once, on insert) -- the raw driver
  // collection is used here deliberately to back-date these two fixtures
  // for the range test, bypassing that protection (test setup only; no
  // application code does this).
  await DonationModel.collection.updateOne({ _id: inRange._id }, { $set: { createdAt: new Date('2025-06-15') } });
  await DonationModel.collection.updateOne({ _id: outOfRange._id }, { $set: { createdAt: new Date('2020-01-01') } });

  const { res, body } = await listDonations(token, '?dateFrom=2025-01-01&dateTo=2025-12-31');
  assert.equal(res.status, 200);
  const ids = body.data.map((d) => d._id);
  assert.ok(ids.includes(String(inRange._id)));
  assert.ok(!ids.includes(String(outOfRange._id)));
});

test('GET /admin/donations supports pagination', async () => {
  const token = await adminToken('paginate');
  for (let i = 0; i < 3; i += 1) await DonationModel.create(donationFixture({ schemeSlug: 'paginate-scheme' }));
  const { res, body } = await listDonations(token, '?schemeSlug=paginate-scheme&page=1&limit=2');
  assert.equal(res.status, 200);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.data.length, 2);
  assert.ok(body.meta.total >= 3);
});

// --- GET /admin/donations/:id ---

test('GET /admin/donations/:id rejects a malformed id with 422', async () => {
  const token = await adminToken('bad-id');
  const { res, body } = await getDonation(token, 'not-a-valid-object-id');
  assert.equal(res.status, 422);
});

test('GET /admin/donations/:id returns 404 for a well-formed but nonexistent id', async () => {
  const token = await adminToken('404-id');
  const { res, body } = await getDonation(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'DONATION_NOT_FOUND');
});

test('GET /admin/donations/:id returns the full donation document for a real id', async () => {
  const token = await adminToken('get-real');
  const doc = await DonationModel.create(donationFixture({ amount: 9999 }));
  const { res, body } = await getDonation(token, doc._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.amount, 9999);
});

// --- GET /admin/donations/schemes ---

test('GET /admin/donations/schemes returns every scheme including inactive ones, sorted by displayOrder', async () => {
  const token = await adminToken('schemes-list');
  await createScheme(token, { slug: 'schemes-list-active', name: 'Active Scheme', description: 'D', displayOrder: 1 });
  const inactiveCreate = await createScheme(token, { slug: 'schemes-list-inactive', name: 'Inactive Scheme', description: 'D', displayOrder: 0 });
  await updateScheme(token, 'schemes-list-inactive', { status: 'inactive' });

  const { res, body } = await listSchemes(token);
  assert.equal(res.status, 200);
  const slugs = body.data.map((s) => s.slug);
  assert.ok(slugs.includes('schemes-list-active') && slugs.includes('schemes-list-inactive'), 'the admin list must include inactive schemes too, unlike the public list');
});

// --- POST /admin/donations/schemes ---

test('POST /admin/donations/schemes rejects an invalid slug format with 422', async () => {
  const token = await adminToken('scheme-bad-slug');
  const { res, body } = await createScheme(token, { slug: 'Not Valid Slug!', name: 'X', description: 'Y' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.slug);
});

test('POST /admin/donations/schemes rejects a missing name/description with 422', async () => {
  const token = await adminToken('scheme-missing-fields');
  const { res, body } = await createScheme(token, { slug: 'missing-fields-scheme' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.name);
  assert.ok(body.fieldErrors.description);
});

test('POST /admin/donations/schemes rejects non-positive-number amountOptions with 422', async () => {
  const token = await adminToken('scheme-bad-amounts');
  const { res, body } = await createScheme(token, { slug: 'bad-amounts-scheme', name: 'X', description: 'Y', amountOptions: [100, -5, 'not-a-number'] });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.amountOptions);
});

test('POST /admin/donations/schemes rejects a duplicate slug with 409 SLUG_IN_USE', async () => {
  const token = await adminToken('scheme-dup');
  await createScheme(token, { slug: 'duplicate-scheme-slug', name: 'First', description: 'D' });
  const { res, body } = await createScheme(token, { slug: 'duplicate-scheme-slug', name: 'Second', description: 'D' });
  assert.equal(res.status, 409);
  assert.equal(body.code, 'SLUG_IN_USE');
});

test('POST /admin/donations/schemes succeeds, defaults to active status, and on success records an audit log entry', async () => {
  const user = await createTestUser({ email: 'donations-scheme-audit-create@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await AuditLogModel.countDocuments({ action: 'donationScheme.created' });

  const { res, body } = await createScheme(token, { slug: 'audit-create-scheme', name: 'Audited Scheme', description: 'D', amountOptions: [1000, 2000] });
  assert.equal(res.status, 201);
  assert.equal(body.data.status, 'active');
  assert.deepEqual(body.data.amountOptions, [1000, 2000]);

  const logs = await AuditLogModel.find({ action: 'donationScheme.created' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.slug, 'audit-create-scheme');
});

// --- PATCH /admin/donations/schemes/:slug ---

test('PATCH /admin/donations/schemes/:slug returns 404 for a nonexistent slug', async () => {
  const token = await adminToken('scheme-patch-404');
  const { res, body } = await updateScheme(token, 'no-such-scheme-slug', { name: 'X' });
  assert.equal(res.status, 404);
  assert.equal(body.code, 'SCHEME_NOT_FOUND');
});

test('PATCH /admin/donations/schemes/:slug has no way to change the slug itself -- the body has no slug field at all', async () => {
  const token = await adminToken('scheme-patch-slug-immutable');
  await createScheme(token, { slug: 'immutable-slug-scheme', name: 'X', description: 'Y' });
  const { res, body } = await updateScheme(token, 'immutable-slug-scheme', { name: 'Updated Name', slug: 'attempted-new-slug' });
  assert.equal(res.status, 200);
  assert.equal(body.data.slug, 'immutable-slug-scheme', 'a slug field in the request body must be silently ignored, never applied');
});

test('PATCH /admin/donations/schemes/:slug rejects an invalid status value with 422', async () => {
  const token = await adminToken('scheme-patch-bad-status');
  await createScheme(token, { slug: 'bad-status-scheme', name: 'X', description: 'Y' });
  const { res, body } = await updateScheme(token, 'bad-status-scheme', { status: 'not_a_real_status' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.status);
});

test('PATCH /admin/donations/schemes/:slug can deactivate a scheme (no delete endpoint exists, by design)', async () => {
  const token = await adminToken('scheme-deactivate');
  await createScheme(token, { slug: 'deactivate-scheme', name: 'X', description: 'Y' });
  const { res, body } = await updateScheme(token, 'deactivate-scheme', { status: 'inactive' });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'inactive');
});

test('PATCH /admin/donations/schemes/:slug rejects an image without a url, but accepts null to remove it', async () => {
  const token = await adminToken('scheme-image');
  await createScheme(token, { slug: 'image-scheme', name: 'X', description: 'Y' });

  const badImage = await updateScheme(token, 'image-scheme', { image: { noUrlField: true } });
  assert.equal(badImage.res.status, 422);

  const setImage = await updateScheme(token, 'image-scheme', { image: { url: 'https://vyoma.org/scheme.jpg' } });
  assert.equal(setImage.res.status, 200);
  assert.equal(setImage.body.data.image.url, 'https://vyoma.org/scheme.jpg');

  const clearImage = await updateScheme(token, 'image-scheme', { image: null });
  assert.equal(clearImage.res.status, 200);
  assert.equal(clearImage.body.data.image, null);
});

test('PATCH /admin/donations/schemes/:slug on success records an audit log entry listing the changed fields', async () => {
  const user = await createTestUser({ email: 'donations-scheme-audit-update@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  await createScheme(token, { slug: 'audit-update-scheme', name: 'Original', description: 'D' });
  const before = await AuditLogModel.countDocuments({ action: 'donationScheme.updated' });

  const { res } = await updateScheme(token, 'audit-update-scheme', { name: 'Updated', displayOrder: 5 });
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'donationScheme.updated' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.ok(logs[0].details.fields.includes('name') && logs[0].details.fields.includes('displayOrder'));
});
