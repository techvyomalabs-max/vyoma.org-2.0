// Source-assertion coverage for the Admin Forms list page's category-query
// wiring AND pagination (Correction 1: real page/limit/meta.total-driven
// pagination, replacing the previous no-pagination-at-all implementation).
// This is a client component wired to useAdminAuth()/RequireAdminAuth, and
// this project has no loader/transform registered for plain `node --test`
// (confirmed via package.json's test script), so it can't be rendered here
// -- same established limitation as every other JSX-returning client
// component in this project. These assertions are not themselves claimed
// as proof of runtime interaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

function buildQueryBody(src) {
  const start = src.indexOf('function buildQuery(filters, page) {');
  const end = src.indexOf('\n}', start);
  return src.slice(start, end);
}

// --- Category + existing filters -------------------------------------------

test('buildQuery includes category only when set, same pattern as the existing status/formKey/date filters', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.category\) params\.set\('category', filters\.category\);/);
});

test('filters state includes category, defaulting to empty (no filter applied) -- matches "All categories" being the default dropdown option', () => {
  assert.match(source, /useState\(\{ category: '', formKey: '', status: '', dateFrom: '', dateTo: '' \}\)/);
});

test('every existing filter (formKey, status, dateFrom, dateTo) is still built into the query string, unchanged', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.formKey\.trim\(\)\) params\.set\('formKey', filters\.formKey\.trim\(\)\);/);
  assert.match(body, /if \(filters\.status\) params\.set\('status', filters\.status\);/);
  assert.match(body, /if \(filters\.dateFrom\) params\.set\('dateFrom', filters\.dateFrom\);/);
  assert.match(body, /if \(filters\.dateTo\) params\.set\('dateTo', filters\.dateTo\);/);
});

// --- Pagination: request shape ----------------------------------------------

test('buildQuery always sends both page and limit -- the existing backend query parameters, limit fixed at the existing default of 50', () => {
  assert.match(source, /const PAGE_SIZE = 50;/);
  const body = buildQueryBody(source);
  assert.match(body, /params\.set\('page', String\(page\)\);/);
  assert.match(body, /params\.set\('limit', String\(PAGE_SIZE\)\);/);
});

test('uses apiFetchWithMeta (not apiFetch), the existing helper already built for {page,limit,total} alongside items', () => {
  assert.match(source, /const \{ apiFetchWithMeta \} = useAdminAuth\(\);/);
  assert.match(source, /apiFetchWithMeta\(`\/admin\/forms\?\$\{qs\}`\)/);
});

test('page state exists, starting at 1', () => {
  assert.match(source, /const \[page, setPage\] = useState\(1\);/);
});

// --- Pagination: reset-to-page-1 on filter change ---------------------------

test('every filter change resets page to 1, via a dedicated handleFiltersChange wrapper passed to SubmissionFilters', () => {
  assert.match(source, /const handleFiltersChange = \(nextFilters\) => \{\s*\n\s*setFilters\(nextFilters\);\s*\n\s*setPage\(1\);\s*\n\s*\};/);
  assert.match(source, /<SubmissionFilters filters=\{filters\} onChange=\{handleFiltersChange\} \/>/);
});

// --- Pagination: range display and controls ---------------------------------

test('displays the accurate record range using the real meta.total/meta.limit (e.g. "Showing 51–100 of 125 applications")', () => {
  assert.match(source, /const totalPages = Math\.max\(1, Math\.ceil\(state\.total \/ state\.limit\)\);/);
  assert.match(source, /const rangeStart = state\.total === 0 \? 0 : \(page - 1\) \* state\.limit \+ 1;/);
  assert.match(source, /const rangeEnd = Math\.min\(page \* state\.limit, state\.total\);/);
  assert.match(source, /Showing \{rangeStart\}–\{rangeEnd\} of \{state\.total\} applications/);
});

