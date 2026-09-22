import mongoose from 'mongoose';

// Explicit schema, not a generic key/value store — per Week 2 instruction,
// this must not become an arbitrary settings bag, and must never be able to
// hold a secret/credential (there is deliberately no field shape here that
// could hold one; JWT/Razorpay/SMTP/AWS/OAuth secrets live only in env vars,
// see src/config/env.js, never in this collection). A singleton document:
// every read/write in setting.controller.js queries with an empty filter, so
// the same one row is always the one found/updated.
const siteSettingsSchema = new mongoose.Schema(
  {
    contactInboxEmail: { type: String, default: null },
    socialLinks: {
      linkedin: { type: String, default: null },
      x: { type: String, default: null },
      youtube: { type: String, default: null },
      instagram: { type: String, default: null },
      facebook: { type: String, default: null },
    },
    donationBankDetails: {
      indiaAccountName: { type: String, default: null },
      indiaBankName: { type: String, default: null },
      fcraAccountName: { type: String, default: null },
      fcraBankName: { type: String, default: null },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const SiteSettingsModel = mongoose.model('SiteSettings', siteSettingsSchema);

// The explicit allowlist of top-level keys a PUT may touch — enforced in
// settings.controller.js in addition to (not instead of) the schema itself,
// so an unrecognized key is a clear 422, not a silently-dropped no-op.
export const ALLOWED_TOP_LEVEL_KEYS = ['contactInboxEmail', 'socialLinks', 'donationBankDetails', 'maintenanceMode'];
