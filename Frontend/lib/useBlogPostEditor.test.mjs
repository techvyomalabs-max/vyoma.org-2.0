// Behavioral regression coverage for the real, unmodified useBlogPostEditor
// hook, using the same harness/mocking approach as useContentEditor.test.mjs
// (see that file and lib/testSupport/moduleAliasLoader.mjs for why). No
// network, database, or external service is ever touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./testSupport/moduleAliasLoader.mjs', import.meta.url);

const { renderHook } = await import('./testSupport/reactTestEnv.mjs');
const { setApiFetchImpl, getApiFetchCalls, resetApiFetchMock } = await import('./testSupport/mockAdminAuth.mjs');
const { getToastCalls, resetToastMock } = await import('./testSupport/mockToast.mjs');
const { useBlogPostEditor } = await import('./useBlogPostEditor.js');

const POST_ID = '507f1f77bcf86cd799439011';

function callsAfter(index) {
  return getApiFetchCalls().slice(index);
}

function defaultRouter({ data = { title: 'Hello' }, draftData = null, revisions = [], slug = 'hello', publishedAt = null } = {}) {
  return async (path, options) => {
    const method = options?.method || 'GET';
    if (path === `/admin/blog/${POST_ID}/revisions/restore`) return { ok: true };
    if (path === `/admin/blog/${POST_ID}/revisions`) return revisions;
    if (path === `/admin/blog/${POST_ID}/publish`) return { ok: true };
    if (path === `/admin/blog/${POST_ID}/unpublish`) return { ok: true };
    if (path === `/admin/blog/${POST_ID}/slug`) return { ok: true };
    if (path === `/admin/blog/${POST_ID}` && method === 'GET') return { data, draftData, slug, publishedAt, status: publishedAt ? 'published' : 'draft' };
    if (path === `/admin/blog/${POST_ID}` && method === 'PUT') return { ok: true };
    throw new Error(`unexpected apiFetch call in test: ${method} ${path}`);
  };
}

async function setup(routerOverrides) {
  resetApiFetchMock();
  resetToastMock();
  setApiFetchImpl(defaultRouter(routerOverrides));
  const harness = await renderHook(() => useBlogPostEditor(POST_ID));
  return harness;
}

test('load() populates draftValue from draftData (merged over the blank-fields default) when present', async () => {
  const harness = await setup({ data: { title: 'Published title' }, draftData: { title: 'Draft title' } });
  assert.equal(harness.result.draftValue.title, 'Draft title');
  assert.deepEqual(harness.result.draftValue.tags, [], 'fields absent from draftData must fall back to BLANK_FIELDS defaults');
  assert.equal(harness.result.loading, false);
});

test('load() falls back to data when draftData is null', async () => {
  const harness = await setup({ data: { title: 'Published only' }, draftData: null });
  assert.equal(harness.result.draftValue.title, 'Published only');
});

test('setFieldValue updates draftValue by key without touching sibling fields', async () => {
  const harness = await setup({ data: { title: 'Hello', excerpt: 'Original excerpt' } });
  await harness.act(() => harness.result.setFieldValue('title', 'Changed'));
  assert.equal(harness.result.draftValue.title, 'Changed');
  assert.equal(harness.result.draftValue.excerpt, 'Original excerpt');
});

test('saveDraft PUTs the current draftValue (as the raw body, not wrapped) and reloads', async () => {
  const harness = await setup();
  await harness.act(() => harness.result.setFieldValue('title', 'Edited'));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.saveDraft());

  const calls = callsAfter(before);
  assert.equal(calls[0].path, `/admin/blog/${POST_ID}`);
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.body.title, 'Edited');
  assert.ok(calls.some((c) => c.path === `/admin/blog/${POST_ID}` && (c.options?.method || 'GET') === 'GET'));
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Draft saved. The public page is unchanged.' }]);
});

