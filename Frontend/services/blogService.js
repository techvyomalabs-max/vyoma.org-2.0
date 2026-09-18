import { getPublicContent } from './contentService';

// contentItems of type "post" (LLD Section 6/7). getBlogPost has no mock
// detail data yet — the source design system never built a post-detail view
// (see Phase 1: /media/blog/[slug] has no source component).
export async function getBlogPosts() {
  const mod = await getPublicContent('blog', () => import('@/lib/mockData/media'));
  return mod.BLOG_POSTS;
}

export async function getBlogPost(slug) {
  const posts = await getBlogPosts();
  return posts.find((p) => p.slug === slug) || null;
}
