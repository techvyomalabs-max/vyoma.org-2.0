'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches NEWSLETTER_SPECIAL — {label, title, url?}. `url` is optional — a
// blank value is safe and simply hides that issue's Download action on the
// public page rather than rendering a dead link.
const NEW_SPECIAL = { label: '', title: '', url: '' };

export function NewsletterSpecialForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_SPECIAL}
      itemLabel={(item) => item.title || 'New special issue'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={item.label} onChange={(e) => onItemChange({ ...item, label: e.target.value })} placeholder="Label" className={inputClass} />
            <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Title" className={inputClass} />
          </div>
          <input
            type="text"
            value={item.url || ''}
            onChange={(e) => onItemChange({ ...item, url: e.target.value })}
            placeholder="Destination URL (PDF or flipbook — optional)"
            className={inputClass}
          />
        </div>
      )}
    />
  );
}
