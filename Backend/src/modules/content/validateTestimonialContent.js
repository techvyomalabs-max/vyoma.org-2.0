// QA Bug 19 Stage 5D — server-side testimonial validation. Scoped to exactly
// three content keys, across the three content types that actually carry
// them: 'pages/media' and its bare 'media' twin (TESTIMONIALS_FEATURED,
// TESTIMONIALS_ALL — see Frontend/app/admin/content/testimonials/page.js's
// own header comment for why both types exist and stay in sync), and
// 'pages/home' (HOME_TESTIMONIALS). Mirrors content.admin.controller.js's
// existing validateJoinUsContent() pattern (narrow per-type scoping, first-
// error-wins reporting, one-based entry numbering) without importing or
// sharing code with any Frontend validator — same reasoning as that file's
// own JOIN_US_TYPE precedent.
//
// Two independent tiers, run in this order:
//   Tier A ("format/safety") — type/category/rating/active shape, URL and
//     image-reference safety, duplicate-id detection. Applies to EVERY
//     item, unconditionally, on every draft save, publish and restore. An
//     absent field is always accepted (legacy compatibility); a PRESENT but
//     invalid/unsafe one is always rejected, regardless of legacy status —
//     this is the tier that actually protects against unsafe content, and
//     it has NO legacy exemption of any kind, for any operation.
//   Tier B ("completeness") — a NEW or MODIFIED text/video/image testimonial
//     must actually have its defining content (quote/video URL/image).
//     Exempted only for an item that is provably unchanged from the
//     relevant baseline array -- see consumeMatchingBaselineItem below --
//     never by checking for a missing id, which a malformed new entry could
//     exploit. This is what lets the TEST content's existing legacy video
//     testimonials (Ravi Menon / Lakshmi Narayanan — seeded with no `url`
//     at all) keep being saved, reordered and have unrelated fields edited
//     without being blocked for a gap that predates this validation, while
//     a genuinely new or edited entry still has to supply real content.
//
// Baseline policy (one per operation, applied identically by both this
// module's three callers in content.admin.controller.js):
//   - Save Draft:  the existing persisted draft if one exists, else the
//     currently published data (`existing.draftData ?? existing.data`).
//   - Publish:     the currently published data (`doc.data`, read BEFORE
//     this publish overwrites it).
//   - Restore:     the currently published data (`doc.data`, read BEFORE
//     this restore overwrites it) -- the SAME baseline Publish uses, and
//     the SAME two tiers; restoring a revision is never exempt from
//     completeness just because it comes from history. Only an item that
//     is genuinely unchanged from what's live right now gets the
//     exemption; an older revision whose incomplete item is no longer part
//     of the current published array is correctly rejected rather than
//     silently restored -- the caller must see a clear validation error
//     instead of an unexpectedly un-restorable (but silently mutated)
//     document. This is an intentional divergence from pages/join-us's
//     restore behavior, which re-validates against no baseline at all
//     (full strict rules, no exemption) -- pages/join-us never had a
//     legitimate gap to grandfather, so it needs none.
//
// One candidate item is considered "unchanged" only if it exactly
// (deep-equal) matches a baseline item that has not already been consumed
// by an earlier candidate in the same array -- see
// consumeMatchingBaselineItem. This is deliberately a one-to-one matching,
// not "matches anything, any number of times": two candidate items that are
// byte-for-byte identical to ONE single incomplete baseline entry must not
// BOTH be exempted (that would let a duplicated legacy entry multiply
// itself for free) -- only the first one consumes the baseline slot; any
// further identical copy is treated as a genuinely new entry and must
// stand on its own completeness. Matching is always whole-object identity,
// never a partial/fuzzy match on name or quote alone, and a legacy baseline
// that itself happens to contain the same entry twice legitimately still
// exempts up to two candidates (each consumes its own slot).

