// Regression coverage for the pure logic extracted from ResourcesTable.jsx
// (QA Bug 11 follow-up: real pagination + Back-button state restoration).
// Exercises the real, unmodified functions directly -- no rendering, no DOM,
// no new dependency (same pattern as repeatableListLogic.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  parseCategory,
  parsePageSize,
  parsePage,
  filterRows,
  getPagination,
  buildQueryString,
} from './resourcesTableLogic.mjs';

const CATEGORIES = [
  'Repositories of Sanskrit Texts',
  'Video Based Learning',
  'Magazines & Journals',
  'Blogs',
  'Dictionaries',
  'Computational Tools',
  'Tools for Typing, OCR, Fonts',
  'eLearning',
];

// --- parseCategory: invalid-category safety (Issue 2 requirement) ----------

test('parseCategory keeps a valid category as-is', () => {
  assert.equal(parseCategory('Dictionaries', CATEGORIES), 'Dictionaries');
});

test('parseCategory falls back to the first category for a value not in the list', () => {
  assert.equal(parseCategory('Not A Real Category', CATEGORIES), CATEGORIES[0]);
});

test('parseCategory falls back to the first category for a missing/null value', () => {
  assert.equal(parseCategory(null, CATEGORIES), CATEGORIES[0]);
  assert.equal(parseCategory(undefined, CATEGORIES), CATEGORIES[0]);
});

// --- parsePageSize: invalid-size safety -------------------------------------

test('parsePageSize keeps each of the three supported sizes as-is', () => {
  for (const size of PAGE_SIZES) {
    assert.equal(parsePageSize(String(size)), size);
  }
});

test('parsePageSize falls back to the default for an unsupported number', () => {
  assert.equal(parsePageSize('17'), DEFAULT_PAGE_SIZE);
  assert.equal(parsePageSize('100'), DEFAULT_PAGE_SIZE);
});

test('parsePageSize falls back to the default for non-numeric/missing input', () => {
  assert.equal(parsePageSize('abc'), DEFAULT_PAGE_SIZE);
  assert.equal(parsePageSize(null), DEFAULT_PAGE_SIZE);
});

// --- parsePage: out-of-range/invalid-page safety ----------------------------

test('parsePage keeps a valid positive integer as-is', () => {
  assert.equal(parsePage('3'), 3);
});

test('parsePage falls back to 1 for zero, negative, decimal, non-numeric or missing input', () => {
  assert.equal(parsePage('0'), 1);
  assert.equal(parsePage('-2'), 1);
  assert.equal(parsePage('2.5'), 1);
  assert.equal(parsePage('abc'), 1);
  assert.equal(parsePage(null), 1);
});

// --- filterRows: search matches title or desc, case-insensitively ----------

const SAMPLE_ROWS = [
  { title: 'Sanskrit Library', desc: 'A vast collection of texts', link: 'https://a.example' },
  { title: 'Gita Supersite', desc: 'Commentaries and translations', link: 'https://b.example' },
];

test('filterRows with no search returns every row unchanged', () => {
  assert.deepEqual(filterRows(SAMPLE_ROWS, ''), SAMPLE_ROWS);
});

test('filterRows matches a title substring case-insensitively', () => {
  const result = filterRows(SAMPLE_ROWS, 'sanskrit');
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Sanskrit Library');
});

test('filterRows matches a desc substring case-insensitively', () => {
  const result = filterRows(SAMPLE_ROWS, 'COMMENTARIES');
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Gita Supersite');
});

test('filterRows returns an empty array when nothing matches', () => {
  assert.deepEqual(filterRows(SAMPLE_ROWS, 'nonexistent'), []);
});

// --- getPagination: the exact acceptance criteria for a 34-row category ----

test('34 resources, show 10: four pages of 10/10/10/4, page 1 default', () => {
  const p1 = getPagination(34, { perPage: 10, page: 1 });
  assert.equal(p1.totalPages, 4);
  assert.equal(p1.currentPage, 1);
  assert.equal(p1.startIndex, 0);

  const p4 = getPagination(34, { perPage: 10, page: 4 });
  assert.equal(p4.currentPage, 4);
  assert.equal(p4.startIndex, 30); // last page's 4 rows start at index 30
});

test('34 resources, show 25: two pages of 25/9', () => {
  const p1 = getPagination(34, { perPage: 25, page: 1 });
  assert.equal(p1.totalPages, 2);
  assert.equal(p1.startIndex, 0);

  const p2 = getPagination(34, { perPage: 25, page: 2 });
  assert.equal(p2.startIndex, 25); // second page's 9 rows start at index 25
});

test('34 resources, show 50: a single page containing all 34 rows', () => {
  const p = getPagination(34, { perPage: 50, page: 1 });
  assert.equal(p.totalPages, 1);
  assert.equal(p.currentPage, 1);
  assert.equal(p.startIndex, 0);
});

test('an out-of-range page (e.g. restored from the URL after a search shrank the result set) clamps down to the last real page', () => {
  const p = getPagination(34, { perPage: 10, page: 99 });
  assert.equal(p.currentPage, 4);
  assert.equal(p.totalPages, 4);
});

test('zero filtered results still yields exactly one (empty) page, never zero or negative', () => {
  const p = getPagination(0, { perPage: 10, page: 1 });
  assert.equal(p.totalPages, 1);
  assert.equal(p.currentPage, 1);
  assert.equal(p.startIndex, 0);
});

// --- buildQueryString: URL mirroring for Back-button restoration -----------

const DEFAULTS = { category: CATEGORIES[0], defaultCategory: CATEGORIES[0], search: '', perPage: DEFAULT_PAGE_SIZE, page: 1 };

test('buildQueryString produces an empty string when every value is the default (clean URL for the common case)', () => {
  assert.equal(buildQueryString(DEFAULTS), '');
});

test('buildQueryString includes only the non-category param when just the category changes', () => {
  const qs = buildQueryString({ ...DEFAULTS, category: 'Dictionaries' });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('category'), 'Dictionaries');
  assert.equal(params.has('q'), false);
  assert.equal(params.has('size'), false);
  assert.equal(params.has('page'), false);
});

test('buildQueryString round-trips a full non-default combination (category, search, size, page)', () => {
  const qs = buildQueryString({
    category: 'Magazines & Journals',
    defaultCategory: CATEGORIES[0],
    search: 'master',
    perPage: 25,
    page: 2,
  });
  const params = new URLSearchParams(qs);
  assert.equal(params.get('category'), 'Magazines & Journals');
  assert.equal(params.get('q'), 'master');
  assert.equal(params.get('size'), '25');
  assert.equal(params.get('page'), '2');
});

test('buildQueryString omits page=1 even when other params are non-default', () => {
  const qs = buildQueryString({ ...DEFAULTS, category: 'Blogs', page: 1 });
  assert.equal(new URLSearchParams(qs).has('page'), false);
});
