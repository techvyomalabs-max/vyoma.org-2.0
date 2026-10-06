'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches pages/media's TESTIMONIALS_ALL shape exactly — {type: 'text'|
// 'video', quote?, name, role}. `quote` only applies to type "text" (a
// "video" entry has no quote in the source data — see media.js).
const NEW_TESTIMONIAL = { type: 'text', quote: '', name: '', role: '' };

export function TestimonialsAllForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_TESTIMONIAL}
      itemLabel={(item) => item.name || 'New testimonial'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={item.name} onChange={(e) => onItemChange({ ...item, name: e.target.value })} placeholder="Person name" className={inputClass} />
            <input type="text" value={item.role} onChange={(e) => onItemChange({ ...item, role: e.target.value })} placeholder="Designation / location" className={inputClass} />
          </div>
          <select
            value={item.type}
            onChange={(e) => onItemChange({ ...item, type: e.target.value })}
            className={inputClass}
          >
            <option value="text">Text</option>
            <option value="video">Video</option>
          </select>
          {item.type === 'text' && (
            <textarea value={item.quote || ''} onChange={(e) => onItemChange({ ...item, quote: e.target.value })} placeholder="Testimonial text" rows={3} className={inputClass} />
          )}
        </div>
      )}
    />
  );
}
