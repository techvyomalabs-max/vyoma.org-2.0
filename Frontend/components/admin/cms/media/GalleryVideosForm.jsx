'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches GALLERY_VIDEOS — {title, url}. Kept as its own array (not folded
// into GALLERY_ALBUMS) since a video has no photo list and no count —
// forcing it into the album shape would mean inventing fields it doesn't
// have, per the Gallery migration's "do not invent" rule.
const NEW_VIDEO = { title: '', url: '' };

// `value` defaults to [] since GALLERY_VIDEOS is a brand-new key that won't
// exist on the live Content document until the Gallery migration script
// commits — without this, opening this tab first would crash on
// `items.map` over undefined.
export function GalleryVideosForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value || []}
      onChange={onChange}
      newItemTemplate={NEW_VIDEO}
      itemLabel={(item) => item.title || 'New video'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-2">
          <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Video title" className={inputClass} />
          <input type="text" value={item.url} onChange={(e) => onItemChange({ ...item, url: e.target.value })} placeholder="Video URL (e.g. YouTube link)" className={inputClass} />
        </div>
      )}
    />
  );
}
