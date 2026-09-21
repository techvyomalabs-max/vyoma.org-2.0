import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPosts, getBlogPost } from '@/services/blogService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { MediaCta } from '@/components/sections/media/MediaCta';

// New route — the source design system never built a blog post detail view
// (see Phase 1 notes on blogService.js). Built fresh here, following the
// same generateStaticParams/generateMetadata/notFound pattern used by
// /donate/[schemeSlug].
export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  return {
    title: post?.title || 'Blog',
    description: post?.excerpt,
    alternates: { canonical: `/media/blog/${slug}` },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  return (
    <div className="font-sans">
      <PageHero eyebrow="Media" title={post.title} body={post.excerpt} />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto max-w-[700px]">
          <div className="h-[360px] border-b-[3px] border-b-amber-gold">
            <ImagePlaceholder shape="rect" caption="Photo" />
          </div>
          <p className="mt-5 font-sans text-[13px] text-charcoal/70">
            By {post.author} · {post.date} · {post.read}
          </p>
          <p className="mt-6 font-sans text-[17px] leading-normal text-charcoal">
            Full post content is being finalized and will appear here soon.
          </p>
          <Link href="/media/blog" className="mt-8 inline-block font-sans text-[15px] font-bold text-vyoma-blue">
            ← Back to Blog
          </Link>
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
