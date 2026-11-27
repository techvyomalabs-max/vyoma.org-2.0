// Manual-testing bug fix (video testimonials not playing) — regression
// coverage confirming the admin CMS form actually has a way to set a video
// URL for a "video"-type testimonial. Before this fix, the form had no such
// field at all: the only two seeded video testimonials (Ravi Menon,
// Lakshmi Narayanan) could never have had a real video attached through
// this screen, which was a root-cause contributor alongside
// TestimonialCard.jsx's own missing playback logic.
//
// Static source-text assertion, not a rendered-DOM test — this project has
// no React-rendering harness (see Header.a11y.test.mjs's own header
// comment for the same, already-established convention).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'TestimonialsAllForm.jsx'), 'utf8');

test('FIXED: a "video"-type testimonial has a URL input field, conditional on item.type === "video"', () => {
  assert.match(source, /item\.type === 'video'/);
  assert.match(source, /placeholder="Video URL \(e\.g\. YouTube link\)"/);
  assert.match(source, /onItemChange\(\{ \.\.\.item, url: e\.target\.value \}\)/);
});

test('a new testimonial template includes the url field (so it exists before an editor ever touches it)', () => {
  assert.match(source, /NEW_TESTIMONIAL = \{[^}]*url: ''/);
});

// --- QA Bug 19 Stage 5B: id, category, rating, image-type, thumbnail,
// profile image, and read-only source provenance --------------------------

