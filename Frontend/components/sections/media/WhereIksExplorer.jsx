'use client';

import { useMemo, useState } from 'react';

// Series selector + category pills + topic-grouped, searchable, paginated
// resource list for /media/where-iks. Combines ResourcesTable's
// search/pagination/description pattern with WhatSanskritTabs' topic
// sub-grouping, because Where-IKS is both large (up to 151 rows in one
// category) AND has a real Topic grouping level within categories —
// neither existing component covers both needs on its own.
//
// `series` describes the full, static 3-series/29-category taxonomy (may
// list categories that haven't been migrated yet); `categories` is the
// flat list of categories actually present in `rows` right now. The UI
// treats a series with none of its categories yet migrated as "coming
// soon" rather than crashing or showing an empty table.
export function WhereIksExplorer({ series, categories, rows }) {
  const safeSeries = series || [];
  const safeCategories = categories || [];
  const safeRows = rows || {};

  const [seriesKey, setSeriesKey] = useState(safeSeries[0]?.key);
  const activeSeries = safeSeries.find((s) => s.key === seriesKey);
  const availableCategoriesForSeries = useMemo(
    () => (activeSeries ? activeSeries.categories.filter((c) => safeCategories.includes(c)) : []),
    [activeSeries, safeCategories]
  );

  const [category, setCategory] = useState(availableCategoriesForSeries[0]);
  // Keep the selected category valid when the series changes.
  const effectiveCategory = availableCategoriesForSeries.includes(category) ? category : availableCategoriesForSeries[0];

  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState(10);

  const all = safeRows[effectiveCategory] || [];
  const filtered = search
    ? all.filter(
        (r) => r.title.toLowerCase().includes(search.toLowerCase()) || (r.desc || '').toLowerCase().includes(search.toLowerCase())
      )
    : all;
  const visible = filtered.slice(0, perPage);

  // Group the visible rows by topic, preserving order, same convention as
  // WhatSanskritTabs — a blank topic stands alone with no sub-header.
  const groups = [];
  for (const r of visible) {
    const last = groups[groups.length - 1];
    if (last && last.topic === r.topic) {
      last.items.push(r);
    } else {
      groups.push({ topic: r.topic, items: [r] });
    }
  }

  if (safeSeries.length === 0) {
    return <p className="font-sans text-[15px] text-charcoal/70">This resource directory hasn&apos;t been migrated yet. Check back soon.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        {safeSeries.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setSeriesKey(s.key);
              setSearch('');
            }}
            className={`rounded-pill px-4 py-1.5 font-sans text-sm font-bold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              seriesKey === s.key ? 'bg-vyoma-blue text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {availableCategoriesForSeries.length === 0 ? (
        <p className="font-sans text-[15px] text-charcoal/70">This series hasn&apos;t been migrated yet. Check back soon.</p>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {availableCategoriesForSeries.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  setSearch('');
                }}
                className={`rounded-pill px-3.5 py-1 font-sans text-[13px] font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
                  effectiveCategory === c ? 'bg-amber-gold text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-center gap-2 font-sans text-sm text-charcoal">
              Show
              <select
                value={perPage}
                onChange={(e) => setPerPage(Number(e.target.value))}
                className="rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 font-sans text-sm text-charcoal"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              entries
            </label>

            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search this category…"
              className="w-full max-w-[280px] rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2 font-sans text-sm text-charcoal"
            />
          </div>

          {all.length === 0 ? (
            <p className="font-sans text-[15px] text-charcoal/70">No links are available in this category yet. We welcome suggestions from users.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((group, gi) => (
                <div key={gi}>
                  {group.topic && <div className="mb-2 font-sans text-sm font-bold uppercase tracking-wide text-vyoma-blue">{group.topic}</div>}
                  <ul className="flex flex-col gap-2">
                    {group.items.map((r, i) => (
                      <li key={`${r.link}-${gi}-${i}`} className="rounded-md border border-[var(--border-subtle)] bg-white p-3.5 font-sans text-[15px]">
                        {r.link ? (
                          <a href={r.link} target="_blank" rel="noreferrer" className="font-semibold text-vyoma-blue">
                            {r.title}
                          </a>
                        ) : (
                          <span className="font-semibold text-charcoal">{r.title}</span>
                        )}
                        {r.desc && <p className="mt-1 text-[14px] text-charcoal/80">{r.desc}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 font-sans text-[13px] text-charcoal/70">
            Showing {visible.length} of {filtered.length} entries.
          </p>
        </>
      )}
    </div>
  );
}
