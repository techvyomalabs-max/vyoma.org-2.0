// QA Bug 19 Stage 5B — shared, framework-free logic for the three
// testimonial CMS editors (TestimonialsAllForm.jsx, TestimonialsFeaturedForm.jsx,
// components/admin/cms/home/TestimonialsForm.jsx). Kept as a plain,
// JSX-free module specifically so it's directly importable and
// unit-testable with `node --test` (this project has no React-rendering
// harness — see Header.a11y.test.mjs's own header comment for the same,
// already-established convention), and so the one genuinely non-trivial
// piece of logic (safe stable-id assignment) is written and tested once,
// not duplicated three times across the forms.
//
// QA Bug 19 Stage 5D — validateTestimonialsContent()/validateHomeTestimonialsContent()
// below are this module's frontend half of the new testimonial validation.
// They deliberately mirror (never import — two separate deployable
// packages, same reasoning as every other Backend/Frontend validator pair
// in this project) Backend/src/modules/content/validateTestimonialContent.js
// rule-for-rule: same two tiers (format/safety always enforced; completeness
// only for an item that isn't provably unchanged from the baseline the
// editor loaded), same messages where practical. The Backend copy remains
// the mandatory, authoritative check — this one exists purely so an admin
// sees the same rejection in the browser, before ever making the request,
// instead of only after a round-trip.
import { isSafeAbsoluteVideoUrl } from './videoTestimonial.js';
import { isUsableImageUrl } from './testimonialImage.js';

