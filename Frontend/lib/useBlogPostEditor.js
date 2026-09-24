'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { useToast } from '@/components/admin/ui/Toast';

const BLANK_FIELDS = { title: '', excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} };

// Shared draft/preview/publish/revision-history logic for the Blog editor —
// same shape as lib/useContentEditor.js, adapted from "one document per
// type" to "one document per post, addressed by :id" (see
// blog.admin.controller.js). `slug` has its own dedicated changeSlug action
// rather than going through the general draft patch, since it's locked the
// moment the post is first published (Decision D-BLOG3).
export function useBlogPostEditor(id) {
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
      const [postDoc, revisionList] = await Promise.all([apiFetch(`/admin/blog/${id}`), apiFetch(`/admin/blog/${id}/revisions`)]);
      setDoc(postDoc);
      setDraftValue({ ...BLANK_FIELDS, ...(postDoc.draftData ?? postDoc.data ?? {}) });
      setRevisions(revisionList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, id]);

  useEffect(() => {
    load();
  }, [load]);

  const setFieldValue = (key, value) => setDraftValue((prev) => ({ ...prev, [key]: value }));

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
        await apiFetch(`/admin/blog/${id}`, { method: 'PUT', body: draftValue });
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
        await apiFetch(`/admin/blog/${id}/publish`, { method: 'POST' });
        await load();
      },
      'Published — now live on the public site.'
    );
  };

  const unpublish = () =>
    runAction(
      'unpublish',
      async () => {
        await apiFetch(`/admin/blog/${id}/unpublish`, { method: 'POST' });
        await load();
      },
      'Unpublished — hidden from the public site.'
    );

  const restore = (revision) =>
    runAction(
      revision._id,
      async () => {
        await apiFetch(`/admin/blog/${id}/revisions/restore`, { method: 'POST', body: { revisionId: revision._id } });
        await load();
      },
      `Restored version ${revision.version}.`
    );

  const changeSlug = (slug) =>
    runAction(
      'slug',
      async () => {
        await apiFetch(`/admin/blog/${id}/slug`, { method: 'PATCH', body: { slug } });
        await load();
      },
      'Slug updated.'
    );

  return { doc, draftValue, setFieldValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore, changeSlug };
}
