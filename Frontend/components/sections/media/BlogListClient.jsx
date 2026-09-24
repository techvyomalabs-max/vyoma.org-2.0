import Link from 'next/link';
import { BlogCard } from './BlogCard';

function pageHref(category, tag, page) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (tag) params.set('tag', tag);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/media/blog?${qs}` : '/media/blog';
}

// Phase E: category filtering and pagination are now real server navigation
// (Links carrying ?category=&page=) instead of client-only state — the
// featured post (top, white section) and the feed grid + sidebar (below)
// are both derived from the server-fetched `posts` for the current
// page/filter. No client JS is needed here any more, so this is a plain
// server component despite the filename (kept to avoid an unrelated file
// rename).
export function BlogListClient({ posts, meta, categories, activeCategory, activeTag, recentPosts }) {
  const featured = meta.page === 1 && !activeCategory && !activeTag ? posts[0] : null;
  const feed = featured ? posts.slice(1) : posts;
  const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));

  return (
    <>
      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          {featured ? (
            <BlogCard post={featured} large />
          ) : !posts.length ? (
            <p className="font-sans text-[15px] text-charcoal">No posts in this category yet.</p>
          ) : null}
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            {activeTag && (
              <p className="mb-4 font-sans text-sm text-charcoal">
                Filtered by tag <strong>#{activeTag}</strong> ·{' '}
                <Link href={pageHref(activeCategory, null, 1)} className="font-semibold text-vyoma-blue">
                  Clear
                </Link>
              </p>
            )}
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              {feed.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-3 font-sans text-sm text-charcoal">
                <Link
                  href={pageHref(activeCategory, activeTag, meta.page - 1)}
                  aria-disabled={meta.page <= 1}
                  className={`rounded-md border border-vyoma-blue px-4 py-2 font-semibold text-vyoma-blue ${meta.page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                >
                  Prev
                </Link>
                <span className="text-charcoal/60">
                  Page {meta.page} of {totalPages}
                </span>
                <Link
                  href={pageHref(activeCategory, activeTag, meta.page + 1)}
                  aria-disabled={meta.page >= totalPages}
                  className={`rounded-md border border-vyoma-blue px-4 py-2 font-semibold text-vyoma-blue ${meta.page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
                >
                  Next
                </Link>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-6">
            <input
              type="text"
              placeholder="Search the blog…"
              className="w-full rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
            />

            <div className="rounded-md border border-[var(--border-subtle)] bg-white p-5">
              <h3 className="mb-3 font-sans text-base font-bold text-vyoma-blue">Categories</h3>
              <ul className="flex flex-col gap-2">
                <li>
                  <Link
                    href={pageHref(null, activeTag, 1)}
                    className={`font-sans text-[15px] ${!activeCategory ? 'font-bold text-vyoma-blue' : 'text-charcoal'}`}
                  >
                    All
                  </Link>
                </li>
                {categories.map((c) => (
                  <li key={c}>
                    <Link
                      href={pageHref(c, activeTag, 1)}
                      className={`font-sans text-[15px] ${activeCategory === c ? 'font-bold text-vyoma-blue' : 'text-charcoal'}`}
                    >
                      {c}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-[var(--border-subtle)] bg-white p-5">
              <h3 className="mb-3 font-sans text-base font-bold text-vyoma-blue">Most Recent</h3>
              <ul className="flex flex-col gap-2.5">
                {recentPosts.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/media/blog/${p.slug}`} className="font-sans text-[14px] text-charcoal">
                      {p.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-[var(--border-subtle)] bg-sky-mist p-5">
              <h3 className="mb-2 font-sans text-base font-bold text-vyoma-blue">Subscribe</h3>
              <p className="mb-3 font-sans text-[13px] text-charcoal">Get new posts in your inbox.</p>
              <input
                type="email"
                placeholder="Your email"
                className="mb-2 w-full rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
              />
              <button
                type="button"
                className="w-full rounded-md bg-vyoma-blue px-[18px] py-2 font-sans text-sm font-semibold text-white"
              >
                Subscribe
              </button>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
