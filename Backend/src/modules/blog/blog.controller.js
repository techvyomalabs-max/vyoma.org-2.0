import { BlogPostModel } from './blogPost.model.js';
import { sendSuccess, ApiError } from '../../utils/apiResponse.js';
import { env } from '../../config/env.js';

// Flattens {slug, status, publishedAt, data|draftData} into the one shape
// the public frontend ever sees — draftData itself, and the distinction
// between it and `data`, is never exposed publicly, even in preview mode.
function presentPublic(doc, viewData) {
  return {
    _id: doc._id,
    slug: doc.slug,
    status: doc.status,
    publishedAt: doc.publishedAt,
    title: viewData?.title ?? '',
    excerpt: viewData?.excerpt ?? '',
    body: viewData?.body ?? '',
    featuredImage: viewData?.featuredImage ?? null,
    author: viewData?.author ?? '',
    categories: viewData?.categories ?? [],
    tags: viewData?.tags ?? [],
    seo: viewData?.seo ?? {},
  };
}

// GET /api/v1/public/blog?category=&tag=&page=&limit= — published posts
// only, newest first.
export async function listPostsPublic(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 9));
    const filter = { status: 'published' };
    if (req.query.category) filter['data.categories'] = req.query.category;
    if (req.query.tag) filter['data.tags'] = req.query.tag;

    const [docs, total] = await Promise.all([
      BlogPostModel.find(filter).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      BlogPostModel.countDocuments(filter),
    ]);
    const items = docs.map((d) => presentPublic(d, d.data));
    return sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/public/blog/categories — distinct category names actually in
// use on published posts (not the full admin-managed list, which may
// contain categories no published post uses yet) — the public filter UI
// only needs options that will actually return results.
export async function listCategoriesPublic(req, res, next) {
  try {
    const categories = await BlogPostModel.distinct('data.categories', { status: 'published' });
    categories.sort();
    return sendSuccess(res, categories);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/public/blog/:slug — `?previewSecret=` mirrors
// content.controller.js's preview gate exactly: the only way a caller ever
// sees draftData, or a post that has never been published at all.
export async function getPostBySlugPublic(req, res, next) {
  try {
    const { slug } = req.params;
    const previewing = !!env.previewSecret && req.query.previewSecret === env.previewSecret;

    const doc = previewing
      ? await BlogPostModel.findOne({ slug }).lean()
      : await BlogPostModel.findOne({ slug, status: 'published' }).lean();

    const viewData = previewing ? doc?.draftData ?? doc?.data : doc?.data;
    if (!doc || viewData == null) {
      throw new ApiError(404, 'POST_NOT_FOUND', `No published post for slug "${slug}".`);
    }
    return sendSuccess(res, presentPublic(doc, viewData));
  } catch (err) {
    next(err);
  }
}
