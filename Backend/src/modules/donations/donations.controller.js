import { DonationSchemeModel } from './donationScheme.model.js';
import { DonationModel } from './donation.model.js';
import { PaymentEventModel } from './paymentEvent.model.js';
import { createOrder, verifyCheckoutSignature, verifyWebhookSignature } from './razorpay.adapter.js';
import { sendDonationReceiptIfNeeded } from './receipt.service.js';
import { isRazorpayConfigured } from '../../config/env.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';

// GET /api/v1/public/donation-schemes — LLD 9.1.
export async function listDonationSchemes(req, res, next) {
  try {
    const schemes = await DonationSchemeModel.find({ status: 'active' }).sort({ createdAt: 1 }).lean();
    const shaped = schemes.map((s) => ({ slug: s.slug, name: s.name, body: s.description, note: s.note || undefined }));
    return sendSuccess(res, shaped);
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
      donation.status = 'verification_failed';
      await donation.save();
      throw new ApiError(400, 'SIGNATURE_INVALID', 'Payment signature verification failed.');
    }

    donation.razorpayPaymentId = razorpayPaymentId;
    donation.status = 'paid_verified';
    await donation.save();

    // Best-effort, never lets a receipt-send problem affect this response —
    // the payment is already verified regardless of what happens next.
    try {
      await sendDonationReceiptIfNeeded(donation._id);
    } catch (receiptErr) {
      console.error('[donations] receipt attempt threw unexpectedly:', receiptErr.message);
    }

    return sendSuccess(res, { status: donation.status });
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
      const donation = await DonationModel.findOne({ razorpayOrderId: orderId });
      if (donation) {
        if (event.event === 'payment.captured') donation.status = 'paid_verified';
        else if (event.event === 'payment.failed') donation.status = 'failed';
        await donation.save();

        if (event.event === 'payment.captured') {
          try {
            await sendDonationReceiptIfNeeded(donation._id);
          } catch (receiptErr) {
            console.error('[donations] receipt attempt threw unexpectedly:', receiptErr.message);
          }
        }
      }
    }

    return sendSuccess(res, { received: true });
  } catch (err) {
    next(err);
  }
}
