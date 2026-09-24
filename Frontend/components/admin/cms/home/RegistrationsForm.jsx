'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';
import { LinkField } from '@/components/admin/ui/LinkField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const NEW_REGISTRATION = { title: '', image: null, supportingText: null, link: null, active: true };

export function RegistrationsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_REGISTRATION}
      itemLabel={(item) => item.title || 'New registration'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <input
            type="text"
            value={item.title}
            onChange={(e) => onItemChange({ ...item, title: e.target.value })}
            placeholder="Title (e.g. FCRA Registered)"
            className={inputClass}
          />
          <input
            type="text"
            value={item.supportingText || ''}
            onChange={(e) => onItemChange({ ...item, supportingText: e.target.value || null })}
            placeholder="Supporting text (optional)"
            className={inputClass}
          />
          <ImageField label="Logo (optional — shows a checkmark if empty)" value={item.image} onChange={(image) => onItemChange({ ...item, image })} />
          <div>
            <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Link (optional)</label>
            <LinkField value={item.link} onChange={(link) => onItemChange({ ...item, link })} />
          </div>
        </div>
      )}
    />
  );
}
