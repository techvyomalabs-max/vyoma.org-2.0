// Task 7L — regression coverage for services/apiClient.js's integration with
// the new shared lib/apiConfig.js. Confirms: (1) a missing API URL in
// production fails fast, with zero network call ever attempted (verified by
// a global.fetch spy); (2) a genuinely unreachable backend with a VALID
// production configuration still surfaces the existing, pre-Task-7L "Unable
// to reach the server" error -- never mock data, never a silent success;
// (3) an API error response (reachable, but non-2xx/non-success) still
// surfaces correctly; (4) a valid production configuration performs a real
// fetch call against the configured URL.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const ORIGINAL_ENV = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL };
const ORIGINAL_FETCH = global.fetch;

function setEnv(overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

beforeEach(() => {
  setEnv(ORIGINAL_ENV);
});

afterEach(() => {
  setEnv(ORIGINAL_ENV);
  global.fetch = ORIGINAL_FETCH;
});

// apiClient.js calls resolveApiBase() fresh inside each exported function
// (not cached at module-import time -- Task 7L), so a single import at the
// top of this file, reused across every test below with different
// process.env values, correctly exercises every scenario.
const { apiRequest, apiRequestWithMeta } = await import('./apiClient.js');

test('production with missing API configuration: throws before attempting any network call', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  let fetchCalled = false;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('fetch must never be called in this scenario');
  };

  await assert.rejects(() => apiRequest('/public/about'), /NEXT_PUBLIC_API_BASE_URL/);
  assert.equal(fetchCalled, false, 'no network call should ever be attempted when production configuration is missing');
});

test('production with a genuinely unreachable backend: surfaces the existing clear network-error message, never mock data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('getaddrinfo ENOTFOUND api.vyoma.org'); // simulated real network failure
  };

  await assert.rejects(() => apiRequest('/public/about'), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    assert.equal(err.networkError, true);
    // The raw DNS/network error text must never reach the caller.
    assert.doesNotMatch(err.message, /ENOTFOUND/);
    return true;
  });
});

test('production with a valid configuration and an API error response: surfaces the error, with status/code preserved', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ success: false, message: 'Internal error', code: 'INTERNAL_ERROR' }),
  });

  await assert.rejects(() => apiRequest('/public/about'), (err) => {
    assert.equal(err.message, 'Internal error');
    assert.equal(err.status, 500);
    assert.equal(err.code, 'INTERNAL_ERROR');
    return true;
  });
});

test('production with a valid configuration and a reachable, successful backend: calls fetch against the configured URL and returns real data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { title: 'Real production content' } }) };
  };

  const data = await apiRequest('/public/about');
  assert.equal(data.title, 'Real production content');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/public/about');
});

test('apiRequestWithMeta: production with missing API configuration also throws before any network call', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  let fetchCalled = false;
  global.fetch = () => {
    fetchCalled = true;
    throw new Error('must not be called');
  };

  await assert.rejects(() => apiRequestWithMeta('/public/blog'), /NEXT_PUBLIC_API_BASE_URL/);
  assert.equal(fetchCalled, false);
});

test('development with no API URL configured: still performs a real fetch against the dev-fallback relative path (never mock data at this layer -- mocking happens one layer up, in each service)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  };

  await apiRequest('/public/about');
  assert.equal(calls[0], '/api/v1/public/about', 'apiClient.js itself always attempts a real call -- the service-layer USE_MOCK check happens before apiClient is ever invoked');
});
