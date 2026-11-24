// ResourcesTable.jsx is a client component wired to Next.js routing
// (useRouter/useSearchParams), so it isn't rendered here -- no
// React-rendering harness exists in this project for full components (only
// a hook-rendering one; see Header.a11y.test.mjs's own header comment and
// lib/testSupport/reactTestEnv.mjs). The pagination/filtering/validation
// math itself is fully covered, with real rendering of its logic, by
// resourcesTableLogic.test.mjs; this file asserts the exact wiring points in
// the real, unmodified source that a future edit could otherwise silently
// regress -- same source-assertion pattern as Header.search.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'ResourcesTable.jsx'), 'utf8');

test('useSearchParams is wrapped in a Suspense boundary (Next.js requirement; a missing boundary is a build-time failure mode)', () => {
  assert.match(source, /<Suspense fallback=\{null\}>\s*<ResourcesTableInner/);
});

test('URL state is synced with router.replace, never router.push (no extra browser-history entries per filter/page/search change)', () => {
  assert.match(source, /router\.replace\(/);
  assert.doesNotMatch(source, /router\.push\(/);
});

test('changing category resets the page to 1', () => {
  assert.match(source, /function handleTabChange\(c\) \{\s*setTab\(c\);\s*setPage\(1\);\s*\}/);
});

test('changing the search value resets the page to 1', () => {
  assert.match(source, /function handleSearchChange\(v\) \{\s*setSearch\(v\);\s*setPage\(1\);\s*\}/);
});

test('changing the page size resets the page to 1', () => {
  assert.match(source, /function handlePerPageChange\(v\) \{\s*setPerPage\(v\);\s*setPage\(1\);\s*\}/);
});

test('the removed "Showing X of Y entries" footer text is not reintroduced', () => {
  assert.doesNotMatch(source, /Showing \{.*\} of \{.*\} entries/);
});

test('serial numbers are continuous across pages (offset by startIndex, not restarting at 1 each page)', () => {
  assert.match(source, /\{startIndex \+ i \+ 1\}/);
});

test('Previous is disabled on the first page and Next is disabled on the last page', () => {
  assert.match(source, /disabled=\{currentPage <= 1\}/);
  assert.match(source, /disabled=\{currentPage >= totalPages\}/);
});

test('pagination controls are hidden whenever there is only one page (covers the zero-results case too, since that also yields exactly one page)', () => {
  assert.match(source, /const showPagination = totalPages > 1;/);
  assert.match(source, /\{showPagination && \(/);
});

test('the page-size dropdown still offers exactly 10/25/50, driven by the shared PAGE_SIZES constant (not hardcoded options)', () => {
  assert.match(source, /PAGE_SIZES\.map\(\(size\) => \(/);
});

test('initial category/search/page-size/page state is read from the URL via the shared parse* helpers, not hardcoded defaults', () => {
  assert.match(source, /parseCategory\(searchParams\.get\('category'\), categories\)/);
  assert.match(source, /parsePageSize\(searchParams\.get\('size'\)\)/);
  assert.match(source, /parsePage\(searchParams\.get\('page'\)\)/);
});
