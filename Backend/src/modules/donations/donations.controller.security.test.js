// Security regression coverage for POST /donations/verify and
// POST /webhooks/razorpay — exercises the REAL routes/controllers via the
// real Express app (createApp()) against a disposable in-memory MongoDB
// (mongodb-memory-server, same pattern as the auth test suite), never the
// persistent development database.
//
// No real Razorpay API call is ever made: /donations/orders (which would
// call the live Razorpay SDK) is never exercised here -- donations are
// seeded directly in the disposable DB with a fabricated razorpayOrderId.
// RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET are set to fixed test
// values BEFORE env.js is first imported, so the real, unmodified
// verifyCheckoutSignature/verifyWebhookSignature functions can be exercised
// with genuine, locally-computed HMACs instead of needing to call Razorpay.
// No SMTP is configured, so sendMail() takes its existing, pre-proven
// "log instead of sending" path -- no real email is ever sent.
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_for_signing';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_signing';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let app;
let server;
let baseUrl;
let DonationModel;
let PaymentEventModel;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  const { createApp } = await import('../../app.js');
  ({ DonationModel } = await import('./donation.model.js'));
  ({ PaymentEventModel } = await import('./paymentEvent.model.js'));
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

const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

function checkoutSignature(orderId, paymentId) {
  return crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
}

function webhookSignature(bodyString) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(bodyString).digest('hex');
}

let seq = 0;
async function createDonation(overrides = {}) {
  seq += 1;
  return DonationModel.create({
    donor: { name: 'Test Donor', email: 'donor@example.test' },
    schemeId: new mongoose.Types.ObjectId(),
    schemeSlug: 'bala-gurukulam',
    amount: 501,
    currency: 'INR',
    razorpayOrderId: `order_test_${seq}_${Date.now()}`,
    status: 'order_created',
    ...overrides,
  });
}

