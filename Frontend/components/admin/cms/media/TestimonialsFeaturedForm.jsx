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

// Matches pages/media's TESTIMONIALS_FEATURED shape — {id, sourceId?,
// category, rating?, quote, name, role, image?, active}. Text-only by
// design: the verified Vandana Mam reference design confirms the Featured
// section shows only text testimonial cards (QA Bug 19 Stage 4), so no
// `type`/video/image-testimonial fields are added here, unlike
// TestimonialsAllForm.jsx. `image`/`active` were previously withheld from
// this form deliberately (see the Stage 4 planning report) only because the
// three names populating this array hadn't yet been confirmed as genuine —
// they are now explicitly approved for QA Bug 19 Stage 5B.
//
// `id` starts as NEW_TESTIMONIAL_ID_SENTINEL ('') — see TestimonialsAllForm.jsx's
// header comment for the full reasoning; withGeneratedIds()/
// `cloneLastItem={false}` below work identically here.
// QA Bug 19 Stage 5B correction — no `rating` key at all on a brand-new
// testimonial (never `rating: ''`): see testimonialCms.mjs's
// applyRatingSelection() header comment for the full reasoning.
const NEW_TESTIMONIAL = {
  id: NEW_TESTIMONIAL_ID_SENTINEL,
  category: 'other',
  quote: '',
  name: '',
  role: '',
  image: null,
  active: true,
};

export function TestimonialsFeaturedForm({ value, onChange }) {
  // QA Bug 19 Stage 5B final safety correction — see TestimonialsAllForm.jsx's
  // matching comment for the full reasoning.
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
          {item.sourceId && (
            <p className="font-sans text-xs text-charcoal/50">
              Imported from: <span className="font-mono">{item.sourceId}</span> (read-only)
            </p>
          )}
          {/* QA Bug 19 Stage 5B correction — see TestimonialsAllForm.jsx's
              matching comment for the full reasoning: this testimonial-local
              checkbox fills the one gap RepeatableList's own built-in
              checkbox leaves (it only renders once `active` is defined). */}
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
            <select value={item.category || ''} onChange={(e) => onItemChange({ ...item, category: e.target.value })} className={inputClass}>
              <option value="">Category…</option>
              {TESTIMONIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
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
          </div>
          <textarea value={item.quote} onChange={(e) => onItemChange({ ...item, quote: e.target.value })} placeholder="Testimonial text" rows={3} className={inputClass} />
          <ImageField label="Profile photo (optional)" value={item.image} onChange={(image) => onItemChange({ ...item, image })} />
          </div>
        )}
      />
    </>
  );
}
