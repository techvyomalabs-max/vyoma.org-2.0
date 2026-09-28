'use client';

import { useState } from 'react';
import { MediaPicker } from './MediaPicker';

// value shape: { mediaId?, url, alt, caption? } | null
// The "managed resource" pattern from the CMS redesign: this field stores a
// reference (mediaId + cached url/filename), never a bare URL an admin has
// to know or maintain by hand.
export function ImageField({ value, onChange, label = 'Image', withCaption = false }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (picked) => {
    onChange({ ...value, mediaId: picked.mediaId, url: picked.url, alt: value?.alt || '' });
    setPickerOpen(false);
  };

  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{label}</label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sky-mist">
          {value?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt={value.alt || ''} className="h-full w-full object-cover" />
          ) : (
            <span className="font-sans text-[10px] text-charcoal/50">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-md border border-vyoma-blue px-2.5 py-1.5 font-sans text-xs font-semibold text-vyoma-blue"
            >
              {value?.url ? 'Replace' : 'Select'}
            </button>
            {value?.url && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="rounded-md border border-red-300 px-2.5 py-1.5 font-sans text-xs font-semibold text-red-600"
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="text"
            value={value?.alt || ''}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
            placeholder="Alt text"
            className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
          />
          {withCaption && (
            <input
              type="text"
              value={value?.caption || ''}
              onChange={(e) => onChange({ ...value, caption: e.target.value })}
              placeholder="Caption (optional)"
              className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
            />
          )}
        </div>
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} accept="image" />
    </div>
  );
}
