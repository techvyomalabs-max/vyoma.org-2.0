// Task 7L — regression coverage for app/sitemap.js's fix: it previously
// imported DONATION_SCHEMES directly and unconditionally from
// lib/mockData/donate, in every environment, regardless of
// NEXT_PUBLIC_API_BASE_URL -- unlike its own blog entries, already correctly
// sourced from the real, properly-gated getBlogPosts(). A production
// sitemap (submitted to search engines) would have listed permanently
// frozen mock donation-scheme URLs forever. Now uses getDonationSchemes()
// (lib/apiConfig.js-gated, same as every other service fixed in this task).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

register('../lib/testSupport/aliasResolver.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.join(__dirname, 'sitemap.js'), 'utf8');

test('no longer imports DONATION_SCHEMES directly from mock data, unconditionally', () => {
  assert.ok(!SOURCE.includes("from '@/lib/mockData/donate'"), 'sitemap.js must not import mock donation data directly/unconditionally');
  assert.match(SOURCE, /import \{ getDonationSchemes \} from '@\/services\/donationService';/);
});

// Task 7S.1 — without this, the sitemap is cached indefinitely from build
// time (confirmed empirically in Task 7R.1's runtime pass: it kept serving
// build-time entries even with the backend down). This is a source check,
// not a behavioral one: Next.js's time-based revalidation itself is runtime
// infrastructure this plain node:test harness cannot simulate -- what a
// newly published blog post or donation scheme actually becoming eligible
// for inclusion after this window elapses depends on Next.js's own ISR
// mechanism working correctly, not on anything sitemap.js's own code does
// differently per call.
test('declares export const revalidate = 3600 (hourly revalidation, not full force-dynamic)', () => {
  assert.match(SOURCE, /export const revalidate = 3600;/, 'sitemap.js must revalidate periodically so newly published content becomes eligible for inclusion without a full rebuild');
});

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

test('valid production API configuration: the generated sitemap includes real donation-scheme and blog-post URLs, never mock ones', async (t) => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async (url) => {
    if (url.includes('/public/donation-schemes')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: [{ slug: 'real-scheme-from-backend' }] }) };
    }
    if (url.includes('/public/blog')) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: [{ slug: 'real-post-from-backend', publishedAt: '2026-01-01T00:00:00.000Z' }], meta: { page: 1, limit: 50, total: 1 } }) };
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  };

  const sitemap = (await import(`./sitemap.js?t=${t.name.length}-${Date.now()}`)).default;
  const entries = await sitemap();

  const schemeUrls = entries.filter((e) => e.url.startsWith('https://vyoma.org/donate/') && e.url !== 'https://vyoma.org/donate/');
  assert.deepEqual(schemeUrls.map((e) => e.url), ['https://vyoma.org/donate/real-scheme-from-backend']);

  const blogUrls = entries.filter((e) => e.url.startsWith('https://vyoma.org/media/blog/'));
  assert.deepEqual(blogUrls.map((e) => e.url), ['https://vyoma.org/media/blog/real-post-from-backend']);
});

test('production with missing API configuration: sitemap generation throws rather than silently publishing mock donation-scheme URLs', async (t) => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  const sitemap = (await import(`./sitemap.js?t=${t.name.length}-${Date.now()}`)).default;
  await assert.rejects(() => sitemap(), /NEXT_PUBLIC_API_BASE_URL/);
});

// Task 7R.1 — a build-time-unreachable backend (DNS failure, transient
// outage) must not fail sitemap generation (and, by the same code path,
// `next build`): the static routes are still returned and the dynamic
// scheme/blog entries are simply omitted, never replaced by mock data.
test('DNS failure (unresolvable staging hostname): sitemap still returns the static routes, omitting only the dynamic scheme/blog entries', async (t) => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://nonexistent-test-host-abcxyz.invalid/api/v1' });
  global.fetch = async () => {
    // Mirrors Node's real fetch() rejection for an unresolvable hostname
    // (ENOTFOUND) -- apiClient.js's catch block treats any rejected fetch()
    // identically, tagging it err.networkError = true regardless of the
    // underlying cause (DNS failure, connection refused, offline).
    const err = new Error('getaddrinfo ENOTFOUND nonexistent-test-host-abcxyz.invalid');
    err.code = 'ENOTFOUND';
    throw err;
  };

  const sitemap = (await import(`./sitemap.js?t=${t.name.length}-${Date.now()}`)).default;
  const entries = await sitemap();

  assert.ok(entries.some((e) => e.url === 'https://vyoma.org/'), 'static routes must still be present');
  assert.equal(entries.filter((e) => e.url.startsWith('https://vyoma.org/donate/')).length, 0, 'scheme entries omitted, not fabricated');
  assert.equal(entries.filter((e) => e.url.startsWith('https://vyoma.org/media/blog/')).length, 0, 'blog entries omitted, not fabricated');
});

// Task 7R.1 — the opposite case: a real, reachable backend that returns a
// genuine server error (not a network-level failure) must still surface as
// an error, exactly like the pre-existing "intended static fallback" test
// for contentService.js -- a broad catch here must never hide a real
// programming/backend error behind a silently-incomplete sitemap.
test('unexpected programming error (reachable backend, real 500 response): re-thrown, never silently swallowed', async (t) => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ success: false, message: 'Internal Server Error' }),
  });

  const sitemap = (await import(`./sitemap.js?t=${t.name.length}-${Date.now()}`)).default;
  await assert.rejects(() => sitemap(), (err) => {
    assert.equal(err.status, 500);
    assert.equal(err.networkError, undefined, 'a real HTTP error response must never be mistaken for a network failure');
    return true;
  });
});