// QA Bug 19 Stage 5B final safety correction — exactly two tiers remain,
// both standard, dependency-free Web Crypto APIs (never an npm package):
//   1. `crypto.randomUUID()` — the normal path on every realistic browser.
//   2. `crypto.getRandomValues()` — for a transitional browser old enough
//      to lack `randomUUID` but that still exposes the underlying Web
//      Crypto RNG; still cryptographically random, just assembled into a
//      hex string by hand instead of returning a pre-formatted UUID.
// The previous `Math.random()`-based last-resort tier has been REMOVED
// entirely: an environment with no usable Web Crypto API must never
// silently receive a weak, non-cryptographic id — it must fail instead
// (returns `null`), and the caller (generateUniqueTestimonialId(), then
// withGeneratedIds() below) is responsible for turning that into "do not
// add this item," never a fabricated id. Never derives an id from the
// testimonial's name or its position in the array.
export function generateSecureId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return `testimonial-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return null;
}

const MAX_ID_GENERATION_ATTEMPTS = 5;

// Random generation alone is never assumed/claimed to guarantee uniqueness
// — every candidate is checked explicitly against `existingIds` (the ids
// already present in the specific array being edited) before being
// accepted. On a collision, retries up to `attempts` times (bounded —
// never an unbounded/infinite loop) before giving up. `generateCandidate`
// defaults to generateSecureId() and is only overridable for tests, so a
// fixed/forced collision and a forced "no secure generator" scenario can
// both be exercised directly and deterministically.
//
// Returns `null` (never an empty string, never a duplicate) when: the
// underlying generator is unavailable, the underlying generator throws
// (treated as an immediate, non-retried failure — a broken generator is
// not retried in case it is also broken on the next attempt), or every
// bounded attempt collided. The caller must treat `null` as "do not add
// this item."
export function generateUniqueTestimonialId(existingIds, { attempts = MAX_ID_GENERATION_ATTEMPTS, generateCandidate = generateSecureId } = {}) {
  for (let i = 0; i < attempts; i++) {
    let candidate;
    try {
      candidate = generateCandidate();
    } catch {
      return null;
    }
    if (!candidate) return null;
    if (!existingIds.has(candidate)) return candidate;
  }
  return null;
}

// The exact sentinel every testimonial form's `NEW_TESTIMONIAL` template
// uses for `id`. RepeatableList's own addItem() (repeatableListLogic.mjs,
// reused completely unmodified here) clones this template verbatim
// whenever "+ Add" is clicked (with `cloneLastItem={false}`, which every
// testimonial form below passes specifically so a freshly-added item is
// never a clone of an existing item's real, already-assigned id/sourceId).
// `id === NEW_TESTIMONIAL_ID_SENTINEL` is therefore the one reliable signal
// that "this exact item was just created by this click" — as distinct from
// a legacy item that has no `id` property at all (`undefined`, which this
// never touches) or any existing item that already carries a real,
// previously-assigned non-empty id (also never touched).
export const NEW_TESTIMONIAL_ID_SENTINEL = '';

// Default user-visible message when safe id generation cannot complete.
// Exported so a form's own wiring test can pin the exact string it expects
// to display, without duplicating it by hand.
export const ID_GENERATION_ERROR_MESSAGE = 'Could not generate a safe ID for the new testimonial. Please try again.';

// Wraps a RepeatableList `onChange` so that any item carrying the sentinel
// id gets a real, freshly-generated, collision-checked id substituted in
// before the change ever reaches application state — this runs exactly
// once, synchronously, inside the same event-handler call that performed
// the add/edit/reorder, never as a render-time side effect and never as a
// periodic/automatic backfill pass over the whole array. An item that
// already has a real id, or that has no `id` property at all (every
// pre-existing legacy testimonial today), is returned completely
// untouched — this function never regenerates an existing id and never
// backfills a legacy one, and it never touches `sourceId` on any item.
//
// QA Bug 19 Stage 5B final safety correction — failure handling: existing
// ids within `nextItems` (the specific array being edited) are collected
// first, and each sentinel item's replacement id is generated via
// generateUniqueTestimonialId() checked against them (bounded retries on
// collision, per-item). If id generation for ANY sentinel item fails
// (`null`), this function returns immediately WITHOUT ever calling
// `onChange` — not even for the other, already-successfully-processed
// items in the same batch — so the caller's existing array (and every
// field on every item in it) is left completely untouched: never a
// partial update. `onError(message)` is called instead, synchronously, so
// the caller can surface it without this function ever throwing — an
// uncaught exception here would otherwise crash the whole editor.
export function withGeneratedIds(onChange, { onError } = {}) {
  return (nextItems) => {
    const existingIds = new Set(
      nextItems.filter((item) => item && item.id && item.id !== NEW_TESTIMONIAL_ID_SENTINEL).map((item) => item.id)
    );
    const patched = [];
    for (const item of nextItems) {
      if (item && item.id === NEW_TESTIMONIAL_ID_SENTINEL) {
        const id = generateUniqueTestimonialId(existingIds);
        if (!id) {
          if (onError) onError(ID_GENERATION_ERROR_MESSAGE);
          return;
        }
        existingIds.add(id); // a second sentinel item in the same batch must never collide with this one either
        patched.push({ ...item, id });
      } else {
        patched.push(item);
      }
    }
    onChange(patched);
  };
}

// The approved Stage 4/5B category set. 'other' is the safe default for a
// newly-created testimonial and for any legacy entry whose real category is
// genuinely unknown — never invented as Learner/Teacher/Volunteer without
// evidence.
export const TESTIMONIAL_CATEGORIES = ['learner', 'teacher', 'volunteer', 'other'];

// The approved 1–5 range for an optional, genuine original rating.
export const RATING_OPTIONS = [1, 2, 3, 4, 5];

// QA Bug 19 Stage 5B final safety correction — "no rating recorded" is
// represented by the complete ABSENCE of the `rating` property, never by
// `''`, `0`, `null`, or a default of `5`. Uses the real `<select>`'s own
// exact value contract to distinguish the two cases: the "No rating"
// `<option>` is the ONLY option with `value=""` — every real valid option
// has `value="1"`..`"5"` — so `rawValue === ''` is checked literally
// (never a falsy-value check like `!rawValue`, which would have
// incorrectly also matched `null`/`undefined`/other falsy non-empty-string
// input as "clear the rating").
//
// Any other raw value that isn't a clean integer 1–5 (out of range,
// non-integer, whitespace, `null`, `undefined`, or an arbitrary string —
// none of which the real `<select>` can ever actually produce, but all
// handled defensively) leaves the item COMPLETELY UNCHANGED — including
// never clearing a genuine existing rating, and never coercing the bad
// value into a plausible-looking but wrong one. Only the two real,
// select-producible cases ever change anything: an exact "" clears the
// rating key, and an exact "1".."5" sets a real JS number. Every other
// property on `item` (including `id`/`sourceId`) is always preserved,
// either by being left on the same object (invalid path) or by being
// spread through untouched (the two real paths).
export function applyRatingSelection(item, rawValue) {
  if (rawValue === '') {
    const { rating, ...rest } = item;
    return rest;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    return item;
  }
  return { ...item, rating: parsed };
}

// QA Bug 19 Stage 5B correction — the single, shared definition of "is this
// testimonial currently visible," reused both by the public
// toActiveContentArray() convention (`active !== false`) and by each CMS
// form's own legacy-visibility checkbox (see each form's renderItem): a
// legacy item with no `active` property at all is visible, exactly like an
// item explicitly marked `active: true`; only an explicit `active: false`
// is hidden.
export function isTestimonialVisible(item) {
  return item?.active !== false;
}

// --- QA Bug 19 Stage 5D: frontend testimonial content validation -----------
// See this file's own header comment for the Tier A/Tier B design and why
// this mirrors, rather than imports, the Backend's equivalent module.

function isBlankRequiredField(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// One-to-one: removes and returns the matched baseline item's index so it
// can never be matched again by a later candidate in the same array -- see
// Backend/.../validateTestimonialContent.js's own header comment (QA Bug 19
// Stage 5D correction) for why a many-to-one match would let a duplicated
// incomplete legacy entry multiply itself for free. `pool` is a mutable
// working copy the caller creates once per array field.
function consumeMatchingBaselineItem(item, pool) {
  const idx = pool.findIndex((b) => deepEqual(item, b));
  if (idx === -1) return false;
  pool.splice(idx, 1);
  return true;
}

const TESTIMONIAL_TYPES = new Set(['text', 'video', 'image']);
const TESTIMONIAL_CATEGORY_SET = new Set(TESTIMONIAL_CATEGORIES);
const TEXT_ONLY_TYPES = new Set(['text']);
const ALL_TESTIMONIAL_TYPES = new Set(['text', 'video', 'image']);

function validateImageRef(ref, label) {
  if (ref === null || ref === undefined) return null;
  if (!isPlainObject(ref) || !isUsableImageUrl(ref.url)) {
    return `${label} must be a safe http(s) URL or an existing managed media reference.`;
  }
  return null;
}

function validateTestimonialItemFormat(item, i, { allowedTypes, label }) {
  if (!isPlainObject(item)) return `${label} ${i + 1} is malformed.`;

  if (item.id !== undefined && isBlankRequiredField(item.id)) {
    return `${label} ${i + 1}: id must be a non-blank string.`;
  }
  if (item.type !== undefined) {
    if (typeof item.type !== 'string' || !TESTIMONIAL_TYPES.has(item.type)) {
      return `${label} ${i + 1}: type must be one of text, video, image.`;
    }
    if (!allowedTypes.has(item.type)) {
      return `${label} ${i + 1}: type "${item.type}" is not supported here.`;
    }
  }
  if (item.category !== undefined && (typeof item.category !== 'string' || !TESTIMONIAL_CATEGORY_SET.has(item.category))) {
    return `${label} ${i + 1}: category must be one of learner, teacher, volunteer, other.`;
  }
  if (item.rating !== undefined && item.rating !== null) {
    if (!Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5) {
      return `${label} ${i + 1}: rating must be a whole number from 1 to 5.`;
    }
  }
  if (item.active !== undefined && typeof item.active !== 'boolean') {
    return `${label} ${i + 1}: active must be true or false.`;
  }
  if (item.quote !== undefined && item.quote !== null && typeof item.quote !== 'string') {
    return `${label} ${i + 1}: quote must be text.`;
  }
  if (item.url !== undefined && item.url !== null && item.url !== '' && !isSafeAbsoluteVideoUrl(item.url)) {
    return `${label} ${i + 1}: video URL must be a safe, absolute http:// or https:// link.`;
  }

  return (
    validateImageRef(item.image, `${label} ${i + 1} photo`) ||
    validateImageRef(item.videoThumbnail, `${label} ${i + 1} video thumbnail`) ||
    validateImageRef(item.testimonialImage, `${label} ${i + 1} testimonial image`) ||
    null
  );
}

