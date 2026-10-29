// Regression coverage for runSeed()'s BlogPostModel upsert (Phase 1 Task
// 6I-B3 fix): `data` now lives under $setOnInsert (a one-time bootstrap
// value), never a bare replacement-style update, so an administrator's edit
// through the admin CMS (title/body/featuredImage/tags/seo, via
// blog.admin.controller.js's EDITABLE_FIELDS) survives any later
// reseed/restart -- exactly the same fix already proven for
// DonationSchemeModel (Task 5B) and ContentModel (Task 6I-B). Runs against a
// disposable mongodb-memory-server instance only -- never MongoDB Atlas,
// never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. The real, installed
// `mongoose`/`mongodb` driver is exercised directly (no mocking), which is
// itself the confirmation that this update structure works with the actual
// installed version.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from '../../../scripts/runSeed.js';
import { BlogPostModel } from './blogPost.model.js';
import { BlogPostRevisionModel } from './blogPostRevision.model.js';
import { BlogCategoryModel } from './blogCategory.model.js';
import * as blog from '../../../scripts/seedData/blog.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

async function resetBlog() {
  await BlogPostModel.deleteMany({});
  await BlogPostRevisionModel.deleteMany({});
  await BlogCategoryModel.deleteMany({});
}

test('first-time seeding creates all expected blog posts with correct data', async () => {
  await resetBlog();
  const result = await runSeed();
  assert.equal(result.blogPosts, blog.BLOG_POSTS.length);

  const docs = await BlogPostModel.find().lean();
  assert.equal(docs.length, blog.BLOG_POSTS.length);
  assert.deepEqual(
    docs.map((d) => d.slug).sort(),
    blog.BLOG_POSTS.map((p) => p.slug).sort()
  );

  const first = blog.BLOG_POSTS[0];
  const doc = docs.find((d) => d.slug === first.slug);
  assert.deepEqual(doc.data, {
    title: first.title,
    excerpt: first.excerpt,
    body: first.body,
    featuredImage: null,
    author: first.author,
    categories: first.categories,
    tags: [],
    seo: {},
  });
  assert.equal(doc.status, 'published');
  assert.deepEqual(new Date(doc.publishedAt).toISOString(), new Date(first.publishedAt).toISOString());
  assert.equal(doc.draftData, null);
});

test('admin-edited title, body, featuredImage, tags and SEO data survive reseeding', async () => {
  await resetBlog();
  await runSeed();
  const slug = blog.BLOG_POSTS[0].slug;
  const adminEdit = {
    title: 'Admin-edited title',
    excerpt: 'Admin-edited excerpt',
    body: '<p>Admin-edited body</p>',
    featuredImage: 'https://example.com/photo.jpg',
    author: 'Admin Author',
    categories: ['Research'],
    tags: ['admin', 'edited'],
    seo: { metaTitle: 'Admin SEO title' },
  };
  await BlogPostModel.updateOne({ slug }, { $set: { data: adminEdit } });

  await runSeed();

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.deepEqual(doc.data, adminEdit);
});

test('draftData, status and publishedAt remain unchanged on reseed', async () => {
  await resetBlog();
  await runSeed();
  const slug = blog.BLOG_POSTS[0].slug;
  const draftEdit = { title: 'Pending draft title', excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} };
  await BlogPostModel.updateOne({ slug }, { $set: { draftData: draftEdit, status: 'draft' } });

  await runSeed();

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.deepEqual(doc.draftData, draftEdit);
  assert.equal(doc.status, 'draft');
  // publishedAt is set once and never moves, even across this reseed call.
  assert.deepEqual(new Date(doc.publishedAt).toISOString(), new Date(blog.BLOG_POSTS[0].publishedAt).toISOString());
});

test('repeated reseeding is idempotent for stored content', async () => {
  await resetBlog();
  await runSeed();
  const slug = blog.BLOG_POSTS[0].slug;
  const stableEdit = { title: 'Stable edit', excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} };
  await BlogPostModel.updateOne({ slug }, { $set: { data: stableEdit } });

  await runSeed();
  await runSeed();
  await runSeed();

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.deepEqual(doc.data, stableEdit);
});

