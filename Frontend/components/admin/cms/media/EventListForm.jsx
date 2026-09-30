'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Shared by both UPCOMING_EVENTS and PAST_EVENTS — both use the exact same
// {type, date, title, note} shape in media.js.
const NEW_EVENT = { type: '', date: '', title: '', note: '' };

export function EventListForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_EVENT}
      itemLabel={(item) => item.title || 'New event'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={item.type} onChange={(e) => onItemChange({ ...item, type: e.target.value })} placeholder="Type (e.g. Workshop, Talk)" className={inputClass} />
            <input type="text" value={item.date} onChange={(e) => onItemChange({ ...item, date: e.target.value })} placeholder="Date (e.g. 16 Jul 2026)" className={inputClass} />
          </div>
          <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Title" className={inputClass} />
          <textarea value={item.note} onChange={(e) => onItemChange({ ...item, note: e.target.value })} placeholder="Note" rows={2} className={inputClass} />
        </div>
      )}
    />
  );
}
