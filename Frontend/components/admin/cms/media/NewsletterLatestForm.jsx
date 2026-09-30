'use client';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const field = (label) => 'mb-1 block font-sans text-xs font-bold text-charcoal/60 ' + label;

// NEWSLETTER_LATEST is a single object, not an array — {label, title,
// summary} — matches media.js exactly.
export function NewsletterLatestForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      <div>
        <label className={field('')}>Label</label>
        <input type="text" value={value.label} onChange={(e) => onChange({ ...value, label: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className={field('')}>Title</label>
        <input type="text" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className={field('')}>Summary</label>
        <textarea value={value.summary} onChange={(e) => onChange({ ...value, summary: e.target.value })} rows={3} className={inputClass} />
      </div>
    </div>
  );
}
