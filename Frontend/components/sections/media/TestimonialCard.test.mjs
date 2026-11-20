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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'TestimonialCard.jsx'), 'utf8');

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

test('a garbage/invalid video URL string never throws, and is still treated as "has a value to link to"', () => {
  assert.doesNotThrow(() => resolveVideoTestimonialMedia({ url: 'not a url at all', name: 'Test' }));
  const result = resolveVideoTestimonialMedia({ url: 'not a url at all', name: 'Test' });
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, null);
});

test('resolveVideoTestimonialMedia never throws on a completely missing item', () => {
  assert.doesNotThrow(() => resolveVideoTestimonialMedia({}));
});

// --- JSX structure (static source assertions -- no rendering harness) ------

test('FIXED: the video card wraps its media in a real, functional link only when a video URL is present', () => {
  assert.match(source, /\{hasPlayableVideo \? \(/, 'the clickable wrapper must be conditional on hasPlayableVideo');
  assert.match(source, /<a href=\{item\.url\}/, 'the wrapper must link to the real item.url, not an invented one');
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
});

test('the play-button icon itself is unchanged visually (same svg path), now sitting inside the conditional link instead of being decorative-only', () => {
  assert.match(source, /<path d="M8 5v14l11-7z" \/>/);
});

test('the video-media decision is reused from the shared lib, not reimplemented inline', () => {
  assert.match(source, /import \{ resolveVideoTestimonialMedia \} from '@\/lib\/videoTestimonial'/);
  assert.doesNotMatch(source, /function extractYouTubeId/, 'must not reintroduce a duplicate copy of the YouTube-id-extraction logic');
});

test('the text-testimonial branch is untouched: still renders the quote, name, role, and optional photo exactly as before', () => {
  assert.match(source, /<p className=\{`mt-2 font-sans italic text-charcoal/);
  assert.match(source, /\{item\.quote\}/);
  assert.match(source, /item\.image\?\.url/);
});
