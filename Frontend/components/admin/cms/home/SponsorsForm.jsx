'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// bg/width/height are preserved untouched (existing layout data, not part of
// this simplified form) since every field-change handler spreads `...item`.
const NEW_SPONSOR = { name: '', logo: null, website: null, bg: '#fff', width: 200, height: 90, active: true };

export function SponsorsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_SPONSOR}
      itemLabel={(item) => item.name || 'New sponsor'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <input
            type="text"
            value={item.name}
            onChange={(e) => onItemChange({ ...item, name: e.target.value })}
            placeholder="Sponsor name"
            className={inputClass}
          />
          <input
            type="text"
            value={item.website || ''}
            onChange={(e) => onItemChange({ ...item, website: e.target.value || null })}
            placeholder="Website (optional — makes the logo clickable)"
            className={inputClass}
          />
          <ImageField label="Logo" value={item.logo} onChange={(logo) => onItemChange({ ...item, logo })} />
        </div>
      )}
    />
  );
}