test('the whole range/pagination block is hidden entirely for zero results (SubmissionList\'s own "No submissions match" message covers that case)', () => {
  assert.match(source, /\{state\.total > 0 && \(/);
});

test('Previous and Next controls exist, correctly disabled at the first/last page, and hidden when only one page exists', () => {
  assert.match(source, /\{totalPages > 1 && \(/);
  assert.match(source, /disabled=\{page <= 1\}/);
  assert.match(source, />\s*Previous\s*</);
  assert.match(source, /disabled=\{page >= totalPages\}/);
  assert.match(source, />\s*Next\s*</);
});

test('Previous/Next only ever change the page number, never touch filters -- existing filters are preserved across pages', () => {
  assert.match(source, /onClick=\{\(\) => setPage\(\(p\) => p - 1\)\}/);
  assert.match(source, /onClick=\{\(\) => setPage\(\(p\) => p \+ 1\)\}/);
});

// --- Pagination: out-of-range safety and stale-response protection ---------

test('an out-of-range page (e.g. after a filter change narrows the result set) is clamped down to the real last page', () => {
  assert.match(
    source,
    /const totalPages = Math\.max\(1, Math\.ceil\(meta\.total \/ meta\.limit\)\);\s*\n\s*if \(meta\.page > totalPages\) setPage\(totalPages\);/
  );
});

test('a stale-response guard (same pattern already established in app/admin/content/page.js) prevents an older, superseded request from overwriting newer filter/page results', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*\n\s*let cancelled = false;/);
  assert.match(source, /if \(cancelled\) return;/);
  assert.match(source, /return \(\) => \{\s*\n\s*cancelled = true;\s*\n\s*\};/);
  assert.match(source, /\}, \[apiFetchWithMeta, filters, page\]\);/);
});

test('loading and error states are preserved', () => {
  assert.match(source, /\{state\.loading && <p className="font-sans text-sm text-charcoal\/60">Loading…<\/p>\}/);
  assert.match(source, /\{state\.error && <p className="font-sans text-sm text-red-600">\{state\.error\}<\/p>\}/);
});

test('SubmissionList is still wired with the same items prop as before', () => {
  assert.match(source, /<SubmissionList items=\{state\.items\} \/>/);
});

// --- Genuine execution of the real pagination-math expressions --------------
// page.js itself contains JSX and can't be imported (see this file's own
// header comment), but the three pagination formulas are themselves plain,
// JSX-free arithmetic. This extracts their exact, verbatim source text and
// executes them for real via `new Function(...)` -- the same technique
// app/(public)/search/page.test.mjs already established for this exact
// situation (a pure expression embedded in an otherwise-unrenderable file)
// -- genuine runtime execution of the real formula, not a re-typed
// duplicate and not a regex match.
function extractPaginationMath(src) {
  const totalPagesLine = src.match(/const totalPages = (Math\.max\(1, Math\.ceil\(state\.total \/ state\.limit\)\));/)[1];
  const rangeStartLine = src.match(/const rangeStart = (state\.total === 0 \? 0 : \(page - 1\) \* state\.limit \+ 1);/)[1];
  const rangeEndLine = src.match(/const rangeEnd = (Math\.min\(page \* state\.limit, state\.total\));/)[1];
  return new Function(
    'state',
    'page',
    `return { totalPages: ${totalPagesLine}, rangeStart: ${rangeStartLine}, rangeEnd: ${rangeEndLine} };`
  );
}

const computePagination = extractPaginationMath(source);

test('pagination math: 0 matching records -> 1 page, "Showing 0 of 0"', () => {
  assert.deepEqual(computePagination({ total: 0, limit: 50 }, 1), { totalPages: 1, rangeStart: 0, rangeEnd: 0 });
});

test('pagination math: 1 matching record -> 1 page, "Showing 1 of 1"', () => {
  assert.deepEqual(computePagination({ total: 1, limit: 50 }, 1), { totalPages: 1, rangeStart: 1, rangeEnd: 1 });
});

test('pagination math: exactly 50 matching records (one full page) -> 1 page, "Showing 1 of 50"', () => {
  assert.deepEqual(computePagination({ total: 50, limit: 50 }, 1), { totalPages: 1, rangeStart: 1, rangeEnd: 50 });
});

test('pagination math: 51 matching records -> 2 pages; page 1 is "Showing 1–50", page 2 is "Showing 51–51"', () => {
  assert.deepEqual(computePagination({ total: 51, limit: 50 }, 1), { totalPages: 2, rangeStart: 1, rangeEnd: 50 });
  assert.deepEqual(computePagination({ total: 51, limit: 50 }, 2), { totalPages: 2, rangeStart: 51, rangeEnd: 51 });
});

test('pagination math: exactly 100 matching records -> 2 pages, page 2 is "Showing 51–100"', () => {
  assert.deepEqual(computePagination({ total: 100, limit: 50 }, 2), { totalPages: 2, rangeStart: 51, rangeEnd: 100 });
});

test('pagination math: 125 matching records -> 3 pages; page 2 is exactly "Showing 51–100 of 125" (the ticket\'s own example)', () => {
  assert.deepEqual(computePagination({ total: 125, limit: 50 }, 2), { totalPages: 3, rangeStart: 51, rangeEnd: 100 });
  assert.deepEqual(computePagination({ total: 125, limit: 50 }, 3), { totalPages: 3, rangeStart: 101, rangeEnd: 125 });
});
