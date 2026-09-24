'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { useToast } from '@/components/admin/ui/Toast';

// Shared draft/preview/publish/revision-history logic behind every
// structured page editor (Home, About, Our Work, Impact, Credibility, Join
// Us) — all of them reuse the exact same generic Content API
// (GET/PUT /admin/content, /publish, /unpublish, /revisions[/restore]) that
// Phase B proved on Home; this hook just avoids re-writing that wiring per
// page.
export function useContentEditor(type) {
  const { apiFetch } = useAdminAuth();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [draftValue, setDraftValue] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentDoc, revisionList] = await Promise.all([
        apiFetch(`/admin/content?type=${encodeURIComponent(type)}`),
        apiFetch(`/admin/content/revisions?type=${encodeURIComponent(type)}`),
      ]);
      setDoc(contentDoc);
      setDraftValue(contentDoc.draftData ?? contentDoc.data ?? null);
      setRevisions(revisionList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, type]);

  useEffect(() => {
    load();
  }, [load]);

  const setSectionValue = (key, value) => setDraftValue((prev) => ({ ...prev, [key]: value }));

  const runAction = async (key, fn, successMessage) => {
    setBusy(key);
    try {
      await fn();
      if (successMessage) toast.success(successMessage);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = (validate) => {
    const validationError = validate?.(draftValue);
    if (validationError) return toast.error(validationError);
    return runAction(
      'draft',
      async () => {
        await apiFetch('/admin/content', { method: 'PUT', body: { type, data: draftValue } });
        await load();
      },
      'Draft saved. The public page is unchanged.'
    );
  };

  const publish = (validate) => {
    const validationError = validate?.(draftValue);
    if (validationError) return toast.error(validationError);
    return runAction(
      'publish',
      async () => {
        await apiFetch('/admin/content/publish', { method: 'POST', body: { type } });
        await load();
      },
      'Published — now live on the public site.'
    );
  };

  const unpublish = () =>
    runAction(
      'unpublish',
      async () => {
        await apiFetch('/admin/content/unpublish', { method: 'POST', body: { type } });
        await load();
      },
      'Unpublished — hidden from the public site.'
    );

  const restore = (revision) =>
    runAction(
      revision._id,
      async () => {
        await apiFetch('/admin/content/revisions/restore', { method: 'POST', body: { type, revisionId: revision._id } });
        await load();
      },
      `Restored version ${revision.version}.`
    );

  return { doc, draftValue, setSectionValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore };
}
