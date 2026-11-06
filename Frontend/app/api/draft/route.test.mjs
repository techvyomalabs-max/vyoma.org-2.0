// Task 7L — regression coverage for app/api/draft/route.js's migration to
// the shared resolveApiBase() (lib/apiConfig.js), mirroring
// lib/adminAuthApi.test.mjs's coverage of the identical fix there.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Needed for this route's own 'next/headers' import (draftMode()) -- see
// lib/testSupport/aliasResolver.mjs.
register('../../../lib/testSupport/aliasResolver.mjs', import.meta.url);

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
  return import(`./route.js?t=${importCounter}`);
}

function draftRequest(path = '/about') {
  return new Request('http://localhost:3000/api/draft', {
    method: 'POST',
    headers: { Authorization: 'Bearer real-admin-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

// Task 7V.2 — replaces a prior version of this test that asserted importing
// the route itself threw when NEXT_PUBLIC_API_BASE_URL was missing. That was
// exactly the bug this task fixed: resolveApiBase() used to be called at
// module scope, so Next.js evaluating this route's module during `next
// build`'s page-data-collection phase crashed the ENTIRE build, confirmed by
// direct testing (Task 7V.1) -- not just this one route failing at request
// time, which is the correct, intended behavior.
test('production with missing API configuration: importing the route succeeds (this must never crash the build)', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  const mod = await freshImport();
  assert.equal(typeof mod.POST, 'function', 'the module must import cleanly regardless of API configuration');
});

test('production with missing API configuration: POST still fails clearly, with no localhost or mock-data fallback, and never reaches fetch', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  const { POST } = await freshImport();
  global.fetch = async () => {
    throw new Error('must not be called -- a missing API URL must be caught before any network request');
  };

  const res = await POST(draftRequest());
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /NEXT_PUBLIC_API_BASE_URL/);
  assert.doesNotMatch(body.error, /localhost/i, 'the error must never mention a localhost fallback');
});

test('valid production API configuration: verifies the session against the real configured backend, never localhost', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const { POST } = await freshImport();
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200 };
  };

  const res = await POST(draftRequest());
  assert.equal(res.status, 200);
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/auth/me');
});

test('valid production API configuration with an unreachable backend: returns a clear 502, never silently enables preview', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const { POST } = await freshImport();
  global.fetch = async () => {
    throw new Error('connection refused');
  };

  const res = await POST(draftRequest());
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.doesNotMatch(body.error, /connection refused/);
});
