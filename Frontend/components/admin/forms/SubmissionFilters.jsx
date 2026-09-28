'use client';

const inputClass = 'rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

export function SubmissionFilters({ filters, onChange }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Form</label>
        <input
          type="text"
          placeholder="e.g. contact"
          value={filters.formKey}
          onChange={(e) => set('formKey', e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Status</label>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)} className={inputClass}>
          <option value="">All</option>
          <option value="new">New</option>
          <option value="handled">Handled</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">From</label>
        <input type="date" value={filters.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">To</label>
        <input type="date" value={filters.dateTo} onChange={(e) => set('dateTo', e.target.value)} className={inputClass} />
      </div>
    </div>
  );
}
