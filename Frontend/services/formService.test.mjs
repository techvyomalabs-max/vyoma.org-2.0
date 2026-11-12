// Task 7L — regression coverage for formService.js's migration to the
// shared shouldUseMockData() (lib/apiConfig.js). Its mock branch fabricates
// a fake successful submissionId with no real submission ever recorded --
// the same class of risk as donationService.js's mock order/verify, just
// lower-stakes (a contact-style form, not a payment).
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

const { submitForm } = await import('./formService.js');

test('explicit development mock mode: returns a fabricated success (preserved for local dev/testing only)', async () => {
  setEnv({ NODE_ENV: 'development', NEXT_PUBLIC_API_BASE_URL: undefined });
  const result = await submitForm('contact', { values: { name: 'Test' }, consent: true, sourceUrl: '/contact' });
  assert.equal(result.success, true);
  assert.match(result.submissionId, /^mock-contact-/);
});

test('production with missing API configuration: never appears successful using mock data', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: undefined });
  global.fetch = () => {
    throw new Error('must not be called');
  };
  await assert.rejects(() => submitForm('contact', { values: { name: 'Test' }, consent: true, sourceUrl: '/contact' }), /NEXT_PUBLIC_API_BASE_URL/);
});

test('valid production API configuration: performs a real submission, never a fabricated one', async () => {
  setEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://api.vyoma.org/api/v1' });
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, body: options.body });
    return { ok: true, status: 200, json: async () => ({ success: true, data: { success: true, submissionId: 'real-submission-123' } }) };
  };
  const result = await submitForm('contact', { values: { name: 'Test' }, consent: true, sourceUrl: '/contact' });
  assert.equal(result.submissionId, 'real-submission-123');
  assert.equal(calls[0].url, 'https://api.vyoma.org/api/v1/forms/contact/submissions');
});
