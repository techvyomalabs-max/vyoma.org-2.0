'use client';

import { useEffect, useState } from 'react';
import { EventCard } from './EventCard';

const PAGE_SIZE = 12;

// Client-side pill filter (by event type) + grid + real pagination for the
// "Past Events" section of /media/events. (A prior "Load more" button here
// had no onClick/pagination logic and was removed — now that the dataset
// is large enough (58 events) to need it, this implements real slicing +
// a Next/Previous control instead of restoring a decorative button.)
export function EventsPastClient({ events, categories }) {
  const [active, setActive] = useState('All');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [active]);

  const filtered = active === 'All' ? events : events.filter((e) => e.type === active);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEvents = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-3">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActive(c)}
            className={`rounded-pill px-4 py-1.5 font-sans text-sm font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              active === c ? 'bg-vyoma-blue text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mb-4 font-sans text-sm text-charcoal/70">
        {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {pageEvents.map((e) => (
          <EventCard key={`${e.title}-${e.date}`} event={e} />
        ))}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-4 py-2 font-sans text-sm font-bold text-vyoma-blue disabled:opacity-40"
          >
            ← Previous
          </button>
          <div className="font-sans text-sm text-charcoal">
            Page {currentPage} of {totalPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-4 py-2 font-sans text-sm font-bold text-vyoma-blue disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
