import { DonationSchemeModel } from './donationScheme.model.js';
import { DonationModel } from './donation.model.js';
import { PaymentEventModel } from './paymentEvent.model.js';
import { createOrder, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.adapter.js';
import { sendDonationReceiptIfNeeded } from './receipt.service.js';
import { isRazorpayConfigured } from '../../config/env.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { shapePublicScheme } from './publicSchemeShape.js';

// Once a donation reaches one of these, no later event (an invalid/garbage
// /verify signature submitted against an arbitrary donationId, or a delayed
// payment.failed webhook for a stale/earlier payment attempt on the same
// order) may downgrade it. Enforced via the filter on an atomic
// findOneAndUpdate/updateOne -- not a read-then-write in-memory check -- so
// this holds even if a downgrade attempt and the write that reaches
// paid_verified race each other; whichever lands first in MongoDB wins, and
// the second one's filter simply won't match anymore.
const PAID_STATUSES = ['paid_verified', 'receipt_sent'];

// GET /api/v1/public/donation-schemes — LLD 9.1. Active schemes only, sorted
// by admin-controlled displayOrder (Phase D) — inactive schemes are excluded
// from the public list entirely, never shown as if available.
export async function listDonationSchemes(req, res, next) {
  try {
    const schemes = await DonationSchemeModel.find({ status: 'active' }).sort({ displayOrder: 1 }).lean();
    return sendSuccess(res, schemes.map(shapePublicScheme));
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/public/donation-schemes/:slug — Phase D. Unlike the list
// above, this returns a scheme regardless of status (including `status`
// itself in the response) so the detail page can distinguish "doesn't
// exist" (404, unchanged) from "exists but not currently accepting
// donations" (a real, distinct donor-facing state, not a fake 404).
export async function getDonationSchemeBySlug(req, res, next) {
  try {
    const scheme = await DonationSchemeModel.findOne({ slug: req.params.slug }).lean();
    if (!scheme) {
      throw new ApiError(404, 'SCHEME_NOT_FOUND', `Unknown donation scheme "${req.params.slug}".`);
    }
    return sendSuccess(res, shapePublicScheme(scheme));
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/donations/orders — LLD 9.1/9.4: validate donor/scheme/amount,
// create a Razorpay order. India/Razorpay flow only in this increment — USA
// and FCRA routes are content/configuration driven per LLD 9.4, not an API call.
export async function createDonationOrder(req, res, next) {
  try {
    const { schemeSlug, amount, currency = 'INR', donor } = req.body || {};

    if (!schemeSlug || typeof schemeSlug !== 'string') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'schemeSlug is required.', { schemeSlug: 'Required.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'A valid positive amount is required.', { amount: 'Required.' });
    }
    // India/Razorpay only (see this function's header comment) -- the
    // destructuring default above already maps a missing currency to
    // 'INR', so this rejects every explicitly-supplied value that isn't
    // exactly that string (wrong case, unsupported code, wrong type,
    // malicious content, etc.) rather than normalizing or coercing it.
    if (currency !== 'INR') {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Only INR donations are supported.', { currency: 'Must be "INR".' });
    }

    const scheme = await DonationSchemeModel.findOne({ slug: schemeSlug, status: 'active' });
    if (!scheme) {
      throw new ApiError(404, 'SCHEME_NOT_FOUND', `Unknown or inactive donation scheme "${schemeSlug}".`);
    }

    if (!isRazorpayConfigured()) {
      throw new ApiError(
        503,
        'RAZORPAY_NOT_CONFIGURED',
        'Razorpay is not configured on this server yet (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET). No order was created.'
      );
    }

    const donation = await DonationModel.create({
      donor,
      schemeId: scheme._id,
      schemeSlug: scheme.slug,
      amount,
      currency,
      status: 'initiated',
    });

    const order = await createOrder({ amount, currency, receipt: donation._id.toString() });
    donation.razorpayOrderId = order.id;
    donation.status = 'order_created';
    await donation.save();

    return sendSuccess(res, { orderId: order.id, amount, currency, donationId: donation._id.toString() }, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/donations/verify — LLD 9.3: never trust client-reported
// success; verify the checkout signature server-side before marking a
// donation paid.
export async function verifyDonation(req, res, next) {
  try {
    const { donationId, razorpayPaymentId, razorpaySignature } = req.body || {};
    if (!donationId || !razorpayPaymentId || !razorpaySignature) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'donationId, razorpayPaymentId and razorpaySignature are required.');
    }

    const donation = await DonationModel.findById(donationId);
    if (!donation || !donation.razorpayOrderId) {
      throw new ApiError(404, 'DONATION_NOT_FOUND', 'No matching donation/order found.');
    }

    const valid = verifyCheckoutSignature({
      orderId: donation.razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    });

    if (!valid) {
      // Conditional on current status, not the copy read above -- a donation
      // already confirmed paid (by an earlier valid /verify call, or by a
      // webhook that landed in between) must never be downgraded just
      // because this particular request's signature didn't check out.
      await DonationModel.updateOne(
        { _id: donationId, status: { $nin: PAID_STATUSES } },
        { $set: { status: 'verification_failed' } }
      );
      throw new ApiError(400, 'SIGNATURE_INVALID', 'Payment signature verification failed.');
    }

    // A valid signature is always allowed to (re-)confirm payment, even if
    // an earlier attempt on this same order was previously recorded as
    // failed/verification_failed -- a real retry succeeding must still be
    // able to mark the donation paid.
    let updated;
    try {
      updated = await DonationModel.findOneAndUpdate(
        { _id: donationId },
        { $set: { razorpayPaymentId, status: 'paid_verified' } },
        { new: true }
      );
    } catch (err) {
      // razorpayPaymentId carries a unique index (donation.model.js) --
      // this is the only field this specific write can conflict on, but
      // keyPattern is checked explicitly (not just err.code === 11000)
      // so a future, unrelated unique-index conflict on this same
      // operation would still fall through to the generic handler below
      // rather than being mislabeled as a payment conflict.
      if (err.code === 11000 && err.keyPattern?.razorpayPaymentId) {
        throw new ApiError(409, 'PAYMENT_ALREADY_ASSIGNED', 'This payment has already been recorded against a different donation.');
      }
      throw err;
    }

    // Best-effort, never lets a receipt-send problem affect this response —
    // the payment is already verified regardless of what happens next.
    try {
      await sendDonationReceiptIfNeeded(updated._id);
    } catch (receiptErr) {
      console.error('[donations] receipt attempt threw unexpectedly:', receiptErr.message);
    }

    return sendSuccess(res, { status: updated.status });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/webhooks/razorpay — LLD 9.3: verify webhook signature, process
// idempotently via the unique (provider, eventId) index on paymentEvents.
export async function razorpayWebhook(req, res, next) {
  try {
    const signature = req.get('x-razorpay-signature');
    const valid = verifyWebhookSignature({ rawBody: req.rawBody, signature });
    if (!valid) {
      throw new ApiError(400, 'SIGNATURE_INVALID', 'Webhook signature verification failed.');
    }

    const event = req.body;
    const eventId = req.get('x-razorpay-event-id') || `${event.event}-${event.created_at}`;

    try {
      await PaymentEventModel.create({ provider: 'razorpay', eventId, eventType: event.event });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        // Already processed this exact event — idempotent no-op.
        return sendSuccess(res, { received: true, duplicate: true });
      }
      throw dupErr;
    }

    const orderId = event.payload?.payment?.entity?.order_id;
    if (orderId) {
      if (event.event === 'payment.captured') {
        // Always allowed to confirm, regardless of current status -- a
        // later successful attempt must still be able to mark the donation
        // paid even if an earlier attempt on the same order was already
        // recorded as failed.
        const donation = await DonationModel.findOneAndUpdate(
          { razorpayOrderId: orderId },
          { $set: { status: 'paid_verified' } },
          { new: true }
        );
        if (donation) {
          try {
            await sendDonationReceiptIfNeeded(donation._id);
          } catch (receiptErr) {
            console.error('[donations] receipt attempt threw unexpectedly:', receiptErr.message);
          }
        }
      } else if (event.event === 'payment.failed') {
        // Conditional: a delayed payment.failed for a stale/earlier attempt
        // must never downgrade a donation a later attempt (or /verify) has
        // already confirmed paid. The filter is evaluated against whatever
        // is in MongoDB at write time, not a value read earlier, so this is
        // race-safe against a concurrent payment.captured/verify landing
        // first.
        await DonationModel.updateOne(
          { razorpayOrderId: orderId, status: { $nin: PAID_STATUSES } },
          { $set: { status: 'failed' } }
        );
      }
    }

    return sendSuccess(res, { received: true });
  } catch (err) {
    next(err);
  }
}
