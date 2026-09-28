import mongoose from 'mongoose';

// Separate bounded collection, not an array field on BlogPost — same
// rationale as contentRevision.model.js (avoids unbounded document growth).
// Keyed by `postId` instead of a `type` string, since each blog post is its
// own document rather than one document per content type. Retention is
// enforced in blog.admin.controller.js (pruneOldRevisions): each postId
// keeps at most MAX_REVISIONS_PER_POST rows, oldest deleted first.
const blogPostRevisionSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    version: { type: Number, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    action: { type: String, enum: ['publish', 'restore'], required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    publishedByEmail: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

blogPostRevisionSchema.index({ postId: 1, version: -1 });

export const BlogPostRevisionModel = mongoose.model('BlogPostRevision', blogPostRevisionSchema);
