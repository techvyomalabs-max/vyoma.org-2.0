import { DonationModel } from './donation.model.js';
import { sendMail } from '../../services/mailer.js';
import { recordAudit } from '../audit/audit.service.js';

// Week 4 Decision W4-4. Both `verifyDonation` (browser path) and
// `razorpayWebhook` (server path) call this after a donation reaches
// `paid_verified` — this function, not either caller, is the idempotency
// boundary. The atomic conditional update below is the single claim point:
// it only succeeds if `receipt.status` is currently pending/failed/absent,
// so a second near-simultaneous caller (webhook firing moments after the
// browser's /verify, or vice versa — the specific race this exists for)
// finds no matching document and does nothing. Because `failed` is an
// allowed prior state to claim from, a previously-failed attempt can be
// retried later (e.g. by a future admin "resend receipt" action) without
// ever touching the payment's own `status` field.
export async function sendDonationReceiptIfNeeded(donationId) {
  const now = new Date();
  const claimed = await DonationModel.findOneAndUpdate(
    {
      _id: donationId,
      status: 'paid_verified',
      $or: [{ receipt: { $exists: false } }, { 'receipt.status': { $in: ['pending', 'failed'] } }],
    },
    { $set: { 'receipt.status': 'processing', 'receipt.claimedAt': now, 'receipt.lastAttemptAt': now } },
    { new: true }
  );

  if (!claimed) return { attempted: false }; // not verified yet, or another caller already claimed/sent it

  const receiptNo = claimed.receipt?.receiptNo || `RCPT-${claimed._id.toString().slice(-8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  // `sendMail` (Week 3) deliberately never throws — unconfigured SMTP and a
  // real transport failure both come back as a normal `{sent, reason}`
  // return value, not an exception. The try/catch below only exists for a
  // genuinely unexpected throw (e.g. this function's own precondition
  // check); the real success/failure signal is `result.sent`, checked
  // explicitly — relying on try/catch alone here would silently treat
  // "SMTP not configured, logged instead of sending" as a successful send,
  // which is exactly the kind of false-positive this field exists to avoid.
  try {
    if (!claimed.donor?.email) {
      await markFailed(donationId, 'No donor email on file for this donation.');
      return { attempted: true, sent: false };
    }

    const result = await sendMail({
      to: claimed.donor.email,
      subject: 'Your donation receipt — Vyoma Linguistic Labs Foundation',
      html: `<p>Namaste ${claimed.donor.name || ''},</p>
             <p>Thank you for your donation of ${claimed.currency} ${claimed.amount} to ${claimed.schemeSlug}.</p>
             <p>Receipt number: <strong>${receiptNo}</strong></p>`,
    });

    if (!result.sent) {
      await markFailed(donationId, result.reason || 'Send did not report success.');
      return { attempted: true, sent: false };
    }

    await DonationModel.updateOne(
      { _id: donationId },
      { $set: { 'receipt.status': 'sent', 'receipt.sentAt': new Date(), 'receipt.receiptNo': receiptNo } }
    );
    await recordAudit({ action: 'donations.receipt_sent', targetType: 'Donation', targetId: donationId, details: { receiptNo } });
    return { attempted: true, sent: true };
  } catch (err) {
    // Defense in depth for a truly unexpected throw — still never touches
    // the payment's `status`, only `receipt.*`.
    await markFailed(donationId, sanitizeFailureReason(err));
    return { attempted: true, sent: false };
  }
}

async function markFailed(donationId, reason) {
  const sanitized = typeof reason === 'string' ? reason : sanitizeFailureReason(new Error(String(reason)));
  await DonationModel.updateOne({ _id: donationId }, { $set: { 'receipt.status': 'failed', 'receipt.failureReason': sanitized } });
  await recordAudit({ action: 'donations.receipt_failed', targetType: 'Donation', targetId: donationId, details: { reason: sanitized } });
}

// Only the error message, never the error object or any transport config —
// matches the same rule mailer.js already follows (Week 3): a send failure
// message never contains SMTP credentials.
function sanitizeFailureReason(err) {
  const message = String(err?.message || 'Unknown error');
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}
