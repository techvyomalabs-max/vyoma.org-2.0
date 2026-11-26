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

// --- pages/join-us: Internship Role/Skill required validation ----------
// Narrowly scoped server-side enforcement closing the gap where a direct
// API request could bypass the Frontend's own validateJoinUs() entirely
// (confirmed, before this fix, by the generic PUT/publish handlers
// performing no per-type/per-field validation at all). Only 'pages/join-us'
// is affected -- every other type's draft-save/publish behavior above is
// unchanged, as already proven by the untouched tests surrounding this
// block.

const JOIN_US_TYPE = 'pages/join-us';

function openingsData(openings) {
  return { CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '', INTERNSHIP_OPENINGS: openings };
}

test('PUT /admin/content for pages/join-us accepts a valid internship opening (Role and Skill both present)', async () => {
  const token = await adminToken('join-us-valid-put');
  const { res, body } = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Frontend Intern', skill: 'React', active: true }]));
  assert.equal(res.status, 200);
  assert.equal(body.data.draftData.INTERNSHIP_OPENINGS[0].role, 'Frontend Intern');
});

test('PUT /admin/content for pages/join-us accepts an empty INTERNSHIP_OPENINGS array', async () => {
  const token = await adminToken('join-us-empty-put');
  const { res } = await saveDraft(token, JOIN_US_TYPE, openingsData([]));
  assert.equal(res.status, 200);
});

test('PUT /admin/content for pages/join-us accepts a document where INTERNSHIP_OPENINGS is entirely absent (legacy compatibility)', async () => {
  const token = await adminToken('join-us-absent-put');
  const { res } = await saveDraft(token, JOIN_US_TYPE, { CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '' });
  assert.equal(res.status, 200);
});

test('PUT /admin/content for pages/join-us rejects a missing Role or Skill individually, and both missing, with 422 and a clear, one-based, field-named message', async () => {
  const token = await adminToken('join-us-missing-fields');

  const missingRole = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: '', skill: 'Python', active: true }]));
  assert.equal(missingRole.res.status, 422);
  assert.match(missingRole.body.message, /Internship opening 1: Role is required\./);

  const missingSkill = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Backend Intern', skill: '', active: true }]));
  assert.equal(missingSkill.res.status, 422);
  assert.match(missingSkill.body.message, /Internship opening 1: Skill is required\./);

  const missingBoth = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: '', skill: '', active: true }]));
  assert.equal(missingBoth.res.status, 422);
  assert.match(missingBoth.body.message, /Internship opening 1: Role and Skill are required\./);
});

test('PUT /admin/content for pages/join-us rejects whitespace-only Role/Skill, null, and non-string values (number/boolean/object/array) with 422', async () => {
  const token = await adminToken('join-us-blank-variants');
  const cases = ['   ', null, 42, true, {}, []];
  for (const bad of cases) {
    const { res, body } = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: bad, skill: 'Python', active: true }]));
    assert.equal(res.status, 422, `expected rejection for role=${JSON.stringify(bad)}`);
    assert.match(body.message, /Internship opening 1: Role is required\./);
  }
});

test('PUT /admin/content for pages/join-us rejects a malformed individual opening entry (null, string, number, array) with 422, without throwing', async () => {
  const token = await adminToken('join-us-malformed-entry');
  for (const bad of [null, 'not-an-opening', 42, ['role', 'skill']]) {
    const { res, body } = await saveDraft(token, JOIN_US_TYPE, openingsData([bad]));
    assert.equal(res.status, 422, `expected rejection for opening=${JSON.stringify(bad)}`);
    assert.match(body.message, /Internship opening 1 is malformed\./);
  }
});

test('PUT /admin/content for pages/join-us rejects a malformed INTERNSHIP_OPENINGS container (null, string, number, object) with 422', async () => {
  const token = await adminToken('join-us-malformed-container');
  for (const bad of [null, 'not-an-array', 42, { role: 'x' }]) {
    const { res, body } = await saveDraft(token, JOIN_US_TYPE, { CAREER_ROLES: [], INTERNSHIP_OPENINGS: bad });
    assert.equal(res.status, 422, `expected rejection for INTERNSHIP_OPENINGS=${JSON.stringify(bad)}`);
    assert.match(body.message, /INTERNSHIP_OPENINGS must be an array/);
  }
});

