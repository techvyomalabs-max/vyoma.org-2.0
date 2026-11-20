// Task 7M.1 — regression coverage for content.admin.controller.js's full
// draft -> publish -> revision -> restore lifecycle. Previously had zero
// dedicated HTTP-level test coverage anywhere (confirmed by the Task 7M
// audit) — only indirectly touched by sanitizeLegalBody.test.js (the
// sanitizer function itself, never the controller that wires it in) and
// auth.rbac.test.js's generic permission-gate smoke test on GET /types.
//
// Cross-checks against the already-tested public read endpoint
// (content.controller.public.test.js) wherever a claim is really about the
// draft/publish boundary, rather than re-asserting the public controller's
// own internals a second time.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';

let env;
let adminRole; // seeded 'admin' role already has content:read + content:write
let readOnlyRole;
let noPermsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  readOnlyRole = await RoleModel.create({ key: 'content_read_only_role', name: 'Content Read Only', permissions: ['content:read'], mfaRequired: false });
  noPermsRole = await RoleModel.create({ key: 'no_content_perms_role', name: 'No Content Perms', permissions: ['forms:read'], mfaRequired: false });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function adminToken(emailSuffix) {
  const user = await createTestUser({ email: `content-admin-${emailSuffix}@example.test`, roleKey: 'admin' });
  return signAccessToken(user, adminRole);
}

async function getAdminContent(token, type) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content?type=${encodeURIComponent(type)}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function saveDraft(token, type, data) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content`, {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function preview(token, type) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/preview?type=${encodeURIComponent(type)}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function publish(token, type) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/publish`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function unpublish(token, type) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/unpublish`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function listRevisions(token, type) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/revisions?type=${encodeURIComponent(type)}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function restore(token, type, revisionId) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/revisions/restore`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type, revisionId }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getPublic(type) {
  const res = await fetch(`${env.baseUrl}/api/v1/public/${type}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- RBAC ---

test('GET /admin/content is rejected with 401 when unauthenticated', async () => {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content?type=pages/about`);
  assert.equal(res.status, 401);
});

