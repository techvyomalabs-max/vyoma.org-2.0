import mongoose from 'mongoose';

// Week 3 Decision W3-3: exact-path matching only for launch — no
// wildcard/prefix rules. `fromPath` is unique so there is exactly one
// destination per legacy path, with no ambiguity about which rule wins.
const redirectSchema = new mongoose.Schema(
  {
    fromPath: { type: String, required: true, unique: true, trim: true }, // e.g. "/old-donate-page"
    toPath: { type: String, required: true, trim: true }, // e.g. "/donate" or an absolute https:// URL
    statusCode: { type: Number, enum: [301, 302], default: 301 },
    notes: { type: String, default: null },
  },
  { timestamps: true }
);

export const RedirectModel = mongoose.model('Redirect', redirectSchema);
