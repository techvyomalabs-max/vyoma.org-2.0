import mongoose from 'mongoose';

// LLD Section 6 & 9.3: paymentEvents collection — idempotent webhook
// processing via the unique (provider, eventId) index.
const paymentEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    donationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Donation', default: null },
    processedAt: { type: Date, default: Date.now },
    status: { type: String, default: 'processed' },
  },
  { timestamps: true }
);

paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export const PaymentEventModel = mongoose.model('PaymentEvent', paymentEventSchema);
