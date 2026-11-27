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
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

// Brace-depth matching (not a bare `indexOf('\n}', start)`) -- buildQuery
// now contains nested multi-line `if (...) { ... }` blocks (Correction 3's
// throw-on-invalid-date guards), each with its own closing brace on its
// own line, so the first "\n}" encountered is no longer reliably the
// function's own closing brace.
function extractBalanced(src, start) {
  let depth = 0;
  let i = start;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced braces starting at ' + start);
}

function buildQueryBody(src) {
  const start = src.indexOf('function buildQuery(filters, page) {');
  return extractBalanced(src, start);
}

// --- Category + existing filters -------------------------------------------

test('buildQuery includes category only when set, same pattern as the existing status/formKey/date filters', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.category\) params\.set\('category', filters\.category\);/);
});

test('filters state includes category, defaulting to empty (no filter applied) -- matches "All categories" being the default dropdown option', () => {
  assert.match(source, /useState\(\{ category: '', formKey: '', status: '', dateFrom: '', dateTo: '' \}\)/);
});

test('every existing non-date filter (formKey, status) is still built into the query string, unchanged', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.formKey\.trim\(\)\) params\.set\('formKey', filters\.formKey\.trim\(\)\);/);
  assert.match(body, /if \(filters\.status\) params\.set\('status', filters\.status\);/);
});

// --- Date filters: timezone-aware local-day boundaries (Admin Forms "To
// Date" QA fix), not the raw filters.dateFrom/dateTo strings -------------

test('imports startOfLocalDayIso/startOfNextLocalDayIso from the extracted, directly-testable dateRangeBoundary module', () => {
  assert.match(
    source,
    /import \{ startOfLocalDayIso, startOfNextLocalDayIso \} from '\.\/dateRangeBoundary\.mjs';/
  );
});

test('buildQuery sends dateFrom as the inclusive UTC start of the selected local day, computed via startOfLocalDayIso', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.dateFrom\) \{\s*\n\s*const dateFromIso = startOfLocalDayIso\(filters\.dateFrom\);/);
  assert.match(body, /params\.set\('dateFrom', dateFromIso\);/);
});

test('buildQuery sends the new dateToExclusive parameter as the exclusive UTC start of the day AFTER the selected local day, computed via startOfNextLocalDayIso', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(filters\.dateTo\) \{\s*\n\s*const dateToExclusiveIso = startOfNextLocalDayIso\(filters\.dateTo\);/);
  assert.match(body, /params\.set\('dateToExclusive', dateToExclusiveIso\);/);
});

test('buildQuery never sends the raw, timezone-ambiguous filters.dateTo value directly as a "dateTo" param (the old bug)', () => {
  const body = buildQueryBody(source);
  assert.doesNotMatch(body, /params\.set\('dateTo', filters\.dateTo\)/);
});

// --- Correction 3: a non-empty date that fails to convert must prevent the
// request, never silently drop into an unintended unfiltered one ----------

test('buildQuery throws (rather than silently omitting the parameter) when a non-empty dateFrom fails to convert to a valid boundary', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(!dateFromIso\) throw new Error\('The From Date is not a valid date\.'\);/);
});

test('buildQuery throws (rather than silently omitting the parameter) when a non-empty dateTo fails to convert to a valid boundary', () => {
  const body = buildQueryBody(source);
  assert.match(body, /if \(!dateToExclusiveIso\) throw new Error\('The To Date is not a valid date\.'\);/);
});

test('the data-fetching effect wraps buildQuery in try/catch and sets the existing error-display state (loading:false, items:[], total:0), never calling apiFetchWithMeta, when it throws', () => {
  assert.match(
    source,
    /let qs;\s*\n\s*try \{\s*\n\s*qs = buildQuery\(filters, page\);\s*\n\s*\} catch \(err\) \{\s*\n\s*setState\(\(s\) => \(\{ \.\.\.s, loading: false, error: err\.message, items: \[\], total: 0 \}\)\);\s*\n\s*return \(\) => \{\s*\n\s*cancelled = true;\s*\n\s*\};\s*\n\s*\}/
  );
  // The catch block's return (cleanup function) must come BEFORE the
  // apiFetchWithMeta call in source order, confirming the fetch is never
  // reached on that path (a plain `return () => {...}` without a value
  // exits the effect immediately in JS, so source order here is dispositive).
  const catchIndex = source.indexOf('} catch (err) {');
  const fetchIndex = source.indexOf('apiFetchWithMeta(`/admin/forms?${qs}`)');
  assert.ok(catchIndex > -1 && fetchIndex > -1 && catchIndex < fetchIndex);
});

