// Task 7M.1 — regression coverage for blog.admin.controller.js's full
// create -> draft -> publish -> revision -> restore lifecycle, slug
// uniqueness/locking, and category rename cascading. Previously had only
// one narrow test (blog.admin.controller.structuralGuard.test.js, which
// exercises updateDraftAdmin directly via fake req/res to test ONLY the
// structural-content-loss guard, never the rest of this controller's
// endpoints) — confirmed by the Task 7M audit as a HIGH-risk gap.
//
// Does not re-test the structural-content-loss guard itself (already
// thoroughly covered by blog.admin.controller.structuralGuard.test.js) --
// this file's draft-save tests use plain, non-structural body edits so as
// not to accidentally depend on or duplicate that separate guard's behavior.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { BlogPostModel } from './blogPost.model.js';

let env;
let adminRole; // seeded 'admin' role already has blog:read + blog:write
let readOnlyRole;
let noPermsRole;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  readOnlyRole = await RoleModel.create({ key: 'blog_read_only_role', name: 'Blog Read Only', permissions: ['blog:read'], mfaRequired: false });
  noPermsRole = await RoleModel.create({ key: 'no_blog_perms_role', name: 'No Blog Perms', permissions: ['forms:read'], mfaRequired: false });
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function adminToken(emailSuffix) {
  const user = await createTestUser({ email: `blog-admin-${emailSuffix}@example.test`, roleKey: 'admin' });
  return signAccessToken(user, adminRole);
}