test('PUT /admin/content for pages/join-us: with multiple openings, the FIRST invalid one is reported, by its own one-based position', async () => {
  const token = await adminToken('join-us-multi-first-invalid');
  const { res, body } = await saveDraft(
    token,
    JOIN_US_TYPE,
    openingsData([
      { role: 'Valid Intern', skill: 'Sanskrit', active: true },
      { role: '', skill: 'Linguistics', active: true },
      { role: 'Also Invalid', skill: '', active: true },
    ])
  );
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 2: Role is required\./, 'must report opening 2 (first invalid), not opening 3 or a generic message');
});

test('PUT /admin/content for pages/join-us validates INACTIVE openings exactly the same as active ones', async () => {
  const token = await adminToken('join-us-inactive-invalid');
  const invalidInactive = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: '', skill: 'Python', active: false }]));
  assert.equal(invalidInactive.res.status, 422, 'an inactive opening with missing Role must still be rejected -- it can be flipped visible later with no further edit');

  const validInactive = await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Hidden Intern', skill: 'Python', active: false }]));
  assert.equal(validInactive.res.status, 200, 'a VALID inactive opening must still be accepted');
});

test('PUT /admin/content for pages/join-us on a REJECTED request leaves content and audit state completely unchanged (no draft write, no audit entry)', async () => {
  const token = await adminToken('join-us-rejected-no-side-effects');
  // Must be the real, exact JOIN_US_TYPE -- the validation this test exists
  // to exercise only ever runs for that literal type string.
  const type = JOIN_US_TYPE;
  // Seed a valid baseline draft first so we can prove it's untouched.
  await saveDraft(token, type, openingsData([{ role: 'Existing Intern', skill: 'Existing Skill', active: true }]));
  const beforeAuditCount = await AuditLogModel.countDocuments({ action: 'content.draft_saved', targetId: type });
  const beforeDoc = await ContentModel.findOne({ type }).lean();

  const { res } = await saveDraft(token, type, openingsData([{ role: '', skill: '', active: true }]));
  assert.equal(res.status, 422);

  const afterAuditCount = await AuditLogModel.countDocuments({ action: 'content.draft_saved', targetId: type });
  assert.equal(afterAuditCount, beforeAuditCount, 'a rejected draft-save must not record a new content.draft_saved audit entry');
  const afterDoc = await ContentModel.findOne({ type }).lean();
  assert.deepEqual(afterDoc.draftData, beforeDoc.draftData, 'the previously-saved valid draft must be completely untouched by the rejected request');
});

test('PUT /admin/content for pages/join-us does NOT change validation behavior for an unrelated content type (pages/about) with the same field shape', async () => {
  const token = await adminToken('join-us-unrelated-type-unaffected');
  const { res } = await saveDraft(token, 'pages/about', { INTERNSHIP_OPENINGS: [{ role: '', skill: '' }] });
  assert.equal(res.status, 200, 'INTERNSHIP_OPENINGS-shaped data under an unrelated type must never be validated by this pages/join-us-only rule');
});

