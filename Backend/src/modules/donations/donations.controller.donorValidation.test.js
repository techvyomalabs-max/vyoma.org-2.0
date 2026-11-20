// QA Bug 1 fix regression coverage: createDonationOrder() previously never
// validated `donor` at all -- `donor: { name: String, email: String }`
// (donation.model.js) has no `required`/`match`, so a donor.name of "0" or
// an email with no "@"/"." reached DonationModel.create() unchanged. This
// exercises the real Express app (createApp()) against a disposable
// in-memory MongoDB (mongodb-memory-server), the same pattern as
// donations.controller.currencyValidation.test.js. RAZORPAY_KEY_ID/SECRET
// are deliberately left UNSET for this entire file, so a request that passes
// every check (schemeSlug/amount/currency/scheme-exists/donor) stops at a
// clean 503 RAZORPAY_NOT_CONFIGURED, strictly before any Donation document
// is created and before razorpay.adapter.js's createOrder() ever runs -- no
// real payment or network call is reachable here regardless of input.
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
  await DonationSchemeModel.create({ slug: 'test-scheme', name: 'Test Scheme', description: 'For donor validation tests', status: 'active' });
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

const BASE = { schemeSlug: 'test-scheme', amount: 500, currency: 'INR' };

// --- Rejected donor.name values ---

const INVALID_NAMES = [
  ['missing entirely', undefined],
  ['an empty string', ''],
  ['whitespace-only', '   '],
  ['"0" (numeric-only, truthy, previously passed unchecked)', '0'],
  ['a number (wrong type)', 42],
  ['digits-and-letters', 'John3'],
  ['HTML/script content', '<script>alert(1)</script>'],
];

for (const [label, name] of INVALID_NAMES) {
  test(`donor.name ${label} is rejected with 422 before any Donation is created`, async () => {
    const before = await donationCount();
    const { res, body } = await createOrderRequest({ ...BASE, donor: { name, email: 'donor@example.test' } });
    assert.equal(res.status, 422);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.fieldErrors?.name, 'the field-level error must point at name');
    assert.equal(await donationCount(), before);
  });
}

// --- Rejected donor.email values ---

const INVALID_EMAILS = [
  ['missing entirely', undefined],
  ['an empty string', ''],
  ['whitespace-only', '   '],
  ['"0" (truthy, previously passed unchecked)', '0'],
  ['missing "@"', 'donor.example.test'],
  ['missing a domain dot', 'donor@example'],
  ['a number (wrong type)', 0],
];

for (const [label, email] of INVALID_EMAILS) {
  test(`donor.email ${label} is rejected with 422 before any Donation is created`, async () => {
    const before = await donationCount();
    const { res, body } = await createOrderRequest({ ...BASE, donor: { name: 'Jane Doe', email } });
    assert.equal(res.status, 422);
    assert.equal(body.code, 'VALIDATION_ERROR');
    assert.ok(body.fieldErrors?.email, 'the field-level error must point at email');
    assert.equal(await donationCount(), before);
  });
}

test('donor missing entirely is rejected with 422 (both fields reported)', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({ ...BASE });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(body.fieldErrors?.name);
  assert.ok(body.fieldErrors?.email);
  assert.equal(await donationCount(), before);
});

// --- Accepted donor values ---

test('a valid Unicode name and a valid email pass donor validation and reach the pre-existing Razorpay-unconfigured stage', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({ ...BASE, donor: { name: 'Śrīdhar Āchārya', email: 'donor@example.test' } });
  assert.equal(res.status, 503, 'must NOT be rejected as a donor validation error');
  assert.equal(body.code, 'RAZORPAY_NOT_CONFIGURED');
  assert.equal(await donationCount(), before, 'no Donation record is created either way, since Razorpay remains unconfigured');
});

test('leading/trailing whitespace around an otherwise-valid name and email is trimmed, not rejected', async () => {
  const { res, body } = await createOrderRequest({ ...BASE, donor: { name: '  Jane Doe  ', email: '  jane@example.test  ' } });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'RAZORPAY_NOT_CONFIGURED');
});

test('donor validation runs before the scheme-existence check (an invalid donor against an unknown scheme is still a 422, not a 404)', async () => {
  const { res, body } = await createOrderRequest({ schemeSlug: 'no-such-scheme', amount: 500, currency: 'INR', donor: { name: '0', email: '0' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('an invalid donor is rejected even when scheme/amount/currency are otherwise valid', async () => {
  const before = await donationCount();
  const { res, body } = await createOrderRequest({ ...BASE, donor: { name: '0', email: 'not-an-email' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.equal(await donationCount(), before);
});

// --- Pre-existing validation, unchanged ---

test('a missing/invalid amount is still rejected before donor validation would even matter, same as before this fix', async () => {
  const { res, body } = await createOrderRequest({ schemeSlug: 'test-scheme', amount: 0, currency: 'INR', donor: { name: 'Jane Doe', email: 'jane@example.test' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(body.fieldErrors?.amount);
});

test('an invalid currency is still rejected, same as before this fix', async () => {
  const { res, body } = await createOrderRequest({ schemeSlug: 'test-scheme', amount: 500, currency: 'USD', donor: { name: 'Jane Doe', email: 'jane@example.test' } });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
  assert.ok(body.fieldErrors?.currency);
});
