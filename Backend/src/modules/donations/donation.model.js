import mongoose from 'mongoose';

// LLD Section 6 & 9.2: donations collection + state model.
// initiated -> order_created -> paid_verified -> receipt_sent
//         \-> failed \-> cancelled \-> verification_failed
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
    receiptNo: { type: String, default: null },
  },
  { timestamps: true }
);

export const DonationModel = mongoose.model('Donation', donationSchema);
