// QA Bug 19 Stage 5D correction (Section 6) — genuinely isolated, zero-DB-
// connection verification that a REJECTED Save Draft / Publish / Restore
// Revision request never invokes a content mutation, a revision write, or
// an audit-log write. content.admin.controller.test.js's own Stage 5D block
// covers the same three operations at the HTTP level but could not be
// executed in this environment (setupTestEnv()'s ambient database
// connection is blocked under this engagement's standing safety rules).
// This file instead calls the real, unmodified exported controller
// functions directly (no Express server, no HTTP layer at all) and replaces
// only the Mongoose models' own query/write methods with `node:test`'s
// built-in `mock.method()` -- a standard part of `node:test` since Node 19,
// not a new dependency, and not a refactor of the controller: it works
// because the controller does a fresh property lookup on the imported model
// object at call time (`ContentModel.findOne(...)`), so replacing that
// property on the already-imported object is enough. `content.model.js`/
// `contentRevision.model.js`/`auditLog.model.js` only call `mongoose.model()`
// at import time (confirmed directly: no `mongoose.connect()` anywhere in
// any of them), so importing them, and even calling the real controller
// functions against fully mocked models, makes no network connection of any
// kind.
//
// Each mocked method is restored automatically at the end of its own test
// (via the test's own `t.mock` -- never the global `mock` import), so tests
// cannot leak state into one another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';
import { AuditLogModel } from '../audit/auditLog.model.js';
import { ApiError } from '../../utils/apiResponse.js';
import { upsertDraftContent, publishContent, restoreRevision } from './content.admin.controller.js';

const MEDIA_TYPE = 'pages/media';

function fakeReq({ type, body = {}, revisionId } = {}) {
  return {
    query: {},
    body: { type, ...body, ...(revisionId !== undefined ? { revisionId } : {}) },
    user: { id: 'isolated-test-user', email: 'isolated-test@example.test' },
    ip: '127.0.0.1',
  };
}

function fakeRes() {
  let statusCode = null;
  let body = null;
  return {
    status(code) {
      statusCode = code;
      return { json: (b) => { body = b; } };
    },
    get statusCode() { return statusCode; },
    get body() { return body; },
  };
}

function fakeNext() {
  const calls = [];
  const next = (err) => calls.push(err);
  next.calls = calls;
  return next;
}

// Mimics a chainable Mongoose Query enough for this controller's own usage
// (`.lean()`, and `.sort().lean()` for the lastRevision lookup) -- never a
// real query, never touches any connection.
function fakeQuery(value) {
  const q = {
    lean: async () => value,
    sort: () => q,
    skip: () => q,
    select: () => q,
    find: () => q,
  };
  return q;
}

const INVALID_TESTIMONIALS = { TESTIMONIALS_FEATURED: [], TESTIMONIALS_ALL: [{ type: 'video' }] };
const VALID_TESTIMONIALS = { TESTIMONIALS_FEATURED: [], TESTIMONIALS_ALL: [{ type: 'text', quote: 'Real quote.' }] };

// --- Save Draft (upsertDraftContent) ---------------------------------------

test('isolated: upsertDraftContent REJECTS invalid testimonial content without ever calling findOneAndUpdate or writing an audit log', async (t) => {
  t.mock.method(ContentModel, 'findOne', () => fakeQuery(null));
  const findOneAndUpdate = t.mock.method(ContentModel, 'findOneAndUpdate', async () => {
    throw new Error('UNEXPECTED MUTATION: findOneAndUpdate must not be called for a rejected draft save');
  });
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => {
    throw new Error('UNEXPECTED AUDIT WRITE: AuditLogModel.create must not be called for a rejected draft save');
  });

  const req = fakeReq({ type: MEDIA_TYPE, body: { data: INVALID_TESTIMONIALS } });
  const next = fakeNext();
  await upsertDraftContent(req, fakeRes(), next);

  assert.equal(findOneAndUpdate.mock.callCount(), 0);
  assert.equal(auditCreate.mock.callCount(), 0);
  assert.equal(next.calls.length, 1);
  assert.ok(next.calls[0] instanceof ApiError);
  assert.equal(next.calls[0].status, 422);
  assert.match(next.calls[0].message, /a valid video URL is required/);
});

test('isolated: upsertDraftContent ACCEPTS valid testimonial content and genuinely calls findOneAndUpdate + records an audit entry (proves the mocks/control-flow actually execute the real code)', async (t) => {
  t.mock.method(ContentModel, 'findOne', () => fakeQuery(null));
  const fakeDoc = { type: MEDIA_TYPE, status: 'draft', data: null, draftData: VALID_TESTIMONIALS };
  const findOneAndUpdate = t.mock.method(ContentModel, 'findOneAndUpdate', async () => fakeDoc);
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => ({}));

  const req = fakeReq({ type: MEDIA_TYPE, body: { data: VALID_TESTIMONIALS } });
  const res = fakeRes();
  const next = fakeNext();
  await upsertDraftContent(req, res, next);

  assert.equal(next.calls.length, 0, 'a valid request must never call next(err)');
  assert.equal(findOneAndUpdate.mock.callCount(), 1);
  assert.equal(auditCreate.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data, fakeDoc);
});

// --- Publish ---------------------------------------------------------------

