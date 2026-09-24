'use client';

import { useState } from 'react';
import { useContentEditor } from '@/lib/useContentEditor';
import { Tabs } from '@/components/admin/ui/Tabs';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';
import { SectionEditorHeader } from '@/components/admin/cms/SectionEditorHeader';

// Generic structured page editor shell — the same shape proven on Home
// (Phase B), parameterized so About/Our Work/Impact/Credibility/Join Us
// don't each reimplement the header/tabs/actions/revision-history UI.
// `pageLabel`: shown as the H1. `type`: the Content type key.
// `sections`: [{ key, label, description, publicPath, Form }] — `key` is
// the field within this type's data object; `Form` gets {value, onChange}.
// `validate(data)`: optional, returns an error string or null.
export function ContentEditorShell({ pageLabel, type, sections, validate }) {
  const { doc, draftValue, setSectionValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore } =
    useContentEditor(type);
  const [activeTab, setActiveTab] = useState(sections[0].key);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(null);

  const section = sections.find((s) => s.key === activeTab);

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-sans text-h2 font-bold text-vyoma-blue">{pageLabel}</h1>
          {doc && (
            <p className="font-sans text-sm text-charcoal/60">
              Status: <strong>{doc.status}</strong>
              {doc.draftData != null && ' · unpublished draft changes pending'}
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
          <Tabs tabs={sections.map((s) => ({ key: s.key, label: s.label }))} active={activeTab} onChange={setActiveTab} />

          <SectionEditorHeader
            pageName={pageLabel}
            sectionName={section.label}
            description={section.description}
            publicPath={section.publicPath}
          />

          <div className="mb-8">
            <section.Form value={draftValue[section.key]} onChange={(v) => setSectionValue(section.key, v)} />
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
