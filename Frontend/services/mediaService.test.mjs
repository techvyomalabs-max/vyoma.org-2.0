// Regression coverage for getTestimonials()'s defensive defaulting, added
// after a root-cause audit found media/testimonials/page.js calls
// `featured.map(...)`/`all.map(...)` directly with no Array.isArray-style
// guard -- the same crash-prone "stale/legacy Content document missing a
// field" pattern already fixed for getPressCoverage() in this same file and
// for several page.js files elsewhere in this engagement. Same
// fetch-mocking + env-override convention as contentService.test.mjs.
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

const { getTestimonials } = await import('./mediaService.js');

test('getTestimonials: real featured/all arrays from the API pass through unchanged', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { TESTIMONIALS_FEATURED: [{ name: 'A' }], TESTIMONIALS_ALL: [{ name: 'A' }, { name: 'B' }] } }),
  });

  const { featured, all } = await getTestimonials();
  assert.deepEqual(featured, [{ name: 'A' }]);
  assert.deepEqual(all, [{ name: 'A' }, { name: 'B' }]);
});

test('getTestimonials: a Content document missing TESTIMONIALS_FEATURED/TESTIMONIALS_ALL degrades to empty arrays instead of undefined', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { SOME_UNRELATED_FIELD: true } }),
  });

  const { featured, all } = await getTestimonials();
  assert.deepEqual(featured, []);
  assert.deepEqual(all, []);
  // Confirms the exact crash this fixes: media/testimonials/page.js calls
  // featured.map(...)/all.map(...) directly.
  assert.doesNotThrow(() => featured.map((x) => x));
  assert.doesNotThrow(() => all.map((x) => x));
});

test('getTestimonials: development mock mode returns the real mock dataset untouched', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const { featured, all } = await getTestimonials();
  assert.ok(Array.isArray(featured));
  assert.ok(Array.isArray(all));
});
