'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { Tabs } from './Tabs';

// The picker behind every Image/Logo/PDF/Document/Excel field. Two tabs:
// "Media Library" (the normal, permanent workflow — browse/upload/select an
// already-managed file) and "External URL" (an explicitly temporary fallback
// for while AWS S3 isn't configured — see s3.adapter.js). Once S3 is live,
// nothing here changes; uploads in the Library tab simply start succeeding
// instead of showing the "not connected" notice.
export function MediaPicker({ open, onClose, onSelect, accept }) {
  const { apiFetch } = useAdminAuth();
  const [tab, setTab] = useState('library');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setNotice(null);
    const acceptKinds = accept ? (Array.isArray(accept) ? accept : [accept]) : null;
    apiFetch('/admin/media')
      .then((list) => setItems(acceptKinds ? list.filter((m) => acceptKinds.includes(m.kind)) : list))
      .catch((err) => setNotice(err.message))
      .finally(() => setLoading(false));
  }, [open, accept, apiFetch]);

  if (!open) return null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const doc = await apiFetch('/admin/media', { method: 'POST', body });
      setItems((prev) => [doc, ...prev]);
    } catch (err) {
      if (err.code === 'MEDIA_NOT_CONFIGURED') {
        setNotice('File storage isn’t connected yet. Pick an already-uploaded file below, or use the External URL tab for now.');
      } else {
        setNotice(err.message);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleUseExternal = () => {
    if (!externalUrl.trim()) return;
    onSelect({ url: externalUrl.trim(), filename: externalUrl.trim().split('/').pop() });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-md bg-white p-5 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-sans text-base font-bold text-charcoal">Choose a file</h2>
          <button type="button" onClick={onClose} className="font-sans text-sm text-charcoal/60">
            Close
          </button>
        </div>

        <Tabs
          tabs={[
            { key: 'library', label: 'Media Library' },
            { key: 'external', label: 'External URL (temporary)' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {notice && <p className="mb-3 font-sans text-sm text-amber-700">{notice}</p>}

        {tab === 'library' && (
          <div className="flex-1 overflow-y-auto">
            <label className="mb-3 inline-block rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue">
              {uploading ? 'Uploading…' : 'Upload new file'}
              <input type="file" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
            {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
            {!loading && !items.length && (
              <p className="font-sans text-sm text-charcoal/60">No files uploaded yet.</p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {items.map((m) => (
                <button
                  key={m._id}
                  type="button"
                  onClick={() => onSelect({ mediaId: m._id, url: m.url, filename: m.filename, mimeType: m.mimeType, size: m.size })}
                  className="flex flex-col items-center gap-1 rounded-md border border-[var(--border-subtle)] p-2 text-left hover:border-vyoma-blue"
                >
                  {m.kind === 'image' && m.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.filename} className="h-16 w-full rounded object-cover" />
                  ) : (
                    <span className="flex h-16 w-full items-center justify-center rounded bg-sky-mist font-sans text-xs font-semibold uppercase text-vyoma-blue">
                      {m.kind}
                    </span>
                  )}
                  <span className="w-full truncate font-sans text-xs text-charcoal" title={m.filename}>
                    {m.filename}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'external' && (
          <div className="flex-1">
            <p className="mb-2 font-sans text-xs text-charcoal/60">
              Temporary fallback only, while file storage isn&apos;t connected. Once it is, use Media Library instead.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
                className="flex-1 rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal"
              />
              <button
                type="button"
                onClick={handleUseExternal}
                disabled={!externalUrl.trim()}
                className="rounded-md bg-vyoma-blue px-3.5 py-2 font-sans text-sm font-semibold text-white disabled:opacity-50"
              >
                Use this URL
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
