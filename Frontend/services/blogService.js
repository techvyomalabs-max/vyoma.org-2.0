import { draftMode } from 'next/headers';
import { apiRequest, apiRequestWithMeta } from './apiClient';

// Phase E: Blog moved off the generic Content model onto its own dedicated
// model/API (see Backend/src/modules/blog). This now calls /public/blog
// directly instead of getPublicContent('blog', ...).
const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;

function mockPost(p) {
  return {
    _id: p.slug,
    slug: p.slug,
    status: 'published',
    publishedAt: p.publishedAt,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body,
    featuredImage: null,
    author: p.author,
    categories: p.categories,
    tags: [],
    seo: {},
  };
}

// Same gotcha documented in contentService.js: draftMode() throws outside a
// real request (e.g. generateStaticParams at build time) — treated as "not
// previewing" there, since there's no request to preview at build time.
async function previewSecretParam() {
  let isEnabled = false;
  try {
    isEnabled = (await draftMode()).isEnabled;
  } catch {
    isEnabled = false;
  }
  const secret = process.env.DRAFT_MODE_SECRET;
  return isEnabled && secret ? secret : null;
}

export async function getBlogPosts({ category, tag, page = 1, limit = 9 } = {}) {
  if (USE_MOCK) {
    const mod = await import('@/lib/mockData/blog');
    let items = mod.BLOG_POSTS.map(mockPost).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    if (category) items = items.filter((p) => p.categories.includes(category));
    if (tag) items = items.filter((p) => p.tags.includes(tag));
    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), meta: { page, limit, total } };
  }

  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (tag) params.set('tag', tag);
  params.set('page', String(page));
  params.set('limit', String(limit));
  const preview = await previewSecretParam();
  if (preview) params.set('previewSecret', preview);

  const { data, meta } = await apiRequestWithMeta(`/public/blog?${params.toString()}`);
  return { items: data, meta };
}

export async function getBlogCategories() {
  if (USE_MOCK) {
    const mod = await import('@/lib/mockData/blog');
    return [...new Set(mod.BLOG_POSTS.flatMap((p) => p.categories))].sort();
  }
  return apiRequest('/public/blog/categories');
}

export async function getBlogPost(slug) {
  if (USE_MOCK) {
    const mod = await import('@/lib/mockData/blog');
    const found = mod.BLOG_POSTS.find((p) => p.slug === slug);
    return found ? mockPost(found) : null;
  }

  const preview = await previewSecretParam();
  const suffix = preview ? `?previewSecret=${encodeURIComponent(preview)}` : '';
  try {
    return await apiRequest(`/public/blog/${encodeURIComponent(slug)}${suffix}`);
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}