function findDuplicateIdError(items, label) {
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const id = items[i]?.id;
    if (typeof id === 'string' && id.trim()) {
      if (seen.has(id)) return `${label}: duplicate id "${id}" at entry ${i + 1}.`;
      seen.add(id);
    }
  }
  return null;
}

function validateTestimonialCompleteness(item, i, label) {
  const effectiveType = item.type ?? 'text';
  if (effectiveType === 'text') {
    if (isBlankRequiredField(item.quote)) return `${label} ${i + 1}: a quote is required for a new text testimonial.`;
  } else if (effectiveType === 'video') {
    if (!isSafeAbsoluteVideoUrl(item.url)) return `${label} ${i + 1}: a valid video URL is required for a new video testimonial.`;
  } else if (effectiveType === 'image') {
    if (!isPlainObject(item.testimonialImage) || !isUsableImageUrl(item.testimonialImage.url)) {
      return `${label} ${i + 1}: a testimonial image is required for a new image testimonial.`;
    }
  }
  return null;
}

function validateTestimonialArrayField(items, { label, allowedTypes, baselineItems }) {
  if (items === undefined) return null;
  if (!Array.isArray(items)) return `${label} must be an array of testimonials.`;

  for (let i = 0; i < items.length; i += 1) {
    const err = validateTestimonialItemFormat(items[i], i, { allowedTypes, label });
    if (err) return err;
  }

  const dupErr = findDuplicateIdError(items, label);
  if (dupErr) return dupErr;

  // A fresh, per-call working copy -- consumed (spliced) as candidates
  // match it, in candidate order, so each baseline slot exempts at most one
  // candidate and an earlier identical candidate always wins the slot over
  // a later duplicate of it.
  const pool = Array.isArray(baselineItems) ? [...baselineItems] : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (consumeMatchingBaselineItem(item, pool)) continue;
    const err = validateTestimonialCompleteness(item, i, label);
    if (err) return err;
  }

  return null;
}

