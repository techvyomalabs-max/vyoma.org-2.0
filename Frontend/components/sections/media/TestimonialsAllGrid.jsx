'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { TestimonialCard } from './TestimonialCard';
import { initialVisibleCount, getVisibleItems, hasMoreTestimonials, nextVisibleCount } from './testimonialLoadMore.mjs';

// QA Bug 19 Stage 5A — the only client-interactive piece of
// app/(public)/media/testimonials/page.js's "All Testimonials" section.
// Kept as its own small Client Component specifically so the surrounding
// page stays a Server Component (preserves its existing server-side
// `getTestimonials()` fetch, `metadata` export, and `dynamic =
// 'force-dynamic'` — none of which are available/meaningful inside a
// Client Component). `items` is passed in already active-filtered (via
// contentArrays.js's existing toActiveContentArray()) by the page; this
// component only ever slices that already-final array, it does not
// re-filter or otherwise alter which testimonials are eligible to show.
export function TestimonialsAllGrid({ items }) {
  const [visibleCount, setVisibleCount] = useState(() => initialVisibleCount(items.length));
  const visible = getVisibleItems(items, visibleCount);
  const showLoadMore = hasMoreTestimonials(items, visibleCount);

  return (
    <>
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {visible.map((item) => (
          // QA Bug 19 Stage 5C: prefers the Stage 5B stable `id` when
          // present -- genuine real-world data can have two different
          // people sharing the same name (e.g. two distinct "Meenakshi"
          // Endorsal testimonials, confirmed during this migration's own
          // investigation), which `item.name` alone cannot disambiguate as
          // a React list key. Falls back to `item.name` only for a legacy
          // entry that has no `id` yet.
          <TestimonialCard key={item.id ?? item.name} item={item} />
        ))}
      </div>
      {showLoadMore && (
        <div className="mt-8 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleCount((count) => nextVisibleCount(count, items.length))}
          >
            Load more
          </Button>
        </div>
      )}
    </>
  );
}
