import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBlogPosts, getBlogPost } from '@/services/blogService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { articleJsonLd, breadcrumbJsonLd, jsonLdScriptProps } from '@/lib/seo';

// Only published posts are statically pre-rendered — same reasoning as the
// donation scheme detail page: the active/published-only list is the only
// one this build step can safely call without auth, and Next's default
// dynamicParams renders anything else on demand at request time.
export async function generateStaticParams() {
  const { items } = await getBlogPosts({ limit: 50 });
  return items.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  const meta = {
    title: post?.seo?.title || post?.title || 'Blog',
    description: post?.seo?.description || post?.excerpt,
    alternates: { canonical: post?.seo?.canonical || `/media/blog/${slug}` },
  };
  // Legacy-exact ogImage first; otherwise the post's own featured image
  // (currently null for every migrated post — see blogPost.model.js's
  // comment on Batch 1 deferring Media/S3 — so this fallback is a no-op
  // today and activates automatically once that data exists). Omitted
  // entirely, never an empty string, when neither exists.
  const ogImageUrl = post?.seo?.ogImage?.url || post?.featuredImage?.url;
  if (ogImageUrl) meta.openGraph = { images: [{ url: ogImageUrl }] };
  return meta;
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) notFound();

  const canonicalPath = post.seo?.canonical || `/media/blog/${slug}`;
  const imageUrl = post.seo?.ogImage?.url || post.featuredImage?.url;
  const article = articleJsonLd({
    title: post.seo?.title || post.title,
    description: post.seo?.description || post.excerpt,
    canonicalPath,
    imageUrl,
    author: post.author,
    publishedAt: post.publishedAt,
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Media', path: '/media' },
    { name: 'Blog', path: '/media/blog' },
    { name: post.title, path: canonicalPath },
  ]);

  return (
    <div className="font-sans">
      <script type="application/ld+json" {...jsonLdScriptProps(article)} />
      <script type="application/ld+json" {...jsonLdScriptProps(breadcrumb)} />
      <PageHero eyebrow="Media" title={post.title} body={post.excerpt} />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto max-w-[700px]">
          <div className="h-[360px] border-b-[3px] border-b-amber-gold">
            {post.featuredImage?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.featuredImage.url} alt={post.featuredImage.alt || post.title} className="h-full w-full object-cover" />
            ) : (
              <ImagePlaceholder shape="rect" caption="Photo" />
            )}
          </div>
          <p className="mt-5 font-sans text-[13px] text-charcoal/70">
            By {post.author}
            {post.publishedAt && ` · ${new Date(post.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
          </p>
          {/* post.body is sanitized server-side (Backend sanitizeBody.js) before
              it is ever stored — this is trusted, already-cleaned HTML, the same
              trust boundary every other admin-authored rich text field in this
              app relies on once it has passed that one sanitization point. */}
          <div
            className="prose-blog mt-6 font-sans text-[17px] leading-normal text-charcoal"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
          {!!post.tags?.length && (
            <div className="mt-6 flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <Link
                  key={t}
                  href={`/media/blog?tag=${encodeURIComponent(t)}`}
                  className="rounded-pill bg-sky-mist px-2.5 py-1 font-sans text-xs font-semibold text-vyoma-blue"
                >
                  #{t}
                </Link>
              ))}
            </div>
          )}
          <Link href="/media/blog" className="mt-8 inline-block font-sans text-[15px] font-bold text-vyoma-blue">
            ← Back to Blog
          </Link>
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