test('isolated: publishContent REJECTS invalid testimonial content without ever calling doc.save, ContentRevisionModel.create, or writing an audit log', async (t) => {
  const save = t.mock.fn(async () => {
    throw new Error('UNEXPECTED MUTATION: doc.save must not be called for a rejected publish');
  });
  const fakeDoc = { data: null, draftData: INVALID_TESTIMONIALS, status: 'draft', save };
  t.mock.method(ContentModel, 'findOne', async () => fakeDoc);
  const revisionCreate = t.mock.method(ContentRevisionModel, 'create', async () => {
    throw new Error('UNEXPECTED REVISION WRITE: ContentRevisionModel.create must not be called for a rejected publish');
  });
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => {
    throw new Error('UNEXPECTED AUDIT WRITE: AuditLogModel.create must not be called for a rejected publish');
  });

  const req = fakeReq({ type: MEDIA_TYPE });
  const next = fakeNext();
  await publishContent(req, fakeRes(), next);

  assert.equal(save.mock.callCount(), 0);
  assert.equal(revisionCreate.mock.callCount(), 0);
  assert.equal(auditCreate.mock.callCount(), 0);
  assert.equal(next.calls.length, 1);
  assert.ok(next.calls[0] instanceof ApiError);
  assert.equal(next.calls[0].status, 422);
  assert.match(next.calls[0].message, /a valid video URL is required/);
});

test('isolated: publishContent ACCEPTS valid testimonial content and genuinely calls doc.save, creates a revision, and records an audit entry', async (t) => {
  const save = t.mock.fn(async () => {});
  const fakeDoc = { data: null, draftData: VALID_TESTIMONIALS, status: 'draft', save };
  t.mock.method(ContentModel, 'findOne', async () => fakeDoc);
  t.mock.method(ContentRevisionModel, 'findOne', () => fakeQuery(null));
  t.mock.method(ContentRevisionModel, 'find', () => fakeQuery([]));
  const revisionCreate = t.mock.method(ContentRevisionModel, 'create', async () => ({}));
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => ({}));

  const req = fakeReq({ type: MEDIA_TYPE });
  const res = fakeRes();
  const next = fakeNext();
  await publishContent(req, res, next);

  assert.equal(next.calls.length, 0, 'a valid request must never call next(err)');
  assert.equal(save.mock.callCount(), 1);
  assert.equal(revisionCreate.mock.callCount(), 1);
  assert.equal(auditCreate.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
  assert.equal(fakeDoc.status, 'published');
});

// --- Restore Revision --------------------------------------------------

test('isolated: restoreRevision REJECTS an invalid/incomplete historical revision (relative to the current published baseline) without ever calling doc.save, ContentRevisionModel.create, or writing an audit log', async (t) => {
  const save = t.mock.fn(async () => {
    throw new Error('UNEXPECTED MUTATION: doc.save must not be called for a rejected restore');
  });
  const currentlyPublished = { TESTIMONIALS_FEATURED: [], TESTIMONIALS_ALL: [{ type: 'text', quote: 'Only this is live now.' }] };
  const fakeDoc = { data: currentlyPublished, draftData: null, status: 'published', save };
  const fakeRevision = { _id: 'rev-1', data: INVALID_TESTIMONIALS, version: 5 };

  t.mock.method(ContentRevisionModel, 'findOne', () => fakeQuery(fakeRevision));
  t.mock.method(ContentModel, 'findOne', async () => fakeDoc);
  const revisionCreate = t.mock.method(ContentRevisionModel, 'create', async () => {
    throw new Error('UNEXPECTED REVISION WRITE: ContentRevisionModel.create must not be called for a rejected restore');
  });
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => {
    throw new Error('UNEXPECTED AUDIT WRITE: AuditLogModel.create must not be called for a rejected restore');
  });

  const req = fakeReq({ type: MEDIA_TYPE, revisionId: 'rev-1' });
  const next = fakeNext();
  await restoreRevision(req, fakeRes(), next);

  assert.equal(save.mock.callCount(), 0);
  assert.equal(revisionCreate.mock.callCount(), 0);
  assert.equal(auditCreate.mock.callCount(), 0);
  assert.equal(next.calls.length, 1);
  assert.ok(next.calls[0] instanceof ApiError);
  assert.equal(next.calls[0].status, 422);
  assert.match(next.calls[0].message, /a valid video URL is required/);
  assert.equal(fakeDoc.status, 'published', 'the currently published doc must be left completely untouched');
});

test('isolated: restoreRevision ACCEPTS a historical revision whose item is unchanged from the current published baseline, and genuinely calls doc.save, creates a revision, and records an audit entry', async (t) => {
  const save = t.mock.fn(async () => {});
  const legacyVideo = { type: 'video', name: 'Historical Person', role: 'Nowhere' };
  const currentlyPublished = { TESTIMONIALS_FEATURED: [], TESTIMONIALS_ALL: [legacyVideo] };
  const fakeDoc = { data: currentlyPublished, draftData: null, status: 'published', save };
  const fakeRevision = { _id: 'rev-2', data: currentlyPublished, version: 3 };

  t.mock.method(ContentRevisionModel, 'findOne', () => fakeQuery(fakeRevision));
  t.mock.method(ContentModel, 'findOne', async () => fakeDoc);
  t.mock.method(ContentRevisionModel, 'find', () => fakeQuery([]));
  const revisionCreate = t.mock.method(ContentRevisionModel, 'create', async () => ({}));
  const auditCreate = t.mock.method(AuditLogModel, 'create', async () => ({}));

  const req = fakeReq({ type: MEDIA_TYPE, revisionId: 'rev-2' });
  const res = fakeRes();
  const next = fakeNext();
  await restoreRevision(req, res, next);

  assert.equal(next.calls.length, 0, 'a valid restore must never call next(err)');
  assert.equal(save.mock.callCount(), 1);
  assert.equal(revisionCreate.mock.callCount(), 1);
  assert.equal(auditCreate.mock.callCount(), 1);
  assert.equal(res.statusCode, 200);
});
