'use client';

import { useState } from 'react';

// Category pills + sub-category grouped list for /media/what-sanskrit.
// Dedicated component (not a ResourcesTable extension) because the real
// WordPress content has a 2nd grouping level (subcategory) that
// ResourcesTable's flat {title, desc, link} table has no concept of, and
// has no description text at all (an empty Description column on every
// row would be pure visual noise). Kept deliberately simpler than
// ResourcesTable: no search/pagination, since the largest category here is
// 23 rows vs. Resources' much larger per-category counts.
export function WhatSanskritTabs({ categories, rows }) {
  const [tab, setTab] = useState(categories[0]);

  const activeRows = rows[tab] || [];

  // Group consecutive rows by subcategory, preserving original order.
  // A row with subcategory === '' stands alone (no sub-header rendered).
  const groups = [];
  for (const r of activeRows) {
    const last = groups[groups.length - 1];
    if (last && last.subcategory === r.subcategory) {
      last.items.push(r);
    } else {
      groups.push({ subcategory: r.subcategory, items: [r] });
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            className={`rounded-pill px-4 py-1.5 font-sans text-sm font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              tab === c ? 'bg-vyoma-blue text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6">
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.subcategory && (
              <div className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-vyoma-blue">{group.subcategory}</div>
            )}
            <ul className="flex flex-col gap-2">
              {group.items.map((r, i) => (
                <li
                  key={`${r.link}-${gi}-${i}`}
                  className="rounded-md border border-[var(--border-subtle)] bg-white p-3.5 font-sans text-[15px]"
                >
                  <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold text-vyoma-blue">
                    {r.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 font-sans text-[13px] text-charcoal/70">
        Showing {activeRows.length} {activeRows.length === 1 ? 'entry' : 'entries'}.
      </p>
    </div>
  );
}