test('POST /admin/content/publish for pages/join-us rejects an invalid PENDING DRAFT with 422, before any mutation, revision, or audit write', async () => {
  const token = await adminToken('join-us-publish-invalid-draft');
  // Must be the real, exact JOIN_US_TYPE for the validation to run at all.
  // A document for this type already exists by this point in the file (many
  // earlier tests in this block saved drafts to it), so this writes directly
  // via findOneAndUpdate+upsert (never `ContentModel.create`, which would
  // throw on the type field's unique index) -- bypassing the (now-correct)
  // PUT validation entirely, simulating either a document saved before this
  // validation existed, or one written by some other direct path -- exactly
  // the scenario "invalid existing draft rejected when publishing" calls for.
  const type = JOIN_US_TYPE;
  await ContentModel.findOneAndUpdate(
    { type },
    { $set: { data: null, draftData: openingsData([{ role: '', skill: 'Python', active: true }]), status: 'draft' } },
    { upsert: true }
  );
  const beforeAuditCount = await AuditLogModel.countDocuments({ action: 'content.published', targetId: type });
  const beforeRevisionCount = await ContentRevisionModel.countDocuments({ contentType: type });

  const { res, body } = await publish(token, type);
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 1: Role is required\./);

  const doc = await ContentModel.findOne({ type }).lean();
  assert.equal(doc.status, 'draft', 'status must remain draft -- the invalid draft must never be promoted to live data');
  assert.notEqual(doc.draftData, null, 'the rejected draft must remain exactly as it was, never cleared');
  assert.equal(await AuditLogModel.countDocuments({ action: 'content.published', targetId: type }), beforeAuditCount);
  assert.equal(await ContentRevisionModel.countDocuments({ contentType: type }), beforeRevisionCount);
});

test('POST /admin/content/publish for pages/join-us rejects an invalid PUBLISHED-DATA FALLBACK (no pending draft) with 422', async () => {
  const token = await adminToken('join-us-publish-invalid-published-fallback');
  // Must be the real, exact JOIN_US_TYPE; findOneAndUpdate+upsert (not
  // `ContentModel.create`) for the same reason as the PENDING DRAFT test
  // above. No draftData at all -- publishContent's own `nextData` fallback
  // must pick up `data` (the already-"published" value) and validate THAT.
  const type = JOIN_US_TYPE;
  await ContentModel.findOneAndUpdate(
    { type },
    { $set: { data: openingsData([{ role: 'Stale Intern', skill: '', active: true }]), draftData: null, status: 'published' } },
    { upsert: true }
  );

  const { res, body } = await publish(token, type);
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 1: Skill is required\./);
});

test('POST /admin/content/publish for pages/join-us succeeds for a valid draft, and the opening is then publicly visible', async () => {
  const token = await adminToken('join-us-publish-valid');
  // The real, exact JOIN_US_TYPE -- genuinely exercises the new validation's
  // accept path, not just an ordinary unrelated type that happens to pass.
  const type = JOIN_US_TYPE;
  await saveDraft(token, type, openingsData([{ role: 'Published Intern', skill: 'Sanskrit', active: true }]));

  const { res, body } = await publish(token, type);
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'published');

  const pub = await getPublic(type);
  assert.equal(pub.res.status, 200);
  assert.equal(pub.body.data.INTERNSHIP_OPENINGS[0].role, 'Published Intern');
});

test('direct-API-bypass prevention: a PUT with an invalid internship opening is rejected with 422 exactly like it would be through the admin UI -- no path to save invalid content', async () => {
  const token = await adminToken('join-us-direct-bypass');
  const type = JOIN_US_TYPE;
  // Seed a known-valid baseline first (a real document for this type
  // already exists at this point in the file regardless), so the assertion
  // below can prove the invalid payload was never written, rather than
  // relying on the unrealistic premise that 'pages/join-us' has never been
  // saved before.
  await saveDraft(token, type, openingsData([{ role: 'Baseline Intern', skill: 'Baseline Skill', active: true }]));

  const res = await fetch(`${env.baseUrl}/api/v1/admin/content`, {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ type, data: openingsData([{ role: null, skill: undefined, active: true }]) }),
  });
  const body = await res.json();
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 1: Role and Skill are required\./);

  const doc = await ContentModel.findOne({ type }).lean();
  assert.equal(doc.draftData.INTERNSHIP_OPENINGS[0].role, 'Baseline Intern', 'the invalid payload must never have been written -- the known-valid baseline must remain exactly as seeded');
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

