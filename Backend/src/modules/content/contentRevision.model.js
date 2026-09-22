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
    action: { type: String, enum: ['publish', 'restore'], required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedByEmail: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

contentRevisionSchema.index({ contentType: 1, version: -1 });

export const ContentRevisionModel = mongoose.model('ContentRevision', contentRevisionSchema);
