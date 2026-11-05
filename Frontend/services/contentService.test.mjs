// Task 7L — regression coverage for contentService.js's migration to the
// shared shouldUseMockData() (lib/apiConfig.js). getPublicContent() backs
// every public page's content (about, impact, credibility, join-us,
// our-work, faq, contact, donate, privacy, terms, media) via pageService.js
// -- this one fix propagates the production safety guarantee to all of them
// at once.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Needed for two things plain `node --test` cannot resolve on its own:
// the dynamic `await import('@/lib/mockData/...')` mock loaders this file's
// own callers pass in, and the 'next/headers' import contentService.js
// itself makes (see lib/testSupport/aliasResolver.mjs).
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

const { getPublicContent } = await import('./contentService.js');

// A real mockLoader using the real mock dataset -- exactly the shape every
// real caller (pageService.js) passes.
const aboutMockLoader = () => import('@/lib/mockData/about');

test('explicit development mock mode: returns the real mock dataset untouched (preserved for local dev/testing)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const mod = await getPublicContent('pages/about', aboutMockLoader);
  assert.ok(mod.SEO, 'expected the real lib/mockData/about.js module, not a fabricated stand-in');
});

test('production with missing API configuration: throws a clear error instead of silently serving mock page content', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  let mockLoaderCalled = false;
  const trackedMockLoader = () => {
    mockLoaderCalled = true;
    return aboutMockLoader();
  };
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => getPublicContent('pages/about', trackedMockLoader), /NEXT_PUBLIC_API_BASE_URL/);
  assert.equal(mockLoaderCalled, false, 'the mock loader must never even be invoked in production');
});

test('valid production API configuration: performs a real fetch for the given type, never touches the mock loader', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  let mockLoaderCalled = false;
  const trackedMockLoader = () => {
    mockLoaderCalled = true;
    return aboutMockLoader();
  };
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { SEO: { title: 'Real About (from backend)' } } }) };
  };

  const data = await getPublicContent('pages/about', trackedMockLoader);
  assert.equal(data.SEO.title, 'Real About (from backend)');
  assert.equal(mockLoaderCalled, false);
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/public/pages/about');
});

test('valid production API configuration with an unreachable backend: throws the existing clear network error, never falls back to mock content', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('connection refused');
  };
  await assert.rejects(() => getPublicContent('pages/about', aboutMockLoader), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    return true;
  });
});

test('intended static fallback: a genuine API error response (reachable, but a real error) still surfaces as an error, not mock content', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ success: false, message: 'Content not found', code: 'NOT_FOUND' }),
  });
  await assert.rejects(() => getPublicContent('pages/nonexistent', aboutMockLoader), (err) => {
    assert.equal(err.status, 404);
    assert.equal(err.code, 'NOT_FOUND');
    return true;
  });
});
