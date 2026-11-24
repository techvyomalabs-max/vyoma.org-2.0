'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  parseCategory,
  parsePageSize,
  parsePage,
  filterRows,
  getPagination,
  buildQueryString,
} from './resourcesTableLogic.mjs';

// Category pills + "show N entries" + search + table + pagination for
// /media/resources. State (category/search/page size/page) is mirrored to
// the URL via router.replace (never push, so Back doesn't have to step
// through every keystroke/click) -- this is what lets the browser Back
// button restore the previously selected category/page/size/search after
// following a resource's external link (QA Bug 11 Issue 2), since the URL
// survives that round trip even when the component itself remounts fresh.
// useSearchParams() requires a Suspense boundary around it (Next.js), hence
// the Inner/outer split below.
function ResourcesTableInner({ categories, rows }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultCategory = categories[0];

  const [tab, setTab] = useState(() => parseCategory(searchParams.get('category'), categories));
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [perPage, setPerPage] = useState(() => parsePageSize(searchParams.get('size')));
  const [page, setPage] = useState(() => parsePage(searchParams.get('page')));

  const all = rows[tab] || [];
  const filtered = filterRows(all, search);
  const { totalPages, currentPage, startIndex } = getPagination(filtered.length, { perPage, page });
  const visible = filtered.slice(startIndex, startIndex + perPage);
  const showPagination = totalPages > 1;

  // Mirrors the current state to the URL (replace only -- see header
  // comment). Runs after every state change, including the initial mount,
  // so an out-of-range page restored from the URL (e.g. the result set
  // shrank since) is normalized in the URL too, not just in memory.
  useEffect(() => {
    const qs = buildQueryString({ category: tab, defaultCategory, search, perPage, page: currentPage });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, perPage, currentPage]);

  function handleTabChange(c) {
    setTab(c);
    setPage(1);
  }
  function handleSearchChange(v) {
    setSearch(v);
    setPage(1);
  }
  function handlePerPageChange(v) {
    setPerPage(v);
    setPage(1);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => handleTabChange(c)}
            className={`rounded-pill px-4 py-1.5 font-sans text-sm font-semibold transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
              tab === c ? 'bg-vyoma-blue text-white' : 'border border-[var(--border-subtle)] bg-white text-charcoal'
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
            onChange={(e) => handlePerPageChange(Number(e.target.value))}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-2 py-1.5 font-sans text-sm text-charcoal"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          entries
        </label>

        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search…"
          className="w-full max-w-[260px] rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2 font-sans text-sm text-charcoal"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-sans text-[15px]">
          <thead>
            <tr className="bg-sky-mist text-left">
              <th className="p-3 font-bold text-charcoal">Sl.No</th>
              <th className="p-3 font-bold text-charcoal">Title</th>
              <th className="p-3 font-bold text-charcoal">Description</th>
              <th className="p-3 font-bold text-charcoal">Link</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.title} className="border-t border-[var(--border-subtle)]">
                <td className="p-3 text-charcoal">{startIndex + i + 1}</td>
                <td className="p-3 font-semibold text-vyoma-blue">{r.title}</td>
                <td className="p-3 text-charcoal">{r.desc}</td>
                <td className="p-3">
                  <a href={r.link} className="font-bold text-vyoma-blue">
                    Visit →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue disabled:opacity-40"
          >
            Previous
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              aria-current={n === currentPage ? 'page' : undefined}
              className={`rounded-md border px-3 py-1.5 font-sans text-sm font-semibold ${
                n === currentPage
                  ? 'border-vyoma-blue bg-vyoma-blue text-white'
                  : 'border-[var(--border-subtle)] bg-white text-charcoal'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-[var(--border-subtle)] bg-white px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function ResourcesTable(props) {
  return (
    <Suspense fallback={null}>
      <ResourcesTableInner {...props} />
    </Suspense>
  );
}