// --- pages/join-us: closing the Revision Restore validation bypass ------
// restoreRevision republishes a past revision SNAPSHOT directly -- the only
// remaining path (besides draft-save/publish, both already validated
// above) that could make pages/join-us content public. A revision row
// containing invalid INTERNSHIP_OPENINGS content can only exist here as a
// historical artifact (one created before this validation existed, or
// written by some other direct path) -- every NEW revision from this point
// forward is already guaranteed valid, since publishContent itself now
// validates before ever creating one. These tests simulate that historical
// case by inserting a revision row directly via ContentRevisionModel.create
// (bypassing the controller entirely), exactly mirroring how the
// PENDING DRAFT / PUBLISHED-DATA FALLBACK tests above simulate
// pre-existing invalid Content documents.

async function seedJoinUsRevision(data, { version = 1 } = {}) {
  return ContentRevisionModel.create({ contentType: JOIN_US_TYPE, version, data, action: 'publish' });
}

test('POST /admin/content/revisions/restore for pages/join-us rejects restoring an INVALID historical revision with 422', async () => {
  const token = await adminToken('join-us-restore-invalid');
  // A valid, real "current" document must exist for restoreRevision's own
  // CONTENT_NOT_FOUND check to pass -- seeded via the normal, already-
  // validated draft-save/publish path.
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const invalidRevision = await seedJoinUsRevision(openingsData([{ role: '', skill: 'Python', active: true }]), { version: 9001 });

  const { res, body } = await restore(token, JOIN_US_TYPE, invalidRevision._id);
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 1: Role is required\./);
});

test('POST /admin/content/revisions/restore for pages/join-us rejects an invalid INACTIVE opening in a historical revision exactly like an active one', async () => {
  const token = await adminToken('join-us-restore-invalid-inactive');
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const invalidInactiveRevision = await seedJoinUsRevision(openingsData([{ role: 'Hidden Intern', skill: '', active: false }]), { version: 9002 });

  const { res, body } = await restore(token, JOIN_US_TYPE, invalidInactiveRevision._id);
  assert.equal(res.status, 422);
  assert.match(body.message, /Internship opening 1: Skill is required\./);
});

test('POST /admin/content/revisions/restore for pages/join-us rejects a malformed INTERNSHIP_OPENINGS container and a malformed individual entry in a historical revision', async () => {
  const token = await adminToken('join-us-restore-malformed');
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const malformedContainerRevision = await seedJoinUsRevision({ CAREER_ROLES: [], INTERNSHIP_OPENINGS: 'not-an-array' }, { version: 9003 });
  const containerResult = await restore(token, JOIN_US_TYPE, malformedContainerRevision._id);
  assert.equal(containerResult.res.status, 422);
  assert.match(containerResult.body.message, /INTERNSHIP_OPENINGS must be an array/);

  const malformedEntryRevision = await seedJoinUsRevision(openingsData([42]), { version: 9004 });
  const entryResult = await restore(token, JOIN_US_TYPE, malformedEntryRevision._id);
  assert.equal(entryResult.res.status, 422);
  assert.match(entryResult.body.message, /Internship opening 1 is malformed\./);
});

test('POST /admin/content/revisions/restore for pages/join-us: a REJECTED restore leaves current content, draft, status, revision count and audit state completely unchanged', async () => {
  const token = await adminToken('join-us-restore-no-side-effects');
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const invalidRevision = await seedJoinUsRevision(openingsData([{ role: '', skill: '', active: true }]), { version: 9005 });

  const beforeDoc = await ContentModel.findOne({ type: JOIN_US_TYPE }).lean();
  const beforeRevisionCount = await ContentRevisionModel.countDocuments({ contentType: JOIN_US_TYPE });
  const beforeAuditCount = await AuditLogModel.countDocuments({ action: 'content.restored', targetId: JOIN_US_TYPE });

  const { res } = await restore(token, JOIN_US_TYPE, invalidRevision._id);
  assert.equal(res.status, 422);

  const afterDoc = await ContentModel.findOne({ type: JOIN_US_TYPE }).lean();
  assert.equal(afterDoc.status, beforeDoc.status);
  assert.deepEqual(afterDoc.data, beforeDoc.data, 'the currently-published content must be completely untouched by a rejected restore');
  assert.deepEqual(afterDoc.draftData, beforeDoc.draftData);
  assert.equal(await ContentRevisionModel.countDocuments({ contentType: JOIN_US_TYPE }), beforeRevisionCount, 'no new revision row may be created for a rejected restore');
  assert.equal(await AuditLogModel.countDocuments({ action: 'content.restored', targetId: JOIN_US_TYPE }), beforeAuditCount, 'no content.restored audit entry may be recorded for a rejected restore');
});