test('GET /admin/content is rejected with 403 for a role without content:read', async () => {
  const user = await createTestUser({ email: 'content-noperm-get@example.test', roleKey: 'no_content_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await getAdminContent(token, 'pages/about');
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('PUT /admin/content is rejected with 403 for a role with content:read but not content:write', async () => {
  const user = await createTestUser({ email: 'content-readonly-put@example.test', roleKey: 'content_read_only_role' });
  const token = signAccessToken(user, readOnlyRole);
  const { res, body } = await saveDraft(token, 'pages/readonly-test', { heading: 'x' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- GET /admin/content/types ---

test('GET /admin/content/types returns a sorted list of real, distinct types', async () => {
  const token = await adminToken('types');
  await saveDraft(token, 'pages/types-test-b', { x: 1 });
  await saveDraft(token, 'pages/types-test-a', { x: 1 });
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/types`, { headers: authHeader(token) });
  const body = await res.json();
  assert.equal(res.status, 200);
  const aIdx = body.data.indexOf('pages/types-test-a');
  const bIdx = body.data.indexOf('pages/types-test-b');
  assert.ok(aIdx !== -1 && bIdx !== -1 && aIdx < bIdx, 'expected a sorted type list');
});

// --- GET /admin/content (single) ---

test('GET /admin/content for a type that has never been saved returns exists: false, not a 404', async () => {
  const token = await adminToken('get-nonexistent');
  const { res, body } = await getAdminContent(token, 'pages/never-created-yet');
  assert.equal(res.status, 200);
  assert.equal(body.data.exists, false);
  assert.equal(body.data.status, 'draft');
  assert.equal(body.data.data, null);
});

test('GET /admin/content without a type query param is rejected with 422', async () => {
  const token = await adminToken('get-missing-type');
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content`, { headers: authHeader(token) });
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.type);
});

// --- PUT /admin/content (draft save) ---

test('PUT /admin/content rejects a missing/non-object data with 422', async () => {
  const token = await adminToken('put-bad-data');
  const missing = await saveDraft(token, 'pages/put-bad-data', undefined);
  assert.equal(missing.res.status, 422);
  const wrongType = await fetch(`${env.baseUrl}/api/v1/admin/content`, {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'pages/put-bad-data', data: 'not-an-object' }),
  });
  assert.equal(wrongType.status, 422);
});

test('PUT /admin/content creates a brand-new type via upsert, as a draft, never touching live `data`', async () => {
  const token = await adminToken('put-create');
  const { res, body } = await saveDraft(token, 'pages/put-create-test', { heading: 'Draft heading' });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'draft');
  assert.equal(body.data.data, null);
  assert.equal(body.data.draftData.heading, 'Draft heading');
});

test('PUT /admin/content on success records a content.draft_saved audit log entry', async () => {
  const user = await createTestUser({ email: 'content-audit-draft@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await AuditLogModel.countDocuments({ action: 'content.draft_saved' });
  const { res } = await saveDraft(token, 'pages/audit-draft-test', { heading: 'x' });
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'content.draft_saved' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].targetId, 'pages/audit-draft-test');
});

test('PUT /admin/content for pages/privacy sanitizes data.BODY at draft-save time, stripping disallowed tags while preserving allowed content', async () => {
  const token = await adminToken('put-legal-sanitize');
  const { res, body } = await saveDraft(token, 'pages/privacy', { BODY: '<script>alert(1)</script><p>Legal text</p>' });
  assert.equal(res.status, 200);
  assert.doesNotMatch(body.data.draftData.BODY, /<script/i, 'the legal-body sanitizer must actually be wired into the draft-save path');
  assert.match(body.data.draftData.BODY, /<p>Legal text<\/p>/);
});

test('draft-leak prevention: a freshly-saved draft (never published) is not visible through the public API', async () => {
  const token = await adminToken('put-draft-not-public');
  await saveDraft(token, 'pages/put-draft-not-public-test', { heading: 'Secret draft' });
  const { res } = await getPublic('pages/put-draft-not-public-test');
  assert.equal(res.status, 404, 'a brand-new type with only draftData and no published data must never be publicly visible');
});

// --- GET /admin/content/preview ---

test('GET /admin/content/preview returns 404 for a type that has never been saved', async () => {
  const token = await adminToken('preview-404');
  const { res, body } = await preview(token, 'pages/preview-404-test');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CONTENT_NOT_FOUND');
});

test('GET /admin/content/preview shows the pending draft when one exists, and falls back to published data otherwise', async () => {
  const token = await adminToken('preview-flow');
  await saveDraft(token, 'pages/preview-flow-test', { heading: 'Draft version' });
  const withDraft = await preview(token, 'pages/preview-flow-test');
  assert.equal(withDraft.body.data.previewing, 'draft');
  assert.equal(withDraft.body.data.data.heading, 'Draft version');

  await publish(token, 'pages/preview-flow-test');
  const afterPublishNoNewDraft = await preview(token, 'pages/preview-flow-test');
  assert.equal(afterPublishNoNewDraft.body.data.previewing, 'published');
  assert.equal(afterPublishNoNewDraft.body.data.data.heading, 'Draft version');
});

// --- POST /admin/content/publish ---

test('POST /admin/content/publish returns 404 for a type that has never been saved', async () => {
  const token = await adminToken('publish-404');
  const { res, body } = await publish(token, 'pages/publish-404-test');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CONTENT_NOT_FOUND');
});

test('POST /admin/content/publish rejects with 400 NOTHING_TO_PUBLISH when the document exists but has neither data nor draftData', async () => {
  const token = await adminToken('publish-nothing');
  // Create a draft, publish it (clears draftData, sets data), then unpublish
  // does NOT clear data -- so force the true "nothing at all" edge case the
  // way the model itself allows: a Content document explicitly created with
  // both fields null, bypassing the admin API (mirrors a pre-Phase-1 doc
  // that exists as `{ type }` only, before its first draft was ever saved).
  await ContentModel.create({ type: 'pages/publish-nothing-test', data: null, draftData: null, status: 'draft' });
  const { res, body } = await publish(token, 'pages/publish-nothing-test');
  assert.equal(res.status, 400);
  assert.equal(body.code, 'NOTHING_TO_PUBLISH');
});

test('POST /admin/content/publish moves draftData to live data, clears draftData, sets status published, and makes the content publicly visible', async () => {
  const token = await adminToken('publish-flow');
  await saveDraft(token, 'pages/publish-flow-test', { heading: 'Now published' });

  const beforePublic = await getPublic('pages/publish-flow-test');
  assert.equal(beforePublic.res.status, 404, 'must still be hidden before publish');

  const { res, body } = await publish(token, 'pages/publish-flow-test');
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'published');
  assert.equal(body.data.draftData, null);
  assert.equal(body.data.data.heading, 'Now published');

  const afterPublic = await getPublic('pages/publish-flow-test');
  assert.equal(afterPublic.res.status, 200);
  assert.equal(afterPublic.body.data.heading, 'Now published');
});

test('POST /admin/content/publish creates a version-1 revision on first publish, and increments the version on each subsequent publish', async () => {
  const token = await adminToken('publish-versioning');
  await saveDraft(token, 'pages/publish-versioning-test', { heading: 'v1' });
  await publish(token, 'pages/publish-versioning-test');

  await saveDraft(token, 'pages/publish-versioning-test', { heading: 'v2' });
  await publish(token, 'pages/publish-versioning-test');

  const { res, body } = await listRevisions(token, 'pages/publish-versioning-test');
  assert.equal(res.status, 200);
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].version, 2, 'expected newest-first ordering');
  assert.equal(body.data[0].data.heading, 'v2');
  assert.equal(body.data[1].version, 1);
  assert.equal(body.data.every((r) => r.action === 'publish'), true);
});

