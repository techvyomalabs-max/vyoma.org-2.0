'use client';

import { useState } from 'react';

// Category pills + "show N entries" + search + table for /media/resources.
export function ResourcesTable({ categories, rows }) {
  const [tab, setTab] = useState(categories[0]);
  const [search, setSearch] = useState('');
  const [perPage, setPerPage] = useState(10);

  const all = rows[tab] || [];
  const filtered = search
    ? all.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) || r.desc.toLowerCase().includes(search.toLowerCase())
      )
    : all;
  const visible = filtered.slice(0, perPage);

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
                <td className="p-3 text-charcoal">{i + 1}</td>
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

      <p className="mt-4 font-sans text-[13px] text-charcoal/70">
        Showing sample entries — the &quot;{tab}&quot; category carries{' '}
        {tab === 'Repositories of Sanskrit Texts' ? '36' : 'more'} entries on the live site.
      </p>
    </div>
  );
}