// Genuine execution of the real, unmodified buildQuery function -- extracted
// verbatim (same `new Function` technique extractPaginationMath already
// establishes further down in this file for a pure, JSX-free expression
// embedded in an otherwise-unrenderable client-component file), run against
// the REAL startOfLocalDayIso/startOfNextLocalDayIso from dateRangeBoundary.mjs
// (not mocked) -- so the throw/no-throw behavior below is real runtime
// behavior of the actual shipped code, not a re-typed duplicate or a regex
// match.
function makeBuildQuery(src) {
  const start = src.indexOf('function buildQuery(filters, page) {');
  const body = extractBalanced(src, start);
  const pageSizeLine = src.match(/const PAGE_SIZE = \d+;/)[0];
  const factory = new Function(
    'URLSearchParams',
    'startOfLocalDayIso',
    'startOfNextLocalDayIso',
    `${pageSizeLine}\n${body}\nreturn buildQuery;`
  );
  return factory(URLSearchParams, startOfLocalDayIsoReal, startOfNextLocalDayIsoReal);
}

const { startOfLocalDayIso: startOfLocalDayIsoReal, startOfNextLocalDayIso: startOfNextLocalDayIsoReal } = await import(
  pathToFileURL(path.join(__dirname, 'dateRangeBoundary.mjs')).href
);
const buildQuery = makeBuildQuery(source);

test('[genuine execution] buildQuery succeeds and includes both date params for a valid From/To selection', () => {
  const qs = buildQuery({ category: '', formKey: '', status: '', dateFrom: '2026-06-15', dateTo: '2026-06-20' }, 1);
  const params = new URLSearchParams(qs);
  assert.ok(params.has('dateFrom'));
  assert.ok(params.has('dateToExclusive'));
  assert.ok(!params.has('dateTo'), 'the raw dateTo value must never be sent directly');
});

test('[genuine execution] buildQuery returns a query string with neither date param when both filters are empty -- not an error', () => {
  const qs = buildQuery({ category: '', formKey: '', status: '', dateFrom: '', dateTo: '' }, 1);
  const params = new URLSearchParams(qs);
  assert.ok(!params.has('dateFrom'));
  assert.ok(!params.has('dateToExclusive'));
});

test('[genuine execution] buildQuery throws for a non-empty but impossible dateFrom (e.g. "2026-02-30"), never silently omitting the filter', () => {
  assert.throws(
    () => buildQuery({ category: '', formKey: '', status: '', dateFrom: '2026-02-30', dateTo: '' }, 1),
    /The From Date is not a valid date\./
  );
});

test('[genuine execution] buildQuery throws for a non-empty but impossible dateTo (e.g. "2026-02-30"), never silently omitting the filter', () => {
  assert.throws(
    () => buildQuery({ category: '', formKey: '', status: '', dateFrom: '', dateTo: '2026-02-30' }, 1),
    /The To Date is not a valid date\./
  );
});

test('[genuine execution] buildQuery throws for a malformed (non "YYYY-MM-DD") dateFrom/dateTo value, never silently omitting the filter', () => {
  assert.throws(() => buildQuery({ category: '', formKey: '', status: '', dateFrom: 'not-a-date', dateTo: '' }, 1));
  assert.throws(() => buildQuery({ category: '', formKey: '', status: '', dateFrom: '', dateTo: 'not-a-date' }, 1));
});

// Finding 1: the maximum-supported-year boundary (December 31st, 9999) is
// TZ-conditional -- whether it's representable depends on this environment's
// own ambient local timezone (already rigorously verified under controlled
// timezones in dateRangeBoundary.test.mjs). What matters here is that
// buildQuery, whichever way the real startOfNextLocalDayIso resolves it in
// THIS environment, routes the result through the exact same guard as any
// other invalid date -- never a silently broader, unfiltered request, and
// never an unparseable boundary sent to the API.
test('[genuine execution] buildQuery correctly handles the maximum-year boundary (dateTo="9999-12-31") through the same throw-on-invalid-date guard, whichever way this environment\'s ambient timezone resolves it', () => {
  const ambientResult = startOfNextLocalDayIsoReal('9999-12-31');
  if (ambientResult === null) {
    assert.throws(() => buildQuery({ category: '', formKey: '', status: '', dateFrom: '', dateTo: '9999-12-31' }, 1));
  } else {
    const qs = buildQuery({ category: '', formKey: '', status: '', dateFrom: '', dateTo: '9999-12-31' }, 1);
    assert.ok(new URLSearchParams(qs).has('dateToExclusive'), 'a representable boundary must still be sent, not dropped');
  }
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
