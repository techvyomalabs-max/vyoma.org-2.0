// QA Bug 19 Stage 5A — source-assertion coverage for
// app/(public)/media/testimonials/page.js's active-visibility filtering
// and Load More wiring. This page is an async Server Component (it calls
// `getTestimonials()` directly and exports `metadata`/`dynamic`), so it
// cannot be rendered or executed directly by `node --test` either (same
// established limitation as every other Next.js page/`'use client'`
// component in this project — see TestimonialsAllGrid.wiring.test.mjs's own
// header comment). The real active-filter logic (toActiveContentArray) and
// the real reveal logic (testimonialLoadMore.mjs) are both covered with
// genuine execution elsewhere; this file only guards that this page wires
// them in correctly and has not silently reverted to rendering the raw,
// unfiltered arrays or reintroduced a non-functional decorative button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

test('remains a Server Component: no "use client" directive, existing server-side getTestimonials() fetch is untouched', () => {
  assert.doesNotMatch(source, /^'use client';/);
  assert.match(source, /const \{ featured, all \} = await getTestimonials\(\);/);
});

test('existing SEO/metadata and force-dynamic exports are preserved unchanged', () => {
  assert.match(source, /export const dynamic = 'force-dynamic';/);
  assert.match(source, /export const metadata = pageMetadata\(\{/);
});

test('both Featured and All Testimonials arrays are passed through the existing, unmodified toActiveContentArray() utility -- not a reimplemented filter', () => {
  assert.match(source, /import \{ toActiveContentArray \} from '@\/lib\/contentArrays';/);
  assert.match(source, /const activeFeatured = toActiveContentArray\(featured\);/);
  assert.match(source, /const activeAll = toActiveContentArray\(all\);/);
});

test('the Featured section renders activeFeatured directly via a plain, unconditional .map() -- no client-side state, independent of whatever the All Testimonials Load More interaction does', () => {
  assert.match(source, /\{activeFeatured\.map\(\(item\) => \(/);
  assert.doesNotMatch(source, /useState/, 'the Featured/server-rendered section must not need client state of its own');
});

test('the All Testimonials section delegates to the isolated TestimonialsAllGrid Client Component, passing the already-active-filtered array', () => {
  assert.match(source, /import \{ TestimonialsAllGrid \} from '@\/components\/sections\/media\/TestimonialsAllGrid';/);
  assert.match(source, /<TestimonialsAllGrid items=\{activeAll\} \/>/);
});

test('the "Submit your testimonial" CTA at the bottom of the page is unchanged', () => {
  assert.match(source, /<ContactCta subject="Testimonial submission">Submit your testimonial<\/ContactCta>/);
});

// --- QA Bug 19 Stage 5C: stable key for Featured, same reasoning as the
// All Testimonials grid -----------------------------------------------------

test('QA Bug 19 Stage 5C: the Featured list key prefers the stable id over item.name', () => {
  assert.match(source, /key=\{item\.id \?\? item\.name\}/);
});
