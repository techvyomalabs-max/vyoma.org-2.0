import mongoose from 'mongoose';

// LLD Section 6 & 9.2: donations collection + state model.
// initiated -> order_created -> paid_verified
//         \-> failed \-> cancelled \-> verification_failed
//
// Week 4 Decision W4-4: `receipt_sent` is no longer a payment-status value —
// payment verification and receipt-email delivery are deliberately separate
// concerns. A donation that reaches `paid_verified` stays `paid_verified`
// forever, even if the receipt email later fails — email delivery must never
// be able to make a genuinely verified payment look unverified. Receipt
// delivery state lives entirely in the `receipt` sub-document below, tracked
// by receipt.service.js via an atomic conditional update (the idempotency
// claim point — see that file), independent of this status field.
const donationSchema = new mongoose.Schema(
  {
    donor: {
      name: String,
      email: String,
    },
    schemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'DonationScheme', required: true },
    schemeSlug: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, unique: true, sparse: true },
    razorpayPaymentId: { type: String, unique: true, sparse: true },
    status: {
      type: String,
      enum: ['initiated', 'order_created', 'paid_verified', 'receipt_sent', 'failed', 'cancelled', 'verification_failed'],
      default: 'initiated',
    },
    receipt: {
      status: { type: String, enum: ['pending', 'processing', 'sent', 'failed'], default: 'pending' },
      receiptNo: { type: String, default: null },
      claimedAt: { type: Date, default: null },
      sentAt: { type: Date, default: null },
      lastAttemptAt: { type: Date, default: null },
      failureReason: { type: String, default: null }, // sanitized message only — never an error object, never credentials
    },
  },
  { timestamps: true }
);

export const DonationModel = mongoose.model('Donation', donationSchema);
