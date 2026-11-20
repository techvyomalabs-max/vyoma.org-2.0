// Task 7L — regression coverage for settingsService.js's migration to the
// shared shouldUseMockData() (lib/apiConfig.js).
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

const { getPublicSettings } = await import('./settingsService.js');

test('explicit development mock mode: returns the safe, empty mock shape (preserved for local dev/testing)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const settings = await getPublicSettings();
  assert.deepEqual(settings, { contactInboxEmail: null, socialLinks: {}, donationBankDetails: {}, financeContactEmail: null });
});

test('production with missing API configuration: throws a clear error instead of silently returning mock settings', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => getPublicSettings(), /NEXT_PUBLIC_API_BASE_URL/);
});

test('valid production API configuration: performs a real fetch and returns real settings, never the mock shape', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => ({ success: true, data: { contactInboxEmail: 'real@vyoma.org', socialLinks: { facebook: 'https://facebook.com/vyoma' }, donationBankDetails: {}, financeContactEmail: null } }) };
  };
  const settings = await getPublicSettings();
  assert.equal(settings.contactInboxEmail, 'real@vyoma.org');
  assert.equal(calls[0], 'https://api.vyoma.org/api/v1/public/settings');
});

test('valid production API configuration with an unreachable backend: throws the existing clear network error (e.g. Footer renders without social links, never with fabricated ones)', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  global.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  await assert.rejects(() => getPublicSettings(), (err) => {
    assert.equal(err.message, 'Unable to reach the server. Please try again.');
    return true;
  });
});