function isBlankRequiredField(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Mirrors Frontend/lib/videoTestimonial.js's isSafeAbsoluteVideoUrl exactly
// (same WHATWG-parser-leniency corrections — see that file's own header
// comment for the control-character/backslash/scheme-syntax reasoning).
// Deliberately duplicated rather than imported: the Backend and Frontend
// are two separate deployable packages with no shared-code mechanism today,
// the same reason validateJoinUsContent() above does not import Frontend's
// validateJoinUs().
const URL_CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;
const EXPLICIT_HTTP_SCHEME_RE = /^https?:\/\/[^\/\\\s]/i;

function isSafeAbsoluteVideoUrl(raw) {
  if (typeof raw !== 'string') return false;
  if (URL_CONTROL_CHAR_RE.test(raw)) return false;
  const value = raw.replace(/^ +| +$/g, '');
  if (!value) return false;
  if (value.startsWith('//')) return false;
  if (!EXPLICIT_HTTP_SCHEME_RE.test(value)) return false;
  if (value.includes('\\')) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

// Mirrors Frontend/components/sections/media/TestimonialCard.jsx's
// isUsableImageUrl exactly (same reasoning; also accepts a single-leading-
// slash managed-media/root-relative path, unlike the video validator above).
function isUsableImageUrl(raw) {
  if (typeof raw !== 'string') return false;
  if (URL_CONTROL_CHAR_RE.test(raw)) return false;
  const value = raw.replace(/^ +| +$/g, '');
  if (!value) return false;
  if (value.includes('\\')) return false;
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  if (!EXPLICIT_HTTP_SCHEME_RE.test(value)) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;
  if (parsed.username || parsed.password) return false;
  return true;
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
// can never be matched again by a later candidate in the same array. `pool`
// is a mutable working copy the caller creates once per array field (see
// validateTestimonialArrayField) -- never the original baseline array.
function consumeMatchingBaselineItem(item, pool) {
  const idx = pool.findIndex((b) => deepEqual(item, b));
  if (idx === -1) return false;
  pool.splice(idx, 1);
  return true;
}

const TESTIMONIAL_CATEGORIES = new Set(['learner', 'teacher', 'volunteer', 'other']);
const TESTIMONIAL_TYPES = new Set(['text', 'video', 'image']);

function validateImageRef(ref, label) {
  if (ref === null || ref === undefined) return null;
  if (!isPlainObject(ref) || !isUsableImageUrl(ref.url)) {
    return `${label} must be a safe http(s) URL or an existing managed media reference.`;
  }
  return null;
}

// Tier A — run on every item regardless of legacy/new/modified status.
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
  if (item.category !== undefined && (typeof item.category !== 'string' || !TESTIMONIAL_CATEGORIES.has(item.category))) {
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

// Tier B — only for an item that is not provably unchanged from baseline.
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
  // match it, so each baseline slot can exempt at most one candidate. Built
  // once here, in candidate order, so an earlier identical candidate always
  // wins the exemption over a later duplicate of it.
  const pool = Array.isArray(baselineItems) ? [...baselineItems] : [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (consumeMatchingBaselineItem(item, pool)) continue;
    const err = validateTestimonialCompleteness(item, i, label);
    if (err) return err;
  }

  return null;
}

const TEXT_ONLY_TYPES = new Set(['text']);
const ALL_TESTIMONIAL_TYPES = new Set(['text', 'video', 'image']);

export const TESTIMONIAL_MEDIA_TYPES = new Set(['pages/media', 'media']);
export const TESTIMONIAL_HOME_TYPE = 'pages/home';

export function isTestimonialContentType(type) {
  return TESTIMONIAL_MEDIA_TYPES.has(type) || type === TESTIMONIAL_HOME_TYPE;
}

// `baselineData` is the relevant prior `data` object (never raw arrays) to
// diff Tier B against — see the three call sites in
// content.admin.controller.js for exactly what each passes, and this file's
// own header comment for the full per-operation baseline policy.
export function validateTestimonialContent(type, data, baselineData) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return null;
  const baseline = isPlainObject(baselineData) ? baselineData : {};

  if (TESTIMONIAL_MEDIA_TYPES.has(type)) {
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

  if (type === TESTIMONIAL_HOME_TYPE) {
    return validateTestimonialArrayField(data.HOME_TESTIMONIALS, {
      label: 'Home testimonial',
      allowedTypes: TEXT_ONLY_TYPES,
      baselineItems: baseline.HOME_TESTIMONIALS,
    });
  }

  return null;
}
