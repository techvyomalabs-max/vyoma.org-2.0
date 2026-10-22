'use client';

import { useEffect, useRef, useState } from 'react';
import { MediaPicker } from './MediaPicker';
import { useAdminAuth } from '@/lib/AdminAuthContext';

const POLL_INTERVAL_MS = 2000;

// value shape: { mediaId?, url, alt, caption? } | null
// The "managed resource" pattern from the CMS redesign: this field stores a
// reference (mediaId + cached url/filename), never a bare URL an admin has
// to know or maintain by hand.
//
// `enableBackgroundRemoval` (opt-in, only passed by PeopleForm today) adds a
// "Remove Background" action for Leadership/Core Team person photos. It
// never touches `value`/`onChange` on its own — the processed result is
// only a local preview until the admin explicitly clicks "Use Processed
// Photo", at which point it's applied through the exact same `onChange`
// path as picking a different photo in MediaPicker. Clicking "Keep
// Original" (or just not accepting) leaves the field completely untouched.
// This is local-development-only today (see localDev.storageAdapter.js on
// the Backend) — the button quietly does nothing harmful if the feature
// isn't configured in a given environment, it just reports the error.
export function ImageField({ value, onChange, label = 'Image', withCaption = false, enableBackgroundRemoval = false }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { apiFetch } = useAdminAuth();

  // 'idle' | 'processing' | 'ready' | 'error'
  const [bgState, setBgState] = useState('idle');
  const [bgResultUrl, setBgResultUrl] = useState(null);
  const [bgError, setBgError] = useState(null);
  // Tracks whether the processed <img> itself actually rendered — a job can
  // report "done" with a resultUrl that still fails to load in the browser
  // (wrong static route, CORS/CORP, file removed, etc.), so "Use Processed
  // Photo" must never be enabled until the image has been confirmed to
  // load, not just until the backend says it finished.
  const [previewLoadState, setPreviewLoadState] = useState('loading'); // 'loading' | 'loaded' | 'failed'
  const pollRef = useRef(null);
  const sourceUrlAtRequestRef = useRef(null);
  // Tracks the current `value` prop for the poll callback below — a plain
  // closure over `value` would only ever see the snapshot from when polling
  // started (setInterval's callback is created once), so it could never
  // actually detect the admin picking a different photo mid-job.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Any change to the underlying value from elsewhere (picked a different
  // photo, cleared it, etc.) discards any in-progress/unaccepted preview —
  // it would no longer be a before/after of the CURRENT photo otherwise.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const resetBgState = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setBgState('idle');
    setBgResultUrl(null);
    setBgError(null);
    setPreviewLoadState('loading');
  };

  const handleSelect = (picked) => {
    resetBgState();
    onChange({ ...value, mediaId: picked.mediaId, url: picked.url, alt: value?.alt || '' });
    setPickerOpen(false);
  };

  const handleRemoveBackground = async () => {
    if (!value?.url) return;
    setBgState('processing');
    setBgError(null);
    setBgResultUrl(null);
    sourceUrlAtRequestRef.current = value.url;

    const poll = async (jobId) => {
      try {
        const job = await apiFetch(`/admin/photo-processing/${jobId}`);
        // If the admin changed the photo while this job was running, the
        // result no longer belongs to the current value — drop it silently.
        // Compares against the LIVE value via valueRef, not a stale closure.
        if (sourceUrlAtRequestRef.current !== valueRef.current?.url) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          return;
        }
        if (job.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPreviewLoadState('loading');
          setBgResultUrl(job.resultUrl);
          setBgState('ready');
        } else if (job.status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBgError(job.errorMessage || 'Background removal failed.');
          setBgState('error');
        }
        // 'queued'/'processing' -> keep polling
      } catch (err) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBgError(err.message || 'Could not check processing status.');
        setBgState('error');
      }
    };

    try {
      const job = await apiFetch('/admin/photo-processing', { method: 'POST', body: { sourceUrl: value.url } });
      pollRef.current = setInterval(() => poll(job.id), POLL_INTERVAL_MS);
    } catch (err) {
      setBgError(err.code === 'BACKGROUND_REMOVAL_NOT_CONFIGURED' ? 'Background removal isn’t available in this environment.' : err.message || 'Could not start background removal.');
      setBgState('error');
    }
  };

  const useProcessed = () => {
    onChange({ ...value, url: bgResultUrl });
    resetBgState();
  };

  return (
    <div>
      <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{label}</label>
      <div className="flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sky-mist">
          {value?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt={value.alt || ''} className="h-full w-full object-cover" />
          ) : (
            <span className="font-sans text-[10px] text-charcoal/50">No image</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-md border border-vyoma-blue px-2.5 py-1.5 font-sans text-xs font-semibold text-vyoma-blue"
            >
              {value?.url ? 'Replace' : 'Select'}
            </button>
            {value?.url && (
              <button
                type="button"
                onClick={() => {
                  resetBgState();
                  onChange(null);
                }}
                className="rounded-md border border-red-300 px-2.5 py-1.5 font-sans text-xs font-semibold text-red-600"
              >
                Remove
              </button>
            )}
            {enableBackgroundRemoval && value?.url && bgState === 'idle' && (
              <button
                type="button"
                onClick={handleRemoveBackground}
                className="rounded-md border border-teal-600 px-2.5 py-1.5 font-sans text-xs font-semibold text-teal-700"
              >
                Remove Background
              </button>
            )}
            {bgState === 'processing' && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-xs text-charcoal/70">
                <span className="h-2 w-2 animate-pulse rounded-full bg-teal-600" aria-hidden="true" />
                Removing background…
              </span>
            )}
          </div>

          {bgState === 'error' && (
            <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 font-sans text-xs text-red-700">
              {bgError}
              <button type="button" onClick={resetBgState} className="ml-2 font-bold underline">
                Dismiss
              </button>
            </div>
          )}

          {bgState === 'ready' && bgResultUrl && (
            <div className="rounded-md border border-[var(--border-subtle)] bg-white p-2.5">
              <div className="mb-2 font-sans text-xs font-bold text-charcoal/70">Preview</div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="mb-1 font-sans text-[10px] font-semibold uppercase text-charcoal/50">Original</div>
                  <div className="h-24 w-24 overflow-hidden rounded-md bg-sky-mist">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={value.url} alt="Original" className="h-full w-full object-cover" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="mb-1 font-sans text-[10px] font-semibold uppercase text-charcoal/50">Processed</div>
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-md bg-sky-mist">
                    {previewLoadState !== 'failed' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={bgResultUrl}
                        alt="Processed"
                        className="h-full w-full object-cover"
                        onLoad={() => setPreviewLoadState('loaded')}
                        onError={() => setPreviewLoadState('failed')}
                      />
                    ) : (
                      <span className="px-1 text-center font-sans text-[9px] text-red-600">Couldn&apos;t load</span>
                    )}
                  </div>
                </div>
              </div>

              {previewLoadState === 'failed' && (
                <p className="mt-2 font-sans text-xs text-red-700">
                  The processed photo couldn&apos;t be loaded, so it can&apos;t be used. Your original photo is unaffected — try again, or dismiss this.
                </p>
              )}

              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={useProcessed}
                  disabled={previewLoadState !== 'loaded'}
                  title={previewLoadState !== 'loaded' ? 'Waiting for the processed photo to finish loading' : undefined}
                  className="rounded-md bg-teal-700 px-2.5 py-1.5 font-sans text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Use Processed Photo
                </button>
                <button
                  type="button"
                  onClick={resetBgState}
                  className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-xs font-semibold text-charcoal"
                >
                  Keep Original
                </button>
              </div>
            </div>
          )}

          <input
            type="text"
            value={value?.alt || ''}
            onChange={(e) => onChange({ ...value, alt: e.target.value })}
            placeholder="Alt text"
            className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
          />
          {withCaption && (
            <input
              type="text"
              value={value?.caption || ''}
              onChange={(e) => onChange({ ...value, caption: e.target.value })}
              placeholder="Caption (optional)"
              className="w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
            />
          )}
        </div>
      </div>
      <MediaPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelect} accept="image" />
    </div>
  );
}
