'use client';

import { ImageField } from '@/components/admin/ui/ImageField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Only the fields the Next.js metadata API actually uses (title, description,
// canonical, OG image) — no scoring/analysis, per the CMS redesign's explicit
// "do not recreate Rank Math" instruction.
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
