'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { useToast } from '@/components/admin/ui/Toast';

// Shared draft/preview/publish/revision-history logic behind every
// structured page editor (Home, About, Our Work, Impact, Credibility, Join
// Us, and now the focused Media sub-editors) — all of them reuse the exact
// same generic Content API (GET/PUT /admin/content, /publish, /unpublish,
// /revisions[/restore]) that Phase B proved on Home; this hook just avoids
// re-writing that wiring per page.
//
// `typeOrTypes`: a single type string (every original caller — unchanged
// behavior), OR an array of type strings for content that must stay
// synchronized across more than one Content document — e.g.
// 'pages/media' and its bare 'media' twin (see
// Backend/scripts/runSeed.js's CONTENT_SEED comment: both are seeded from
// the same media.js module because Frontend/services/mediaService.js reads
// the bare 'media' type while pageService.js reads 'pages/media'). The
// FIRST type in the array is the "primary" — it alone drives what's shown
// (doc/draftValue/revisions) and its own revision history; every write
// (save/publish/unpublish/restore) is mirrored onto every other type in the
// array afterward, using the primary's own resulting data, so they can
// never drift apart again once edited exclusively through this hook.
export function useContentEditor(typeOrTypes) {
  const types = Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes];
  const type = types[0];
  const secondaryTypes = types.slice(1);
  const { apiFetch } = useAdminAuth();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [draftValue, setDraftValue] = useState(null);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  // The last value actually confirmed saved to the server (right after
  // load() populates draftValue, and again after every successful
  // save/publish/unpublish/restore, since each of those ends by calling
  // load() again). Used only to detect "does the screen currently hold an
  // edit that was never saved" — e.g. accepting a background-removed photo
  // and then reloading/navigating away before clicking Save Draft, which
  // would otherwise silently discard it with no warning at all.
  const lastSyncedValueRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contentDoc, revisionList] = await Promise.all([
        apiFetch(`/admin/content?type=${encodeURIComponent(type)}`),
        apiFetch(`/admin/content/revisions?type=${encodeURIComponent(type)}`),
      ]);
      const value = contentDoc.draftData ?? contentDoc.data ?? null;
      setDoc(contentDoc);
      setDraftValue(value);
      lastSyncedValueRef.current = value;
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

  // Warns before a reload/close/external-navigation would silently discard
  // an edit that hasn't been saved yet — there was previously no protection
  // against this at all. Does not (and cannot, without deeper Next.js
  // router integration) cover navigating to a different admin page via an
  // in-app link; this is deliberately the smallest safe guard against the
  // most common way to lose an accepted edit, not a complete solution.
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (JSON.stringify(draftValue) === JSON.stringify(lastSyncedValueRef.current)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [draftValue]);

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

  // Mirrors `data` (the primary type's just-written draft or published
  // value) onto every secondary type, as a plain draft PUT — never touches
  // a secondary's own publish state here; the caller decides whether to
  // also publish the mirrored draft (see publish() below).
  const mirrorDraftToSecondaries = (data) =>
    Promise.all(secondaryTypes.map((t) => apiFetch('/admin/content', { method: 'PUT', body: { type: t, data } })));

  const saveDraft = (validate) => {
    const validationError = validate?.(draftValue);
    if (validationError) return toast.error(validationError);
    return runAction(
      'draft',
      async () => {
        await apiFetch('/admin/content', { method: 'PUT', body: { type, data: draftValue } });
        await mirrorDraftToSecondaries(draftValue);
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
        // Always persist exactly what's currently on screen *first* — the
        // publish endpoint itself only promotes whatever draftData is
        // already stored server-side, it is never sent the in-memory
        // draftValue. "Save draft" and "Publish" are two independent
        // buttons with no enforced order, so clicking Publish without an
        // immediately-preceding successful Save (the common case: edit,
        // then go straight to Publish) silently re-published stale,
        // previously-saved data — discarding any newer edit (including a
        // deletion) with no warning, while still showing a "Published" success
        // toast. This was the root cause of a category deletion that
        // appeared to work locally but never actually left the published
        // data. Mirroring saveDraft's own PUT here closes that gap: publish
        // now always reflects the current draftValue, regardless of
        // whether "Save draft" was clicked beforehand.
        await apiFetch('/admin/content', { method: 'PUT', body: { type, data: draftValue } });
        await mirrorDraftToSecondaries(draftValue);
        await apiFetch('/admin/content/publish', { method: 'POST', body: { type } });
        if (secondaryTypes.length) {
          await Promise.all(
            secondaryTypes.map((t) => apiFetch('/admin/content/publish', { method: 'POST', body: { type: t } }))
          );
        }
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
        await Promise.all(
          secondaryTypes.map((t) => apiFetch('/admin/content/unpublish', { method: 'POST', body: { type: t } }))
        );
        await load();
      },
      'Unpublished — hidden from the public site.'
    );

  const restore = (revision) =>
    runAction(
      revision._id,
      async () => {
        await apiFetch('/admin/content/revisions/restore', { method: 'POST', body: { type, revisionId: revision._id } });
        if (secondaryTypes.length) {
          const primaryDoc = await apiFetch(`/admin/content?type=${encodeURIComponent(type)}`);
          await mirrorDraftToSecondaries(primaryDoc.data);
          await Promise.all(
            secondaryTypes.map((t) => apiFetch('/admin/content/publish', { method: 'POST', body: { type: t } }))
          );
        }
        await load();
      },
      `Restored version ${revision.version}.`
    );

  return { doc, draftValue, setSectionValue, revisions, loading, error, busy, saveDraft, publish, unpublish, restore };
}