test('saveDraft short-circuits on a validation error: no apiFetch call, toast.error shown', async () => {
  const harness = await setup();
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.saveDraft(() => 'title is required'));

  assert.equal(getApiFetchCalls().length, before);
  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'title is required' }]);
});

// --- The fix this task implements: publish() must PUT the current
// draftValue BEFORE calling the publish endpoint, exactly like
// useContentEditor.js's publish() already does. Before this fix, publish()
// sent no body at all and relied entirely on whatever draftData the server
// already had from the last explicit "Save draft" click -- an unsaved edit
// followed directly by "Publish" silently discarded that edit. ---

test('publish() PUTs the current draftValue before calling the publish endpoint (the fixed stale-draft bug)', async () => {
  const harness = await setup();
  await harness.act(() => harness.result.setFieldValue('title', 'Edited but never saved'));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.publish());

  const calls = callsAfter(before);
  const putIndex = calls.findIndex((c) => c.path === `/admin/blog/${POST_ID}` && c.options.method === 'PUT');
  const publishIndex = calls.findIndex((c) => c.path === `/admin/blog/${POST_ID}/publish` && c.options.method === 'POST');
  assert.notEqual(putIndex, -1, 'expected a PUT /admin/blog/:id call carrying the draft');
  assert.notEqual(publishIndex, -1, 'expected a POST /admin/blog/:id/publish call');
  assert.ok(putIndex < publishIndex, 'the draft PUT must happen before the publish POST');
  assert.equal(calls[putIndex].options.body.title, 'Edited but never saved', 'the PUT must carry the in-memory edit, not stale server-side draftData');
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Published — now live on the public site.' }]);
});

test('publish() short-circuits on a validation error: no apiFetch call at all', async () => {
  const harness = await setup();
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.publish(() => 'body is required'));

  assert.equal(getApiFetchCalls().length, before);
  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'body is required' }]);
});

test('publish() surfaces an apiFetch rejection via toast.error and leaves busy cleared', async () => {
  const harness = await setup();
  setApiFetchImpl(async (path, options) => {
    if (path === `/admin/blog/${POST_ID}` && options?.method === 'PUT') throw new Error('Network down');
    return defaultRouter()(path, options);
  });

  await harness.act(() => harness.result.publish());

  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'Network down' }]);
  assert.equal(harness.result.busy, null, 'busy must be cleared even after a failure');
});

test('unpublish() calls the unpublish endpoint and reloads', async () => {
  const harness = await setup();
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.unpublish());

  const calls = callsAfter(before);
  assert.equal(calls[0].path, `/admin/blog/${POST_ID}/unpublish`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Unpublished — hidden from the public site.' }]);
});

test('restore() restores the given revision and reloads', async () => {
  const harness = await setup();
  const before = getApiFetchCalls().length;
  const revision = { _id: 'rev-1', version: 3 };

  await harness.act(() => harness.result.restore(revision));

  const calls = callsAfter(before);
  assert.equal(calls[0].path, `/admin/blog/${POST_ID}/revisions/restore`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.body, { revisionId: 'rev-1' });
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Restored version 3.' }]);
});

test('changeSlug PATCHes the new slug and reloads', async () => {
  const harness = await setup();
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.changeSlug('new-slug'));

  const calls = callsAfter(before);
  assert.equal(calls[0].path, `/admin/blog/${POST_ID}/slug`);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(calls[0].options.body, { slug: 'new-slug' });
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Slug updated.' }]);
});

test('changeSlug surfaces an apiFetch rejection via toast.error', async () => {
  const harness = await setup();
  setApiFetchImpl(async (path, options) => {
    if (path === `/admin/blog/${POST_ID}/slug`) throw new Error('Slug already in use');
    return defaultRouter()(path, options);
  });

  await harness.act(() => harness.result.changeSlug('taken-slug'));

  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'Slug already in use' }]);
  assert.equal(harness.result.busy, null);
});