test('POST /admin/content/revisions/restore for pages/join-us successfully restores a VALID historical revision', async () => {
  const token = await adminToken('join-us-restore-valid');
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const validRevision = await seedJoinUsRevision(openingsData([{ role: 'Restored Intern', skill: 'Restored Skill', active: true }]), { version: 9006 });

  const { res, body } = await restore(token, JOIN_US_TYPE, validRevision._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'published');
  assert.equal(body.data.data.INTERNSHIP_OPENINGS[0].role, 'Restored Intern');
});

test('POST /admin/content/revisions/restore for pages/join-us successfully restores a historical revision with ZERO openings, and one with INTERNSHIP_OPENINGS entirely absent (legacy)', async () => {
  const token = await adminToken('join-us-restore-zero-and-absent');
  await saveDraft(token, JOIN_US_TYPE, openingsData([{ role: 'Current Intern', skill: 'Current Skill', active: true }]));
  await publish(token, JOIN_US_TYPE);

  const zeroOpeningsRevision = await seedJoinUsRevision(openingsData([]), { version: 9007 });
  const zeroResult = await restore(token, JOIN_US_TYPE, zeroOpeningsRevision._id);
  assert.equal(zeroResult.res.status, 200);

  const absentFieldRevision = await seedJoinUsRevision({ CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '' }, { version: 9008 });
  const absentResult = await restore(token, JOIN_US_TYPE, absentFieldRevision._id);
  assert.equal(absentResult.res.status, 200);
});

test('POST /admin/content/revisions/restore for an UNRELATED content type is unaffected by the pages/join-us-only validation, even with the same invalid field shape', async () => {
  const token = await adminToken('join-us-restore-unrelated-type');
  const type = 'pages/about';
  await saveDraft(token, type, { INTERNSHIP_OPENINGS: [{ role: 'irrelevant here', skill: 'irrelevant here' }] });
  await publish(token, type);
  const baselineRevisionId = (await listRevisions(token, type)).body.data[0]._id;

  // Directly insert a revision with an INTERNSHIP_OPENINGS shape that would
  // be rejected for pages/join-us, under a type this validation never
  // applies to.
  const unrelatedRevision = await ContentRevisionModel.create({
    contentType: type,
    version: 9009,
    data: { INTERNSHIP_OPENINGS: [{ role: '', skill: '' }] },
    action: 'publish',
  });

  const { res } = await restore(token, type, unrelatedRevision._id);
  assert.equal(res.status, 200, 'restore for a type other than pages/join-us must never be validated by this rule');
  assert.notEqual(baselineRevisionId, undefined, 'sanity check: a baseline revision exists for this type (pre-existing wrong-type-revisionId behavior is covered separately above, unaffected by this change)');
});