test('POST /admin/content/publish on success records a content.published audit log entry with the version', async () => {
  const user = await createTestUser({ email: 'content-audit-publish@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  await saveDraft(token, 'pages/audit-publish-test', { heading: 'x' });
  const before = await AuditLogModel.countDocuments({ action: 'content.published' });

  const { res } = await publish(token, 'pages/audit-publish-test');
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'content.published' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.version, 1);
});

test('revision pruning: publishing more than MAX_REVISIONS_PER_TYPE (20) times keeps only the most recent 20 revisions', async () => {
  const token = await adminToken('prune');
  const type = 'pages/prune-test';
  for (let i = 1; i <= 22; i += 1) {
    await saveDraft(token, type, { heading: `v${i}` });
    await publish(token, type);
  }
  const { body } = await listRevisions(token, type);
  assert.equal(body.data.length, 20, 'expected exactly 20 retained revisions, not 22');
  const versions = body.data.map((r) => r.version).sort((a, b) => a - b);
  assert.deepEqual(versions, Array.from({ length: 20 }, (_, i) => i + 3), 'expected versions 3..22 retained -- the oldest 2 (versions 1 and 2) must be the ones pruned');
});

// --- POST /admin/content/unpublish ---

test('POST /admin/content/unpublish returns 404 for a nonexistent type', async () => {
  const token = await adminToken('unpublish-404');
  const { res, body } = await unpublish(token, 'pages/unpublish-404-test');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CONTENT_NOT_FOUND');
});

test('POST /admin/content/unpublish hides the content publicly but preserves `data` for a later re-publish', async () => {
  const token = await adminToken('unpublish-flow');
  await saveDraft(token, 'pages/unpublish-flow-test', { heading: 'Will be unpublished' });
  await publish(token, 'pages/unpublish-flow-test');
  assert.equal((await getPublic('pages/unpublish-flow-test')).res.status, 200);

  const { res, body } = await unpublish(token, 'pages/unpublish-flow-test');
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'draft');
  assert.equal(body.data.data.heading, 'Will be unpublished', 'unpublish must preserve data, not discard it');

  assert.equal((await getPublic('pages/unpublish-flow-test')).res.status, 404, 'must be hidden from the public API once unpublished');

  // Re-publishing with no new draft edits simply re-shows the same data.
  const republish = await publish(token, 'pages/unpublish-flow-test');
  assert.equal(republish.res.status, 200);
  assert.equal((await getPublic('pages/unpublish-flow-test')).body.data.heading, 'Will be unpublished');
});

