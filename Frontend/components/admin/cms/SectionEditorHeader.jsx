'use client';

import { useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';

// Orients the admin: which public page/section this form controls, and lets
// them jump straight to seeing it. "Preview draft" no longer carries any
// secret in a link — it calls enablePreview() (AdminAuthContext), which
// proves this is a real admin session server-to-server before Draft Mode
// turns on, then opens the real page in a new tab.
export function SectionEditorHeader({ pageName, sectionName, description, publicPath }) {
  const { enablePreview } = useAdminAuth();
  const [error, setError] = useState(null);

  const handlePreview = async () => {
    setError(null);
    try {
      const redirect = await enablePreview(publicPath);
      window.open(redirect, '_blank');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-sky-mist/40 p-3">
      <div>
        <p className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">
          {pageName} &middot; {sectionName}
        </p>
        {description && <p className="mt-0.5 font-sans text-sm text-charcoal/70">{description}</p>}
        {error && <p className="mt-0.5 font-sans text-xs text-red-600">{error}</p>}
      </div>
      <div className="flex gap-2">
        {publicPath && (
          <a
            href={publicPath}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-vyoma-blue px-2.5 py-1.5 font-sans text-xs font-semibold text-vyoma-blue"
          >
            View on website
          </a>
        )}
        <button
          type="button"
          onClick={handlePreview}
          className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-xs font-semibold text-charcoal"
        >
          Preview draft
        </button>
      </div>
    </div>
  );
}
