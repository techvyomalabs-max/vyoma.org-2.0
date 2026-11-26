// QA Bug 19 Stage 5A — source-assertion coverage for TestimonialsAllGrid.jsx.
// It is a 'use client' JSX component; this project has no loader/transform
// registered for plain `node --test` (confirmed directly elsewhere in this
// codebase: a bare .jsx file fails with "Unknown file extension .jsx"), so
// it cannot be rendered here. The actual reveal/pagination decision logic
// this component is driven by is fully covered, with genuine real
// execution, by testimonialLoadMore.test.mjs; this file only guards this
// component's own wiring (which functions it calls, with which arguments,
// and that it reuses TestimonialCard rather than reimplementing card
// rendering), and is not itself claimed as proof of runtime rendering or
// interaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'TestimonialsAllGrid.jsx'), 'utf8');

test('is a Client Component, kept isolated from the surrounding Server Component page', () => {
  assert.match(source, /^'use client';/);
});

test('reuses TestimonialCard rather than reimplementing card rendering', () => {
  assert.match(source, /import \{ TestimonialCard \} from '\.\/TestimonialCard';/);
  assert.match(source, /<TestimonialCard key=\{item\.name\} item=\{item\} \/>/);
});

test('imports the real pure reveal-logic functions from testimonialLoadMore.mjs, never reimplementing the pagination math inline', () => {
  assert.match(
    source,
    /import \{ initialVisibleCount, getVisibleItems, hasMoreTestimonials, nextVisibleCount \} from '\.\/testimonialLoadMore\.mjs';/
  );
  assert.doesNotMatch(source, /Math\.min\(/, 'pagination arithmetic must live only in testimonialLoadMore.mjs, not be duplicated here');
});

test('initial state is computed via initialVisibleCount(items.length), not a hardcoded literal', () => {
  assert.match(source, /useState\(\(\) => initialVisibleCount\(items\.length\)\)/);
});

test('the visible slice and the Load more button visibility are both derived from the real logic functions on every render', () => {
  assert.match(source, /const visible = getVisibleItems\(items, visibleCount\);/);
  assert.match(source, /const showLoadMore = hasMoreTestimonials\(items, visibleCount\);/);
});

test('clicking Load more advances state via nextVisibleCount(count, items.length), never by appending/concatenating items', () => {
  assert.match(source, /setVisibleCount\(\(count\) => nextVisibleCount\(count, items\.length\)\)/);
  assert.doesNotMatch(source, /\.concat\(|\[\.\.\.(visible|items)/);
});

test('the Load more button renders only when showLoadMore is true, as a real native <button> via the shared Button component (type="button", never href)', () => {
  assert.match(source, /\{showLoadMore && \(/);
  assert.match(source, /<Button\s/);
  assert.match(source, /type="button"/);
  assert.doesNotMatch(source, /<Button[^>]*href=/);
});

test('the All Testimonials grid keeps the existing responsive column styling unchanged', () => {
  assert.match(source, /gridTemplateColumns: 'repeat\(auto-fit,minmax\(280px,1fr\)\)'/);
});
