// Regression tests for the minimize: false schema fix (blogPost.model.js).
// Mongoose's default (minimize: true) strips any key whose value is a
// plain empty object ({}) out of a Mixed field on every .save() -- this
// silently dropped `seo: {}` from both draftData (on every draft save,
// via updateDraftAdmin) and data (on every publish, via publishPostAdmin),
// since both call doc.save() on this same model. Throwaway in-memory
// MongoDB only -- never the real database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let BlogPostModel;
let updateDraftAdmin;
let publishPostAdmin;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ BlogPostModel } = await import('./blogPost.model.js'));
  ({ updateDraftAdmin, publishPostAdmin } = await import('./blog.admin.controller.js'));
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

function baseContent(overrides = {}) {
  return { title: 'T', excerpt: 'E', body: '<p>text</p>', featuredImage: null, author: 'A', categories: ['cat'], tags: ['tag'], seo: {}, ...overrides };
}

function fakeReqRes(id, body) {
  let payload;
  const req = { params: { id: String(id) }, body, user: { id: new mongoose.Types.ObjectId().toString(), email: 'tester@example.com' } };
  const res = { json: (p) => { payload = p; return res; }, status: () => res };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getPayload: () => payload };
}

test('empty seo: {} survives a draft save (updateDraftAdmin)', async () => {
  const doc = await BlogPostModel.create({ slug: 'minimize-draft-1', status: 'draft', data: null, draftData: baseContent() });
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>updated text</p>' });
  await updateDraftAdmin(req, res, next);

  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(Object.prototype.hasOwnProperty.call(saved.draftData, 'seo'), true, 'seo key must survive the save');
  assert.deepEqual(saved.draftData.seo, {});
});

test('empty seo: {} survives publishing (publishPostAdmin)', async () => {
  const doc = await BlogPostModel.create({ slug: 'minimize-publish-1', status: 'draft', data: null, draftData: baseContent() });
  const { req, res, next } = fakeReqRes(doc._id, {});
  await publishPostAdmin(req, res, next);

  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(saved.status, 'published');
  assert.equal(Object.prototype.hasOwnProperty.call(saved.data, 'seo'), true, 'seo key must survive publish');
  assert.deepEqual(saved.data.seo, {});
});

test('empty seo: {} survives a draft save made directly against a published post with data.seo already {}', async () => {
  // Mirrors the real-world case found during migration: a post already
  // published with data.seo = {}, then edited again later.
  const doc = await BlogPostModel.create({ slug: 'minimize-draft-2', status: 'published', publishedAt: new Date(), data: baseContent(), draftData: null });
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>a further edit</p>' });
  await updateDraftAdmin(req, res, next);

  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.deepEqual(saved.draftData.seo, {});
  assert.deepEqual(saved.data.seo, {}, 'the already-published data.seo must remain untouched');
});

test('non-empty SEO metadata is never altered by a draft save or publish', async () => {
  const seo = { title: 'Custom SEO Title', description: 'A real description.' };
  const doc = await BlogPostModel.create({ slug: 'minimize-nonempty-1', status: 'draft', data: null, draftData: baseContent({ seo }) });

  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>edited</p>' });
  await updateDraftAdmin(req, res, next);
  let saved = await BlogPostModel.findById(doc._id).lean();
  assert.deepEqual(saved.draftData.seo, seo, 'non-empty seo must be byte-identical after a draft save');

  const { req: req2, res: res2, next: next2 } = fakeReqRes(doc._id, {});
  await publishPostAdmin(req2, res2, next2);
  saved = await BlogPostModel.findById(doc._id).lean();
  assert.deepEqual(saved.data.seo, seo, 'non-empty seo must be byte-identical after publish');
});

test('every other field is unchanged by the fix -- a draft save and publish only touch what was actually patched', async () => {
  const doc = await BlogPostModel.create({
    slug: 'minimize-other-fields-1',
    status: 'draft',
    data: null,
    draftData: baseContent({ title: 'Original Title', author: 'Original Author', categories: ['A', 'B'], tags: ['x', 'y'] }),
  });

  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>only the body changes</p>' });
  await updateDraftAdmin(req, res, next);
  let saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(saved.draftData.title, 'Original Title');
  assert.equal(saved.draftData.author, 'Original Author');
  assert.deepEqual(saved.draftData.categories, ['A', 'B']);
  assert.deepEqual(saved.draftData.tags, ['x', 'y']);
  assert.equal(saved.draftData.body, '<p>only the body changes</p>');

  const { req: req2, res: res2, next: next2 } = fakeReqRes(doc._id, {});
  await publishPostAdmin(req2, res2, next2);
  saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(saved.data.title, 'Original Title');
  assert.equal(saved.data.author, 'Original Author');
  assert.deepEqual(saved.data.categories, ['A', 'B']);
  assert.deepEqual(saved.data.tags, ['x', 'y']);
  assert.equal(saved.data.body, '<p>only the body changes</p>');
  assert.equal(saved.draftData, null, 'publish must still clear draftData');
});

test('minimize: false does not resurrect an empty object that was never there -- a field simply absent stays absent', async () => {
  // Guards against the fix over-correcting: if a document never had a
  // `seo` key at all (not even {}), publishing/saving must not invent one.
  const doc = await BlogPostModel.create({
    slug: 'minimize-absent-1',
    status: 'draft',
    data: null,
    draftData: { title: 'T', excerpt: '', body: '<p>x</p>', featuredImage: null, author: '', categories: [], tags: [] }, // no seo key at all
  });
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>y</p>' });
  await updateDraftAdmin(req, res, next);
  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(Object.prototype.hasOwnProperty.call(saved.draftData, 'seo'), false, 'a field that was never set must not be invented');
});
