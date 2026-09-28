'use client';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// CSR has no repeatable items — it's the single hardcoded badge/heading/CTA
// block on the public page, now editable as plain fields. This exposes
// exactly what's currently represented on the public page, nothing more.
export function CsrForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Badge text</label>
        <input type="text" value={value.badge} onChange={(e) => onChange({ ...value, badge: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Heading</label>
        <input type="text" value={value.heading} onChange={(e) => onChange({ ...value, heading: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Button label</label>
        <input type="text" value={value.ctaLabel} onChange={(e) => onChange({ ...value, ctaLabel: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Contact form subject (pre-filled when clicked)</label>
        <input type="text" value={value.ctaSubject} onChange={(e) => onChange({ ...value, ctaSubject: e.target.value })} className={inputClass} />
      </div>
    </div>
  );
}
