// Task 7D.32 — regression coverage for getPrivacyContent()/getTermsContent()'s
// narrow "known-content fallback" (pageService.js's getContentOrKnownFallback).
// The migration audit found GET /public/pages/privacy and /pages/terms both
// 404 CONTENT_NOT_FOUND on a freshly bootstrapped database (neither type was
// in Backend/scripts/runSeed.js's CONTENT_SEED map at all), and neither
// page.js file has any error handling -- an uncaught rejection there crashes
// the whole page. Same fetch-mocking + env-override convention as
// contentService.test.mjs.
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

const { getPrivacyContent, getTermsContent, getFaqContent } = await import('./pageService.js');
const privacyMock = await import('@/lib/mockData/privacy');
const termsMock = await import('@/lib/mockData/terms');

function respond404NotFound(type) {
  return async () => ({
    ok: false,
    status: 404,
    json: async () => ({ success: false, code: 'CONTENT_NOT_FOUND', message: `No published content for type "${type}"` }),
  });
}

test('getPrivacyContent: a genuine 404 CONTENT_NOT_FOUND falls back to the real, verified mock content instead of crashing', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = respond404NotFound('pages/privacy');

  const data = await getPrivacyContent();
  assert.equal(data.TITLE, privacyMock.TITLE);
  assert.equal(data.BODY, privacyMock.BODY);
  assert.deepEqual(data.SEO, privacyMock.SEO);
});

test('getTermsContent: a genuine 404 CONTENT_NOT_FOUND falls back to the real, verified mock content instead of crashing', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = respond404NotFound('pages/terms');

  const data = await getTermsContent();
  assert.equal(data.TITLE, termsMock.TITLE);
  assert.equal(data.BODY, termsMock.BODY);
  assert.deepEqual(data.SEO, termsMock.SEO);
});

test('getPrivacyContent: a real, populated API response is used as-is -- the fallback never overrides genuine data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { TITLE: 'Real Privacy Policy (from backend)', EFFECTIVE_DATE: '2026-01-01', BODY: '<p>Real.</p>', SEO: {} } }),
  });

  const data = await getPrivacyContent();
  assert.equal(data.TITLE, 'Real Privacy Policy (from backend)');
});

test('getPrivacyContent: an unrelated error (not 404 CONTENT_NOT_FOUND) is never swallowed by the fallback', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ success: false, code: 'INTERNAL_ERROR', message: 'Something went wrong' }),
  });

  await assert.rejects(() => getPrivacyContent(), (err) => {
    assert.equal(err.status, 500);
    assert.equal(err.code, 'INTERNAL_ERROR');
    return true;
  });
});

test('getPrivacyContent: a 404 with a different code (not CONTENT_NOT_FOUND) is never swallowed by the fallback', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ success: false, code: 'SOME_OTHER_404', message: 'Not found for a different reason' }),
  });

  await assert.rejects(() => getPrivacyContent(), (err) => {
    assert.equal(err.code, 'SOME_OTHER_404');
    return true;
  });
});

test('getPrivacyContent: a network failure (backend unreachable) is never swallowed by the fallback', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('connection refused');
  };

  await assert.rejects(() => getPrivacyContent(), (err) => {
    assert.equal(err.networkError, true);
    return true;
  });
});

test('this fallback is scoped to exactly Privacy/Terms -- an unrelated content type (FAQ) still rejects on 404, never falls back to mock', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = respond404NotFound('pages/faq');

  await assert.rejects(() => getFaqContent(), (err) => {
    assert.equal(err.status, 404);
    assert.equal(err.code, 'CONTENT_NOT_FOUND');
    return true;
  });
});

test('development mock mode is unaffected: getPrivacyContent() returns the real mock dataset directly, never touching fetch', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called in mock mode');
  };

  const data = await getPrivacyContent();
  assert.equal(data.TITLE, privacyMock.TITLE);
});
