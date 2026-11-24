'use client';

const inputClass = 'rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Keys must exactly match the approved allowlist in
// Backend/src/modules/forms/formCategoryFilter.js's CATEGORY_KEYS -- kept
// as a separate, hardcoded list here (not a shared import) since Frontend
// and Backend are two independently deployed apps with no shared runtime
// import graph.
const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'internships', label: 'Internships' },
  { value: 'careers', label: 'Careers' },
  { value: 'volunteering', label: 'Volunteering' },
  { value: 'institutional-partnership', label: 'Institutional Partnership' },
  { value: 'csr-partnership', label: 'CSR Partnership' },
  { value: 'press-media', label: 'Press & Media' },
  { value: 'testimonial-submission', label: 'Testimonial Submission' },
  { value: 'corpus-fund', label: 'Corpus Fund' },
  { value: 'general-inquiry', label: 'General Inquiry' },
  { value: 'other-unknown', label: 'Other / Unknown' },
];

export function SubmissionFilters({ filters, onChange }) {
  const set = (key, value) => onChange({ ...filters, [key]: value });

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Application Category</label>
        <select value={filters.category} onChange={(e) => set('category', e.target.value)} className={inputClass}>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
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
