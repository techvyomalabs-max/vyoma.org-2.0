// Regression coverage for strict INR-only currency validation in
// createDonationOrder (POST /donations/orders) -- exercises the real
// Express app (createApp()) against a disposable in-memory MongoDB
// (mongodb-memory-server, same pattern as the rest of this test suite).
//
// RAZORPAY_KEY_ID/SECRET are deliberately left UNSET for this entire file,
// so isRazorpayConfigured() is false and every request that passes
// schemeSlug/amount/currency/scheme-exists validation stops at a clean
// 503 RAZORPAY_NOT_CONFIGURED -- strictly before any Donation document is
// created and before razorpay.adapter.js's createOrder() ever runs (it
// returns null immediately without constructing a client or making any
// network call). This is what makes a true "mock Razorpay" unnecessary:
// a real Razorpay SDK call is architecturally unreachable here regardless
// of which currency is submitted, so there is no live-network-call risk to
// guard against with a mock -- the distinction that matters for this task
// (whether a given currency was accepted or rejected) is already fully
// observable as 422 (rejected by currency validation) vs 503 (passed
// currency validation, then failed for the unrelated, pre-existing reason
// that Razorpay isn't configured) -- without needing real credentials,
// a live API call, or the experimental node:test module-mocking API that
// the rest of this codebase doesn't use.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let app;
let server;
let baseUrl;
let DonationModel;
let DonationSchemeModel;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const { createApp } = await import('../../app.js');
  ({ DonationModel } = await import('./donation.model.js'));
  ({ DonationSchemeModel } = await import('./donationScheme.model.js'));
  await DonationSchemeModel.create({ slug: 'test-scheme', name: 'Test Scheme', description: 'For currency validation tests', status: 'active' });
  app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mem.stop();
});

async function createOrderRequest(body) {
  const res = await fetch(`${baseUrl}/api/v1/donations/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

async function donationCount() {
  return DonationModel.countDocuments();
}

// --- Accepted currency values ---

test('a missing currency defaults to INR and passes validation (reaches the pre-existing Razorpay-unconfigured stage, not a currency rejection)', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({ schemeSlug: 'test-scheme', amount: 500 });
  assert.equal(res.status, 503, 'must NOT be rejected as a currency validation error');
  assert.equal(body.code, 'RAZORPAY_NOT_CONFIGURED');
  assert.equal(await donationCount(), before, 'no Donation record is created either way, since Razorpay remains unconfigured');
});

test('an explicit currency of "INR" is accepted and passes validation', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({ schemeSlug: 'test-scheme', amount: 500, currency: 'INR' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'RAZORPAY_NOT_CONFIGURED');
  assert.equal(await donationCount(), before);
});

// --- Rejected currency values ---

const INVALID_CURRENCIES = [
  ['an empty string', ''],
  ['null', null],
  ['lowercase "inr"', 'inr'],
  ['"USD"', 'USD'],
  ['"XYZ"', 'XYZ'],
  ['a number', 123],
  ['an object', { code: 'INR' }],
  ['an array', ['INR']],
  ['an extremely long string', 'A'.repeat(500)],
  ['HTML/script content', '<script>alert(1)</script>'],
];

for (const [label, currency] of INVALID_CURRENCIES) {
  test(`${label} is rejected with 422 before any Donation is created or Razorpay is reached`, async () => {
    const before = await donationCount();
    const { res, body } = await createOrderRequest({ schemeSlug: 'test-scheme', amount: 500, currency });
    assert.equal(res.status, 422);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.fieldErrors?.currency, 'the field-level error must point at currency');
    assert.equal(await donationCount(), before, 'no Donation record may be created for a rejected currency');
  });
}

test('an invalid currency is rejected even when every other field (scheme, amount, donor) is otherwise valid', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({
    schemeSlug: 'test-scheme',
    amount: 2500,
    currency: 'USD',
    donor: { name: 'Jane Doe', email: 'jane@example.test' },
  });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(await donationCount(), before);
});

test('currency validation runs before the scheme-existence check (an invalid currency against an unknown scheme is still a 422, not a 404)', async () => {
  const { res, body } = await createOrderRequest({ schemeSlug: 'no-such-scheme', amount: 500, currency: 'USD' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});
