// Task 7L — regression coverage for blogService.js's migration to the
// shared shouldUseMockData() (lib/apiConfig.js).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../lib/testSupport/aliasResolver.mjs', import.meta.url);

const ORIGINAL_ENV = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL };
const ORIGINAL_FETCH = global.fetch;

function setEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => setEnv(ORIGINAL_ENV));
afterEach(() => {
  setEnv(ORIGINAL_ENV);
  global.fetch = ORIGINAL_FETCH;
});

const { getBlogPosts, getBlogCategories, getBlogPost } = await import('./blogService.js');

test('explicit development mock mode: getBlogPosts() returns the real mock dataset (preserved for local dev/testing)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const { items, meta } = await getBlogPosts();
  assert.ok(items.length > 0, 'expected the real lib/mockData/blog.js dataset, not an empty/fabricated list');
  assert.equal(meta.page, 1);
});

test('production with missing API configuration: getBlogPosts() throws a clear error instead of silently serving mock posts', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => getBlogPosts(), /NEXT_PUBLIC_API_BASE_URL/);
});

test('production with missing API configuration: getBlogCategories() and getBlogPost() also never fall back to mock data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => getBlogCategories(), /NEXT_PUBLIC_API_BASE_URL/);
  await assert.rejects(() => getBlogPost('some-post'), /NEXT_PUBLIC_API_BASE_URL/);
});

test('valid production API configuration: getBlogPosts() performs a real fetch and returns real data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: [{ slug: 'real-post-from-backend' }], meta: { page: 1, limit: 9, total: 1 } }) };
  };
  const { items } = await getBlogPosts();
  assert.deepEqual(items, [{ slug: 'real-post-from-backend' }]);
  assert.ok(calls[0].startsWith('https://api.vyoma.org/api/v1/public/blog?'));
});

test('valid production API configuration with an unreachable backend: throws the existing clear network error, never falls back to mock posts', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('connection refused');
  };
  await assert.rejects(() => getBlogPosts(), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    return true;
  });
});

test('intended behavior: a real 404 from the backend for a missing post still resolves to null, not mock content', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ success: false, message: 'Not found' }),
  });
  const post = await getBlogPost('does-not-exist');
  assert.equal(post, null);
});