// --- QA Bug 19 Stage 5D: testimonial content validation (pages/media, its
// bare 'media' twin, and pages/home) ---------------------------------------
// Mirrors the structure of the pages/join-us block above (narrow per-type
// scoping, first-error-wins reporting), but with two tiers instead of one:
// Tier A (format/safety -- type/category/rating/active shape, URL/image-
// reference safety, duplicate ids) is always enforced, with NO legacy
// exemption of any kind, for any operation. Tier B (completeness -- a
// new/modified testimonial must actually have its defining content) is
// exempted only for an item that is provably unchanged (one-to-one, never
// many-to-one -- see validateTestimonialContent.js) from the operation's own
// baseline: Save Draft's existing persisted draft (or published data if
// none), Publish's and Restore's currently published data. Restore gets the
// SAME two tiers as Publish -- it is never automatically exempt from
// completeness just because an item appears in history. See
// Backend/src/modules/content/validateTestimonialContent.js's own header
// comment for the full reasoning, and validateTestimonialContent.test.js for
// exhaustive isolated coverage of every rule. These tests focus on the
// HTTP-level wiring (draft/publish/restore, no-write-on-rejection, the
// legacy-baseline exemption actually working end-to-end) rather than
// restating every rule already proven in isolation.
//
// IMPORTANT: like every other test in this file, these were NOT executed as
// part of QA Bug 19 Stage 5D's own verification -- this file requires
// setupTestEnv()'s ambient database connection, which remains blocked under
// this engagement's standing safety rules. Only
// validateTestimonialContent.test.js (genuinely isolated, zero DB
// dependency) was actually run. See the Stage 5D implementation report's own
// "Isolated backend test results" section for the exact, honest accounting.

const MEDIA_TYPE = 'pages/media';
const HOME_TYPE = 'pages/home';

function mediaTestimonialsData({ featured = [], all = [] } = {}) {
  return { TESTIMONIALS_FEATURED: featured, TESTIMONIALS_ALL: all };
}

test('PUT /admin/content for pages/media accepts a valid new text/video/image testimonial', async () => {
  const token = await adminToken('testimonials-valid-put');
  const { res } = await saveDraft(
    token,
    MEDIA_TYPE,
    mediaTestimonialsData({
      all: [
        { type: 'text', quote: 'Wonderful experience.' },
        { type: 'video', url: 'https://www.youtube.com/watch?v=abc123' },
        { type: 'image', testimonialImage: { url: '/uploads/t1.jpg' } },
      ],
    })
  );
  assert.equal(res.status, 200);
});

test('PUT /admin/content for pages/media rejects a new text/video/image testimonial missing its defining content, with a clear one-based message', async () => {
  const token = await adminToken('testimonials-missing-content');

  const blankQuote = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'text', quote: '' }] }));
  assert.equal(blankQuote.res.status, 422);
  assert.match(blankQuote.body.message, /Testimonial 1: a quote is required for a new text testimonial\./);

  const noVideoUrl = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'video' }] }));
  assert.equal(noVideoUrl.res.status, 422);
  assert.match(noVideoUrl.body.message, /Testimonial 1: a valid video URL is required for a new video testimonial\./);

  const noImage = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'image' }] }));
  assert.equal(noImage.res.status, 422);
  assert.match(noImage.body.message, /Testimonial 1: a testimonial image is required for a new image testimonial\./);
});

test('PUT /admin/content for pages/media rejects an unsafe video URL regardless of legacy status', async () => {
  const token = await adminToken('testimonials-unsafe-url');
  const { res, body } = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'video', url: 'javascript:alert(1)' }] }));
  assert.equal(res.status, 422);
  assert.match(body.message, /video URL must be a safe, absolute http:\/\/ or https:\/\/ link\./);
});

test('PUT /admin/content for pages/media rejects TESTIMONIALS_FEATURED using a video/image type -- text-only by design', async () => {
  const token = await adminToken('testimonials-featured-text-only');
  const { res, body } = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ featured: [{ type: 'video', quote: 'x' }] }));
  assert.equal(res.status, 422);
  assert.match(body.message, /Featured testimonial 1: type "video" is not supported here\./);
});

test('PUT /admin/content for pages/media rejects a duplicate id within TESTIMONIALS_ALL', async () => {
  const token = await adminToken('testimonials-dup-id');
  const { res, body } = await saveDraft(
    token,
    MEDIA_TYPE,
    mediaTestimonialsData({ all: [{ type: 'text', quote: 'a', id: 'dup' }, { type: 'text', quote: 'b', id: 'dup' }] })
  );
  assert.equal(res.status, 422);
  assert.match(body.message, /duplicate id "dup" at entry 2\./);
});

