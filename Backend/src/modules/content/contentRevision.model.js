import mongoose from 'mongoose';

// Separate collection, not an array field on Content — per Phase 2 Week 2
// instruction, an unbounded array embedded in the main Content document
// would grow the document indefinitely and eventually hit MongoDB's 16MB
// document size limit for a frequently-republished page. One row per
// revision here instead, with bounded retention enforced in
// content.admin.controller.js (pruneOldRevisions): each contentType keeps at
// most MAX_REVISIONS_PER_TYPE rows, oldest deleted first, right after a new
// one is inserted.
const contentRevisionSchema = new mongoose.Schema(
  {
    contentType: { type: String, required: true, index: true },
    version: { type: Number, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    // Task 7D.33 — 'migration' added for a scripted restoration
    // (scripts/wordpress/import/migrationRevision.mjs) that writes directly
    // via ContentModel, bypassing the admin publish/restore flow below --
    // kept distinct from 'publish'/'restore' so the revision history clearly
    // shows which entries came from a human admin action versus an
    // automated migration script. Purely additive: every existing row's
    // action value is already one of the original two and is unaffected.
    action: { type: String, enum: ['publish', 'restore', 'migration'], required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedByEmail: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

contentRevisionSchema.index({ contentType: 1, version: -1 });

export const ContentRevisionModel = mongoose.model('ContentRevision', contentRevisionSchema);
