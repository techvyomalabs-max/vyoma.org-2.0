'use client';

import { useState } from 'react';
import { IssueRow } from './IssueRow';

// Client-side year filter for "Browse the Archive" on /media/newsletter.
// When "All" is active, a "Special Issues" group is also shown below the
// year groups.
export function NewsletterArchiveClient({ archive, special }) {
  const years = ['All', ...archive.map((g) => g.year)];
  const [active, setActive] = useState('All');
  const groups = active === 'All' ? archive : archive.filter((g) => g.year === active);

  return (
    <div>
      <div className="mb-8 flex flex-wrap gap-3">
        {years.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setActive(y)}
            className={`rounded-pill px-4 py-1.5 font-sans text-sm font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              active === y ? 'bg-vyoma-blue text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {groups.map((g) => (
          <div key={g.year}>
            <h3 className="mb-3 font-sans text-lg font-bold text-vyoma-blue">{g.year}</h3>
            <div className="flex flex-col gap-3">
              {g.issues.map((issue) => (
                <IssueRow key={issue.label} label={issue.label} title={issue.title} url={issue.url} />
              ))}
            </div>
          </div>
        ))}

        {active === 'All' && (
          <div>
            <h3 className="mb-3 font-sans text-lg font-bold text-vyoma-blue">Special Issues</h3>
            <div className="flex flex-col gap-3">
              {special.map((issue) => (
                <IssueRow key={issue.label} label={issue.label} title={issue.title} url={issue.url} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
