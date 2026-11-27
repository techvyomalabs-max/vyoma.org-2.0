'use client';

import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 25;

// `categories`: PATRON_CATEGORIES — an array, not a fixed hardcoded tab
// list, so any category an admin adds/renames/reorders and publishes
// shows up here automatically with zero code change.
export function PatronTierTable({ categories }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const visibleCategories = categories.filter((c) => c.active !== false);
  const active = visibleCategories[Math.min(activeIndex, visibleCategories.length - 1)];

  // Reset to page 1 whenever the active category or search term changes, so
  // a stale page number from a longer category/filter never shows an empty
  // table.
  useEffect(() => {
    setPage(1);
  }, [activeIndex, search]);

  const activeRows = (active?.rows || []).filter((r) => r.active !== false);
  const hasProductColumn = !!active?.hasProductField;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeRows;
    return activeRows.filter((r) => [r.name, r.place, r.product].some((v) => v && v.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!active) {
    return (
      <div className="mx-auto max-w-[1100px] rounded-md border border-[var(--border-subtle)] bg-white p-6 text-center font-sans text-[15px] text-charcoal/60">
        No patron categories yet.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex flex-wrap overflow-hidden rounded-md border border-[var(--border-subtle)]">
        {visibleCategories.map((c, i) => (
          <button
            key={c.sanskrit}
            onClick={() => setActiveIndex(i)}
            className={`min-w-0 flex-1 whitespace-nowrap px-2 py-3.5 font-sans text-sm font-bold text-white ${
              i === activeIndex ? 'bg-vyoma-blue' : 'bg-charcoal'
            }`}
          >
            {c.sanskrit}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 border border-t-0 border-[var(--border-subtle)] bg-sky-mist px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="font-sans text-sm font-bold text-charcoal">
          {activeRows.length} {activeRows.length === 1 ? 'patron' : 'patrons'} in {active.sanskrit}
        </div>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or place…"
          className="w-full max-w-xs rounded-md border border-[var(--border-subtle)] bg-white px-3 py-2 font-sans text-sm text-charcoal"
        />
      </div>

      <div className="overflow-hidden border border-t-0 border-[var(--border-subtle)] bg-white">
        <table className="w-full border-collapse font-sans">
          <thead>
            <tr className="bg-sky-mist">
              <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Name</th>
              <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Place</th>
              {hasProductColumn && <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Product Sponsored</th>}
            </tr>
          </thead>
          <tbody>
            {pageRows.length ? (
              pageRows.map((r, i) => (
                <tr key={`${r.name}-${i}`} className={i % 2 ? 'bg-sky-mist' : 'bg-white'}>
                  <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.name}</td>
                  <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.place}</td>
                  {hasProductColumn && <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.product}</td>}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={hasProductColumn ? 3 : 2} className="px-5 py-6 text-center text-[15px] text-charcoal/60">
                  {search ? 'No matching patrons.' : 'No entries yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > PAGE_SIZE && (
        <div className="flex items-center justify-between border border-t-0 border-[var(--border-subtle)] bg-sky-mist px-5 py-3.5">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-3 py-1.5 font-sans text-sm font-bold text-vyoma-blue disabled:opacity-40"
          >
            ← Previous
          </button>
          <div className="font-sans text-sm text-charcoal">
            Page {currentPage} of {totalPages} ({filteredRows.length} {filteredRows.length === 1 ? 'result' : 'results'})
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-3 py-1.5 font-sans text-sm font-bold text-vyoma-blue disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
