'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches GALLERY_ALBUMS exactly — {title, count}. `count` can be null in
// the source (see media.js's "Sanskrit as Medicine" album) — an empty
// input is saved back as null, not 0, to preserve that distinction.
const NEW_ALBUM = { title: '', count: null };

export function GalleryAlbumsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_ALBUM}
      itemLabel={(item) => item.title || 'New album'}
      renderItem={(item, onItemChange) => (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Album title" className={inputClass} />
          <input
            type="number"
            value={item.count ?? ''}
            onChange={(e) => onItemChange({ ...item, count: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="Photo count"
            className={inputClass}
          />
        </div>
      )}
    />
  );
}
