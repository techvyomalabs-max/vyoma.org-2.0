'use client';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const field = (label) => 'mb-1 block font-sans text-xs font-bold text-charcoal/60 ' + label;

export function ComplianceStripForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      {value.items.map((item, i) => (
        <input
          key={i}
          type="text"
          value={item}
          onChange={(e) => onChange({ ...value, items: value.items.map((it, idx) => (idx === i ? e.target.value : it)) })}
          className={inputClass}
        />
      ))}
      <div>
        <label className={field('')}>Button label</label>
        <input type="text" value={value.ctaLabel} onChange={(e) => onChange({ ...value, ctaLabel: e.target.value })} className={inputClass} />
      </div>
    </div>
  );
}
