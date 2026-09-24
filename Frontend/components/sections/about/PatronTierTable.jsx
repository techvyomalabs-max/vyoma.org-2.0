'use client';

import { useState } from 'react';

const TABS = ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'];

export function PatronTierTable({ rows }) {
  const [active, setActive] = useState('Prayojakas');
  const activeRows = (rows[active] || []).filter((r) => r.active !== false);

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex overflow-hidden rounded-md border border-[var(--border-subtle)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActive(t)}
            className={`min-w-0 flex-1 whitespace-nowrap px-2 py-3.5 font-sans text-sm font-bold text-white ${
              active === t ? 'bg-vyoma-blue' : 'bg-charcoal'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="overflow-hidden border border-t-0 border-[var(--border-subtle)] bg-white">
        <table className="w-full border-collapse font-sans">
          <thead>
            <tr className="bg-sky-mist">
              <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Name</th>
              <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Place</th>
              <th className="px-5 py-3.5 text-left text-sm font-bold text-vyoma-blue">Product Sponsored</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.length ? (
              activeRows.map((r, i) => (
                <tr key={i} className={i % 2 ? 'bg-sky-mist' : 'bg-white'}>
                  <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.name}</td>
                  <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.place}</td>
                  <td className="px-5 py-3.5 text-[15px] text-charcoal">{r.product}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-5 py-6 text-center text-[15px] text-charcoal/60">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