test('a new testimonial template starts with the id sentinel, not a hardcoded or pre-generated id', () => {
  assert.match(source, /import \{ useState \} from 'react';/);
  assert.match(source, /import \{[\s\S]*withGeneratedIds,[\s\S]*\} from '@\/lib\/testimonialCms\.mjs';/);
  assert.match(source, /applyRatingSelection,/);
  assert.match(source, /isTestimonialVisible,/);
  assert.match(source, /NEW_TESTIMONIAL = \{\s*id: NEW_TESTIMONIAL_ID_SENTINEL,/);
});

test('onChange is wrapped with withGeneratedIds (passing an onError handler), and cloneLastItem is explicitly false -- a freshly-added item must never clone an existing item\'s real id/sourceId', () => {
  assert.match(source, /const \[error, setError\] = useState\(null\);/);
  assert.match(source, /setError\(null\);/);
  assert.match(source, /withGeneratedIds\(onChange, \{ onError: setError \}\)\(nextItems\);/);
  assert.match(source, /onChange=\{handleChange\}/);
  assert.match(source, /cloneLastItem=\{false\}/);
});

test('QA Bug 19 Stage 5B final safety correction: a user-visible error banner renders when id generation fails, using the existing CMS red-text error convention', () => {
  assert.match(source, /\{error && \(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /text-red-600/);
  assert.match(source, /\{error\}/);
});

test('imported source provenance is shown read-only, never as an editable input', () => {
  assert.match(source, /\{item\.sourceId && \(/);
  assert.match(source, /\(read-only\)/);
  assert.doesNotMatch(source, /value=\{item\.sourceId\}/, 'sourceId must never be bound to an editable input');
});

test('the type selector now includes an "image" option alongside text/video', () => {
  assert.match(source, /<option value="text">Text<\/option>/);
  assert.match(source, /<option value="video">Video<\/option>/);
  assert.match(source, /<option value="image">Image<\/option>/);
});

test('a category selector is present, backed by the shared TESTIMONIAL_CATEGORIES list, defaulting new items to "other"', () => {
  assert.match(source, /value=\{item\.category \|\| ''\}/);
  assert.match(source, /TESTIMONIAL_CATEGORIES\.map/);
  assert.match(source, /NEW_TESTIMONIAL = \{[\s\S]*category: 'other',/);
});

test('an optional rating selector is present, backed by applyRatingSelection(), with no rating key at all on a new testimonial (never defaulting to 5 stars or to an empty-string placeholder)', () => {
  assert.match(source, /RATING_OPTIONS\.map/);
  assert.match(source, /<option value="">No rating<\/option>/);
  assert.match(source, /onChange=\{\(e\) => onItemChange\(applyRatingSelection\(item, e\.target\.value\)\)\}/);
  const start = source.indexOf('const NEW_TESTIMONIAL = {');
  const end = source.indexOf('};', start);
  const templateBlock = source.slice(start, end);
  assert.doesNotMatch(templateBlock, /rating/, 'a new testimonial must not carry a rating key at all -- "no rating" is the absence of the property, not a default value');
});

test('the text branch supports an optional profile image via the existing ImageField component', () => {
  assert.match(source, /\{item\.type === 'text' && \(/);
  assert.match(source, /<ImageField label="Profile photo \(optional\)" value=\{item\.image\} onChange=\{\(image\) => onItemChange\(\{ \.\.\.item, image \}\)\} \/>/);
});

test('the video branch supports an optional explicit thumbnail via ImageField, and an optional (never required) quote', () => {
  assert.match(source, /\{item\.type === 'video' && \(/);
  assert.match(
    source,
    /<ImageField\s+label="Explicit video thumbnail \(optional\)"\s+value=\{item\.videoThumbnail\}\s+onChange=\{\(videoThumbnail\) => onItemChange\(\{ \.\.\.item, videoThumbnail \}\)\}\s*\/>/
  );
});

test('the image branch supports a testimonial image (visually marked "required", but this is a label only, not actual validation -- see the dedicated clarification test below) and an optional quote, via the existing ImageField component', () => {
  assert.match(source, /\{item\.type === 'image' && \(/);
  assert.match(
    source,
    /<ImageField\s+label="Testimonial image \(required\)"\s+value=\{item\.testimonialImage\}\s+onChange=\{\(testimonialImage\) => onItemChange\(\{ \.\.\.item, testimonialImage \}\)\}\s*\/>/
  );
});

test('QA Bug 19 Stage 5B clarification: the testimonial image "(required)" label is visual only -- no actual validation prevents saving without it in this file', () => {
  assert.match(source, /label="Testimonial image \(required\)"/);
  // No conditional early-return, no thrown/blocked save path, no required
  // HTML attribute anywhere tied to testimonialImage in this file -- the
  // label text is the entire extent of "required" here.
  assert.doesNotMatch(source, /if \(!item\.testimonialImage\)/);
  assert.doesNotMatch(source, /testimonialImage.*required=\{true\}/);
});

test('changing type never clears any other field -- the type select handler only ever spreads {...item} and sets type, never deleting quote/url/image/videoThumbnail/testimonialImage', () => {
  assert.match(source, /onChange=\{\(e\) => onItemChange\(\{ \.\.\.item, type: e\.target\.value \}\)\}/);
});

test('a new testimonial template includes active:true, so the existing RepeatableList visibility checkbox is available for new entries', () => {
  assert.match(source, /NEW_TESTIMONIAL = \{[\s\S]*active: true,/);
});

// --- QA Bug 19 Stage 5B correction: legacy visibility ---------------------

test('a testimonial-local "Visible" checkbox fills the gap for a legacy entry with no `active` property at all, using the shared isTestimonialVisible() convention', () => {
  assert.match(source, /\{item\.active === undefined && \(/);
  assert.match(source, /checked=\{isTestimonialVisible\(item\)\}/);
  assert.match(source, /onChange=\{\(e\) => onItemChange\(\{ \.\.\.item, active: e\.target\.checked \}\)\}/);
});

test('the legacy-visibility checkbox only ever fires onItemChange from an explicit click -- it is never written to on render (no onItemChange call outside the onChange handler)', () => {
  const checkboxBlockStart = source.indexOf('{item.active === undefined && (');
  // The literal closing of this exact block (label end + the `)}` that
  // closes the `{... && (...)}`) -- distinct from indexOf(')}', ...) alone,
  // which would otherwise match prematurely inside
  // `isTestimonialVisible(item)}` a few lines earlier.
  const checkboxBlockEnd = source.indexOf('</label>\n          )}', checkboxBlockStart);
  assert.ok(checkboxBlockStart !== -1 && checkboxBlockEnd !== -1);
  const block = source.slice(checkboxBlockStart, checkboxBlockEnd);
  const onItemChangeCalls = (block.match(/onItemChange\(/g) || []).length;
  assert.equal(onItemChangeCalls, 1, 'exactly one onItemChange call, inside the checkbox\'s own onChange handler');
});
