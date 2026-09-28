import mongoose from 'mongoose';

// LLD Section 6: donationSchemes collection.
const donationSchemeSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    note: { type: String, default: null },
    amountOptions: { type: [Number], default: [1000, 2500, 5000, 10000] },
    paymentMode: { type: String, default: 'razorpay' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    // Phase D: admin-controlled public ordering. Seeded to match the exact
    // pre-existing array order in seedData/donate.js (see runSeed.js) so the
    // migration changes nothing visible until an admin actually reorders.
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const DonationSchemeModel = mongoose.model('DonationScheme', donationSchemeSchema);
