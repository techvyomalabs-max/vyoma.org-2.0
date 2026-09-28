import mongoose from 'mongoose';

// LLD Section 6/7: contentItems, generalized here as one flexible
// per-`type` document (HLD's own rationale for choosing MongoDB: "flexible
// content... data model"). `data` mirrors whatever shape the corresponding
// Frontend/lib/mockData/*.js module used to export, so the frontend needs no
// per-page changes when it switches from mock data to this API.
//
// Phase 2 Week 2 (CMS admin): `data` is the live PUBLISHED payload — the only
// thing the public reader ever returns. `draftData` holds an edited-but-not-
// published version and is never exposed publicly. `status` gates public
// visibility: every Phase 1 document was created without this field, and its
// Mongoose default ('published') only applies on document construction, not
// on a lean() read of a pre-existing document missing the field — so the
// public query (content.controller.js) explicitly treats a missing/undefined
// status as published too, to avoid silently hiding every pre-existing page.
// `data` is intentionally not required: a brand-new type can exist as a pure
// draft (status: 'draft', data: null) before its first publish, and the
// public query's status filter keeps it invisible regardless.
const contentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    draftData: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
  },
  { timestamps: true }
);

export const ContentModel = mongoose.model('Content', contentSchema);
