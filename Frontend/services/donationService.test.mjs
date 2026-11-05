// Task 7L — regression coverage for donationService.js's migration from its
// own independent `USE_MOCK` constant to the shared shouldUseMockData()
// (lib/apiConfig.js). This file carries the highest real-world stakes of
// every service fixed in this task: createDonationOrder()/verifyDonation()'s
// mock branches fabricate a successful order/payment with no Razorpay call
// and no money moving -- a production misconfiguration must never reach
// them.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// Needed only for the dev-mock-mode test below, which exercises the real
// `await import('@/lib/mockData/donate')` inside donationService.js's own
// mock branch -- see lib/testSupport/aliasResolver.mjs.
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

const { getDonationSchemes, createDonationOrder, verifyDonation } = await import('./donationService.js');

test('explicit development mock mode: getDonationSchemes() returns real mock data (preserved for local dev/testing)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const schemes = await getDonationSchemes();
  assert.ok(Array.isArray(schemes) && schemes.length > 0, 'expected the real lib/mockData/donate.js dataset, not an empty/fabricated list');
});

test('production with missing API configuration: getDonationSchemes() throws a clear error instead of silently returning mock schemes', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called -- mock mode must never activate in production');
  };
  await assert.rejects(() => getDonationSchemes(), /NEXT_PUBLIC_API_BASE_URL/);
});

test('production with missing API configuration: createDonationOrder() never fabricates a successful order', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(
    () => createDonationOrder({ schemeSlug: 'general-donation', amount: 500, currency: 'INR', donor: { name: 'Test', email: 't@example.com' } }),
    /NEXT_PUBLIC_API_BASE_URL/
  );
});

test('production with missing API configuration: verifyDonation() never fabricates a "paid_verified" result', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => verifyDonation({ donationId: 'x', razorpayPaymentId: 'y', razorpaySignature: 'z' }), /NEXT_PUBLIC_API_BASE_URL/);
});

test('valid production API configuration: getDonationSchemes() performs a real fetch and returns real data, never mock', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: [{ slug: 'real-scheme-from-backend' }] }) };
  };
  const schemes = await getDonationSchemes();
  assert.deepEqual(schemes, [{ slug: 'real-scheme-from-backend' }]);
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/public/donation-schemes');
});

test('valid production API configuration with an unreachable backend: throws the existing clear network error, never falls back to mock', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('connection refused');
  };
  await assert.rejects(() => getDonationSchemes(), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    assert.equal(err.networkError, true);
    return true;
  });
});
