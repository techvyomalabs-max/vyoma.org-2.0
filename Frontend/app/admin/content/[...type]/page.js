'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditor } from '@/components/admin/content/ContentEditor';
import { RevisionHistory } from '@/components/admin/content/RevisionHistory';

function ContentTypeEditorContent() {
  const { apiFetch } = useAdminAuth();
  const params = useParams();
  const type = Array.isArray(params.type) ? params.type.join('/') : String(params.type);

  const [doc, setDoc] = useState(null);
  const [draftValue, setDraftValue] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(null); // 'draft' | 'publish' | 'unpublish' | 'preview' | revisionId
  const encodedType = encodeURIComponent(type);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentDoc, revisionList] = await Promise.all([
        apiFetch(`/admin/content?type=${encodedType}`),
        apiFetch(`/admin/content/revisions?type=${encodedType}`),
      ]);
      setDoc(contentDoc);
      setDraftValue(contentDoc.draftData ?? contentDoc.data ?? null);
      setRevisions(revisionList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, encodedType]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (key, fn) => {
    setBusy(key);
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleSaveDraft = () =>
    runAction('draft', async () => {
      await apiFetch('/admin/content', { method: 'PUT', body: { type, data: draftValue } });
      setNotice('Draft saved.');
      await load();
    });

  const handlePreview = () =>
    runAction('preview', async () => {
      const result = await apiFetch(`/admin/content/preview?type=${encodedType}`);
      setPreview(result);
    });

  const handlePublish = () =>
    runAction('publish', async () => {
      await apiFetch('/admin/content/publish', { method: 'POST', body: { type } });
      setNotice('Published — now live on the public site.');
      setPreview(null);
      await load();
    });

  const handleUnpublish = () => {
    if (!window.confirm(`Unpublish "${type}"? It will stop appearing on the public site immediately. Its content is kept and can be republished later.`)) {
      return;
    }
    runAction('unpublish', async () => {
      await apiFetch('/admin/content/unpublish', { method: 'POST', body: { type } });
      setNotice('Unpublished — hidden from the public site.');
      setPreview(null);
      await load();
    });
  };

  const handleRestore = (revision) => {
    if (!window.confirm(`Restore version ${revision.version}? This immediately replaces the live published content and any unsaved draft edits will be lost.`)) {
      return;
    }
    runAction(revision._id, async () => {
      await apiFetch('/admin/content/revisions/restore', { method: 'POST', body: { type, revisionId: revision._id } });
      setNotice(`Restored version ${revision.version}.`);
      setPreview(null);
      await load();
    });
  };

  const startEmpty = () => setDraftValue({});

  return (
    <div className="mx-auto mt-10 max-w-[900px] px-4">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">{type}</h1>
      {doc && (
        <p className="mb-4 font-sans text-sm text-charcoal/60">
          Status: <strong>{doc.status}</strong>
          {doc.draftData != null && ' · unpublished draft changes pending'}
        </p>
      )}
      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="mb-3 font-sans text-sm text-red-600">{error}</p>}
      {notice && <p className="mb-3 font-sans text-sm text-green-700">{notice}</p>}

      {!loading && doc && (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === 'draft'}
              onClick={handleSaveDraft}
              className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === 'draft' ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              disabled={busy === 'preview'}
              onClick={handlePreview}
              className="rounded-md border border-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-vyoma-blue disabled:opacity-60"
            >
              {busy === 'preview' ? 'Loading…' : 'Preview'}
            </button>
            <button
              type="button"
              disabled={busy === 'publish'}
              onClick={handlePublish}
              className="rounded-md border border-green-700 px-4 py-2 font-sans text-sm font-semibold text-green-700 disabled:opacity-60"
            >
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
            <button
              type="button"
              disabled={busy === 'unpublish'}
              onClick={handleUnpublish}
              className="rounded-md border border-red-400 px-4 py-2 font-sans text-sm font-semibold text-red-600 disabled:opacity-60"
            >
              {busy === 'unpublish' ? 'Unpublishing…' : 'Unpublish'}
            </button>
          </div>

          {preview && (
            <div className="mb-4 rounded-md border border-amber-gold bg-amber-50 p-3">
              <p className="mb-1 font-sans text-xs font-bold uppercase text-charcoal/60">
                Preview — showing: {preview.previewing}
              </p>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-charcoal">
                {JSON.stringify(preview.data, null, 2)}
              </pre>
            </div>
          )}

          <div className="mb-6 rounded-md border border-[var(--border-subtle)] p-4">
            <h2 className="mb-3 font-sans text-lg font-bold text-vyoma-blue">Edit draft</h2>
            {draftValue == null ? (
              <div>
                <p className="mb-2 font-sans text-sm text-charcoal/60">No content exists for this type yet.</p>
                <button
                  type="button"
                  onClick={startEmpty}
                  className="rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue"
                >
                  Start with an empty object
                </button>
              </div>
            ) : (
              <ContentEditor value={draftValue} onChange={setDraftValue} />
            )}
          </div>

          <div className="rounded-md border border-[var(--border-subtle)] p-4">
            <h2 className="mb-3 font-sans text-lg font-bold text-vyoma-blue">Revision history</h2>
            <RevisionHistory revisions={revisions} onRestore={handleRestore} restoring={busy} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ContentTypeEditorPage() {
  return (
    <RequireAdminAuth>
      <ContentTypeEditorContent />
    </RequireAdminAuth>
  );
}