async function verify(payload) {
  const res = await fetch(`${baseUrl}/api/v1/donations/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { res, body: await res.json() };
}

function webhookEventBody({ event, orderId, paymentId = `pay_${Date.now()}`, eventId }) {
  const body = {
    event,
    created_at: Math.floor(Date.now() / 1000),
    payload: { payment: { entity: { order_id: orderId, id: paymentId } } },
  };
  const bodyString = JSON.stringify(body);
  return { bodyString, eventId: eventId || `${event}-${body.created_at}-${Math.random()}` };
}

async function sendWebhook({ bodyString, eventId, signatureOverride }) {
  const res = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signatureOverride !== undefined ? signatureOverride : webhookSignature(bodyString),
      'x-razorpay-event-id': eventId,
    },
    body: bodyString,
  });
  return { res, body: await res.json() };
}

// --- /donations/verify ---

test('a valid payment signature marks the donation paid', async () => {
  const donation = await createDonation();
  const paymentId = 'pay_valid_1';
  const signature = checkoutSignature(donation.razorpayOrderId, paymentId);

  const { res, body } = await verify({ donationId: donation._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: signature });
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'paid_verified');

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'paid_verified');
  assert.equal(stored.razorpayPaymentId, paymentId);
});

test('an invalid signature is rejected and marks the donation verification_failed', async () => {
  const donation = await createDonation();
  const { res, body } = await verify({ donationId: donation._id.toString(), razorpayPaymentId: 'pay_x', razorpaySignature: 'not-a-real-signature' });
  assert.equal(res.status, 400);
  assert.equal(body.code, 'SIGNATURE_INVALID');

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'verification_failed');
});

test('missing donationId/paymentId/signature fields are rejected with a validation error', async () => {
  const { res, body } = await verify({});
  assert.equal(res.status, 422);
  assert.equal(body.code, 'VALIDATION_ERROR');
});

test('an unknown donationId is rejected with 404', async () => {
  const { res, body } = await verify({
    donationId: new mongoose.Types.ObjectId().toString(),
    razorpayPaymentId: 'pay_x',
    razorpaySignature: 'whatever',
  });
  assert.equal(res.status, 404);
  assert.equal(body.code, 'DONATION_NOT_FOUND');
});

test('a donation with no Razorpay order yet cannot be verified', async () => {
  const donation = await createDonation({ razorpayOrderId: undefined, status: 'initiated' });
  const { res, body } = await verify({ donationId: donation._id.toString(), razorpayPaymentId: 'pay_x', razorpaySignature: 'whatever' });
  assert.equal(res.status, 404);
  assert.equal(body.code, 'DONATION_NOT_FOUND');
});

test('a signature valid for donation A cannot verify donation B', async () => {
  const donationA = await createDonation();
  const donationB = await createDonation();
  const paymentId = 'pay_cross';
  const signatureForA = checkoutSignature(donationA.razorpayOrderId, paymentId);

  const { res, body } = await verify({ donationId: donationB._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: signatureForA });
  assert.equal(res.status, 400);
  assert.equal(body.code, 'SIGNATURE_INVALID');

  const storedB = await DonationModel.findById(donationB._id).lean();
  assert.notEqual(storedB.status, 'paid_verified');
  assert.equal(storedB.razorpayPaymentId, undefined);
});

test('FIXED: an already-paid donation cannot be downgraded by a subsequent invalid verification attempt', async () => {
  const donation = await createDonation({ status: 'paid_verified', razorpayPaymentId: 'pay_already_paid' });

  const { res, body } = await verify({ donationId: donation._id.toString(), razorpayPaymentId: 'pay_garbage', razorpaySignature: 'garbage-signature' });
  assert.equal(res.status, 400, 'the response correctly reports this specific signature as invalid');
  assert.equal(body.code, 'SIGNATURE_INVALID');

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'paid_verified', 'the already-paid status must NOT be downgraded');
  assert.equal(stored.razorpayPaymentId, 'pay_already_paid', 'the real payment ID must be untouched');
});

test('verification responses expose only {status}, never donor details', async () => {
  const donation = await createDonation();
  const paymentId = 'pay_no_leak';
  const signature = checkoutSignature(donation.razorpayOrderId, paymentId);
  const { body } = await verify({ donationId: donation._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: signature });
  assert.deepEqual(Object.keys(body.data), ['status']);
});

test('repeated valid verification does not re-trigger an already-sent receipt', async () => {
  const donation = await createDonation({
    receipt: { status: 'sent', receiptNo: 'RCPT-ALREADY-SENT', sentAt: new Date('2026-01-01T00:00:00Z') },
  });
  const paymentId = 'pay_repeat';
  const signature = checkoutSignature(donation.razorpayOrderId, paymentId);

  await verify({ donationId: donation._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: signature });
  await verify({ donationId: donation._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: signature });

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.receipt.status, 'sent');
  assert.equal(stored.receipt.sentAt.toISOString(), '2026-01-01T00:00:00.000Z', 'the already-sent receipt must never be reprocessed');
});

test('FIXED: a valid signature reusing a paymentId already assigned to another donation returns a clean 409, not a raw 500', async () => {
  const donationA = await createDonation();
  const paymentId = 'pay_duplicate_target';
  const sigForA = checkoutSignature(donationA.razorpayOrderId, paymentId);
  const okRes = await verify({ donationId: donationA._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: sigForA });
  assert.equal(okRes.res.status, 200);

  const donationB = await createDonation();
  const statusBeforeDup = (await DonationModel.findById(donationB._id).lean()).status;
  const sigForB = checkoutSignature(donationB.razorpayOrderId, paymentId); // genuinely valid for B's own order
  const dupRes = await verify({ donationId: donationB._id.toString(), razorpayPaymentId: paymentId, razorpaySignature: sigForB });

  assert.equal(dupRes.res.status, 409, 'must be a clean 409 Conflict, not a 500');
  assert.equal(dupRes.body.code, 'PAYMENT_ALREADY_ASSIGNED');
  assert.equal(dupRes.body.message, 'This payment has already been recorded against a different donation.');

  const rawBody = JSON.stringify(dupRes.body);
  assert.doesNotMatch(rawBody, /E11000|MongoServerError|duplicate key|collection:|index:/i, 'no raw MongoDB error details may reach the client');
  assert.doesNotMatch(rawBody, /Test Donor|donor@example\.test/i, 'no donor name or email may appear in the error response');

  const storedB = await DonationModel.findById(donationB._id).lean();
  assert.notEqual(storedB.razorpayPaymentId, paymentId, 'donation B must not end up with donation A\'s payment ID');
  assert.equal(storedB.status, statusBeforeDup, 'donation B\'s status must be completely unchanged by the rejected write');
  assert.equal(storedB.receipt?.status ?? 'pending', 'pending', 'no receipt processing may have been attempted for donation B');

  const storedA = await DonationModel.findById(donationA._id).lean();
  assert.equal(storedA.razorpayPaymentId, paymentId, 'donation A\'s own payment ID must be untouched');
});

// --- /webhooks/razorpay ---

test('a valid webhook signature with payment.captured marks the donation paid and triggers a receipt attempt', async () => {
  const donation = await createDonation();
  const { bodyString, eventId } = webhookEventBody({ event: 'payment.captured', orderId: donation.razorpayOrderId });
  const { res, body } = await sendWebhook({ bodyString, eventId });
  assert.equal(res.status, 200);
  assert.equal(body.data.received, true);

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'paid_verified');
});

test('an invalid webhook signature is rejected and does not change donation status', async () => {
  const donation = await createDonation();
  const { bodyString, eventId } = webhookEventBody({ event: 'payment.captured', orderId: donation.razorpayOrderId });
  const { res, body } = await sendWebhook({ bodyString, eventId, signatureOverride: 'not-a-real-signature' });
  assert.equal(res.status, 400);
  assert.equal(body.code, 'SIGNATURE_INVALID');

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'order_created', 'an unsigned/forged webhook must never change payment status');
});

test('a missing webhook signature header is rejected', async () => {
  const donation = await createDonation();
  const { bodyString, eventId } = webhookEventBody({ event: 'payment.captured', orderId: donation.razorpayOrderId });
  const res = await fetch(`${baseUrl}/api/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-event-id': eventId },
    body: bodyString,
  });
  assert.equal(res.status, 400);
});

