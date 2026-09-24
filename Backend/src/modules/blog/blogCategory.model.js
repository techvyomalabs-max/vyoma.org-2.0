import mongoose from 'mongoose';

// Phase E Decision D-BLOG5: a small admin-managed list, not a fixed enum and
// not uncontrolled free text. Deliberately minimal — name only, no delete
// endpoint (same "no delete, ever" convention as DonationSchemeModel), since
// removing a category out from under posts that reference it would leave
// them pointing at a name that no longer exists in the managed list. Rename
// is supported and cascades onto every post using the old name (see
// blog.admin.controller.js renameCategoryAdmin).
const blogCategorySchema = new mongoose.Schema(
  { name: { type: String, required: true, unique: true, trim: true } },
  { timestamps: true }
);

export const BlogCategoryModel = mongoose.model('BlogCategory', blogCategorySchema);
