'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const NEW_TESTIMONIAL = { name: '', role: '', quote: '', image: null, active: true };

export function TestimonialsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_TESTIMONIAL}
      itemLabel={(item) => item.name || 'New testimonial'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={item.name}
              onChange={(e) => onItemChange({ ...item, name: e.target.value })}
              placeholder="Person name"
              className={inputClass}
            />
            <input
              type="text"
              value={item.role}
              onChange={(e) => onItemChange({ ...item, role: e.target.value })}
              placeholder="Designation / location"
              className={inputClass}
            />
          </div>
          <textarea
            value={item.quote}
            onChange={(e) => onItemChange({ ...item, quote: e.target.value })}
            placeholder="Testimonial text"
            rows={3}
            className={inputClass}
          />
          <ImageField label="Photo" value={item.image} onChange={(image) => onItemChange({ ...item, image })} />
        </div>
      )}
    />
  );
}
