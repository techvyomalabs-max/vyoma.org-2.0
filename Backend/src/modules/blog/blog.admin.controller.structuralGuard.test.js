// Exercises the structural-content-loss guard added to updateDraftAdmin
// (blog.admin.controller.js) against a throwaway in-memory MongoDB --
// never the real database. mongodb-memory-server is already a project
// devDependency; this is its first actual use in an automated test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let BlogPostModel;
let updateDraftAdmin;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ BlogPostModel } = await import('./blogPost.model.js'));
  ({ updateDraftAdmin } = await import('./blog.admin.controller.js'));
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

async function createPost(slug, body) {
  return BlogPostModel.create({
    slug,
    status: 'draft',
    data: null,
    draftData: { title: 'T', excerpt: '', body, featuredImage: null, author: '', categories: [], tags: [], seo: {} },
  });
}

function fakeReqRes(id, body) {
  let payload;
  const req = { params: { id: String(id) }, body, user: { id: new mongoose.Types.ObjectId().toString(), email: 'tester@example.com' } };
  const res = { json: (p) => { payload = p; return res; }, status: () => res };
  const next = (err) => { if (err) throw err; };
  return { req, res, next, getPayload: () => payload };
}

test('rejects a save that removes a table without confirmation', async () => {
  const doc = await createPost('guard-table-1', '<table><tbody><tr><td>a</td></tr></tbody></table><p>text</p>');
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>text</p>' });
  await assert.rejects(
    () => updateDraftAdmin(req, res, next),
    (err) => err.code === 'STRUCTURAL_CONTENT_LOSS' && err.status === 409 && err.fieldErrors.regressions.some((r) => r.tag === 'table')
  );
});

test('rejects a save that removes an image without confirmation', async () => {
  const doc = await createPost('guard-img-1', '<p>before</p><img src="https://vyoma.org/a.jpg" alt="">');
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>before</p>' });
  await assert.rejects(
    () => updateDraftAdmin(req, res, next),
    (err) => err.code === 'STRUCTURAL_CONTENT_LOSS' && err.fieldErrors.regressions.some((r) => r.tag === 'img')
  );
});

test('allows the same removal when confirmStructuralChange: true is explicitly sent', async () => {
  const doc = await createPost('guard-confirm-1', '<table><tbody><tr><td>a</td></tr></tbody></table><p>text</p>');
  const { req, res, next, getPayload } = fakeReqRes(doc._id, { body: '<p>text</p>', confirmStructuralChange: true });
  await updateDraftAdmin(req, res, next);
  assert.equal(getPayload().success, true);
  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.equal(saved.draftData.body, '<p>text</p>');
});

test('allows a save that only adds structural content, no confirmation needed', async () => {
  const doc = await createPost('guard-add-1', '<p>text</p>');
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>text</p><img src="https://vyoma.org/a.jpg" alt="">' });
  await updateDraftAdmin(req, res, next);
  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.match(saved.draftData.body, /<img/);
});

test('allows replacing an image src 1:1 (the real image-URL-migration use case), no confirmation needed', async () => {
  const doc = await createPost('guard-swap-1', '<p>text</p><img src="https://vyoma.org/old.jpg" alt="x">');
  const { req, res, next } = fakeReqRes(doc._id, { body: '<p>text</p><img src="https://vyoma.org/new.jpg" alt="x">' });
  await updateDraftAdmin(req, res, next);
  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.match(saved.draftData.body, /new\.jpg/);
});

test('never triggers when body is not part of the patch (e.g. a featuredImage-only draft save)', async () => {
  const doc = await createPost('guard-no-body-1', '<table><tbody><tr><td>a</td></tr></tbody></table>');
  const { req, res, next } = fakeReqRes(doc._id, { featuredImage: { url: 'https://vyoma.org/f.jpg', alt: '' } });
  await updateDraftAdmin(req, res, next);
  const saved = await BlogPostModel.findById(doc._id).lean();
  assert.match(saved.draftData.body, /<table/); // untouched
  assert.equal(saved.draftData.featuredImage.url, 'https://vyoma.org/f.jpg');
});
