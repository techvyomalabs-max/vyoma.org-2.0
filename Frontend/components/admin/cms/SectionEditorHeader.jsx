'use client';

// Orients the admin: which public page/section this form controls, and lets
// them jump straight to seeing it. `previewHref`, when provided, should be a
// Draft Mode link (see app/api/draft/route.js) — minting that link safely
// (without exposing the draft secret to the browser) is Phase B's job, once
// there's a real page to preview; this component just renders whatever link
// it's given.
export function SectionEditorHeader({ pageName, sectionName, description, publicPath, previewHref }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--border-subtle)] bg-sky-mist/40 p-3">
      <div>
        <p className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">
          {pageName} &middot; {sectionName}
        </p>
        {description && <p className="mt-0.5 font-sans text-sm text-charcoal/70">{description}</p>}
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
        {previewHref && (
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-xs font-semibold text-charcoal"
          >
            Preview draft
          </a>
        )}
      </div>
    </div>
  );
}
