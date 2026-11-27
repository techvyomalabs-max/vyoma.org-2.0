import { extractYouTubeId } from './youtube.js';

// Manual-testing bug fix (video testimonials not playing): kept as a plain,
// JSX-free module (not inline in TestimonialCard.jsx) specifically so this
// logic is directly importable and unit-testable with `node --test` — Node
// refuses to load a bare `.jsx` file at all (confirmed directly: "Unknown
// file extension .jsx"), which is why this project's existing React
// component tests fall back to static source-text assertions instead (see
// Header.a11y.test.mjs). Pulling the one genuinely logical decision out into
// its own pure function avoids needing that weaker fallback for it.

// QA Bug 19 follow-up — URL-safety correction. `Boolean(item?.url)` alone
// (the prior check) treated a whitespace-only string, a `javascript:`/
// `data:`/`vbscript:`/`file:`/`blob:`/any-other-scheme value, a relative or
// protocol-relative path, or a URL carrying embedded userinfo credentials
// as equally "playable" as a real http(s) video link -- this resolver is
// the only place that decision is made (confirmed: TestimonialCard.jsx is
// its only consumer, and this file itself is the only other reference),
// so tightening it here closes the gap everywhere it's used.
//
// Checked against the RAW, untrimmed string first, before any parsing: the
// WHATWG URL parser itself silently strips an embedded tab/newline/
// carriage-return during parsing (confirmed directly -- `new
// URL('https://example.com/\tvideo.mp4')` parses without error, tab
// silently gone), so relying on `new URL()` to reject a control character
// would let one slip through unnoticed rather than being rejected. Every
// other C0 control character and DEL is rejected the same way, for the
// same reason.
//
// Only ordinary ASCII spaces are trimmed (the same narrow convention
// CSRProjectsBoard.jsx's/forms.controller.js's isValidMobileNumber already
// uses: `replace(/^ +| +$/g, '')`, never ``.trim()``'s full Unicode-
// whitespace definition) -- a tab or newline anywhere in the value,
// including at either end, is still caught by the control-character check
// above before this ever runs, so it is never silently trimmed away.
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

// QA Bug 19 follow-up #2 — final URL-parser edge-case correction. Requires
// an explicit http/https scheme followed by EXACTLY two literal forward
// slashes, then an authority that starts immediately (never another
// slash, a backslash, or whitespace). Checked on the raw, space-trimmed
// string BEFORE ever handing it to `new URL()`: the WHATWG URL parser is
// deliberately lenient for "special" schemes like http/https -- confirmed
// directly, it silently normalizes "https:example.com", "https:/example.com"
// and "http:example.com" (missing/single slash) as well as
// "https:///example.com" (one extra slash collapsed) into a well-formed
// "https://example.com"/"http://example.com", all without ever throwing.
// Relying on `new URL()` alone would therefore silently *accept* every one
// of those malformed forms instead of rejecting them. The `/i` flag keeps
// an uppercase scheme ("HTTPS://...") valid, matching the parser's own
// case-insensitive scheme handling.
const EXPLICIT_HTTP_SCHEME_RE = /^https?:\/\/[^\/\\\s]/i;

// Establishes URL *format* and *permitted scheme* only -- an explicit,
// absolute http: or https: URL, with a non-empty hostname and no embedded
// username/password. It does not, and cannot, verify that the URL is
// reachable, that the linked video actually exists or plays, or that the
// hosting provider is trustworthy -- no network request is ever made here.
// QA Bug 19 Stage 5D — exported (previously module-private) so
// lib/testimonialCms.mjs's new frontend CMS validation can reuse this exact
// same safety check for video testimonials, instead of a second,
// independently-maintained copy living inside the same Frontend package.
// resolveVideoTestimonialMedia()'s own rendering behavior below is
// completely unchanged.
export function isSafeAbsoluteVideoUrl(raw) {
  if (typeof raw !== 'string') return false;
  if (CONTROL_CHAR_RE.test(raw)) return false;
  const value = raw.replace(/^ +| +$/g, '');
  if (!value) return false;
  // Explicit, documented rejection of a protocol-relative URL -- the
  // standard URL parser already throws on one with no base to resolve
  // against (verified directly), but this makes the intent self-evident
  // and doesn't depend on that specific parser behavior continuing.
  if (value.startsWith('//')) return false;
  if (!EXPLICIT_HTTP_SCHEME_RE.test(value)) return false;
  // A literal backslash anywhere in the value is rejected outright, never
  // parsed -- the WHATWG parser treats a backslash exactly like a forward
  // slash for a "special" scheme such as http/https (confirmed directly:
  // "https:\\example.com\\video.mp4" silently normalizes to
  // "https://example.com/video.mp4", and a backslash later in the string,
  // e.g. in the authority position, is likewise normalized away), so a
  // value using one could resolve to an authority other than what it
  // visually appears to name.
  if (value.includes('\\')) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    // Covers every malformed value, every relative path, and every
    // protocol-relative URL (no scheme, no base to resolve against) in one
    // place -- never silently coerced into an absolute URL by supplying an
    // implicit base.
    return false;
  }
  // `parsed.protocol` is already lower-cased by the URL parser regardless
  // of the input's casing (e.g. "JAVASCRIPT:" normalizes to "javascript:"),
  // so this comparison alone is case-insensitive by construction.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (!parsed.hostname) return false;
  if (parsed.username || parsed.password) return false;
  return true;
}

// Decides whether a "video" testimonial has anything real and safe to link
// to, and whether a real YouTube thumbnail can be shown for it. Never
// invents a URL: an item with no `url` at all (true today for the two
// seeded video testimonials — see Backend/scripts/seedData/media.js)
// simply has no playable video, and the caller must not render a
// functional-looking play button for it -- nor for any value that fails
// the safety check above.
export function resolveVideoTestimonialMedia(item) {
  const safe = isSafeAbsoluteVideoUrl(item?.url);
  const url = safe ? item.url.replace(/^ +| +$/g, '') : null;
  const hasPlayableVideo = Boolean(url);
  const videoId = hasPlayableVideo ? extractYouTubeId(url) : null;
  const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  return { hasPlayableVideo, thumbnail, url };
}
