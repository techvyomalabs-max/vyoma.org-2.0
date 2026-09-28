'use client';

import { useState } from 'react';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,text/plain';

export function MediaUploadForm({ onUpload, uploading, error }) {
  const [file, setFile] = useState(null);
  const [altText, setAltText] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    await onUpload({ file, altText });
    setFile(null);
    setAltText('');
    e.target.reset();
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-[var(--border-subtle)] p-4">
      <div className="flex flex-col gap-1">
        <label className="font-sans text-xs font-semibold text-charcoal/70">File (image, PDF, or text)</label>
        <input
          type="file"
          accept={ACCEPT}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="font-sans text-sm text-charcoal"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="font-sans text-xs font-semibold text-charcoal/70">Alt text (optional)</label>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-sans text-sm text-charcoal"
        />
      </div>
      <button
        type="submit"
        disabled={!file || uploading}
        className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
      >
        {uploading ? 'Uploading…' : 'Upload'}
      </button>
      {error && <p className="w-full font-sans text-sm text-red-600">{error}</p>}
    </form>
  );
}