test('FIXED: a delayed payment.failed webhook cannot downgrade a donation already confirmed paid_verified', async () => {
  const donation = await createDonation({ status: 'paid_verified', razorpayPaymentId: 'pay_already_captured' });
  const { bodyString, eventId } = webhookEventBody({ event: 'payment.failed', orderId: donation.razorpayOrderId });
  const { res } = await sendWebhook({ bodyString, eventId });
  assert.equal(res.status, 200, 'the webhook itself is still accepted (valid signature)');

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'paid_verified', 'a stale payment.failed must not downgrade an already-paid donation');
});

test('a duplicate webhook event (same event ID) is processed idempotently', async () => {
  const donation = await createDonation();
  const { bodyString, eventId } = webhookEventBody({ event: 'payment.captured', orderId: donation.razorpayOrderId });

  const first = await sendWebhook({ bodyString, eventId });
  assert.equal(first.res.status, 200);
  assert.equal(first.body.data.duplicate, undefined);

  const second = await sendWebhook({ bodyString, eventId });
  assert.equal(second.res.status, 200);
  assert.equal(second.body.data.duplicate, true);

  const eventCount = await PaymentEventModel.countDocuments({ eventId });
  assert.equal(eventCount, 1, 'the event must only be recorded once');
});

// --- Concurrency ---

test('CONCURRENCY: a racing payment.failed webhook can never leave a successfully-captured donation as failed, regardless of arrival order', async () => {
  const donation = await createDonation();
  const captured = webhookEventBody({ event: 'payment.captured', orderId: donation.razorpayOrderId });
  const failed = webhookEventBody({ event: 'payment.failed', orderId: donation.razorpayOrderId });

  await Promise.all([sendWebhook({ bodyString: captured.bodyString, eventId: captured.eventId }), sendWebhook({ bodyString: failed.bodyString, eventId: failed.eventId })]);

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.status, 'paid_verified', 'captured must always win, whichever request\'s write actually lands first in MongoDB');
});