// For TestimonialsFeaturedForm.jsx/TestimonialsAllForm.jsx (pages/media,
// data.TESTIMONIALS_FEATURED + data.TESTIMONIALS_ALL). `baselineData` is the
// already-published `doc.data` the editor loaded, or null/undefined for a
// brand-new type with nothing published yet.
export function validateTestimonialsContent(data, baselineData) {
  if (!isPlainObject(data)) return null;
  const baseline = isPlainObject(baselineData) ? baselineData : {};
  return (
    validateTestimonialArrayField(data.TESTIMONIALS_FEATURED, {
      label: 'Featured testimonial',
      allowedTypes: TEXT_ONLY_TYPES,
      baselineItems: baseline.TESTIMONIALS_FEATURED,
    }) ||
    validateTestimonialArrayField(data.TESTIMONIALS_ALL, {
      label: 'Testimonial',
      allowedTypes: ALL_TESTIMONIAL_TYPES,
      baselineItems: baseline.TESTIMONIALS_ALL,
    }) ||
    null
  );
}

// For components/admin/cms/home/TestimonialsForm.jsx (pages/home,
// data.HOME_TESTIMONIALS).
export function validateHomeTestimonialsContent(data, baselineData) {
  if (!isPlainObject(data)) return null;
  const baseline = isPlainObject(baselineData) ? baselineData : {};
  return validateTestimonialArrayField(data.HOME_TESTIMONIALS, {
    label: 'Home testimonial',
    allowedTypes: TEXT_ONLY_TYPES,
    baselineItems: baseline.HOME_TESTIMONIALS,
  });
}
