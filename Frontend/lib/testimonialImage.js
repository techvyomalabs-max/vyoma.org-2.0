// QA Bug 19 Stage 5C/5D — extracted out of TestimonialCard.jsx (a .jsx file,
// which Node refuses to load directly — "Unknown file extension .jsx" — the
// same established limitation noted throughout this project, e.g.
// videoTestimonial.js's own header comment) into its own plain, JSX-free
// module, mirroring that exact precedent. This is now the single canonical
// home for this check: TestimonialCard.jsx (public rendering) and
// lib/testimonialCms.mjs (Stage 5D CMS validation) both import it from here,
// rather than each keeping its own independently-maintained copy that could
// silently drift apart.
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;
const EXPLICIT_HTTP_SCHEME_RE = /^https?:\/\/[^\/\\\s]/i;

// Establishes URL *format* only -- an explicit absolute http(s) URL with a
// non-empty hostname and no embedded credentials, OR the existing CMS
// convention for an already-managed, root-relative media reference. Mirrors
// (independently of) videoTestimonial.js's isSafeAbsoluteVideoUrl -- see
// that file's own header comment for the full WHATWG-url-parser-leniency
// reasoning behind every one of these checks.
export function isUsableImageUrl(raw) {
  if (typeof raw !== 'string') return false;
  if (CONTROL_CHAR_RE.test(raw)) return false;
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
