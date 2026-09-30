'use client';

import { useState } from 'react';
import { useContentEditor } from '@/lib/useContentEditor';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';
import { LegalRichTextEditor } from './LegalRichTextEditor';

// Batch 2 (Privacy/Terms): a single-document editor, not the multi-section
// ContentEditorShell pattern (Home/Donate/Media/etc.) — these two pages are
// one cohesive legal document each, not several independently-toggled
// fields, so there is nothing to usefully split into tabs. Reuses
// useContentEditor directly for its draft/publish/unpublish/revision-
// history logic (identical API either way), just with a flat form instead
// of ContentEditorShell's section/tab abstraction.
export function LegalPageEditor({ pageLabel, type, publicPath }) {
  const { doc, draftValue, setSectionValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore } =
    useContentEditor(type);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const validate = (data) => {
    if (!data?.TITLE?.trim()) return 'Title is required.';
    if (!data?.BODY?.trim()) return 'Body cannot be empty.';
    return null;
  };

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-sans text-h2 font-bold text-vyoma-blue">{pageLabel}</h1>
          {doc && (
            <p className="font-sans text-sm text-charcoal/60">
              Status: <strong>{doc.status}</strong>
              {doc.draftData != null && ' · unpublished draft changes pending'}
              {' · '}
              <a href={publicPath} target="_blank" rel="noopener noreferrer" className="text-vyoma-blue underline">
                View public page
              </a>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy === 'draft'}
            onClick={() => saveDraft(validate)}
            className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === 'draft' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={busy === 'publish'}
            onClick={() => publish(validate)}
            className="rounded-md border border-green-700 px-4 py-2 font-sans text-sm font-semibold text-green-700 disabled:opacity-60"
          >
            {busy === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
          <button
            type="button"
            disabled={busy === 'unpublish'}
            onClick={() => setConfirmUnpublish(true)}
            className="rounded-md border border-red-400 px-4 py-2 font-sans text-sm font-semibold text-red-600 disabled:opacity-60"
          >
            {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
          </button>
        </div>
      </div>

      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      {!loading && draftValue && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Title</label>
              <input
                type="text"
                value={draftValue.TITLE || ''}
                onChange={(e) => setSectionValue('TITLE', e.target.value)}
                className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 font-sans text-sm text-charcoal"
              />
            </div>
            <div>
              <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Effective date (optional)</label>
              <input
                type="text"
                value={draftValue.EFFECTIVE_DATE || ''}
                onChange={(e) => setSectionValue('EFFECTIVE_DATE', e.target.value || null)}
                placeholder="e.g. 01 Jan 2023"
                className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 font-sans text-sm text-charcoal"
              />
            </div>
          </div>

          <div className="mb-8">
            <LegalRichTextEditor value={draftValue.BODY} onChange={(v) => setSectionValue('BODY', v)} />
          </div>

          <div className="mb-8 rounded-md border border-[var(--border-subtle)] p-4">
            <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">SEO</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Meta title</label>
                <input
                  type="text"
                  value={draftValue.SEO?.title || ''}
                  onChange={(e) => setSectionValue('SEO', { ...draftValue.SEO, title: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 font-sans text-sm text-charcoal"
                />
              </div>
              <div>
                <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Meta description</label>
                <input
                  type="text"
                  value={draftValue.SEO?.description || ''}
                  onChange={(e) => setSectionValue('SEO', { ...draftValue.SEO, description: e.target.value })}
                  className="w-full rounded-md border border-[var(--border-subtle)] px-3 py-2 font-sans text-sm text-charcoal"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[var(--border-subtle)] p-4">
            <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Revision history</h2>
            {!revisions.length && <p className="font-sans text-sm text-charcoal/60">No revisions yet — publish once to create the first one.</p>}
            <ul className="flex flex-col gap-2">
              {revisions.map((r) => (
                <li key={r._id} className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] px-3 py-2">
                  <span className="font-sans text-sm text-charcoal">
                    v{r.version} · {r.action} · {new Date(r.createdAt).toLocaleString()} · {r.publishedByEmail}
                  </span>
                  <button
                    type="button"
                    disabled={busy === r._id}
                    onClick={() => setConfirmRestore(r)}
                    className="font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-60"
                  >
                    {busy === r._id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmUnpublish}
        title={`Unpublish ${pageLabel}?`}
        message="It will stop appearing on the public site immediately. Its content is kept and can be republished later."
        confirmLabel="Unpublish"
        onConfirm={() => {
          setConfirmUnpublish(false);
          unpublish();
        }}
        onCancel={() => setConfirmUnpublish(false)}
      />
      <ConfirmDialog
        open={!!confirmRestore}
        title={confirmRestore ? `Restore version ${confirmRestore.version}?` : ''}
        message="This immediately replaces the live published content and any unsaved draft edits will be lost."
        confirmLabel="Restore"
        onConfirm={() => {
          restore(confirmRestore);
          setConfirmRestore(null);
        }}
        onCancel={() => setConfirmRestore(null)}
      />
    </div>
  );
}
