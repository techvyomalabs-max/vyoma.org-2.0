import Link from 'next/link';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// A rough, standard 200-words-per-minute estimate — there is no authored
// "read time" field any more now that body is real, editable content
// (Phase E) rather than static mock copy.
function readTime(html) {
  const words = (html || '').replace(/<[^>]*>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

// Used both large (featured post) and small (feed grid) on /media/blog.
export function BlogCard({ post, large = false }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
      <div className={`border-b-[3px] border-b-amber-gold ${large ? 'h-[360px]' : 'h-[200px]'}`}>
        {post.featuredImage?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.featuredImage.url} alt={post.featuredImage.alt || post.title} className="h-full w-full object-cover" />
        ) : (
          <ImagePlaceholder shape="rect" caption="Photo" />
        )}
      </div>
      <div className={large ? 'p-[26px_24px]' : 'p-[20px_22px]'}>
        {post.categories?.[0] && (
          <span className="inline-block rounded-sm bg-sky-mist px-2.5 py-1 font-sans text-xs font-bold uppercase text-charcoal">
            {post.categories[0]}
          </span>
        )}
        <h3 className={`mt-3 font-sans font-bold text-vyoma-blue ${large ? 'text-[26px]' : 'text-[19px]'}`}>
          <Link href={`/media/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="mt-2 font-sans text-[15px] text-charcoal">{post.excerpt}</p>
        <p className="mt-3 font-sans text-[13px] text-charcoal/70">
          By {post.author} · {formatDate(post.publishedAt)} · {readTime(post.body)}
        </p>
        <Link href={`/media/blog/${post.slug}`} className="mt-3 inline-block font-sans text-[15px] font-bold text-vyoma-blue">
          Read more →
        </Link>
      </div>
    </div>
  );
}
