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
          <TestimonialCard key={item.name} item={item} />
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