test('legacy compatibility: an UNCHANGED legacy video testimonial (no url) can still be saved again untouched, alongside a brand-new valid entry', async () => {
  const token = await adminToken('testimonials-legacy-unchanged');
  const legacyVideo = { type: 'video', name: 'Ravi Menon', role: 'Chennai, India' };
  // Seeds the legacy baseline directly, bypassing validation -- simulating
  // content that predates this validation existing, exactly like the
  // pages/join-us PENDING DRAFT precedent above.
  await ContentModel.findOneAndUpdate(
    { type: MEDIA_TYPE },
    { $set: { data: mediaTestimonialsData({ all: [legacyVideo] }), draftData: null, status: 'published' } },
    { upsert: true }
  );

  const { res } = await saveDraft(
    token,
    MEDIA_TYPE,
    mediaTestimonialsData({ all: [legacyVideo, { type: 'text', quote: 'A brand-new, complete entry.' }] })
  );
  assert.equal(res.status, 200, 'the untouched legacy video entry must never block saving an unrelated new valid entry alongside it');
});

test('legacy compatibility: MODIFYING a legacy video testimonial without adding a url is rejected -- it is no longer "unchanged"', async () => {
  const token = await adminToken('testimonials-legacy-modified');
  const legacyVideo = { type: 'video', name: 'Lakshmi Narayanan', role: 'Singapore' };
  await ContentModel.findOneAndUpdate(
    { type: MEDIA_TYPE },
    { $set: { data: mediaTestimonialsData({ all: [legacyVideo] }), draftData: null, status: 'published' } },
    { upsert: true }
  );

  const { res, body } = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ ...legacyVideo, role: 'Singapore (updated)' }] }));
  assert.equal(res.status, 422);
  assert.match(body.message, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('POST /admin/content/publish for pages/media validates nextData against the currently-live doc.data baseline, accepting an unchanged legacy entry and rejecting a modified one', async () => {
  const token = await adminToken('testimonials-publish-baseline');
  const legacyVideo = { type: 'video', name: 'Legacy Person', role: 'Legacy Role' };
  await ContentModel.findOneAndUpdate(
    { type: MEDIA_TYPE },
    { $set: { data: mediaTestimonialsData({ all: [legacyVideo] }), draftData: mediaTestimonialsData({ all: [legacyVideo] }), status: 'published' } },
    { upsert: true }
  );

  const unchanged = await publish(token, MEDIA_TYPE);
  assert.equal(unchanged.res.status, 200);

  // Direct DB write of a modified draft -- bypassing draft-save validation
  // entirely, so publishContent's OWN check is what's actually exercised
  // here (same reasoning as the pages/join-us PENDING DRAFT test above).
  await ContentModel.findOneAndUpdate(
    { type: MEDIA_TYPE },
    { $set: { draftData: mediaTestimonialsData({ all: [{ ...legacyVideo, role: 'Legacy Role (edited)' }] }) } }
  );
  const modified = await publish(token, MEDIA_TYPE);
  assert.equal(modified.res.status, 422);
  assert.match(modified.body.message, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('POST /admin/content/revisions/restore for pages/media restores a historical revision containing a legacy video testimonial with no url, when that EXACT entry is still part of the currently published data', async () => {
  const token = await adminToken('testimonials-restore-legacy-still-live');
  const legacyVideo = { type: 'video', name: 'Historical Person', role: 'Nowhere' };
  // The currently-published data (doc.data, restore's own baseline) already
  // contains this exact legacy entry -- same baseline rule Publish uses.
  await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [legacyVideo] }));
  await publish(token, MEDIA_TYPE);

  const legacyRevision = await ContentRevisionModel.create({
    contentType: MEDIA_TYPE,
    version: 9101,
    data: mediaTestimonialsData({ all: [legacyVideo] }),
    action: 'publish',
  });

  const { res, body } = await restore(token, MEDIA_TYPE, legacyRevision._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.data.TESTIMONIALS_ALL[0].name, 'Historical Person');
});

test('POST /admin/content/revisions/restore for pages/media REJECTS an older incomplete revision whose item is no longer part of the current published data -- restore is never automatically exempt just because it is historical', async () => {
  const token = await adminToken('testimonials-restore-legacy-no-longer-live');
  // Current published data no longer contains the historical incomplete
  // item at all (it was since edited/removed).
  await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'text', quote: 'Only this is live now.' }] }));
  await publish(token, MEDIA_TYPE);

  const staleRevision = await ContentRevisionModel.create({
    contentType: MEDIA_TYPE,
    version: 9103,
    data: mediaTestimonialsData({ all: [{ type: 'video', name: 'Historical Person', role: 'Nowhere' }] }),
    action: 'publish',
  });

  const { res, body } = await restore(token, MEDIA_TYPE, staleRevision._id);
  assert.equal(res.status, 422);
  assert.match(body.message, /Testimonial 1: a valid video URL is required for a new video testimonial\./);

  const doc = await ContentModel.findOne({ type: MEDIA_TYPE }).lean();
  assert.equal(doc.data.TESTIMONIALS_ALL[0].quote, 'Only this is live now.', 'a rejected restore must leave the currently published data completely untouched');
});

