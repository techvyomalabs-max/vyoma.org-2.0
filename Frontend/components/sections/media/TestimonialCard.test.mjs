// Manual-testing bug fix — regression coverage for TestimonialCard.jsx's
// video testimonial playback.
//
// Root cause (confirmed by reading the code before this fix): the "video"
// branch rendered a placeholder image plus a bare decorative play-button
// icon with no <a>/<button> wrapper, no onClick, and no reference to any
// video URL at all — so clicking it could never do anything, for ANY
// testimonial, regardless of data. Separately, the only two seeded video
// testimonials (Ravi Menon, Lakshmi Narayanan — Backend/scripts/seedData/
// media.js) carry no url field at all, and the admin CMS form
// (components/admin/cms/media/TestimonialsAllForm.jsx) had no input to ever
// set one — a missing-data gap, not something this fix invents content for.
//
// resolveVideoTestimonialMedia() lives in lib/videoTestimonial.js (a plain
// .js module, not inline in the .jsx component) specifically so it's
// directly importable here — `node --test` cannot load a bare .jsx file at
// all (confirmed directly: "Unknown file extension .jsx"). The surrounding
// JSX structure (whether a clickable <a> wrapper is present) is pinned via
// a static source-text assertion instead — this project has no
// React-rendering harness (see Header.a11y.test.mjs's own header comment
// for the same, already-established convention).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVideoTestimonialMedia } from '../../../lib/videoTestimonial.js';
import { isUsableImageUrl } from '../../../lib/testimonialImage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'TestimonialCard.jsx'), 'utf8');

// QA Bug 19 Stage 5D — isUsableImageUrl() moved out of this .jsx file into
// lib/testimonialImage.js (a plain, JSX-free module) so lib/testimonialCms.mjs's
// new CMS validation can reuse it too. It's now directly importable — the
// brace-extraction-and-Function-constructor technique this file previously
// needed (the same one still used elsewhere in this project for logic that
// genuinely has nowhere else to live) is no longer necessary for this
// specific function. Every test below still executes the real, production
// implementation; only how it's obtained changed.

// --- resolveVideoTestimonialMedia() (pure logic) ----------------------------

