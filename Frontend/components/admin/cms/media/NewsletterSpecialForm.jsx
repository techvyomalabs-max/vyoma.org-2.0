'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches NEWSLETTER_SPECIAL exactly — {label, title}.
const NEW_SPECIAL = { label: '', title: '' };

export function NewsletterSpecialForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_SPECIAL}
      itemLabel={(item) => item.title || 'New special issue'}
      renderItem={(item, onItemChange) => (
        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={item.label} onChange={(e) => onItemChange({ ...item, label: e.target.value })} placeholder="Label" className={inputClass} />
          <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Title" className={inputClass} />
        </div>
      )}
    />
  );
}