test('POST /admin/content/revisions/restore for pages/media still rejects an unsafe video URL in a historical revision -- Tier A safety is never skipped', async () => {
  const token = await adminToken('testimonials-restore-unsafe');
  await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'text', quote: 'Current.' }] }));
  await publish(token, MEDIA_TYPE);

  const unsafeRevision = await ContentRevisionModel.create({
    contentType: MEDIA_TYPE,
    version: 9102,
    data: mediaTestimonialsData({ all: [{ type: 'video', url: 'javascript:alert(1)' }] }),
    action: 'publish',
  });

  const { res, body } = await restore(token, MEDIA_TYPE, unsafeRevision._id);
  assert.equal(res.status, 422);
  assert.match(body.message, /video URL must be a safe, absolute http:\/\/ or https:\/\/ link\./);
});

test('a REJECTED pages/media draft-save leaves content and audit state completely unchanged (no write, no audit entry)', async () => {
  const token = await adminToken('testimonials-rejected-no-side-effects');
  await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'text', quote: 'Baseline.' }] }));
  const beforeAuditCount = await AuditLogModel.countDocuments({ action: 'content.draft_saved', targetId: MEDIA_TYPE });
  const beforeDoc = await ContentModel.findOne({ type: MEDIA_TYPE }).lean();

  const { res } = await saveDraft(token, MEDIA_TYPE, mediaTestimonialsData({ all: [{ type: 'video' }] }));
  assert.equal(res.status, 422);

  assert.equal(await AuditLogModel.countDocuments({ action: 'content.draft_saved', targetId: MEDIA_TYPE }), beforeAuditCount);
  const afterDoc = await ContentModel.findOne({ type: MEDIA_TYPE }).lean();
  assert.deepEqual(afterDoc.draftData, beforeDoc.draftData);
});

test('the bare "media" twin is validated exactly the same way as pages/media', async () => {
  const token = await adminToken('testimonials-bare-media-type');
  const { res, body } = await saveDraft(token, 'media', mediaTestimonialsData({ all: [{ type: 'video' }] }));
  assert.equal(res.status, 422);
  assert.match(body.message, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('PUT /admin/content for pages/home validates HOME_TESTIMONIALS independently, and does not affect an unrelated type with the same field shape', async () => {
  const token = await adminToken('home-testimonials-valid-invalid');

  const invalid = await saveDraft(token, HOME_TYPE, { HOME_TESTIMONIALS: [{ quote: '' }] });
  assert.equal(invalid.res.status, 422);
  assert.match(invalid.body.message, /Home testimonial 1: a quote is required for a new text testimonial\./);

  const unaffected = await saveDraft(token, 'pages/about', { HOME_TESTIMONIALS: [{ quote: '' }] });
  assert.equal(unaffected.res.status, 200, 'HOME_TESTIMONIALS-shaped data under an unrelated type must never be validated by this rule');
});
