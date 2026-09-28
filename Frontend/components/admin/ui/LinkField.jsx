'use client';

// value shape: { label, href, external, newTab }
export function LinkField({ value, onChange }) {
  const v = value || { label: '', href: '', external: false, newTab: false };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={v.label}
        onChange={(e) => onChange({ ...v, label: e.target.value })}
        placeholder="Button/link label"
        className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
      />
      <div className="flex items-center gap-3">
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-charcoal">
          <input type="radio" checked={!v.external} onChange={() => onChange({ ...v, external: false, newTab: false })} />
          Internal page
        </label>
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-charcoal">
          <input type="radio" checked={!!v.external} onChange={() => onChange({ ...v, external: true })} />
          External URL
        </label>
      </div>
      <input
        type="text"
        value={v.href}
        onChange={(e) => onChange({ ...v, href: e.target.value })}
        placeholder={v.external ? 'https://…' : '/about'}
        className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
      />
      {v.external && (
        <label className="inline-flex items-center gap-1.5 font-sans text-xs text-charcoal">
          <input type="checkbox" checked={!!v.newTab} onChange={(e) => onChange({ ...v, newTab: e.target.checked })} />
          Open in new tab
        </label>
      )}
    </div>
  );
}
