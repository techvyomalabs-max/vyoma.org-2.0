'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches pages/media's TESTIMONIALS_ALL shape — {type: 'text'|'video',
// quote?, url?, name, role}. `quote` only applies to type "text"; `url`
// only applies to type "video" (manual-testing bug fix: the video entries
// in the live seed data were created with no `url` field at all and no
// input here to ever set one -- this form previously had no way to attach a
// real video to a "video" testimonial, which was the root cause of video
// testimonials never having anything to play).
const NEW_TESTIMONIAL = { type: 'text', quote: '', url: '', name: '', role: '' };

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
          {item.type === 'video' && (
            <input
              type="text"
              value={item.url || ''}
              onChange={(e) => onItemChange({ ...item, url: e.target.value })}
              placeholder="Video URL (e.g. YouTube link)"
              className={inputClass}
            />
          )}
        </div>
      )}
    />
  );
}
