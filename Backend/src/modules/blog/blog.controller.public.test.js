// Task 7M — regression coverage for the public blog read endpoints
// (GET /api/v1/public/blog, /blog/categories, /blog/:slug —
// blog.controller.js). Previously had zero Backend test coverage anywhere
// (confirmed by audit) despite being the public-facing draft-leak-prevention
// boundary for every blog post, mirroring content.controller.public.test.js
// for the generic Content model.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';

let mem;
let BlogPostModel;
let server;
let baseUrl;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ BlogPostModel } = await import('./blogPost.model.js'));
  const { createApp } = await import('../../app.js');
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mem.stop();
});

async function get(path) {
  const res = await fetch(`${baseUrl}${path}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

function postData(overrides = {}) {
  return { title: 'A Post', excerpt: 'Excerpt', body: '<p>Body</p>', featuredImage: null, author: 'Author', categories: [], tags: [], seo: {}, ...overrides };
}

// --- GET /public/blog/:slug ---

test('getPostBySlugPublic: returns 404 for a slug that does not exist at all', async () => {
  const { res, body } = await get('/api/v1/public/blog/no-such-slug-anywhere');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'POST_NOT_FOUND');
});

test('getPostBySlugPublic: returns the published data for a published post', async () => {
  await BlogPostModel.create({ slug: 'public-test-published-post', status: 'published', data: postData({ title: 'Real Published Post' }) });
  const { res, body } = await get('/api/v1/public/blog/public-test-published-post');
  assert.equal(res.status, 200);
  assert.equal(body.data.title, 'Real Published Post');
  assert.equal(body.data.status, 'published');
});

test('draft-leak prevention: a draft-status post (never published) is hidden from a normal public request', async () => {
  await BlogPostModel.create({ slug: 'public-test-draft-post', status: 'draft', data: null, draftData: postData({ title: 'Unpublished draft -- must never leak' }) });
  const { res, body } = await get('/api/v1/public/blog/public-test-draft-post');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'POST_NOT_FOUND');
});

test('previewSecret gate: the correct secret reveals a draft post\'s draftData', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = 'test-blog-preview-secret';
  try {
    await BlogPostModel.create({ slug: 'public-test-preview-correct', status: 'draft', data: null, draftData: postData({ title: 'Draft shown only with secret' }) });
    const { res, body } = await get('/api/v1/public/blog/public-test-preview-correct?previewSecret=test-blog-preview-secret');
    assert.equal(res.status, 200);
    assert.equal(body.data.title, 'Draft shown only with secret');
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('previewSecret gate: a wrong secret behaves exactly like a normal public request -- draft stays hidden', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = 'test-blog-preview-secret';
  try {
    await BlogPostModel.create({ slug: 'public-test-preview-wrong', status: 'draft', data: null, draftData: postData({ title: 'Must not leak' }) });
    const { res } = await get('/api/v1/public/blog/public-test-preview-wrong?previewSecret=wrong-value');
    assert.equal(res.status, 404);
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('the public response shape never exposes the draft/published distinction beyond `status`, and omits internal fields', async () => {
  await BlogPostModel.create({ slug: 'public-test-shape', status: 'published', data: postData({ title: 'Shape Check' }) });
  const { body } = await get('/api/v1/public/blog/public-test-shape');
  assert.deepEqual(
    Object.keys(body.data).sort(),
    ['_id', 'author', 'body', 'categories', 'excerpt', 'featuredImage', 'publishedAt', 'seo', 'slug', 'status', 'tags', 'title'].sort()
  );
});

// --- GET /public/blog (list) ---

test('listPostsPublic: only ever returns published posts, newest first', async () => {
  await BlogPostModel.create({ slug: 'public-test-list-old', status: 'published', publishedAt: new Date('2024-01-01'), data: postData({ title: 'Old' }) });
  await BlogPostModel.create({ slug: 'public-test-list-new', status: 'published', publishedAt: new Date('2025-01-01'), data: postData({ title: 'New' }) });
  await BlogPostModel.create({ slug: 'public-test-list-draft', status: 'draft', draftData: postData({ title: 'Should never appear' }) });

  const { res, body } = await get('/api/v1/public/blog?limit=50');
  assert.equal(res.status, 200);
  const titles = body.data.map((p) => p.title);
  assert.ok(!titles.includes('Should never appear'), 'a draft post must never appear in the public list');
  const newIdx = titles.indexOf('New');
  const oldIdx = titles.indexOf('Old');
  assert.ok(newIdx !== -1 && oldIdx !== -1 && newIdx < oldIdx, 'expected newest-first ordering');
});

test('listPostsPublic: filters by category and tag', async () => {
  await BlogPostModel.create({ slug: 'public-test-filter-match', status: 'published', data: postData({ title: 'Match', categories: ['sanskrit'], tags: ['featured'] }) });
  await BlogPostModel.create({ slug: 'public-test-filter-nomatch', status: 'published', data: postData({ title: 'No Match', categories: ['other'], tags: ['other'] }) });

  const byCategory = await get('/api/v1/public/blog?category=sanskrit');
  assert.ok(byCategory.body.data.some((p) => p.title === 'Match'));
  assert.ok(!byCategory.body.data.some((p) => p.title === 'No Match'));

  const byTag = await get('/api/v1/public/blog?tag=featured');
  assert.ok(byTag.body.data.some((p) => p.title === 'Match'));
  assert.ok(!byTag.body.data.some((p) => p.title === 'No Match'));
});

test('listPostsPublic: pagination meta reflects the real total, clamped limit, and respects page/limit', async () => {
  for (let i = 0; i < 3; i += 1) {
    await BlogPostModel.create({ slug: `public-test-page-${i}`, status: 'published', data: postData({ title: `Page Post ${i}` }) });
  }
  const { body } = await get('/api/v1/public/blog?page=1&limit=2');
  assert.equal(body.meta.page, 1);
  assert.equal(body.meta.limit, 2);
  assert.equal(body.data.length, 2);
  assert.ok(body.meta.total >= 3);
});

test('listPostsPublic: limit is capped at 50 even if a larger value is requested', async () => {
  const { body } = await get('/api/v1/public/blog?limit=500');
  assert.equal(body.meta.limit, 50);
});

// --- NoSQL operator-injection hardening (Task 7D.26) ---

test('listPostsPublic: an operator-shaped category query parameter is rejected with a validation error, not passed to MongoDB', async () => {
  // Express's default `qs` parser turns this bracket syntax into
  // { $regex: '.*', $options: 'i' } -- if assigned directly into the
  // Mongo filter, this would match every published post regardless of its
  // real category (or worse, a slower/more dangerous operator).
  const { res, body } = await get('/api/v1/public/blog?category[$regex]=.*&category[$options]=i');
  assert.equal(res.status, 422);
  assert.equal(body.success, false);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('listPostsPublic: an operator-shaped tag query parameter is rejected with a validation error', async () => {
  const { res, body } = await get('/api/v1/public/blog?tag[$ne]=null');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('listPostsPublic: a repeated category query parameter (array, not a scalar) is rejected with a validation error', async () => {
  const { res, body } = await get('/api/v1/public/blog?category=a&category=b');
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('listPostsPublic: a normal single-value category filter is unaffected by the new validation', async () => {
  await BlogPostModel.create({ slug: 'public-test-filter-still-works', status: 'published', data: postData({ title: 'Still Works', categories: ['still-works-category'] }) });
  const { res, body } = await get('/api/v1/public/blog?category=still-works-category');
  assert.equal(res.status, 200);
  assert.ok(body.data.some((p) => p.title === 'Still Works'));
});

// --- GET /public/blog/categories ---

test('listCategoriesPublic: only returns categories actually used by a published post, sorted', async () => {
  await BlogPostModel.create({ slug: 'public-test-cat-1', status: 'published', data: postData({ categories: ['zebra', 'apple'] }) });
  await BlogPostModel.create({ slug: 'public-test-cat-draft', status: 'draft', draftData: postData({ categories: ['draft-only-category'] }) });

  const { res, body } = await get('/api/v1/public/blog/categories');
  assert.equal(res.status, 200);
  assert.ok(!body.data.includes('draft-only-category'), 'a category used only by a draft post must not appear in the public category list');
  assert.ok(body.data.includes('zebra') && body.data.includes('apple'));
  const zebraIdx = body.data.indexOf('zebra');
  const appleIdx = body.data.indexOf('apple');
  assert.ok(appleIdx < zebraIdx, 'expected alphabetically sorted categories');
});

test('the /blog/categories route is matched before /blog/:slug (a post literally slugged "categories" would otherwise be shadowed)', async () => {
  // This is really a route-registration-order regression guard: if blog.routes.js
  // ever registered /blog/:slug before /blog/categories, this request would
  // 404 with POST_NOT_FOUND (treated as a slug lookup) instead of returning
  // the categories list.
  const { res, body } = await get('/api/v1/public/blog/categories');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
});
