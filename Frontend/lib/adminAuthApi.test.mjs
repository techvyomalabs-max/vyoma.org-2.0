// Task 7L — regression coverage for lib/adminAuthApi.js's migration from its
// own independent `process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost
// :4000/api/v1'` fallback to the shared resolveApiBase() (lib/apiConfig.js).
//
// This file never had a mock-data branch -- every admin action already
// always made a real network call, so "admin operations never appear
// successful using mock data" was already true before this task. What this
// fix closes is narrower but still real: a misconfigured production
// deployment would previously have had every admin action silently target
// http://localhost:4000, which fails in a confusing way (the visiting
// browser's own machine, not the real backend) instead of with a clear
// configuration error.
//
// API_BASE is a module-level constant (computed once at import, matching
// this file's pre-existing shape) -- each test below re-imports the module
// with a cache-busting query string so a fresh `API_BASE` is resolved
// against that test's own process.env.
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

beforeEach(() => setEnv(ORIGINAL_ENV));
afterEach(() => {
  setEnv(ORIGINAL_ENV);
  global.fetch = ORIGINAL_FETCH;
});

let importCounter = 0;
function freshImport() {
  importCounter += 1;
  return import(`./adminAuthApi.js?t=${importCounter}`);
}

test('production with missing API configuration: importing the module throws a clear configuration error, before any admin action can even be attempted', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  await assert.rejects(() => freshImport(), /NEXT_PUBLIC_API_BASE_URL/);
});

test('development with no API URL configured: falls back to the local Backend default, preserved for local dev', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const { login } = await freshImport();
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { accessToken: 'x', user: {} } }) };
  };
  await login('admin@vyoma.org', 'password');
  assert.equal(calls[0], 'http://localhost:4000/api/v1/auth/login');
});

test('valid production API configuration: login() targets the real configured backend, never localhost', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const { login } = await freshImport();
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { accessToken: 'x', user: {} } }) };
  };
  await login('admin@vyoma.org', 'password');
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/auth/login');
});

test('valid production API configuration with an unreachable backend: admin login fails with a clear error, never appears successful', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const { login } = await freshImport();
  global.fetch = async () => {
    throw new Error('connection refused');
  };
  await assert.rejects(() => login('admin@vyoma.org', 'password'), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    assert.equal(err.networkError, true);
    return true;
  });
});
