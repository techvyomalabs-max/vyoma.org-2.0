// QA Bug 19 Stage 5B — regression coverage for TestimonialsFeaturedForm.jsx's
// new id/sourceId/category/rating/profile-image support. Static
// source-text assertion, not a rendered-DOM test — this project has no
// React-rendering harness (see Header.a11y.test.mjs's own header comment
// for the same, already-established convention). No test file existed for
// this component before this change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'TestimonialsFeaturedForm.jsx'), 'utf8');

test('a new testimonial template starts with the id sentinel, and onChange is wrapped with withGeneratedIds (passing an onError handler) with cloneLastItem explicitly false', () => {
  assert.match(source, /import \{ useState \} from 'react';/);
  assert.match(source, /import \{[\s\S]*withGeneratedIds,[\s\S]*\} from '@\/lib\/testimonialCms\.mjs';/);
  assert.match(source, /applyRatingSelection,/);
  assert.match(source, /isTestimonialVisible,/);
  assert.match(source, /NEW_TESTIMONIAL = \{\s*id: NEW_TESTIMONIAL_ID_SENTINEL,/);
  assert.match(source, /const \[error, setError\] = useState\(null\);/);
  assert.match(source, /withGeneratedIds\(onChange, \{ onError: setError \}\)\(nextItems\);/);
  assert.match(source, /cloneLastItem=\{false\}/);
});

test('QA Bug 19 Stage 5B final safety correction: a user-visible error banner renders when id generation fails', () => {
  assert.match(source, /\{error && \(/);
  assert.match(source, /role="alert"/);
  assert.match(source, /text-red-600/);
});

test('imported source provenance is shown read-only, never as an editable input', () => {
  assert.match(source, /\{item\.sourceId && \(/);
  assert.match(source, /\(read-only\)/);
  assert.doesNotMatch(source, /value=\{item\.sourceId\}/);
});

test('a category selector is present, backed by the shared TESTIMONIAL_CATEGORIES list, defaulting new items to "other"', () => {
  assert.match(source, /value=\{item\.category \|\| ''\}/);
  assert.match(source, /TESTIMONIAL_CATEGORIES\.map/);
  assert.match(source, /NEW_TESTIMONIAL = \{[\s\S]*category: 'other',/);
});

test('an optional rating selector is present, backed by applyRatingSelection(), with no rating key at all on a new testimonial', () => {
  assert.match(source, /RATING_OPTIONS\.map/);
  assert.match(source, /<option value="">No rating<\/option>/);
  assert.match(source, /onChange=\{\(e\) => onItemChange\(applyRatingSelection\(item, e\.target\.value\)\)\}/);
  const start = source.indexOf('const NEW_TESTIMONIAL = {');
  const end = source.indexOf('};', start);
  assert.doesNotMatch(source.slice(start, end), /rating/);
});

test('an optional profile image field is present, reusing the existing ImageField component', () => {
  assert.match(source, /import \{ ImageField \} from '@\/components\/admin\/ui\/ImageField';/);
  assert.match(source, /<ImageField label="Profile photo \(optional\)" value=\{item\.image\} onChange=\{\(image\) => onItemChange\(\{ \.\.\.item, image \}\)\} \/>/);
  assert.match(source, /NEW_TESTIMONIAL = \{[\s\S]*image: null,/);
});

test('a new testimonial template includes active:true, so the existing RepeatableList visibility checkbox is available for new entries', () => {
  assert.match(source, /NEW_TESTIMONIAL = \{[\s\S]*active: true,/);
});

test('remains text-only by design -- no type selector or video/image-testimonial fields are present (the verified reference design shows only text cards in Featured)', () => {
  assert.doesNotMatch(source, /item\.type/);
  assert.doesNotMatch(source, /videoThumbnail/);
  assert.doesNotMatch(source, /testimonialImage/);
});

test('the quote field remains a required-looking plain textarea bound directly to item.quote, unchanged from before', () => {
  assert.match(source, /<textarea value=\{item\.quote\} onChange=\{\(e\) => onItemChange\(\{ \.\.\.item, quote: e\.target\.value \}\)\} placeholder="Testimonial text" rows=\{3\} className=\{inputClass\} \/>/);
});

test('name/role fields are unchanged from before', () => {
  assert.match(source, /placeholder="Person name"/);
  assert.match(source, /placeholder="Designation \/ location"/);
});

// --- QA Bug 19 Stage 5B correction: legacy visibility ---------------------

test('a testimonial-local "Visible" checkbox fills the gap for a legacy entry with no `active` property at all', () => {
  assert.match(source, /\{item\.active === undefined && \(/);
  assert.match(source, /checked=\{isTestimonialVisible\(item\)\}/);
  assert.match(source, /onChange=\{\(e\) => onItemChange\(\{ \.\.\.item, active: e\.target\.checked \}\)\}/);
});
