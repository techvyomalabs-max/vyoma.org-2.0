'use client';

import { ImageField } from '@/components/admin/ui/ImageField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Shared across every Phase C page (About/Our Work/Impact/Credibility/Join
// Us) — same fields as Home's Phase B SeoForm, factored out here since it's
// otherwise identical five times over. Only the fields the Next.js metadata
// API actually uses — no Rank-Math-style scoring.
export function SeoForm({ value, onChange }) {
  const v = value || { title: null, description: null, canonical: '/', ogImage: null };
  return (
    <div className="max-w-lg space-y-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Page title</label>
        <input
          type="text"
          value={v.title || ''}
          onChange={(e) => onChange({ ...v, title: e.target.value || null })}
          placeholder="Falls back to the site default if empty"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Meta description</label>
        <textarea
          value={v.description || ''}
          onChange={(e) => onChange({ ...v, description: e.target.value || null })}
          rows={3}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Canonical URL</label>
        <input type="text" value={v.canonical || '/'} onChange={(e) => onChange({ ...v, canonical: e.target.value })} className={inputClass} />
      </div>
      <ImageField label="Social sharing (Open Graph) image" value={v.ogImage} onChange={(ogImage) => onChange({ ...v, ogImage })} />
    </div>
  );
}
