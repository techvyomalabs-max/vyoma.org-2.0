'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches GALLERY_ALBUMS' post-migration shape — {title, images:
// [{url, caption?, alt?, attachmentId?}]}. Photo count is deliberately NOT
// stored here — it's derived as images.length by the public page, so there
// is only one source of truth for how many photos an album has.
// `attachmentId` (present only on WordPress-migrated images) has no input
// here — it's preserved silently via object spread when other fields on
// the same image are edited, but is migration-only, not admin-editable.
const NEW_ALBUM = { title: '', images: [] };
const NEW_IMAGE = { url: '', caption: '', alt: '' };

export function GalleryAlbumsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_ALBUM}
      itemLabel={(item) => item.title || 'New album'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-3">
          <input type="text" value={item.title} onChange={(e) => onItemChange({ ...item, title: e.target.value })} placeholder="Album title" className={inputClass} />
          <div className="rounded-md border border-[var(--border-subtle)] p-3">
            <div className="mb-2 font-sans text-xs font-bold text-charcoal/60">
              Images ({(item.images || []).length})
            </div>
            <RepeatableList
              items={item.images || []}
              onChange={(images) => onItemChange({ ...item, images })}
              newItemTemplate={NEW_IMAGE}
              itemLabel={(img) => img.caption || img.url || 'New image'}
              renderItem={(img, onImgChange) => (
                <div className="space-y-2">
                  <input type="text" value={img.url} onChange={(e) => onImgChange({ ...img, url: e.target.value })} placeholder="Image URL" className={inputClass} />
                  <input
                    type="text"
                    value={img.caption || ''}
                    onChange={(e) => onImgChange({ ...img, caption: e.target.value })}
                    placeholder="Caption (optional)"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={img.alt || ''}
                    onChange={(e) => onImgChange({ ...img, alt: e.target.value })}
                    placeholder="Alt text (optional)"
                    className={inputClass}
                  />
                </div>
              )}
            />
          </div>
        </div>
      )}
    />
  );
}
