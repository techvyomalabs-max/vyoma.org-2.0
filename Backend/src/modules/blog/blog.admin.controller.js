import mongoose from 'mongoose';
import { BlogPostModel } from './blogPost.model.js';
import { BlogPostRevisionModel } from './blogPostRevision.model.js';
import { BlogCategoryModel } from './blogCategory.model.js';
import { sanitizeBlogBody } from './sanitizeBody.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { recordAudit } from '../audit/audit.service.js';

const MAX_REVISIONS_PER_POST = 20;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EDITABLE_FIELDS = ['title', 'excerpt', 'body', 'featuredImage', 'author', 'categories', 'tags', 'seo'];

function actorOf(req) {
  return { _id: req.user.id, email: req.user.email };
}

function validateId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid post id format.');
}

// Only the known content fields ever reach draftData — status/slug/
// publishedAt each have their own dedicated operation below, so a client
// can never smuggle a status flip or slug change through the draft-save
// body. `body` is sanitized here, at the single point where rich-text HTML
// ever enters the database — publish/restore only ever promote already-
// sanitized draftData, never re-accept raw client input.
function sanitizeDraftInput(input) {
  const out = {};
  for (const key of EDITABLE_FIELDS) {
    if (input[key] === undefined) continue;
    out[key] = input[key];
  }
  if (out.categories !== undefined && (!Array.isArray(out.categories) || !out.categories.every((c) => typeof c === 'string'))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'categories must be an array of strings.', { categories: 'Invalid.' });
  }
  if (out.tags !== undefined && (!Array.isArray(out.tags) || !out.tags.every((t) => typeof t === 'string'))) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'tags must be an array of strings.', { tags: 'Invalid.' });
  }
  if (out.body !== undefined) out.body = sanitizeBlogBody(out.body);
  return out;
}

async function pruneOldRevisions(postId) {
  const excessIds = await BlogPostRevisionModel.find({ postId })
    .sort({ version: -1 })
    .skip(MAX_REVISIONS_PER_POST)
    .select('_id')
    .lean();
  if (excessIds.length) {
    await BlogPostRevisionModel.deleteMany({ _id: { $in: excessIds.map((d) => d._id) } });
  }
}

