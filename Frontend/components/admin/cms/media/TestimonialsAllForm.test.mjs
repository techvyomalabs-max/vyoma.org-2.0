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
