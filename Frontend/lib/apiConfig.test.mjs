// Task 7L — regression coverage for lib/apiConfig.js, the single shared
// source of truth closing the "production silently serves mock content"
// gap found across 8 previously-independent copies of the same
// process.env.NEXT_PUBLIC_API_BASE_URL check (see the module's own header
// comment for the full inventory). Pure functions, no I/O, no framework —
// every scenario is driven via the injectable `env` parameter rather than
// mutating the real process.env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldUseMockData, resolveApiBase } from './apiConfig.js';

// --- shouldUseMockData ------------------------------------------------------

test('production with missing API configuration: mock data is never permitted', () => {
  assert.equal(shouldUseMockData({ NODE_ENV: 'production' }), false);
});

test('production with a valid, configured API URL: mock data is never permitted (redundant but must still be false)', () => {
  assert.equal(shouldUseMockData({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' }), false);
});

test('explicit development mode with no API URL configured: mock data is used (preserves zero-setup local dev)', () => {
  assert.equal(shouldUseMockData({ NODE_ENV: 'development' }), true);
});

test('development with a real API URL configured: mock data is not used, even in development', () => {
  assert.equal(shouldUseMockData({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/v1' }), false);
});

test('NODE_ENV entirely unset (e.g. a bare `node --test` run) with no API URL: treated as non-production, mock data is used', () => {
  assert.equal(shouldUseMockData({}), true);
});

test('NODE_ENV entirely unset with a real API URL configured: mock data is not used', () => {
  assert.equal(shouldUseMockData({ NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/v1' }), false);
});

test('a blank-string API URL is treated the same as missing, in every environment', () => {
  assert.equal(shouldUseMockData({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: '' }), true);
  assert.equal(shouldUseMockData({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: '' }), false, 'still never true in production, blank or not');
});

test('defaults to reading the real process.env when no env object is passed', () => {
  const backup = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL };
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    assert.equal(shouldUseMockData(), true);

    process.env.NODE_ENV = 'production';
    assert.equal(shouldUseMockData(), false);
  } finally {
    if (backup.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = backup.NODE_ENV;
    if (backup.NEXT_PUBLIC_API_BASE_URL === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = backup.NEXT_PUBLIC_API_BASE_URL;
  }
});

// --- resolveApiBase ----------------------------------------------------------

test('production with missing API configuration: throws a clear, non-sensitive configuration error', () => {
  assert.throws(() => resolveApiBase({ NODE_ENV: 'production' }), (err) => {
    assert.match(err.message, /NEXT_PUBLIC_API_BASE_URL/);
    assert.match(err.message, /not configured/);
    // Never leaks a URL, host, or credential-shaped value in the error.
    assert.doesNotMatch(err.message, /https?:\/\//);
    assert.doesNotMatch(err.message, /localhost/);
    return true;
  });
});

test('production with a valid, configured API URL: returns it, no error', () => {
  assert.equal(resolveApiBase({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' }), 'https://api.vyoma.org/api/v1');
});

test('development with no API URL configured: returns the dev fallback, no error', () => {
  assert.equal(resolveApiBase({ NODE_ENV: 'development' }), '/api/v1');
});

test('a caller-supplied devFallback is used instead of the default, outside production', () => {
  assert.equal(resolveApiBase({ NODE_ENV: 'development' }, 'http://localhost:4000/api/v1'), 'http://localhost:4000/api/v1');
});

test('a caller-supplied devFallback is still never used in production -- missing config still throws', () => {
  assert.throws(() => resolveApiBase({ NODE_ENV: 'production' }, 'http://localhost:4000/api/v1'), /NEXT_PUBLIC_API_BASE_URL/);
});

test('a configured API URL always wins over any fallback, in any environment', () => {
  assert.equal(
    resolveApiBase({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: 'https://staging-api.vyoma.org/api/v1' }, 'http://localhost:4000/api/v1'),
    'https://staging-api.vyoma.org/api/v1'
  );
});
