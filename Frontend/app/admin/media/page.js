'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { MediaUploadForm } from '@/components/admin/media/MediaUploadForm';
import { MediaLibrary } from '@/components/admin/media/MediaLibrary';

function MediaPageContent() {
  const { apiFetch } = useAdminAuth();
  const [state, setState] = useState({ loading: true, error: null, items: [] });
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch('/admin/media')
      .then((items) => setState({ loading: false, error: null, items }))
      .catch((err) => setState({ loading: false, error: err.message, items: [] }));
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async ({ file, altText }) => {
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      if (altText) body.append('altText', altText);
      await apiFetch('/admin/media', { method: 'POST', body });
      load();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiFetch(`/admin/media/${id}`, { method: 'DELETE' });
      setState((s) => ({ ...s, items: s.items.filter((m) => m._id !== id) }));
    } catch (err) {
      setState((s) => ({ ...s, error: err.message }));
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-[900px] px-4 pb-16">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Media</h1>
      <MediaUploadForm onUpload={handleUpload} uploading={uploading} error={uploadError} />
      {state.loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {state.error && <p className="font-sans text-sm text-red-600">{state.error}</p>}
      {!state.loading && !state.error && <MediaLibrary items={state.items} onDelete={handleDelete} />}
    </div>
  );
}

export default function AdminMediaPage() {
  return (
    <RequireAdminAuth>
      <MediaPageContent />
    </RequireAdminAuth>
  );
}
