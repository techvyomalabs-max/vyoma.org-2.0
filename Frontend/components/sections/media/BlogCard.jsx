import Link from 'next/link';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

// Used both large (featured post) and small (feed grid) on /media/blog.
// The source design system's "Read more" link was non-functional (href="#"),
// but since this migration adds a real /media/blog/[slug] detail route, the
// title and "Read more" both link there instead of nowhere.
export function BlogCard({ post, large = false }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
      <div className={`border-b-[3px] border-b-amber-gold ${large ? 'h-[360px]' : 'h-[200px]'}`}>
        <ImagePlaceholder shape="rect" caption="Photo" />
      </div>
      <div className={large ? 'p-[26px_24px]' : 'p-[20px_22px]'}>
        <span className="inline-block rounded-sm bg-sky-mist px-2.5 py-1 font-sans text-xs font-bold uppercase text-charcoal">
          {post.category}
        </span>
        <h3 className={`mt-3 font-sans font-bold text-vyoma-blue ${large ? 'text-[26px]' : 'text-[19px]'}`}>
          <Link href={`/media/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="mt-2 font-sans text-[15px] text-charcoal">{post.excerpt}</p>
        <p className="mt-3 font-sans text-[13px] text-charcoal/70">
          By {post.author} · {post.date} · {post.read}
        </p>
        <Link href={`/media/blog/${post.slug}`} className="mt-3 inline-block font-sans text-[15px] font-bold text-vyoma-blue">
          Read more →
        </Link>
      </div>
    </div>
  );
}
