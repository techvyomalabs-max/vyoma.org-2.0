// Source-assertion coverage for SubmissionFilters.jsx's new Application
// Category dropdown. Same established no-rendering-harness limitation as
// every other JSX-returning client component in this project (confirmed
// via package.json's test script: no JSX loader/transform for plain
// `node --test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'SubmissionFilters.jsx'), 'utf8');

const EXPECTED_CATEGORY_VALUES = [
  '',
  'internships',
  'careers',
  'volunteering',
  'institutional-partnership',
  'csr-partnership',
  'press-media',
  'testimonial-submission',
  'corpus-fund',
  'general-inquiry',
  'other-unknown',
];

test('CATEGORY_OPTIONS exactly matches the approved taxonomy and the backend\'s CATEGORY_KEYS allowlist (plus the blank "All categories" option)', () => {
  const valuesMatch = [...source.matchAll(/\{ value: '([^']*)', label: '[^']*' \}/g)].map((m) => m[1]);
  assert.deepEqual(valuesMatch, EXPECTED_CATEGORY_VALUES);
});

test('"General Inquiry" and "Other / Unknown" are present as two separate, distinct options', () => {
  assert.match(source, /\{ value: 'general-inquiry', label: 'General Inquiry' \}/);
  assert.match(source, /\{ value: 'other-unknown', label: 'Other \/ Unknown' \}/);
});

test('the category select is wired to filters.category via the existing set() helper, same pattern as Status', () => {
  assert.match(source, /value=\{filters\.category\} onChange=\{\(e\) => set\('category', e\.target\.value\)\}/);
});

test('the existing Form (formKey), Status, From and To date filters are all still present, unchanged', () => {
  assert.match(source, /value=\{filters\.formKey\}\s*\n\s*onChange=\{\(e\) => set\('formKey', e\.target\.value\)\}/);
  assert.match(source, /value=\{filters\.status\} onChange=\{\(e\) => set\('status', e\.target\.value\)\}/);
  assert.match(source, /value=\{filters\.dateFrom\} onChange=\{\(e\) => set\('dateFrom', e\.target\.value\)\}/);
  assert.match(source, /value=\{filters\.dateTo\} onChange=\{\(e\) => set\('dateTo', e\.target\.value\)\}/);
});