// This task's scope forbids modifying seedData files, so a truly new post
// can't be introduced there for this test. A real missing-then-seeded post
// is simulated instead by deleting one of the real seeded posts (standing in
// for "a post that doesn't exist in this database yet") and confirming a
// single runSeed() call both (a) recreates it correctly and (b) leaves an
// unrelated, already-customized post completely alone.
test('a missing post can be recreated without changing existing customized posts', async () => {
  await resetBlog();
  await runSeed();
  const [first, second] = blog.BLOG_POSTS;
  const customized = { title: 'Customized', excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} };
  await BlogPostModel.updateOne({ slug: first.slug }, { $set: { data: customized } });
  await BlogPostModel.deleteOne({ slug: second.slug }); // stands in for "not yet introduced"

  await runSeed();

  const recreated = await BlogPostModel.findOne({ slug: second.slug }).lean();
  assert.ok(recreated, 'the missing post must be recreated by the next reseed');
  assert.deepEqual(recreated.data, {
    title: second.title,
    excerpt: second.excerpt,
    body: second.body,
    featuredImage: null,
    author: second.author,
    categories: second.categories,
    tags: [],
    seo: {},
  });

  const untouched = await BlogPostModel.findOne({ slug: first.slug }).lean();
  assert.deepEqual(untouched.data, customized, 'an unrelated, already-customized post must remain untouched');

  assert.equal(await BlogPostModel.countDocuments(), blog.BLOG_POSTS.length, 'reseeding must not create duplicate documents for posts that already exist');
});

test('seed summary counts remain correct after the fix', async () => {
  await resetBlog();
  const result = await runSeed();
  assert.equal(result.blogPosts, blog.BLOG_POSTS.length);
  assert.equal(result.contentTypes, 11);
  assert.equal(result.donationSchemes, 9);
});

test('blog categories, ContentModel and DonationSchemeModel seeding still behave correctly', async () => {
  const { ContentModel } = await import('../content/content.model.js');
  const { DonationSchemeModel } = await import('../donations/donationScheme.model.js');
  await resetBlog();
  await ContentModel.deleteMany({});
  await DonationSchemeModel.deleteMany({});

  await runSeed();

  const categories = await BlogCategoryModel.find().lean();
  assert.deepEqual(
    categories.map((c) => c.name).sort(),
    [...blog.BLOG_CATEGORIES].sort()
  );
  assert.equal(await ContentModel.countDocuments(), 11);
  assert.equal(await DonationSchemeModel.countDocuments(), 9);
});

// Investigative only (per this task's explicit scope: report the finding, do
// not change timestamp behavior as part of this fix) -- consistent with the
// identical, already-documented findings for DonationSchemeModel and
// ContentModel.
//
// FINDING: updatedAt DOES still change on every reseed call, even now that
// `data` is $setOnInsert-only and has no effect on an already-existing
// document. This is Mongoose's own `{ timestamps: true }` schema option: its
// findOneAndUpdate middleware unconditionally injects an updatedAt bump into
// the update document it sends to MongoDB, regardless of whether
// $setOnInsert would otherwise change anything for the matched document.
// This is pre-existing Mongoose behavior, not something this fix introduced
// or changed, and (per this task's explicit scope) is not being altered here
// -- recorded as a finding only.
test('finding: updatedAt still changes on every reseed call, even a content-level no-op, due to Mongoose\'s own timestamps middleware', async () => {
  await resetBlog();
  await runSeed();
  const slug = blog.BLOG_POSTS[0].slug;
  const firstRead = await BlogPostModel.findOne({ slug }).lean();

  await new Promise((resolve) => setTimeout(resolve, 10)); // ensure a measurable clock difference
  await runSeed();

  const secondRead = await BlogPostModel.findOne({ slug }).lean();
  assert.ok(
    new Date(secondRead.updatedAt).getTime() > new Date(firstRead.updatedAt).getTime(),
    'FINDING: updatedAt advances on every reseed call, including a no-op one for content purposes -- Mongoose\'s timestamps middleware bumps it unconditionally, independent of $setOnInsert having no effect on an existing document.'
  );
  // Content itself, meanwhile, is genuinely unchanged.
  assert.deepEqual(secondRead.data, firstRead.data);
});

// Reseeding bypasses blog.admin.controller.js's publishPostAdmin entirely
// (the only code path that ever writes a BlogPostRevisionModel row), so a
// reseed call -- whether it's a no-op or (before this fix) an overwrite --
// must never create a revision record of its own.
test('reseeding an existing post does not create BlogPostRevisionModel records', async () => {
  await resetBlog();
  await runSeed();
  await runSeed();
  await runSeed();

  assert.equal(await BlogPostRevisionModel.countDocuments(), 0);
});
