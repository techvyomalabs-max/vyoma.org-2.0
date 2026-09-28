'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';
import { LinkField } from '@/components/admin/ui/LinkField';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

const NEW_SLIDE = { heading: '', body: '', image: null, cta: { label: '', href: '', external: false }, active: true };

export function HeroSlidesForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_SLIDE}
      itemLabel={(item) => item.heading || 'New slide'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <input
            type="text"
            value={item.heading}
            onChange={(e) => onItemChange({ ...item, heading: e.target.value })}
            placeholder="Heading"
            className={inputClass}
          />
          <textarea
            value={item.body}
            onChange={(e) => onItemChange({ ...item, body: e.target.value })}
            placeholder="Subheading / body"
            rows={2}
            className={inputClass}
          />
          <ImageField
            label="Photo"
            value={item.image}
            onChange={(image) => onItemChange({ ...item, image })}
          />
          <div>
            <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Call to action</label>
            <LinkField value={item.cta} onChange={(cta) => onItemChange({ ...item, cta })} />
          </div>
        </div>
      )}
    />
  );
}
