'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';

// Decision D-BLOG7: categories is an array from the start (multiple
// categories per post), backed by the small admin-managed list from
// Decision D-BLOG5 — a checkbox per managed category, not free text and not
// a single-select dropdown.
export function CategoryMultiSelect({ value, onChange }) {
  const { apiFetch } = useAdminAuth();
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/admin/blog/categories')
      .then(setCategories)
      .catch((err) => setError(err.message));
  }, [apiFetch]);

  const selected = value || [];
  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter((c) => c !== name) : [...selected, name]);
  };

  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Categories</label>
      {error && <p className="font-sans text-xs text-red-600">{error}</p>}
      {!categories && !error && <p className="font-sans text-xs text-charcoal/60">Loading…</p>}
      {categories && !categories.length && (
        <p className="font-sans text-xs text-charcoal/60">
          No categories yet — add one from the Blog list page, then it will appear here.
        </p>
      )}
      {categories && !!categories.length && (
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <label
              key={c._id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-pill border px-2.5 py-1 font-sans text-xs ${
                selected.includes(c.name) ? 'border-vyoma-blue bg-sky-mist text-vyoma-blue' : 'border-[var(--border-subtle)] text-charcoal'
              }`}
            >
              <input type="checkbox" checked={selected.includes(c.name)} onChange={() => toggle(c.name)} className="hidden" />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