async function listPosts(token, query = '') {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog${query}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function createPost(token, payload) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getPost(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function updateDraft(token, id, patch) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}`, {
    method: 'PUT',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function updateSlug(token, id, slug) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}/slug`, {
    method: 'PATCH',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function publishPost(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}/publish`, { method: 'POST', headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function unpublishPost(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}/unpublish`, { method: 'POST', headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function listRevisions(token, id) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}/revisions`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function restoreRevision(token, id, revisionId) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/${id}/revisions/restore`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ revisionId }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function listCategories(token) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/categories`, { headers: authHeader(token) });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function createCategory(token, name) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/categories`, {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function renameCategory(token, id, name) {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog/categories/${id}`, {
    method: 'PATCH',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getPublicPost(slug) {
  const res = await fetch(`${env.baseUrl}/api/v1/public/blog/${slug}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- RBAC ---

test('GET /admin/blog is rejected with 401 when unauthenticated', async () => {
  const res = await fetch(`${env.baseUrl}/api/v1/admin/blog`);
  assert.equal(res.status, 401);
});

test('GET /admin/blog is rejected with 403 for a role without blog:read', async () => {
  const user = await createTestUser({ email: 'blog-noperm-list@example.test', roleKey: 'no_blog_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res, body } = await listPosts(token);
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

test('POST /admin/blog is rejected with 403 for a role with blog:read but not blog:write', async () => {
  const user = await createTestUser({ email: 'blog-readonly-create@example.test', roleKey: 'blog_read_only_role' });
  const token = signAccessToken(user, readOnlyRole);
  const { res, body } = await createPost(token, { slug: 'readonly-cannot-create', title: 'X' });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
});

// --- POST /admin/blog (create) ---

test('POST /admin/blog rejects an invalid slug format with 422', async () => {
  const token = await adminToken('create-bad-slug');
  const { res, body } = await createPost(token, { slug: 'Not A Valid Slug!', title: 'X' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.slug);
});

test('POST /admin/blog rejects a missing title with 422', async () => {
  const token = await adminToken('create-missing-title');
  const { res, body } = await createPost(token, { slug: 'missing-title-post' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.title);
});

test('POST /admin/blog rejects a duplicate slug with 409 SLUG_IN_USE', async () => {
  const token = await adminToken('create-dup-slug');
  await createPost(token, { slug: 'duplicate-post-slug', title: 'First' });
  const { res, body } = await createPost(token, { slug: 'duplicate-post-slug', title: 'Second' });
  assert.equal(res.status, 409);
  assert.equal(body.code, 'SLUG_IN_USE');
});

test('POST /admin/blog succeeds, creating a draft post with empty editable fields pre-populated, and records a blogPost.created audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-create@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await AuditLogModel.countDocuments({ action: 'blogPost.created' });

  const { res, body } = await createPost(token, { slug: 'brand-new-draft-post', title: 'Brand New Draft' });
  assert.equal(res.status, 201);
  assert.equal(body.data.status, 'draft');
  assert.equal(body.data.data, null);
  assert.equal(body.data.draftData.title, 'Brand New Draft');
  assert.deepEqual(body.data.draftData.categories, []);

  const logs = await AuditLogModel.find({ action: 'blogPost.created' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.slug, 'brand-new-draft-post');
});

// --- GET /admin/blog/:id ---

test('GET /admin/blog/:id rejects a malformed id with 422', async () => {
  const token = await adminToken('get-bad-id');
  const { res } = await getPost(token, 'not-a-valid-id');
  assert.equal(res.status, 422);
});

test('GET /admin/blog/:id returns 404 for a well-formed but nonexistent id', async () => {
  const token = await adminToken('get-404');
  const { res, body } = await getPost(token, '507f1f77bcf86cd799439011');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'POST_NOT_FOUND');
});

// --- PUT /admin/blog/:id (draft save) ---

test('PUT /admin/blog/:id updates only the given editable fields, merging into the existing draft', async () => {
  const token = await adminToken('draft-merge');
  const created = await createPost(token, { slug: 'draft-merge-post', title: 'Original Title' });
  const { res, body } = await updateDraft(token, created.body.data._id, { excerpt: 'A new excerpt' });
  assert.equal(res.status, 200);
  assert.equal(body.data.draftData.title, 'Original Title', 'an unrelated field must be preserved');
  assert.equal(body.data.draftData.excerpt, 'A new excerpt');
});

test('PUT /admin/blog/:id rejects non-array categories/tags with 422', async () => {
  const token = await adminToken('draft-bad-categories');
  const created = await createPost(token, { slug: 'draft-bad-categories-post', title: 'X' });
  const { res, body } = await updateDraft(token, created.body.data._id, { categories: 'not-an-array' });
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.categories);
});

test('PUT /admin/blog/:id cannot smuggle a status or slug change through the draft body (only EDITABLE_FIELDS are ever applied)', async () => {
  const token = await adminToken('draft-no-smuggle');
  const created = await createPost(token, { slug: 'draft-no-smuggle-post', title: 'X' });
  const { res, body } = await updateDraft(token, created.body.data._id, { status: 'published', slug: 'attempted-slug-change' });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'draft', 'status must only ever change via the dedicated publish/unpublish endpoints');
  assert.equal(body.data.slug, 'draft-no-smuggle-post', 'slug must only ever change via the dedicated slug endpoint');
});

test('PUT /admin/blog/:id on success records a blogPost.draft_saved audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-draft@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createPost(token, { slug: 'audit-draft-post', title: 'X' });
  const before = await AuditLogModel.countDocuments({ action: 'blogPost.draft_saved' });

  const { res } = await updateDraft(token, created.body.data._id, { excerpt: 'Updated' });
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'blogPost.draft_saved' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
});

test('draft-leak prevention: a freshly-created draft post is not visible through the public API', async () => {
  const token = await adminToken('draft-not-public');
  const created = await createPost(token, { slug: 'draft-not-public-post', title: 'Secret draft post' });
  await updateDraft(token, created.body.data._id, { body: '<p>Draft body</p>' });
  const { res } = await getPublicPost('draft-not-public-post');
  assert.equal(res.status, 404);
});

// --- PATCH /admin/blog/:id/slug ---

test('PATCH /admin/blog/:id/slug rejects an invalid slug format with 422', async () => {
  const token = await adminToken('slug-bad-format');
  const created = await createPost(token, { slug: 'slug-bad-format-post', title: 'X' });
  const { res, body } = await updateSlug(token, created.body.data._id, 'Not Valid!');
  assert.equal(res.status, 422);
});

test('PATCH /admin/blog/:id/slug rejects a slug already used by another post with 409 SLUG_IN_USE', async () => {
  const token = await adminToken('slug-dup');
  await createPost(token, { slug: 'slug-dup-existing', title: 'X' });
  const toChange = await createPost(token, { slug: 'slug-dup-changeable', title: 'Y' });
  const { res, body } = await updateSlug(token, toChange.body.data._id, 'slug-dup-existing');
  assert.equal(res.status, 409);
  assert.equal(body.code, 'SLUG_IN_USE');
});

test('PATCH /admin/blog/:id/slug succeeds before the first publish', async () => {
  const token = await adminToken('slug-before-publish');
  const created = await createPost(token, { slug: 'slug-before-publish-original', title: 'X' });
  const { res, body } = await updateSlug(token, created.body.data._id, 'slug-before-publish-renamed');
  assert.equal(res.status, 200);
  assert.equal(body.data.slug, 'slug-before-publish-renamed');
});

test('PATCH /admin/blog/:id/slug is permanently locked with 409 SLUG_LOCKED once the post has been published at least once, even after a later unpublish', async () => {
  const token = await adminToken('slug-locked');
  const created = await createPost(token, { slug: 'slug-locked-post', title: 'Title' });
  await updateDraft(token, created.body.data._id, { body: '<p>Body</p>' });
  await publishPost(token, created.body.data._id);

  const afterPublish = await updateSlug(token, created.body.data._id, 'slug-locked-post-renamed');
  assert.equal(afterPublish.res.status, 409);
  assert.equal(afterPublish.body.code, 'SLUG_LOCKED');

  await unpublishPost(token, created.body.data._id);
  const afterUnpublish = await updateSlug(token, created.body.data._id, 'slug-locked-post-renamed-2');
  assert.equal(afterUnpublish.res.status, 409, 'the slug lock is permanent once published, not merely tied to current status');
});

test('PATCH /admin/blog/:id/slug on success records a blogPost.slug_changed audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-slug@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createPost(token, { slug: 'audit-slug-original', title: 'X' });
  const before = await AuditLogModel.countDocuments({ action: 'blogPost.slug_changed' });

  const { res } = await updateSlug(token, created.body.data._id, 'audit-slug-renamed');
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'blogPost.slug_changed' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
});

// --- POST /admin/blog/:id/publish ---

test('POST /admin/blog/:id/publish rejects with 422 when title or body is missing', async () => {
  const token = await adminToken('publish-missing-fields');
  const created = await createPost(token, { slug: 'publish-missing-fields-post', title: 'Has Title' });
  // Title exists (from creation) but body is still the empty string default.
  const { res, body } = await publishPost(token, created.body.data._id);
  assert.equal(res.status, 422);
  assert.ok(body.fieldErrors.body);
});

test('POST /admin/blog/:id/publish succeeds, sets publishedAt only on the FIRST publish, and makes the post publicly visible', async () => {
  const token = await adminToken('publish-flow');
  const created = await createPost(token, { slug: 'publish-flow-post', title: 'Published Post' });
  await updateDraft(token, created.body.data._id, { body: '<p>Real body</p>' });

  const first = await publishPost(token, created.body.data._id);
  assert.equal(first.res.status, 200);
  assert.equal(first.body.data.status, 'published');
  assert.ok(first.body.data.publishedAt);
  const firstPublishedAt = first.body.data.publishedAt;

  const { res: publicRes, body: publicBody } = await getPublicPost('publish-flow-post');
  assert.equal(publicRes.status, 200);
  assert.equal(publicBody.data.title, 'Published Post');

  // A second publish (e.g. after a later edit) must not reset publishedAt.
  await updateDraft(token, created.body.data._id, { excerpt: 'Edited after first publish' });
  const second = await publishPost(token, created.body.data._id);
  assert.equal(second.res.status, 200);
  assert.equal(second.body.data.publishedAt, firstPublishedAt, 'publishedAt must only ever be set once, on the first publish');
});

test('POST /admin/blog/:id/publish creates a version-1 revision on first publish, incrementing on each subsequent publish', async () => {
  const token = await adminToken('publish-versioning');
  const created = await createPost(token, { slug: 'publish-versioning-post', title: 'T' });
  await updateDraft(token, created.body.data._id, { body: '<p>v1</p>' });
  await publishPost(token, created.body.data._id);

  await updateDraft(token, created.body.data._id, { body: '<p>v2</p>' });
  await publishPost(token, created.body.data._id);

  const { body } = await listRevisions(token, created.body.data._id);
  assert.equal(body.data.length, 2);
  assert.equal(body.data[0].version, 2);
  assert.equal(body.data[1].version, 1);
});

test('POST /admin/blog/:id/publish on success records a blogPost.published audit log entry with the version', async () => {
  const user = await createTestUser({ email: 'blog-audit-publish@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createPost(token, { slug: 'audit-publish-post', title: 'T' });
  await updateDraft(token, created.body.data._id, { body: '<p>Body</p>' });
  const before = await AuditLogModel.countDocuments({ action: 'blogPost.published' });

  const { res } = await publishPost(token, created.body.data._id);
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'blogPost.published' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.version, 1);
});

test('revision pruning: publishing more than MAX_REVISIONS_PER_POST (20) times keeps only the most recent 20 revisions', async () => {
  const token = await adminToken('prune');
  const created = await createPost(token, { slug: 'prune-post', title: 'T' });
  for (let i = 1; i <= 22; i += 1) {
    await updateDraft(token, created.body.data._id, { body: `<p>v${i}</p>` });
    await publishPost(token, created.body.data._id);
  }
  const { body } = await listRevisions(token, created.body.data._id);
  assert.equal(body.data.length, 20);
  const versions = body.data.map((r) => r.version).sort((a, b) => a - b);
  assert.deepEqual(versions, Array.from({ length: 20 }, (_, i) => i + 3));
});

// --- POST /admin/blog/:id/unpublish ---

test('POST /admin/blog/:id/unpublish hides the post publicly but preserves data and publishedAt', async () => {
  const token = await adminToken('unpublish-flow');
  const created = await createPost(token, { slug: 'unpublish-flow-post', title: 'T' });
  await updateDraft(token, created.body.data._id, { body: '<p>Body</p>' });
  const published = await publishPost(token, created.body.data._id);
  const publishedAt = published.body.data.publishedAt;

  const { res, body } = await unpublishPost(token, created.body.data._id);
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'draft');
  assert.equal(body.data.publishedAt, publishedAt, 'unpublish must not clear publishedAt');
  assert.ok(body.data.data, 'unpublish must preserve the published data, not discard it');

  assert.equal((await getPublicPost('unpublish-flow-post')).res.status, 404);
});

test('POST /admin/blog/:id/unpublish on success records a blogPost.unpublished audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-unpublish@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createPost(token, { slug: 'audit-unpublish-post', title: 'T' });
  await updateDraft(token, created.body.data._id, { body: '<p>Body</p>' });
  await publishPost(token, created.body.data._id);
  const before = await AuditLogModel.countDocuments({ action: 'blogPost.unpublished' });

  const { res } = await unpublishPost(token, created.body.data._id);
  assert.equal(res.status, 200);
  const logs = await AuditLogModel.find({ action: 'blogPost.unpublished' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
});

// --- GET revisions & POST revisions/restore ---

test('POST /admin/blog/:id/revisions/restore rejects a missing revisionId with 422', async () => {
  const token = await adminToken('restore-missing-id');
  const created = await createPost(token, { slug: 'restore-missing-id-post', title: 'T' });
  const { res } = await restoreRevision(token, created.body.data._id, undefined);
  assert.equal(res.status, 422);
});

test('POST /admin/blog/:id/revisions/restore returns 404 for a revisionId belonging to a different post, and leaves that post\'s revision history unchanged', async () => {
  const token = await adminToken('restore-wrong-post');
  const postA = await createPost(token, { slug: 'restore-wrong-post-a', title: 'A' });
  await updateDraft(token, postA.body.data._id, { body: '<p>A</p>' });
  await publishPost(token, postA.body.data._id);
  const revisionFromA = (await listRevisions(token, postA.body.data._id)).body.data[0]._id;

  const postB = await createPost(token, { slug: 'restore-wrong-post-b', title: 'B' });
  await updateDraft(token, postB.body.data._id, { body: '<p>B</p>' });
  await publishPost(token, postB.body.data._id);
  const beforeCount = (await listRevisions(token, postB.body.data._id)).body.data.length;

  const { res, body } = await restoreRevision(token, postB.body.data._id, revisionFromA);
  assert.equal(res.status, 404);
  assert.equal(body.code, 'REVISION_NOT_FOUND');

  const afterCount = (await listRevisions(token, postB.body.data._id)).body.data.length;
  assert.equal(afterCount, beforeCount, 'a failed restore must not create a partial/corrupt revision row');
});

test('POST /admin/blog/:id/revisions/restore re-publishes a past revision, adds a NEW revision (action: restore), and updates the public response', async () => {
  const token = await adminToken('restore-flow');
  const created = await createPost(token, { slug: 'restore-flow-post', title: 'Restore Flow' });
  await updateDraft(token, created.body.data._id, { body: '<p>Original v1 body</p>' });
  await publishPost(token, created.body.data._id);
  const v1RevisionId = (await listRevisions(token, created.body.data._id)).body.data[0]._id;

  await updateDraft(token, created.body.data._id, { body: '<p>Changed v2 body</p>' });
  await publishPost(token, created.body.data._id);
  assert.match((await getPublicPost('restore-flow-post')).body.data.body, /Changed v2/);

  const { res, body } = await restoreRevision(token, created.body.data._id, v1RevisionId);
  assert.equal(res.status, 200);
  assert.match(body.data.data.body, /Original v1/);

  const revisions = (await listRevisions(token, created.body.data._id)).body.data;
  assert.equal(revisions.length, 3);
  assert.equal(revisions[0].action, 'restore');
  assert.equal(revisions[0].details.restoredFromVersion, 1);

  assert.match((await getPublicPost('restore-flow-post')).body.data.body, /Original v1/);
});

test('POST /admin/blog/:id/revisions/restore on success records a blogPost.restored audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-restore@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const created = await createPost(token, { slug: 'audit-restore-post', title: 'T' });
  await updateDraft(token, created.body.data._id, { body: '<p>v1</p>' });
  await publishPost(token, created.body.data._id);
  const revisionId = (await listRevisions(token, created.body.data._id)).body.data[0]._id;
  await updateDraft(token, created.body.data._id, { body: '<p>v2</p>' });
  await publishPost(token, created.body.data._id);

  const before = await AuditLogModel.countDocuments({ action: 'blogPost.restored' });
  const { res } = await restoreRevision(token, created.body.data._id, revisionId);
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'blogPost.restored' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].actorEmail, user.email);
  assert.equal(logs[0].details.restoredFromVersion, 1);
});

// --- GET /admin/blog (list, filtering) ---

test('GET /admin/blog returns posts of every status, unlike the public list which only shows published', async () => {
  const token = await adminToken('list-all-status');
  await createPost(token, { slug: 'list-all-status-draft', title: 'Draft Post' });
  const published = await createPost(token, { slug: 'list-all-status-published', title: 'Published Post' });
  await updateDraft(token, published.body.data._id, { body: '<p>Body</p>' });
  await publishPost(token, published.body.data._id);

  const { res, body } = await listPosts(token);
  assert.equal(res.status, 200);
  const slugs = body.data.map((p) => p.slug);
  assert.ok(slugs.includes('list-all-status-draft') && slugs.includes('list-all-status-published'));
});

test('GET /admin/blog filters by status', async () => {
  const token = await adminToken('list-filter-status');
  await createPost(token, { slug: 'list-filter-status-post', title: 'T' });
  const byStatus = await listPosts(token, '?status=draft');
  assert.ok(byStatus.body.data.some((p) => p.slug === 'list-filter-status-post'));
});

// The admin list's `?category=`/`?tag=` filters match `data.categories`/
// `data.tags` -- the PUBLISHED fields, same as the public list's own
// filters -- not a pending draft's `draftData.categories`. The post must
// actually be published for this filter to find it.
test('GET /admin/blog filters by category, matching a published post\'s data.categories', async () => {
  const token = await adminToken('list-filter-category');
  const post = await createPost(token, { slug: 'list-filter-category-post', title: 'T' });
  await updateDraft(token, post.body.data._id, { body: '<p>B</p>', categories: ['filter-category-x'] });
  await publishPost(token, post.body.data._id);

  const byCategory = await listPosts(token, '?category=filter-category-x');
  assert.ok(byCategory.body.data.some((p) => p.slug === 'list-filter-category-post'));
});

test('GET /admin/blog rejects an operator-shaped category query parameter (NoSQL injection attempt) with 422', async () => {
  const token = await adminToken('list-filter-category-injection');
  const { res, body } = await listPosts(token, '?category[$regex]=.*&category[$options]=i');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('GET /admin/blog rejects an operator-shaped tag query parameter with 422', async () => {
  const token = await adminToken('list-filter-tag-injection');
  const { res, body } = await listPosts(token, '?tag[$ne]=null');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

// --- Categories ---

test('GET /admin/blog/categories is rejected with 403 for a role without blog:read', async () => {
  const user = await createTestUser({ email: 'blog-noperm-categories@example.test', roleKey: 'no_blog_perms_role' });
  const token = signAccessToken(user, noPermsRole);
  const { res } = await listCategories(token);
  assert.equal(res.status, 403);
});

test('POST /admin/blog/categories rejects a missing name with 422', async () => {
  const token = await adminToken('category-missing-name');
  const { res } = await createCategory(token, undefined);
  assert.equal(res.status, 422);
});

test('POST /admin/blog/categories rejects a duplicate name with 409 CATEGORY_IN_USE', async () => {
  const token = await adminToken('category-dup');
  await createCategory(token, 'Duplicate Category');
  const { res, body } = await createCategory(token, 'Duplicate Category');
  assert.equal(res.status, 409);
  assert.equal(body.code, 'CATEGORY_IN_USE');
});

test('POST /admin/blog/categories succeeds and records a blogCategory.created audit log entry', async () => {
  const user = await createTestUser({ email: 'blog-audit-category-create@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await AuditLogModel.countDocuments({ action: 'blogCategory.created' });

  const { res, body } = await createCategory(token, 'Audited New Category');
  assert.equal(res.status, 201);
  assert.equal(body.data.name, 'Audited New Category');

  const logs = await AuditLogModel.find({ action: 'blogCategory.created' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
});

test('PATCH /admin/blog/categories/:id returns 404 for a nonexistent category id', async () => {
  const token = await adminToken('category-rename-404');
  const { res, body } = await renameCategory(token, '507f1f77bcf86cd799439011', 'New Name');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CATEGORY_NOT_FOUND');
});

test('PATCH /admin/blog/categories/:id rejects renaming to a name already used by another category with 409', async () => {
  const token = await adminToken('category-rename-dup');
  await createCategory(token, 'Existing Category Name');
  const toRename = await createCategory(token, 'Renameable Category');
  const { res, body } = await renameCategory(token, toRename.body.data._id, 'Existing Category Name');
  assert.equal(res.status, 409);
  assert.equal(body.code, 'CATEGORY_IN_USE');
});

test('PATCH /admin/blog/categories/:id is a no-op success when renamed to its own current name', async () => {
  const token = await adminToken('category-rename-noop');
  const category = await createCategory(token, 'Unchanged Category Name');
  const { res, body } = await renameCategory(token, category.body.data._id, 'Unchanged Category Name');
  assert.equal(res.status, 200);
  assert.equal(body.data.name, 'Unchanged Category Name');
});

test('PATCH /admin/blog/categories/:id cascades the rename onto every post\'s published `data.categories` AND pending `draftData.categories`, and only the matching category entry, nothing else', async () => {
  const token = await adminToken('category-rename-cascade');
  const category = await createCategory(token, 'Cascade Original Name');

  // Post 1: published, uses the category in `data.categories` alongside an
  // unrelated category that must NOT be touched by the rename.
  const post1 = await createPost(token, { slug: 'cascade-post-1', title: 'T1' });
  await updateDraft(token, post1.body.data._id, { body: '<p>B</p>', categories: ['Cascade Original Name', 'Untouched Category'] });
  await publishPost(token, post1.body.data._id);

  // Post 2: has ONLY a pending draft (never published) using the category.
  const post2 = await createPost(token, { slug: 'cascade-post-2', title: 'T2' });
  await updateDraft(token, post2.body.data._id, { categories: ['Cascade Original Name'] });

  // Post 3: does not use this category at all -- must be completely unaffected.
  const post3 = await createPost(token, { slug: 'cascade-post-3', title: 'T3' });
  await updateDraft(token, post3.body.data._id, { categories: ['Some Other Category'] });

  const { res } = await renameCategory(token, category.body.data._id, 'Cascade Renamed Name');
  assert.equal(res.status, 200);

  const reloaded1 = await BlogPostModel.findById(post1.body.data._id).lean();
  assert.deepEqual(reloaded1.data.categories, ['Cascade Renamed Name', 'Untouched Category']);

  const reloaded2 = await BlogPostModel.findById(post2.body.data._id).lean();
  assert.deepEqual(reloaded2.draftData.categories, ['Cascade Renamed Name']);

  const reloaded3 = await BlogPostModel.findById(post3.body.data._id).lean();
  assert.deepEqual(reloaded3.draftData.categories, ['Some Other Category']);

  // The renamed category must now reflect publicly too, for the published post.
  const { body: publicBody } = await getPublicPost('cascade-post-1');
  assert.deepEqual(publicBody.data.categories, ['Cascade Renamed Name', 'Untouched Category']);
});

test('PATCH /admin/blog/categories/:id on success records a blogCategory.renamed audit log entry with from/to names', async () => {
  const user = await createTestUser({ email: 'blog-audit-category-rename@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const category = await createCategory(token, 'Audit Rename Original');
  const before = await AuditLogModel.countDocuments({ action: 'blogCategory.renamed' });

  const { res } = await renameCategory(token, category.body.data._id, 'Audit Rename New');
  assert.equal(res.status, 200);

  const logs = await AuditLogModel.find({ action: 'blogCategory.renamed' }).sort({ createdAt: -1 });
  assert.equal(logs.length, before + 1);
  assert.equal(logs[0].details.from, 'Audit Rename Original');
  assert.equal(logs[0].details.to, 'Audit Rename New');
});
