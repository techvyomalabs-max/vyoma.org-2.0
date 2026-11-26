// QA Bug 19 Stage 5B — shared, framework-free logic for the three
// testimonial CMS editors (TestimonialsAllForm.jsx, TestimonialsFeaturedForm.jsx,
// components/admin/cms/home/TestimonialsForm.jsx). Kept as a plain,
// JSX-free module specifically so it's directly importable and
// unit-testable with `node --test` (this project has no React-rendering
// harness — see Header.a11y.test.mjs's own header comment for the same,
// already-established convention), and so the one genuinely non-trivial
// piece of logic (safe stable-id assignment) is written and tested once,
// not duplicated three times across the forms.

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
