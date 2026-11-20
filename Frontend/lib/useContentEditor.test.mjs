// Behavioral regression coverage for the real, unmodified useContentEditor
// hook -- rendered via lib/testSupport/reactTestEnv.mjs's minimal React
// harness, with '@/lib/AdminAuthContext' and '@/components/admin/ui/Toast'
// substituted for lightweight test doubles (see
// lib/testSupport/moduleAliasLoader.mjs for why). No network, database, or
// external service is ever touched -- every apiFetch call is intercepted by
// lib/testSupport/mockAdminAuth.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./testSupport/moduleAliasLoader.mjs', import.meta.url);

const { renderHook } = await import('./testSupport/reactTestEnv.mjs');
const { setApiFetchImpl, getApiFetchCalls, resetApiFetchMock } = await import('./testSupport/mockAdminAuth.mjs');
const { getToastCalls, resetToastMock } = await import('./testSupport/mockToast.mjs');
const { useContentEditor } = await import('./useContentEditor.js');

function callsAfter(index) {
  return getApiFetchCalls().slice(index);
}

// A default router good enough for every test below unless a test needs a
// specific response shape (e.g. revisions, or an initial draftData).
function defaultRouter({ data = { heading: 'Hello' }, draftData = null, revisions = [] } = {}) {
  return async (path, options) => {
    const method = options?.method || 'GET';
    if (path.startsWith('/admin/content/revisions/restore')) return { ok: true };
    if (path.startsWith('/admin/content/revisions?')) return revisions;
    if (path.startsWith('/admin/content/publish')) return { ok: true };
    if (path.startsWith('/admin/content/unpublish')) return { ok: true };
    if (path.startsWith('/admin/content?')) return { data, draftData };
    if (path === '/admin/content' && method === 'PUT') return { ok: true };
    throw new Error(`unexpected apiFetch call in test: ${method} ${path}`);
  };
}

async function setup(typeOrTypes, routerOverrides) {
  resetApiFetchMock();
  resetToastMock();
  setApiFetchImpl(defaultRouter(routerOverrides));
  const harness = await renderHook(() => useContentEditor(typeOrTypes));
  return harness;
}

test('load() populates draftValue from draftData when present, else from data', async () => {
  const harness = await setup('about', { data: { heading: 'Published' }, draftData: { heading: 'Draft in progress' } });
  assert.equal(harness.result.draftValue.heading, 'Draft in progress');
  assert.equal(harness.result.loading, false);
  assert.equal(harness.result.error, null);
});

test('load() falls back to data when draftData is null', async () => {
  const harness = await setup('about', { data: { heading: 'Published only' }, draftData: null });
  assert.equal(harness.result.draftValue.heading, 'Published only');
});

test('setSectionValue updates draftValue by key without touching sibling keys', async () => {
  const harness = await setup('about', { data: { heading: 'Hello', subheading: 'World' } });
  await harness.act(() => harness.result.setSectionValue('heading', 'Changed'));
  assert.equal(harness.result.draftValue.heading, 'Changed');
  assert.equal(harness.result.draftValue.subheading, 'World');
});

test('saveDraft PUTs the current draftValue and reloads', async () => {
  const harness = await setup('about');
  await harness.act(() => harness.result.setSectionValue('heading', 'Edited'));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.saveDraft());

  const calls = callsAfter(before);
  assert.equal(calls[0].path, '/admin/content');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(calls[0].options.body, { type: 'about', data: { heading: 'Edited' } });
  // Reload (GET doc + GET revisions) must follow the PUT.
  assert.ok(calls.some((c) => c.path.startsWith('/admin/content?type=about')));
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Draft saved. The public page is unchanged.' }]);
});

test('saveDraft short-circuits on a validation error: no apiFetch call, toast.error shown', async () => {
  const harness = await setup('about');
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.saveDraft(() => 'heading is required'));

  assert.equal(getApiFetchCalls().length, before, 'no network call should happen when client-side validation fails');
  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'heading is required' }]);
});

// --- The regression this task exists to protect: publish() must always PUT
// the current draftValue BEFORE calling the publish endpoint, regardless of
// whether "Save draft" was clicked first. ---

test('publish() PUTs the current draftValue before calling the publish endpoint (the fixed stale-draft bug)', async () => {
  const harness = await setup('about');
  await harness.act(() => harness.result.setSectionValue('heading', 'Edited but never saved'));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.publish());

  const calls = callsAfter(before);
  const putIndex = calls.findIndex((c) => c.path === '/admin/content' && c.options.method === 'PUT');
  const publishIndex = calls.findIndex((c) => c.path === '/admin/content/publish' && c.options.method === 'POST');
  assert.notEqual(putIndex, -1, 'expected a PUT /admin/content call');
  assert.notEqual(publishIndex, -1, 'expected a POST /admin/content/publish call');
  assert.ok(putIndex < publishIndex, 'the draft PUT must happen before the publish POST');
  assert.deepEqual(calls[putIndex].options.body, { type: 'about', data: { heading: 'Edited but never saved' } });
  assert.deepEqual(calls[publishIndex].options.body, { type: 'about' });
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Published — now live on the public site.' }]);
});

test('publish() short-circuits on a validation error: no apiFetch call at all', async () => {
  const harness = await setup('about');
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.publish(() => 'body is required'));

  assert.equal(getApiFetchCalls().length, before);
  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'body is required' }]);
});

test('publish() surfaces an apiFetch rejection via toast.error and leaves busy cleared', async () => {
  const harness = await setup('about', {});
  setApiFetchImpl(async (path, options) => {
    if (path === '/admin/content' && options?.method === 'PUT') throw new Error('Network down');
    return defaultRouter()(path, options);
  });

  await harness.act(() => harness.result.publish());

  assert.deepEqual(getToastCalls(), [{ type: 'error', message: 'Network down' }]);
  assert.equal(harness.result.busy, null, 'busy must be cleared even after a failure');
});