test('POST /admin/content/unpublish on success records a content.unpublished audit log entry', async () => {
  const user = await createTestUser({ email: 'content-audit-unpublish@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  await saveDraft(token, 'pages/audit-unpublish-test', { heading: 'x' });
  await publish(token, 'pages/audit-unpublish-test');
  const before = await AuditLogModel.countDocuments({ action: 'content.unpublished' });

  const { res } = await unpublish(token, 'pages/audit-unpublish-test');
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'content.unpublished' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
});

// --- GET /admin/content/revisions & POST /admin/content/revisions/restore ---

test('GET /admin/content/revisions without a type query param is rejected with 422', async () => {
  const token = await adminToken('revisions-missing-type');
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/revisions`, { headers: authHeader(token) });
  assert.equal(res.status, 422);
});

test('POST /admin/content/revisions/restore rejects a missing revisionId with 422', async () => {
  const token = await adminToken('restore-missing-id');
  const res = await fetch(`${env.baseUrl}/api/v1/admin/content/revisions/restore`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'pages/restore-missing-id-test' }),
  });
  assert.equal(res.status, 422);
});

test('POST /admin/content/revisions/restore returns 404 for a revisionId that does not belong to this type, and does not create a new revision row', async () => {
  const token = await adminToken('restore-wrong-type');
  await saveDraft(token, 'pages/restore-wrong-type-a', { heading: 'A' });
  const publishedA = await publish(token, 'pages/restore-wrong-type-a');
  const revisionFromA = (await listRevisions(token, 'pages/restore-wrong-type-a')).body.data[0]._id;

  await saveDraft(token, 'pages/restore-wrong-type-b', { heading: 'B' });
  await publish(token, 'pages/restore-wrong-type-b');
  const beforeCount = (await listRevisions(token, 'pages/restore-wrong-type-b')).body.data.length;

  const { res, body } = await restore(token, 'pages/restore-wrong-type-b', revisionFromA);
  assert.equal(res.status, 404);
  assert.equal(body.code, 'REVISION_NOT_FOUND');

  const afterCount = (await listRevisions(token, 'pages/restore-wrong-type-b')).body.data.length;
  assert.equal(afterCount, beforeCount, 'a failed restore attempt must leave the revision history completely unchanged -- no partial/corrupt row created');
});

test('POST /admin/content/revisions/restore re-publishes a past revision\'s data, adds a NEW revision (action: restore) rather than rewriting history, and makes it publicly visible', async () => {
  const token = await adminToken('restore-flow');
  const type = 'pages/restore-flow-test';
  await saveDraft(token, type, { heading: 'Original v1' });
  await publish(token, type);
  const v1RevisionId = (await listRevisions(token, type)).body.data[0]._id;

  await saveDraft(token, type, { heading: 'Changed v2' });
  await publish(token, type);
  assert.equal((await getPublic(type)).body.data.heading, 'Changed v2');

  const { res, body } = await restore(token, type, v1RevisionId);
  assert.equal(res.status, 200);
  assert.equal(body.data.data.heading, 'Original v1');
  assert.equal(body.data.status, 'published');

  const revisions = (await listRevisions(token, type)).body.data;
  assert.equal(revisions.length, 3, 'restoring must ADD a new revision row, never delete or rewrite the v1/v2 rows');
  assert.equal(revisions[0].version, 3);
  assert.equal(revisions[0].action, 'restore');
  assert.equal(revisions[0].details.restoredFromVersion, 1);
  assert.equal(revisions[1].action, 'publish');
  assert.equal(revisions[2].action, 'publish');

  assert.equal((await getPublic(type)).body.data.heading, 'Original v1');
});

test('POST /admin/content/revisions/restore on success records a content.restored audit log entry', async () => {
  const user = await createTestUser({ email: 'content-audit-restore@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const type = 'pages/audit-restore-test';
  await saveDraft(token, type, { heading: 'v1' });
  await publish(token, type);
  const revisionId = (await listRevisions(token, type)).body.data[0]._id;
  await saveDraft(token, type, { heading: 'v2' });
  await publish(token, type);

  const before = await AuditLogModel.countDocuments({ action: 'content.restored' });
  const { res } = await restore(token, type, revisionId);
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'content.restored' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.restoredFromVersion, 1);
  assert.equal(logs[0].details.newVersion, 3);
});
