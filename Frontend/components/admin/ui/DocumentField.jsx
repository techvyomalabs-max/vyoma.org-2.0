'use client';

import { useState } from 'react';
import { MediaPicker } from './MediaPicker';

// value shape: { mediaId?, url, filename, size? } | null — covers PDF,
// Word/document, and Excel/resource field types alike (they differ only in
// which MIME types the picker's upload step accepts, enforced backend-side
// by media.admin.controller.js's ALLOWED_MIME).
export function DocumentField({ value, onChange, label = 'File' }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (picked) => {
    onChange({ mediaId: picked.mediaId, url: picked.url, filename: picked.filename, size: picked.size });
    setPickerOpen(false);
  };

  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{label}</label>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border-subtle)] p-2.5">
        <span className="flex-1 truncate font-sans text-sm text-charcoal">
          {value?.filename || 'No file selected'}
        </span>
        {value?.url && (
          <>
            <a href={value.url} target="_blank" rel="noreferrer" className="font-sans text-xs font-semibold text-vyoma-blue">
              View
            </a>
            <a href={value.url} download className="font-sans text-xs font-semibold text-vyoma-blue">
              Download
            </a>
          </>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-vyoma-blue px-2.5 py-1 font-sans text-xs font-semibold text-vyoma-blue"
        >
          {value?.url ? 'Replace' : 'Select'}
        </button>
        {value?.url && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-md border border-red-300 px-2.5 py-1 font-sans text-xs font-semibold text-red-600"
          >
            Remove
          </button>
        )}
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} accept={['pdf', 'document']} />
    </div>
  );
}