test('unpublish() calls the unpublish endpoint for the primary type and reloads', async () => {
  const harness = await setup('about');
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.unpublish());

  const calls = callsAfter(before);
  assert.equal(calls[0].path, '/admin/content/unpublish');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.body, { type: 'about' });
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Unpublished — hidden from the public site.' }]);
});

test('restore() restores the given revision and reloads', async () => {
  const harness = await setup('about');
  const before = getApiFetchCalls().length;
  const revision = { _id: 'rev-1', version: 3 };

  await harness.act(() => harness.result.restore(revision));

  const calls = callsAfter(before);
  assert.equal(calls[0].path, '/admin/content/revisions/restore');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.body, { type: 'about', revisionId: 'rev-1' });
  assert.deepEqual(getToastCalls(), [{ type: 'success', message: 'Restored version 3.' }]);
});

// --- Multi-type mirroring (typeOrTypes as an array) ---

test('with a secondary type, saveDraft mirrors the primary draft onto every secondary type', async () => {
  const harness = await setup(['pages/media', 'media']);
  await harness.act(() => harness.result.setSectionValue('items', ['a']));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.saveDraft());

  const calls = callsAfter(before);
  const puts = calls.filter((c) => c.path === '/admin/content' && c.options.method === 'PUT');
  assert.equal(puts.length, 2, 'expected one PUT for the primary type and one for the secondary type');
  assert.deepEqual(puts[0].options.body, { type: 'pages/media', data: { heading: 'Hello', items: ['a'] } });
  assert.deepEqual(puts[1].options.body, { type: 'media', data: { heading: 'Hello', items: ['a'] } });
});

test('with a secondary type, publish() PUTs and publishes both the primary and the secondary type, PUT always before its own publish', async () => {
  const harness = await setup(['pages/media', 'media']);
  await harness.act(() => harness.result.setSectionValue('items', ['unsaved edit']));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.publish());

  const calls = callsAfter(before);
  const primaryPutIdx = calls.findIndex((c) => c.path === '/admin/content' && c.options.method === 'PUT' && c.options.body.type === 'pages/media');
  const secondaryPutIdx = calls.findIndex((c) => c.path === '/admin/content' && c.options.method === 'PUT' && c.options.body.type === 'media');
  const primaryPublishIdx = calls.findIndex((c) => c.path === '/admin/content/publish' && c.options.body.type === 'pages/media');
  const secondaryPublishIdx = calls.findIndex((c) => c.path === '/admin/content/publish' && c.options.body.type === 'media');

  assert.ok(primaryPutIdx !== -1 && secondaryPutIdx !== -1 && primaryPublishIdx !== -1 && secondaryPublishIdx !== -1);
  assert.ok(primaryPutIdx < primaryPublishIdx, 'primary draft must be saved before the primary is published');
  assert.ok(secondaryPutIdx < secondaryPublishIdx, 'secondary draft must be mirrored before the secondary is published');
  assert.deepEqual(calls[secondaryPutIdx].options.body, { type: 'media', data: { heading: 'Hello', items: ['unsaved edit'] } });
});

test('with a secondary type, unpublish() unpublishes both the primary and the secondary type', async () => {
  const harness = await setup(['pages/media', 'media']);
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.unpublish());

  const calls = callsAfter(before);
  const unpublishCalls = calls.filter((c) => c.path === '/admin/content/unpublish');
  assert.equal(unpublishCalls.length, 2);
  assert.deepEqual(unpublishCalls.map((c) => c.options.body.type).sort(), ['media', 'pages/media']);
});

test('with a secondary type, restore() re-fetches the restored primary data, mirrors it onto the secondary, then publishes the secondary', async () => {
  resetApiFetchMock();
  resetToastMock();
  let primaryRestoredData = { heading: 'Restored content' };
  setApiFetchImpl(async (path, options) => {
    const method = options?.method || 'GET';
    if (path.startsWith('/admin/content/revisions/restore')) return { ok: true };
    if (path.startsWith('/admin/content/revisions?')) return [];
    if (path.startsWith('/admin/content/publish')) return { ok: true };
    // After restore, the hook re-fetches the primary doc to get the
    // now-restored `data` to mirror onto secondaries.
    if (path.startsWith('/admin/content?')) return { data: primaryRestoredData, draftData: null };
    if (path === '/admin/content' && method === 'PUT') return { ok: true };
    throw new Error(`unexpected apiFetch call: ${method} ${path}`);
  });

  const harness = await renderHook(() => useContentEditor(['pages/media', 'media']));
  const before = getApiFetchCalls().length;

  await harness.act(() => harness.result.restore({ _id: 'rev-9', version: 9 }));

  const calls = callsAfter(before);
  const restoreIdx = calls.findIndex((c) => c.path === '/admin/content/revisions/restore');
  const secondaryPutIdx = calls.findIndex((c) => c.path === '/admin/content' && c.options.method === 'PUT' && c.options.body.type === 'media');
  const secondaryPublishIdx = calls.findIndex((c) => c.path === '/admin/content/publish' && c.options.body.type === 'media');

  assert.ok(restoreIdx !== -1 && secondaryPutIdx !== -1 && secondaryPublishIdx !== -1);
  assert.ok(restoreIdx < secondaryPutIdx, 'the primary restore must happen before mirroring onto the secondary');
  assert.ok(secondaryPutIdx < secondaryPublishIdx, 'the secondary mirror must be saved before the secondary is published');
  assert.deepEqual(calls[secondaryPutIdx].options.body, { type: 'media', data: primaryRestoredData });
});
