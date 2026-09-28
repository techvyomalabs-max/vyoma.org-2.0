'use client';

import { useState } from 'react';
import { EventCard } from './EventCard';

// Client-side pill filter (by event type) + grid for the "Past Events"
// section of /media/events.
export function EventsPastClient({ events, categories }) {
  const [active, setActive] = useState('All');
  const filtered = active === 'All' ? events : events.filter((e) => e.type === active);

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

      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {filtered.map((e) => (
          <EventCard key={e.title} event={e} />
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
  );
}
