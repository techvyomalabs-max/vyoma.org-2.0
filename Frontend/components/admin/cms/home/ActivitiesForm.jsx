'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';
import { LinkField } from '@/components/admin/ui/LinkField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const NEW_ACTIVITY = { title: '', description: null, icon: null, link: { label: '', href: '', external: false }, active: true };

export function ActivitiesForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_ACTIVITY}
      itemLabel={(item) => item.title || 'New activity'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <input
            type="text"
            value={item.title}
            onChange={(e) => onItemChange({ ...item, title: e.target.value })}
            placeholder="Title (e.g. What SSS?)"
            className={inputClass}
          />
          <textarea
            value={item.description || ''}
            onChange={(e) => onItemChange({ ...item, description: e.target.value || null })}
            placeholder="Description (optional)"
            rows={2}
            className={inputClass}
          />
          <ImageField label="Icon (optional)" value={item.icon} onChange={(icon) => onItemChange({ ...item, icon })} />
          <div>
            <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Link</label>
            <LinkField value={item.link} onChange={(link) => onItemChange({ ...item, link })} />
          </div>
        </div>
      )}
    />
  );
}
