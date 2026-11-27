'use client';

import { useState } from 'react';
import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { ImageField } from '@/components/admin/ui/ImageField';
import {
  withGeneratedIds,
  NEW_TESTIMONIAL_ID_SENTINEL,
  TESTIMONIAL_CATEGORIES,
  RATING_OPTIONS,
  applyRatingSelection,
  isTestimonialVisible,
} from '@/lib/testimonialCms.mjs';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Matches pages/media's TESTIMONIALS_ALL shape — {id, sourceId?,
// type: 'text'|'video'|'image', category, rating?, quote?, url?, name,
// role, image?, videoThumbnail?, testimonialImage?, active}. `quote`
// applies to every type (optional for video/image — never required, since
// a genuine video/image testimonial may have no separate written quote);
// `url`/`videoThumbnail` apply to type "video"; `testimonialImage` applies
// to type "image"; `image` (a profile photo) applies to type "text".
//
// QA Bug 19 Stage 5B — `id` starts as NEW_TESTIMONIAL_ID_SENTINEL ('')
// here; RepeatableList's own addItem() (reused unmodified) clones this
// template for a freshly-added item, and withGeneratedIds() below replaces
// that sentinel with a real, freshly-generated stable id the moment the
// add actually happens — never on every render, edit, or reorder, and
// never for a legacy item that has no `id` at all. `cloneLastItem={false}`
// below is required for the same reason: cloning the last real item (the
// RepeatableList default) would otherwise duplicate its already-assigned
// id/sourceId onto a "new" item, which must never happen.
// QA Bug 19 Stage 5B correction — no `rating` key at all on a brand-new
// testimonial (never `rating: ''`): "no rating recorded" is the absence of
// the property, matching how a legacy entry that never had a rating looks.
const NEW_TESTIMONIAL = {
  id: NEW_TESTIMONIAL_ID_SENTINEL,
  type: 'text',
  category: 'other',
  quote: '',
  url: '',
  name: '',
  role: '',
  image: null,
  videoThumbnail: null,
  testimonialImage: null,
  active: true,
};

export function TestimonialsAllForm({ value, onChange }) {
  // QA Bug 19 Stage 5B final safety correction — `error` surfaces the rare
  // case where withGeneratedIds() could not safely generate a new
  // testimonial's id (no secure Web Crypto API available, or bounded
  // collision retries exhausted): cleared optimistically before every
  // change attempt, set only on an actual failure. On failure, `onChange`
  // (and therefore `value`) is never called/updated at all — the existing
  // array is left exactly as it was — so there is nothing to roll back.
  const [error, setError] = useState(null);
  const handleChange = (nextItems) => {
    setError(null);
    withGeneratedIds(onChange, { onError: setError })(nextItems);
  };
  return (
    <>
      {error && (
        <p role="alert" className="mb-2 font-sans text-sm text-red-600">
          {error}
        </p>
      )}
      <RepeatableList
        items={value}
        onChange={handleChange}
        newItemTemplate={NEW_TESTIMONIAL}
        cloneLastItem={false}
        itemLabel={(item) => item.name || 'New testimonial'}
        renderItem={(item, onItemChange) => (
          <div className="space-y-2">
          {/* Read-only — imported provenance is never editable here, and
              every onItemChange call below spreads {...item} first, so it
              is never dropped or overwritten by an unrelated field edit. */}
          {item.sourceId && (
            <p className="font-sans text-xs text-charcoal/50">
              Imported from: <span className="font-mono">{item.sourceId}</span> (read-only)
            </p>
          )}
          {/* QA Bug 19 Stage 5B correction — RepeatableList's own built-in
              "Visible" checkbox only renders when `active !== undefined`,
              so a legacy entry that has never had an `active` property at
              all (every TESTIMONIALS_ALL entry today) had no way to be
              hidden through the admin UI, even though it is already treated
              as visible by the public page's toActiveContentArray().  This
              testimonial-local checkbox fills exactly that one gap — it
              only renders while `active` is still undefined, and the very
              first time an admin toggles it, `active` becomes an explicit
              true/false, at which point RepeatableList's own header-row
              checkbox takes over seamlessly and this one stops rendering
              (no duplicate control). It is never shown/checked based on
              anything written automatically — isTestimonialVisible() is a
              pure read of the current value, and onItemChange here only
              ever fires from an explicit admin click. */}
          {item.active === undefined && (
            <label className="inline-flex items-center gap-1 font-sans text-xs text-charcoal">
              <input
                type="checkbox"
                checked={isTestimonialVisible(item)}
                onChange={(e) => onItemChange({ ...item, active: e.target.checked })}
              />
              Visible
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={item.name} onChange={(e) => onItemChange({ ...item, name: e.target.value })} placeholder="Person name" className={inputClass} />
            <input type="text" value={item.role} onChange={(e) => onItemChange({ ...item, role: e.target.value })} placeholder="Designation / location" className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={item.type}
              onChange={(e) => onItemChange({ ...item, type: e.target.value })}
              className={inputClass}
            >
              <option value="text">Text</option>
              <option value="video">Video</option>
              <option value="image">Image</option>
            </select>
            <select value={item.category || ''} onChange={(e) => onItemChange({ ...item, category: e.target.value })} className={inputClass}>
              <option value="">Category…</option>
              {TESTIMONIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <select
            value={item.rating ?? ''}
            onChange={(e) => onItemChange(applyRatingSelection(item, e.target.value))}
            className={inputClass}
          >
            <option value="">No rating</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r} star{r > 1 ? 's' : ''}
              </option>
            ))}
          </select>

          {item.type === 'text' && (
            <>
              <textarea value={item.quote || ''} onChange={(e) => onItemChange({ ...item, quote: e.target.value })} placeholder="Testimonial text" rows={3} className={inputClass} />
              <ImageField label="Profile photo (optional)" value={item.image} onChange={(image) => onItemChange({ ...item, image })} />
            </>
          )}

          {item.type === 'video' && (
            <>
              <input
                type="text"
                value={item.url || ''}
                onChange={(e) => onItemChange({ ...item, url: e.target.value })}
                placeholder="Video URL (e.g. YouTube link)"
                className={inputClass}
              />
              <ImageField
                label="Explicit video thumbnail (optional)"
                value={item.videoThumbnail}
                onChange={(videoThumbnail) => onItemChange({ ...item, videoThumbnail })}
              />
              <textarea
                value={item.quote || ''}
                onChange={(e) => onItemChange({ ...item, quote: e.target.value })}
                placeholder="Original quote (optional — only if the submitter also gave a written quote)"
                rows={2}
                className={inputClass}
              />
            </>
          )}

          {item.type === 'image' && (
            <>
              {/* QA Bug 19 Stage 5B clarification — "(required)" here is a
                  visual label only, not actual validation: nothing in this
                  form (or the generic save/publish path) currently prevents
                  saving an "image"-type testimonial with no
                  testimonialImage selected. Real enforcement is explicitly
                  deferred to Stage 5D's backend validation. */}
              <ImageField
                label="Testimonial image (required)"
                value={item.testimonialImage}
                onChange={(testimonialImage) => onItemChange({ ...item, testimonialImage })}
              />
              <textarea
                value={item.quote || ''}
                onChange={(e) => onItemChange({ ...item, quote: e.target.value })}
                placeholder="Original quote (optional — only if legible/available)"
                rows={2}
                className={inputClass}
              />
            </>
          )}
          </div>
        )}
      />
    </>
  );
}
