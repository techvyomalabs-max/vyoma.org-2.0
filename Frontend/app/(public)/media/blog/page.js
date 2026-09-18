import { getBlogPosts } from '@/services/blogService';
import { PageHero } from '@/components/sections/PageHero';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { BlogListClient } from '@/components/sections/media/BlogListClient';

export const metadata = {
  title: 'Blog',
  description: 'Long-form stories and updates from classrooms, research, and the field.',
};

export default async function BlogPage() {
  const posts = await getBlogPosts();
  // Category filter chips derive from the posts themselves (first-appearance
  // order), which matches the source design system's BLOG_CATEGORIES order
  // exactly, so there is no need for a separate categories fetch here.
  const categories = [...new Set(posts.map((p) => p.category))];

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Blog"
        body="Long-form stories and updates from classrooms, research, and the field."
      />

      <BlogListClient posts={posts} categories={categories} />

      <MediaCta />
    </div>
  );
}
