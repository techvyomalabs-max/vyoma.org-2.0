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
