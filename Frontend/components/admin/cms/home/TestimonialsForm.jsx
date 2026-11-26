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
// QA Bug 19 Stage 5B — `id`/`category`/`rating` added; `name`/`role`/
// `quote`/`image`/`active` are unchanged, existing field names. `id` starts
// as NEW_TESTIMONIAL_ID_SENTINEL ('') — see TestimonialsAllForm.jsx's header
// comment for the full reasoning; withGeneratedIds()/`cloneLastItem={false}`
// below work identically here. Text-only by design (the homepage's
// "Impact Stories" testimonials are, and have always been, text-only) — no
// `type`/video/image-testimonial fields are added here. No `rating` key at
// all on a brand-new testimonial (never `rating: ''`) — see
// testimonialCms.mjs's applyRatingSelection() header comment.
const NEW_TESTIMONIAL = {
  id: NEW_TESTIMONIAL_ID_SENTINEL,
  category: 'other',
  name: '',
  role: '',
  quote: '',
  image: null,
  active: true,
};

export function TestimonialsForm({ value, onChange }) {
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
              matching comment for the full reasoning. */}
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
            <input
              type="text"
              value={item.name}
              onChange={(e) => onItemChange({ ...item, name: e.target.value })}
              placeholder="Person name"
              className={inputClass}
            />
            <input
              type="text"
              value={item.role}
              onChange={(e) => onItemChange({ ...item, role: e.target.value })}
              placeholder="Designation / location"
              className={inputClass}
            />
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
          <textarea
            value={item.quote}
            onChange={(e) => onItemChange({ ...item, quote: e.target.value })}
            placeholder="Testimonial text"
            rows={3}
            className={inputClass}
          />
          <ImageField label="Photo" value={item.image} onChange={(image) => onItemChange({ ...item, image })} />
          </div>
        )}
      />
    </>
  );
}