// GET /api/v1/admin/blog — every post, any status (the public list only
// ever shows status: 'published').
export async function listPostsAdmin(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter['data.categories'] = req.query.category;
    if (req.query.tag) filter['data.tags'] = req.query.tag;

    const [items, total] = await Promise.all([
      BlogPostModel.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BlogPostModel.countDocuments(filter),
    ]);
    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/blog/:id — full admin view (published + pending draft +
// status), same shape as content.admin.controller.js's getAdminContent.
export async function getPostAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const doc = await BlogPostModel.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/blog — body { slug, title }. Slug uniqueness is
// enforced now, while it's still free to fix; format/uniqueness is the only
// thing checked immediately — everything else can stay blank in the
// draft until the admin fills it in and publishes.
export async function createPostAdmin(req, res, next) {
  try {
    const { slug, title } = req.body || {};
    const fieldErrors = {};
    if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      fieldErrors.slug = 'Required, lowercase letters/numbers/hyphens only (e.g. "my-first-post").';
    }
    if (!title || typeof title !== 'string' || !title.trim()) fieldErrors.title = 'Title is required.';
    if (Object.keys(fieldErrors).length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    let doc;
    try {
      doc = await BlogPostModel.create({
        slug: slug.trim(),
        status: 'draft',
        data: null,
        draftData: { title: title.trim(), excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} },
      });
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, 'SLUG_IN_USE', `A post with slug "${slug}" already exists.`);
      throw err;
    }

    await recordAudit({ actor: actorOf(req), action: 'blogPost.created', targetType: 'BlogPost', targetId: doc._id, details: { slug: doc.slug }, req });
    return sendSuccess(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/blog/:id — body is a partial patch of the editable
// content fields. Mirrors content.admin.controller.js's upsertDraftContent:
// only ever writes draftData, never the live `data` — editing never
// affects what the public API serves until an explicit publish.
export async function updateDraftAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const doc = await BlogPostModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');

    const patch = sanitizeDraftInput(req.body || {});
    const base = doc.draftData ?? doc.data ?? {};
    doc.draftData = { ...base, ...patch };
    await doc.save();

    await recordAudit({ actor: actorOf(req), action: 'blogPost.draft_saved', targetType: 'BlogPost', targetId: doc._id, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/blog/:id/slug — Decision D-BLOG3: allowed only before
// the first publish (publishedAt still null). Once published, there is
// deliberately no code path that can change it — a rename after real
// traffic/links exist needs a separate, redirect-aware operation, not a
// silent edit here.
export async function updateSlugAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const doc = await BlogPostModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');
    if (doc.publishedAt) {
      throw new ApiError(409, 'SLUG_LOCKED', 'This post has already been published once — its slug can no longer be changed here.');
    }

    const { slug } = req.body || {};
    if (!slug || typeof slug !== 'string' || !SLUG_RE.test(slug)) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Slug must be lowercase letters/numbers/hyphens only.', { slug: 'Invalid.' });
    }

    doc.slug = slug.trim();
    try {
      await doc.save();
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, 'SLUG_IN_USE', `A post with slug "${slug}" already exists.`);
      throw err;
    }

    await recordAudit({ actor: actorOf(req), action: 'blogPost.slug_changed', targetType: 'BlogPost', targetId: doc._id, details: { slug: doc.slug }, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/blog/:id/publish — moves draftData -> the live `data`,
// flips status, sets publishedAt only the first time, and snapshots a
// bounded revision row.
export async function publishPostAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const doc = await BlogPostModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');
    if (doc.draftData == null && doc.data == null) {
      throw new ApiError(400, 'NOTHING_TO_PUBLISH', 'There is no draft or existing content to publish.');
    }

    const nextData = doc.draftData != null ? doc.draftData : doc.data;
    const fieldErrors = {};
    if (!nextData.title || !String(nextData.title).trim()) fieldErrors.title = 'Title is required to publish.';
    if (!nextData.body || !String(nextData.body).trim()) fieldErrors.body = 'Body is required to publish.';
    if (Object.keys(fieldErrors).length) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', fieldErrors);
    }

    const lastRevision = await BlogPostRevisionModel.findOne({ postId: doc._id }).sort({ version: -1 }).lean();
    const nextVersion = (lastRevision?.version || 0) + 1;

    doc.data = nextData;
    doc.draftData = null;
    doc.status = 'published';
    if (!doc.publishedAt) doc.publishedAt = new Date();
    await doc.save();

    await BlogPostRevisionModel.create({
      postId: doc._id,
      version: nextVersion,
      data: nextData,
      action: 'publish',
      publishedBy: req.user.id,
      publishedByEmail: req.user.email,
    });
    await pruneOldRevisions(doc._id);

    await recordAudit({ actor: actorOf(req), action: 'blogPost.published', targetType: 'BlogPost', targetId: doc._id, details: { version: nextVersion }, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/blog/:id/unpublish — hides the post from the public
// API (status: 'draft') without discarding `data` or `publishedAt`.
export async function unpublishPostAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const doc = await BlogPostModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');
    doc.status = 'draft';
    await doc.save();
    await recordAudit({ actor: actorOf(req), action: 'blogPost.unpublished', targetType: 'BlogPost', targetId: doc._id, req });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/blog/:id/revisions
export async function listRevisionsAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const revisions = await BlogPostRevisionModel.find({ postId: req.params.id }).sort({ version: -1 }).lean();
    return sendSuccess(res, revisions);
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/admin/blog/:id/revisions/restore — body { revisionId }. Adds
// a NEW revision (action: 'restore') rather than rewriting history.
export async function restoreRevisionAdmin(req, res, next) {
  try {
    validateId(req.params.id);
    const { revisionId } = req.body || {};
    if (!revisionId) throw new ApiError(422, 'VALIDATION_ERROR', 'revisionId is required.', { revisionId: 'Required.' });

    const revision = await BlogPostRevisionModel.findOne({ _id: revisionId, postId: req.params.id }).lean();
    if (!revision) throw new ApiError(404, 'REVISION_NOT_FOUND', 'No matching revision for this post.');

    const doc = await BlogPostModel.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'POST_NOT_FOUND', 'Blog post not found.');

    const lastRevision = await BlogPostRevisionModel.findOne({ postId: doc._id }).sort({ version: -1 }).lean();
    const nextVersion = (lastRevision?.version || 0) + 1;

    doc.data = revision.data;
    doc.draftData = null;
    doc.status = 'published';
    await doc.save();

    await BlogPostRevisionModel.create({
      postId: doc._id,
      version: nextVersion,
      data: revision.data,
      action: 'restore',
      publishedBy: req.user.id,
      publishedByEmail: req.user.email,
      details: { restoredFromRevisionId: String(revision._id), restoredFromVersion: revision.version },
    });
    await pruneOldRevisions(doc._id);

    await recordAudit({
      actor: actorOf(req),
      action: 'blogPost.restored',
      targetType: 'BlogPost',
      targetId: doc._id,
      details: { restoredFromVersion: revision.version, newVersion: nextVersion },
      req,
    });
    return sendSuccess(res, doc);
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Categories (Decision D-BLOG5): small admin-managed list. No delete
// endpoint, ever — same convention as DonationSchemeModel.
// ---------------------------------------------------------------------------

export async function listCategoriesAdmin(req, res, next) {
  try {
    const categories = await BlogCategoryModel.find().sort({ name: 1 }).lean();
    return sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
}

export async function createCategoryAdmin(req, res, next) {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Name is required.', { name: 'Required.' });
    }
    let doc;
    try {
      doc = await BlogCategoryModel.create({ name: name.trim() });
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, 'CATEGORY_IN_USE', `A category named "${name}" already exists.`);
      throw err;
    }
    await recordAudit({ actor: actorOf(req), action: 'blogCategory.created', targetType: 'BlogCategory', targetId: doc._id, details: { name: doc.name }, req });
    return sendSuccess(res, doc, { status: 201 });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/admin/blog/categories/:id — renames the managed entry AND
// cascades the new name onto every post (published `data` and any pending
// `draftData`) currently tagged with the old one, so no post is ever left
// pointing at a category name that no longer appears in the managed list.
export async function renameCategoryAdmin(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(422, 'VALIDATION_ERROR', 'Invalid category id format.');
    const category = await BlogCategoryModel.findById(req.params.id);
    if (!category) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');

    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Name is required.', { name: 'Required.' });
    }
    const nextName = name.trim();
    const oldName = category.name;
    if (nextName === oldName) return sendSuccess(res, category);

    category.name = nextName;
    try {
      await category.save();
    } catch (err) {
      if (err.code === 11000) throw new ApiError(409, 'CATEGORY_IN_USE', `A category named "${nextName}" already exists.`);
      throw err;
    }

    await BlogPostModel.updateMany(
      { 'data.categories': oldName },
      { $set: { 'data.categories.$[elem]': nextName } },
      { arrayFilters: [{ elem: oldName }] }
    );
    await BlogPostModel.updateMany(
      { 'draftData.categories': oldName },
      { $set: { 'draftData.categories.$[elem]': nextName } },
      { arrayFilters: [{ elem: oldName }] }
    );

    await recordAudit({
      actor: actorOf(req),
      action: 'blogCategory.renamed',
      targetType: 'BlogCategory',
      targetId: category._id,
      details: { from: oldName, to: nextName },
      req,
    });
    return sendSuccess(res, category);
  } catch (err) {
    next(err);
  }
}
