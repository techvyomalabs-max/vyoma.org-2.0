'use client';

import { useState } from 'react';
import { BlogCard } from './BlogCard';

// Holds the category-filter state for /media/blog: the featured post (top,
// white section) and the feed grid + sidebar (below, sky-mist section) are
// both derived from the same filtered list, so one client component owns
// both blocks rather than splitting state across server/client boundaries.
export function BlogListClient({ posts, categories }) {
  const [category, setCategory] = useState(null);

  const filtered = category ? posts.filter((p) => p.category === category) : posts;
  const featured = filtered[0];
  const feed = filtered.slice(1);
  const recent = posts.slice(0, 5);

  return (
    <>
      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          {featured ? (
            <BlogCard post={featured} large />
          ) : (
            <p className="font-sans text-[15px] text-charcoal">No posts in this category yet.</p>
          )}
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-8 lg:grid-cols-[1fr_300px]">
          <div>
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              {feed.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
            <div className="mt-8 text-center">
              <button
                type="button"
                className="rounded-md border border-vyoma-blue px-[22px] py-[11px] font-sans text-base font-semibold text-vyoma-blue"
              >
                Load more
              </button>
            </div>
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
                  <button
                    type="button"
                    onClick={() => setCategory(null)}
                    className={`font-sans text-[15px] ${category === null ? 'font-bold text-vyoma-blue' : 'text-charcoal'}`}
                  >
                    All
                  </button>
                </li>
                {categories.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`font-sans text-[15px] ${category === c ? 'font-bold text-vyoma-blue' : 'text-charcoal'}`}
                    >
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-md border border-[var(--border-subtle)] bg-white p-5">
              <h3 className="mb-3 font-sans text-base font-bold text-vyoma-blue">Most Recent</h3>
              <ul className="flex flex-col gap-2.5">
                {recent.map((p) => (
                  <li key={p.slug}>
                    <a href="#" className="font-sans text-[14px] text-charcoal">
                      {p.title}
                    </a>
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
