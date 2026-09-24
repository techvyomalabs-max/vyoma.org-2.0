import { getBlogPosts, getBlogCategories } from '@/services/blogService';
import { PageHero } from '@/components/sections/PageHero';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { BlogListClient } from '@/components/sections/media/BlogListClient';
import { pageMetadata } from '@/lib/seo';

const PAGE_SIZE = 9;

export const metadata = pageMetadata({
  path: '/media/blog',
  title: 'Blog',
  description: 'Long-form stories and updates from classrooms, research, and the field.',
});

// Phase E: category filtering and pagination are now real, server-driven
// (via ?category=&page=), reading from the dedicated Blog API instead of
// the previous client-only, single-page mock filter.
export default async function BlogPage({ searchParams }) {
  const sp = await searchParams;
  const category = sp?.category || null;
  const tag = sp?.tag || null;
  const page = Math.max(1, Number(sp?.page) || 1);

  const [{ items: posts, meta }, categories, { items: recentPosts }] = await Promise.all([
    getBlogPosts({ category, tag, page, limit: PAGE_SIZE }),
    getBlogCategories(),
    getBlogPosts({ limit: 5 }),
  ]);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Blog"
        body="Long-form stories and updates from classrooms, research, and the field."
      />

      <BlogListClient posts={posts} meta={meta} categories={categories} activeCategory={category} activeTag={tag} recentPosts={recentPosts} />

      <MediaCta />
    </div>
  );
}
