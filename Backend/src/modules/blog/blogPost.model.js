import mongoose from 'mongoose';

// Phase E. Deliberately mirrors Content's {data, draftData, status} shape
// (see ../content/content.model.js) rather than typed top-level content
// fields — Decision: "prefer consistency with the existing Content revision
// approach unless there is a strong reason otherwise." `data` holds the
// published snapshot { title, excerpt, body, featuredImage, author,
// categories, tags, seo }; `draftData` holds a pending edit in the same
// shape, exactly like every other structured CMS page. `slug` and
// `publishedAt` sit outside that snapshot because they have their own
// lifecycle rules that don't belong to "draft vs published content": slug
// locks the moment `publishedAt` is first set (see blog.admin.controller.js
// updateSlugAdmin), and publishedAt itself is set once and never moves,
// even across later unpublish/republish or restore cycles.
const blogPostSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, index: true },
    data: { type: mongoose.Schema.Types.Mixed, default: null },
    draftData: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['draft', 'published'], default: 'draft', index: true },
    publishedAt: { type: Date, default: null },
  },
  // minimize: false — Mongoose's default (true) strips any key whose value
  // is a plain empty object ({}) out of a Mixed field on every save. `seo`
  // legitimately has no fields set on most posts, so the default silently
  // dropped it from `data`/`draftData` on every draft save and publish,
  // changing their shape (not their meaning) each time. See the
  // investigation this fix came out of for the reproduction and the exact
  // two call sites affected (blog.admin.controller.js's updateDraftAdmin
  // and publishPostAdmin, both of which call doc.save() on this model).
  { timestamps: true, minimize: false }
);

// Cheap at this scale (a few dozen posts) and correctness-preserving for the
// public category/tag filters, which query these paths directly.
blogPostSchema.index({ 'data.categories': 1 });
blogPostSchema.index({ 'data.tags': 1 });

export const BlogPostModel = mongoose.model('BlogPost', blogPostSchema);