test('a valid YouTube video URL resolves to a playable video with a real thumbnail', () => {
  const result = resolveVideoTestimonialMedia({ url: 'https://youtu.be/dQw4w9WgXcQ', name: 'Test' });
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('a missing video URL (the exact shape of the live Ravi Menon / Lakshmi Narayanan seed data) resolves to no playable video and no thumbnail', () => {
  const result = resolveVideoTestimonialMedia({ name: 'Ravi Menon', role: 'Chennai, India' });
  assert.equal(result.hasPlayableVideo, false);
  assert.equal(result.thumbnail, null);
});

test('an empty-string video URL is treated the same as missing', () => {
  const result = resolveVideoTestimonialMedia({ url: '', name: 'Test' });
  assert.equal(result.hasPlayableVideo, false);
  assert.equal(result.thumbnail, null);
});

test('a non-YouTube (but otherwise valid) video URL is still playable, just without a known thumbnail', () => {
  const result = resolveVideoTestimonialMedia({ url: 'https://example.com/videos/ravi-menon.mp4', name: 'Test' });
  assert.equal(result.hasPlayableVideo, true, 'the link must still work even when no thumbnail can be derived');
  assert.equal(result.thumbnail, null);
});

// QA Bug 19 follow-up: a garbage/malformed string is no longer treated as
// "has a value to link to" -- it is not an absolute http(s) URL, so the
// tightened resolver (see lib/videoTestimonial.js's own, much more
// extensive fixture matrix in videoTestimonial.test.mjs) now correctly
// rejects it. Never throwing remains an invariant either way.
test('a garbage/invalid video URL string never throws, and is now correctly treated as "nothing safe to link to"', () => {
  assert.doesNotThrow(() => resolveVideoTestimonialMedia({ url: 'not a url at all', name: 'Test' }));
  const result = resolveVideoTestimonialMedia({ url: 'not a url at all', name: 'Test' });
  assert.equal(result.hasPlayableVideo, false);
  assert.equal(result.thumbnail, null);
  assert.equal(result.url, null);
});

test('resolveVideoTestimonialMedia never throws on a completely missing item', () => {
  assert.doesNotThrow(() => resolveVideoTestimonialMedia({}));
});

// --- JSX structure (static source assertions -- no rendering harness) ------

test('FIXED: the video card wraps its media in a real, functional link only when a video URL is present', () => {
  assert.match(source, /\{hasPlayableVideo \? \(/, 'the clickable wrapper must be conditional on hasPlayableVideo');
  assert.match(source, /<a href=\{url\}/, 'the wrapper must link to the resolver\'s validated url, not item.url directly');
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
});

// QA Bug 19 follow-up: the href must come from the resolver's own
// validated/trimmed `url`, never the raw, unvalidated `item.url` -- this is
// what actually prevents a whitespace-only or unsafe-scheme value from
// ever reaching the DOM, even if hasPlayableVideo were somehow computed
// independently elsewhere in the future.
test('FIXED: the rendered href is the resolver\'s validated url, never the raw, unvalidated item.url', () => {
  assert.doesNotMatch(source, /href=\{item\.url\}/, 'must not fall back to rendering the raw, unvalidated item.url');
  assert.match(source, /const \{ hasPlayableVideo, thumbnail, url \} = resolveVideoTestimonialMedia\(item\);/);
});

test('the play-button icon itself is unchanged visually (same svg path)', () => {
  assert.match(source, /<path d="M8 5v14l11-7z" \/>/);
});

// --- QA Bug 19 follow-up: the play icon must not render for a testimonial
// with no playable video. Source-assertion coverage -- TestimonialCard.jsx
// is a 'use client' JSX component with no rendering harness available in
// this project (see this file's own header comment); the underlying
// hasPlayableVideo/thumbnail decision these assertions key off of is
// covered with genuine execution by the resolveVideoTestimonialMedia()
// tests above. ------------------------------------------------------------

test('FIXED: the play-icon overlay is gated on hasPlayableVideo, not rendered unconditionally', () => {
  assert.match(
    source,
    /\{hasPlayableVideo && \(\s*\n\s*<div className="absolute inset-0 flex items-center justify-center">/,
    'the play-icon overlay div must itself be conditional on hasPlayableVideo, not just its <a> wrapper'
  );
});

test('a missing video URL renders the non-interactive "Video unavailable" caption instead of the generic "Video" caption', () => {
  assert.match(source, /caption=\{hasPlayableVideo \? 'Video' : 'Video unavailable'\}/);
});

test('a valid video URL retains the existing play icon and link-out behaviour -- the <a> wrapper and the play-icon overlay share the exact same hasPlayableVideo condition, so they can never disagree', () => {
  const aWrapperIndex = source.indexOf('{hasPlayableVideo ? (');
  const overlayIndex = source.indexOf('{hasPlayableVideo && (');
  assert.ok(aWrapperIndex !== -1 && overlayIndex !== -1);
  // The overlay (inside `media`) is defined before `media` is referenced by
  // the <a>-wrapper ternary later in the same render -- confirming both
  // reference the one hasPlayableVideo value computed once per render via
  // resolveVideoTestimonialMedia(item), never two independently-derived
  // booleans that could drift apart.
  assert.ok(overlayIndex < aWrapperIndex);
});

test('existing YouTube thumbnail handling is unchanged: a real thumbnail still renders via <img>, independent of hasPlayableVideo', () => {
  assert.match(source, /\{displayThumbnail \? \(/);
  assert.match(
    source,
    /<img src=\{displayThumbnail\} alt=\{\(explicitVideoThumbnail && item\.videoThumbnail\?\.alt\) \|\| item\.name\} className="h-full w-full object-cover" \/>/
  );
});

// --- QA Bug 19 Stage 5C: explicit videoThumbnail priority ------------------

test('an explicit CMS-supplied videoThumbnail takes priority over the resolver\'s own YouTube-derived thumbnail, but only when it is a usable image reference', () => {
  assert.match(source, /const explicitVideoThumbnail = isUsableImageUrl\(item\.videoThumbnail\?\.url\) \? item\.videoThumbnail\.url : null;/);
  assert.match(source, /const displayThumbnail = explicitVideoThumbnail \|\| thumbnail;/);
});

// --- QA Bug 19 Stage 5C final correction: isUsableImageUrl() --------------
// Genuine executable-logic coverage of the real function (see the
// extraction helper above). A bare http(s)-prefix-or-startsWith('/') check
// (the prior version) was not enough once a testimonial image is also used
// as a clickable href -- this now reuses the same hardened approach proven
// for the video URL resolver (videoTestimonial.js's own
// isSafeAbsoluteVideoUrl(), independently duplicated here, not imported,
// since that module stays unmodified), extended with one additional
// accepted shape: a genuine single-leading-slash root-relative media
// reference.

// --- valid --------------------------------------------------------------

test('isUsableImageUrl: accepts an absolute https URL with a valid hostname', () => {
  assert.equal(isUsableImageUrl('https://res.cloudinary.com/endorsal-io/image/upload/poster.jpg'), true);
});

test('isUsableImageUrl: accepts an absolute http URL', () => {
  assert.equal(isUsableImageUrl('http://example.com/image.jpg'), true);
});

test('isUsableImageUrl: accepts a genuine single-leading-slash root-relative media reference (the existing CMS convention)', () => {
  assert.equal(isUsableImageUrl('/images/testimonials/photo.jpg'), true);
});

test('isUsableImageUrl: accepts an uppercase HTTPS scheme (case-insensitive, matching the parser\'s own scheme handling)', () => {
  assert.equal(isUsableImageUrl('HTTPS://example.com/image.jpg'), true);
});

test('isUsableImageUrl: trims surrounding ordinary spaces from a valid URL', () => {
  assert.equal(isUsableImageUrl('  https://example.com/image.jpg  '), true);
});

// --- invalid: unsupported schemes ----------------------------------------

test('isUsableImageUrl: rejects a javascript: URL', () => {
  assert.equal(isUsableImageUrl('javascript:alert(1)'), false);
});

test('isUsableImageUrl: rejects a data: URL', () => {
  assert.equal(isUsableImageUrl('data:text/html,<script>alert(1)</script>'), false);
});

test('isUsableImageUrl: rejects a file: URL', () => {
  assert.equal(isUsableImageUrl('file:///etc/passwd'), false);
});

test('isUsableImageUrl: rejects a vbscript: URL', () => {
  assert.equal(isUsableImageUrl('vbscript:msgbox(1)'), false);
});

test('isUsableImageUrl: rejects an ftp: URL (a real, resolvable scheme, but not an accepted one)', () => {
  assert.equal(isUsableImageUrl('ftp://example.com/image.jpg'), false);
});

// --- invalid: protocol-relative and malformed absolute URLs --------------

test('isUsableImageUrl: REJECTS a protocol-relative URL ("//host/path") -- corrected from the prior round, which incorrectly accepted it', () => {
  assert.equal(isUsableImageUrl('//example.com/image.jpg'), false);
});

test('isUsableImageUrl: rejects "https:example.com/image.jpg" (missing both slashes) -- not silently normalized', () => {
  assert.equal(isUsableImageUrl('https:example.com/image.jpg'), false);
});

test('isUsableImageUrl: rejects "https:///example.com/image.jpg" (one extra slash) -- not silently collapsed', () => {
  assert.equal(isUsableImageUrl('https:///example.com/image.jpg'), false);
});

test('isUsableImageUrl: rejects a bare "https://" with no hostname', () => {
  assert.equal(isUsableImageUrl('https://'), false);
});

test('isUsableImageUrl: rejects a bare, schemeless string', () => {
  assert.equal(isUsableImageUrl('not a url at all'), false);
});

// --- invalid: backslashes, control characters, credentials ---------------

test('isUsableImageUrl: rejects a literal backslash in the scheme/authority position', () => {
  assert.equal(isUsableImageUrl('https:\\\\example.com\\image.jpg'), false);
});

test('isUsableImageUrl: rejects an embedded control character (tab), checked on the raw string before any trimming/parsing', () => {
  assert.equal(isUsableImageUrl('https://example.com/\timage.jpg'), false);
});

test('isUsableImageUrl: rejects an embedded newline character', () => {
  assert.equal(isUsableImageUrl('https://example.com/\nimage.jpg'), false);
});

test('isUsableImageUrl: rejects a URL containing embedded username/password credentials', () => {
  assert.equal(isUsableImageUrl('https://user:pass@example.com/image.jpg'), false);
});

// --- invalid: non-string / empty -----------------------------------------

test('isUsableImageUrl: rejects missing, null, undefined and non-string values without throwing', () => {
  for (const value of [undefined, null, 123, {}, [], true]) {
    assert.doesNotThrow(() => isUsableImageUrl(value));
    assert.equal(isUsableImageUrl(value), false);
  }
});

test('isUsableImageUrl: rejects an empty string', () => {
  assert.equal(isUsableImageUrl(''), false);
});

test('isUsableImageUrl: rejects a whitespace-only string', () => {
  assert.equal(isUsableImageUrl('   '), false);
});

test('the resolver\'s YouTube-derived thumbnail remains the fallback when no explicit videoThumbnail is set -- the existing resolver itself is untouched', () => {
  const result = resolveVideoTestimonialMedia({ url: 'https://youtu.be/dQw4w9WgXcQ', name: 'Test' });
  assert.equal(result.thumbnail, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('the generic placeholder remains the final fallback when neither an explicit videoThumbnail nor a YouTube thumbnail exists (e.g. a genuine non-YouTube video with no explicit thumbnail set)', () => {
  const result = resolveVideoTestimonialMedia({ url: 'https://res.cloudinary.com/endorsal-io/video/upload/videos/1711009621773-179148.mp4', name: 'Test' });
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, null, 'a real, non-YouTube Cloudinary URL has no derivable YouTube thumbnail');
});

// --- QA Bug 19 Stage 5C: optional genuine quote on a video testimonial ----

test('an optional genuine quote renders on a video testimonial only when present, never fabricated or required', () => {
  const videoBranchStart = source.indexOf("item.type === 'video'");
  const imageBranchStart = source.indexOf("item.type === 'image'");
  assert.ok(videoBranchStart !== -1 && imageBranchStart !== -1 && videoBranchStart < imageBranchStart);
  const videoBranch = source.slice(videoBranchStart, imageBranchStart);
  assert.match(videoBranch, /\{item\.quote && <p className="mt-2 font-sans text-sm italic text-charcoal">\{item\.quote\}<\/p>\}/);
});

test('no embedded video player, iframe, or new dependency was introduced', () => {
  assert.doesNotMatch(source, /<video/);
  assert.doesNotMatch(source, /<iframe/);
  assert.doesNotMatch(source, /import\(['"]react-player/);
});

test('card dimensions, layout and colours are unchanged: same 200px media height, same amber-gold divider, same rounded card shell', () => {
  assert.match(source, /className="relative h-\[200px\] border-b-\[3px\] border-b-amber-gold"/);
  assert.match(source, /className="overflow-hidden rounded-md border border-\[var\(--border-subtle\)\] bg-white"/);
});

test('the video-media decision is reused from the shared lib, not reimplemented inline', () => {
  assert.match(source, /import \{ resolveVideoTestimonialMedia \} from '@\/lib\/videoTestimonial'/);
  assert.doesNotMatch(source, /function extractYouTubeId/, 'must not reintroduce a duplicate copy of the YouTube-id-extraction logic');
});

test('QA Bug 19 Stage 5D: isUsableImageUrl is imported from the shared lib, not reimplemented inline', () => {
  assert.match(source, /import \{ isUsableImageUrl \} from '@\/lib\/testimonialImage'/);
  assert.doesNotMatch(source, /function isUsableImageUrl/, 'must not reintroduce a second, independently-maintained copy');
});

test('the text-testimonial branch is untouched: still renders the quote, name, role, and optional photo exactly as before', () => {
  assert.match(source, /<p className=\{`mt-2 font-sans italic text-charcoal/);
  assert.match(source, /\{item\.quote\}/);
  assert.match(source, /item\.image\?\.url/);
});

// --- QA Bug 19 Stage 5C: image-type testimonial rendering ------------------

test('a new image-type branch exists, reusing the existing SmartImage component (never a new image component)', () => {
  assert.match(source, /if \(item\.type === 'image'\) \{/);
  assert.match(source, /import \{ SmartImage \} from '@\/components\/common\/SmartImage';/);
  assert.match(
    source,
    /<SmartImage src=\{usableImageUrl\} alt=\{item\.testimonialImage\?\.alt \|\| item\.name \|\| 'Testimonial'\} \/>/
  );
});

test('QA Bug 19 Stage 5C final correction: the testimonial image is only treated as usable after passing isUsableImageUrl() -- never an unvalidated string handed to SmartImage', () => {
  assert.match(source, /const usableImageUrl = isUsableImageUrl\(item\.testimonialImage\?\.url\) \? item\.testimonialImage\.url : null;/);
});

test('SmartImage is used with its default fit (contain) -- the complete photo is preserved at its real aspect ratio, never cropped', () => {
  assert.doesNotMatch(source, /<SmartImage[^>]*fit=/, 'must not override SmartImage\'s default contain fit with a cropped cover fit for a testimonial image');
});

test('the image container preserves a sensible aspect ratio via a ratio-boxed container, not a fixed-height crop like the video card', () => {
  assert.match(source, /className="relative aspect-\[4\/3\] border-b-\[3px\] border-b-amber-gold bg-sky-mist"/);
});

test('a missing or invalid testimonial image is handled safely via the existing ImagePlaceholder component, never a crash', () => {
  assert.match(source, /<ImagePlaceholder shape="rect" caption="Image unavailable" \/>/);
});

test('alt text is preserved: the explicit testimonialImage.alt is used when present, falling back to the person\'s name, never left empty/undefined in the DOM', () => {
  assert.match(source, /alt=\{item\.testimonialImage\?\.alt \|\| item\.name \|\| 'Testimonial'\}/);
});

// --- QA Bug 19 Stage 5C final correction: minimal, safe full-size view ---

test('a minimal "view full size" link reuses the exact existing external-link convention (target=_blank, rel=noopener noreferrer), not a new lightbox', () => {
  const imageBranchStart = source.indexOf("item.type === 'image'");
  const imageBranch = source.slice(imageBranchStart);
  assert.match(imageBranch, /<a href=\{usableImageUrl\} target="_blank" rel="noopener noreferrer"/);
  // Checks actual imports/JSX usage, not prose -- this file's own comments
  // legitimately use the word "lightbox" to explain why one was NOT added.
  assert.doesNotMatch(source, /^import .*[Ll]ightbox/m);
  assert.doesNotMatch(source, /<[A-Za-z]*[Ll]ightbox/);
  assert.doesNotMatch(source, /new Image\(/);
});

test('the full-size view link is only ever rendered for a URL that already passed isUsableImageUrl() -- never the raw, unvalidated testimonialImage.url', () => {
  const imageBranchStart = source.indexOf("item.type === 'image'");
  const imageBranch = source.slice(imageBranchStart);
  assert.match(imageBranch, /\{usableImageUrl \? \(/);
  assert.doesNotMatch(imageBranch, /href=\{item\.testimonialImage\?\.url\}/);
});

test('name, designation and quote are each rendered only when genuinely present on an image testimonial -- never fabricated for an unknown subject', () => {
  assert.match(source, /const hasInfo = Boolean\(item\.name \|\| item\.role \|\| item\.quote\);/);
  assert.match(source, /\{hasInfo && \(/);
  assert.match(source, /\{item\.name && <div className="font-sans text-base font-bold text-vyoma-blue">\{item\.name\}<\/div>\}/);
  assert.match(source, /\{item\.role && <div className="mt-1 font-sans text-sm text-charcoal">\{item\.role\}<\/div>\}/);
});

test('the image branch renders exactly one <SmartImage>, never duplicating the same photo', () => {
  const imageBranchStart = source.indexOf("item.type === 'image'");
  const imageBranchEnd = source.indexOf("\n  return (", imageBranchStart); // the text-branch's own `return (` that follows every type-specific branch
  const imageBranch = source.slice(imageBranchStart, imageBranchEnd === -1 ? source.length : imageBranchEnd);
  const matches = imageBranch.match(/<SmartImage/g) || [];
  assert.equal(matches.length, 1);
});

test('no new lightbox/enlargement dependency or component was introduced for image testimonials', () => {
  // Checks actual imports/JSX usage, not prose -- this file's own comments
  // legitimately use the word "lightbox" to explain why one was NOT added.
  assert.doesNotMatch(source, /^import .*[Ll]ightbox/m);
  assert.doesNotMatch(source, /<[A-Za-z]*[Ll]ightbox/);
  assert.doesNotMatch(source, /react-image-lightbox/);
});
