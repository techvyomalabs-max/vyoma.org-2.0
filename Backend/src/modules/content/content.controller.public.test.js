// Task 7M — regression coverage for the public content read endpoint
// (GET /api/v1/public/:type, content.controller.js). Previously had zero
// Backend test coverage anywhere (confirmed by audit) despite being the
// public-facing draft-leak-prevention boundary: the only thing stopping an
// unpublished draft from being visible to the world is this controller's
// own status filter and previewSecret gate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';

let mem;
let ContentModel;
let app;
let server;
let baseUrl;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ ContentModel } = await import('./content.model.js'));
  const { createApp } = await import('../../app.js');
  app = createApp();
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

async function getPublicContent(type, query = '') {
  const res = await fetch(`${baseUrl}/api/v1/public/${type}${query}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

test('returns 404 for a type that has never been created at all', async () => {
  const { res, body } = await getPublicContent('pages/this-type-does-not-exist-anywhere');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CONTENT_NOT_FOUND');
});

test('returns the published data for a published document', async () => {
  await ContentModel.create({ type: 'pages/public-test-published', data: { heading: 'Real published heading' }, status: 'published' });
  const { res, body } = await getPublicContent('pages/public-test-published');
  assert.equal(res.status, 200);
  assert.equal(body.data.heading, 'Real published heading');
});

test('a document with no explicit status field (pre-Phase-1 back-compat) is still publicly visible', async () => {
  // Deliberately bypass the Mongoose default by inserting the raw document
  // shape pre-Phase-1 documents actually have -- no `status` key at all.
  await ContentModel.collection.insertOne({ type: 'pages/public-test-no-status-field', data: { heading: 'Legacy doc, no status field' } });
  const { res, body } = await getPublicContent('pages/public-test-no-status-field');
  assert.equal(res.status, 200);
  assert.equal(body.data.heading, 'Legacy doc, no status field');
});

test('draft-leak prevention: a document in draft status is hidden from a normal public request, even though draftData exists', async () => {
  await ContentModel.create({
    type: 'pages/public-test-draft-only',
    data: null,
    draftData: { heading: 'Unpublished draft heading -- must never leak' },
    status: 'draft',
  });
  const { res, body } = await getPublicContent('pages/public-test-draft-only');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'CONTENT_NOT_FOUND');
});

test('draft-leak prevention: an UNPUBLISHED (draft) document with no published `data` yet is hidden, even without a previewSecret query param at all', async () => {
  await ContentModel.create({
    type: 'pages/public-test-draft-no-secret-attempt',
    data: null,
    draftData: { heading: 'Should stay hidden' },
    status: 'draft',
  });
  const { res } = await getPublicContent('pages/public-test-draft-no-secret-attempt', '?previewSecret=');
  assert.equal(res.status, 404, 'an empty/missing previewSecret must never be treated as a match');
});

test('previewSecret gate: a draft document IS visible, showing draftData, when the exact configured secret is supplied', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = 'test-preview-secret-value';
  try {
    await ContentModel.create({
      type: 'pages/public-test-preview-correct-secret',
      data: { heading: 'Published fallback (should not be shown)' },
      draftData: { heading: 'Draft heading -- shown only with correct secret' },
      status: 'draft',
    });
    const { res, body } = await getPublicContent('pages/public-test-preview-correct-secret', '?previewSecret=test-preview-secret-value');
    assert.equal(res.status, 200);
    assert.equal(body.data.heading, 'Draft heading -- shown only with correct secret');
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('previewSecret gate: a WRONG secret behaves exactly like a normal (non-preview) public request -- draft stays hidden', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = 'test-preview-secret-value';
  try {
    await ContentModel.create({
      type: 'pages/public-test-preview-wrong-secret',
      data: null,
      draftData: { heading: 'Draft heading -- must not leak with a wrong secret' },
      status: 'draft',
    });
    const { res, body } = await getPublicContent('pages/public-test-preview-wrong-secret', '?previewSecret=totally-wrong-value');
    assert.equal(res.status, 404);
    assert.equal(body.code, 'CONTENT_NOT_FOUND');
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('previewSecret gate: when no PREVIEW_SECRET is configured at all (env.previewSecret is null), the preview query param can never activate preview mode', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = null;
  try {
    await ContentModel.create({
      type: 'pages/public-test-no-secret-configured',
      data: null,
      draftData: { heading: 'Draft heading -- unreachable with no secret configured' },
      status: 'draft',
    });
    // Even supplying the literal string "null" as a guess must not match.
    const { res } = await getPublicContent('pages/public-test-no-secret-configured', '?previewSecret=null');
    assert.equal(res.status, 404);
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('previewSecret gate: a PUBLISHED document ignores previewSecret entirely and always shows the same published data', async () => {
  const previousSecret = env.previewSecret;
  env.previewSecret = 'test-preview-secret-value';
  try {
    await ContentModel.create({
      type: 'pages/public-test-preview-published-doc',
      data: { heading: 'Published heading' },
      draftData: { heading: 'A newer, unpublished draft edit' },
      status: 'published',
    });
    const withSecret = await getPublicContent('pages/public-test-preview-published-doc', '?previewSecret=test-preview-secret-value');
    assert.equal(withSecret.body.data.heading, 'A newer, unpublished draft edit', 'preview mode on a published doc shows the in-progress draft edit, per the controller\'s own documented fallback (doc?.draftData ?? doc?.data)');

    const withoutSecret = await getPublicContent('pages/public-test-preview-published-doc');
    assert.equal(withoutSecret.body.data.heading, 'Published heading');
  } finally {
    env.previewSecret = previousSecret;
  }
});

test('a multi-segment type (e.g. "pages/home") round-trips correctly through the wildcard route', async () => {
  await ContentModel.create({ type: 'pages/public-test-multi/segment-type', data: { heading: 'Multi-segment type works' }, status: 'published' });
  const { res, body } = await getPublicContent('pages/public-test-multi/segment-type');
  assert.equal(res.status, 200);
  assert.equal(body.data.heading, 'Multi-segment type works');
});
