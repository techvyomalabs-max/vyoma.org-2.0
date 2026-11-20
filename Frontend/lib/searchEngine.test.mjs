// QA Bug 5, Stage 2: real-behavior tests for searchEngine.js, against
// local, in-memory fixtures only -- no CMS/API/database access anywhere in
// this file. The final suite additionally exercises the engine against the
// real Stage 1 registry (searchRegistry.js), adapted to this engine's own
// canonical `{href, title, text}` shape by the test itself (not by
// searchEngine.js, which must stay agnostic of Stage 1's `path`/
// `description` field names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_QUERY_CODEPOINTS,
  PAGE_SIZE,
  foldForSearch,
  normalizeSearchQuery,
  matchEntry,
  dedupeByHref,
  rankResults,
  paginate,
  searchEntries,
} from './searchEngine.js';
import { SEARCH_REGISTRY } from './searchRegistry.js';

// --- foldForSearch -----------------------------------------------------

test('foldForSearch is case-insensitive for plain English', () => {
  assert.equal(foldForSearch('Credibility'), foldForSearch('CREDIBILITY'));
  assert.equal(foldForSearch('Credibility'), 'credibility');
});

test('foldForSearch is diacritic-insensitive for IAST Latin -- "Gita" folds the same as "Gītā"', () => {
  assert.equal(foldForSearch('Gītā'), foldForSearch('Gita'));
  assert.equal(foldForSearch('Gītā'), 'gita');
  // Retroflex consonants (dot-below diacritics) fold the same way.
  assert.equal(foldForSearch('Saṃskṛta'), foldForSearch('Samskrta'));
});

test('foldForSearch leaves Tamil script unchanged (no case, no Latin combining marks to strip)', () => {
  const tamil = 'தமிழ்';
  assert.equal(foldForSearch(tamil), tamil);
});

test('foldForSearch leaves Devanagari script unchanged', () => {
  const devanagari = 'गीता';
  assert.equal(foldForSearch(devanagari), devanagari);
});

test('foldForSearch never transliterates between scripts -- folding Tamil text never produces Devanagari or Latin text', () => {
  const tamil = 'சமஸ்கிருதம்';
  const folded = foldForSearch(tamil);
  assert.ok(!/[a-z]/i.test(folded), 'folded Tamil must contain no Latin letters');
  assert.ok(!/[ऀ-ॿ]/.test(folded), 'folded Tamil must contain no Devanagari');
});

test('foldForSearch is defensive against non-string input', () => {
  assert.equal(foldForSearch(null), '');
  assert.equal(foldForSearch(undefined), '');
  assert.equal(foldForSearch(42), '');
});

// --- normalizeSearchQuery -----------------------------------------------

test('normalizeSearchQuery trims surrounding whitespace', () => {
  assert.equal(normalizeSearchQuery('  team  '), 'team');
});

test('normalizeSearchQuery returns empty for an empty or whitespace-only query', () => {
  assert.equal(normalizeSearchQuery(''), '');
  assert.equal(normalizeSearchQuery('   '), '');
  assert.equal(normalizeSearchQuery('\t\n '), '');
});

test('normalizeSearchQuery is defensive against non-string input', () => {
  assert.equal(normalizeSearchQuery(null), '');
  assert.equal(normalizeSearchQuery(undefined), '');
  assert.equal(normalizeSearchQuery(123), '');
  assert.equal(normalizeSearchQuery(['team']), '');
});

test('normalizeSearchQuery enforces the 200-code-point cap by truncation, not rejection', () => {
  const long = 'a'.repeat(250);
  const result = normalizeSearchQuery(long);
  assert.equal(Array.from(result).length, MAX_QUERY_CODEPOINTS);
  assert.equal(result, 'a'.repeat(200));
});

test('normalizeSearchQuery counts by Unicode code point, not UTF-16 code unit', () => {
  // U+1F600 (😀) is one code point but two UTF-16 code units -- a query of
  // 201 such emoji is 201 code points (over the cap) despite being 402
  // `.length` units; this must still truncate to exactly 200 code points.
  const long = '\u{1F600}'.repeat(201);
  const result = normalizeSearchQuery(long);
  assert.equal(Array.from(result).length, MAX_QUERY_CODEPOINTS);
});

test('a query exactly at the 200-code-point cap is left untouched', () => {
  const exact = 'a'.repeat(200);
  assert.equal(normalizeSearchQuery(exact), exact);
});

// --- matchEntry -----------------------------------------------------

const FIXTURES = [
  { href: '/about', title: 'About', text: 'Founded in Bengaluru, the organisation behind free Sanskrit education.' },
  { href: '/about/core-team', title: 'Core Team', text: 'Teachers, technologists, and coordinators.' },
  { href: '/credibility', title: 'Credibility', text: 'Reports, registrations, and recognition.' },
  { href: '/donate', title: 'Donate', text: 'Your gift keeps Sanskrit education free.' },
];

test('matchEntry scores a title match above a text-only match', () => {
  const titleMatch = matchEntry(FIXTURES[0], foldForSearch('about'), 0);
  const textMatch = matchEntry(FIXTURES[0], foldForSearch('bengaluru'), 0);
  assert.equal(titleMatch.score, 2);
  assert.equal(textMatch.score, 1);
});

test('matchEntry returns null for no match', () => {
  assert.equal(matchEntry(FIXTURES[0], foldForSearch('xyznonexistent'), 0), null);
});

test('matchEntry returns null for an empty folded query', () => {
  assert.equal(matchEntry(FIXTURES[0], '', 0), null);
});

test('matchEntry is defensive against malformed entries -- skipped, never thrown', () => {
  assert.equal(matchEntry(null, foldForSearch('about'), 0), null);
  assert.equal(matchEntry({}, foldForSearch('about'), 0), null);
  assert.equal(matchEntry({ href: '/x', title: 42 }, foldForSearch('about'), 0), null);
  assert.equal(matchEntry({ href: 7, title: 'About' }, foldForSearch('about'), 0), null);
});

test('matchEntry matches Tamil and Devanagari text the same way as English', () => {
  const tamilEntry = { href: '/tamil-page', title: 'தமிழ் பக்கம்', text: '' };
  const devanagariEntry = { href: '/sanskrit-page', title: 'संस्कृत पृष्ठ', text: '' };
  assert.ok(matchEntry(tamilEntry, foldForSearch('தமிழ்'), 0));
  assert.ok(matchEntry(devanagariEntry, foldForSearch('संस्कृत'), 0));
});

test('matchEntry matches a diacritic-insensitive query against diacritic-bearing title text', () => {
  const entry = { href: '/gita', title: 'Bhagavad Gītā', text: '' };
  assert.ok(matchEntry(entry, foldForSearch('Gita'), 0));
});

// --- dedupeByHref -----------------------------------------------------

test('dedupeByHref keeps only the best-scored match per href', () => {
  const matches = [
    { href: '/a', title: 'A', text: '', score: 1, idx: 0 },
    { href: '/a', title: 'A', text: '', score: 2, idx: 1 },
  ];
  const deduped = dedupeByHref(matches);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].score, 2);
});

test('dedupeByHref never collapses two distinct destinations', () => {
  const matches = [
    { href: '/a', title: 'A', text: '', score: 1, idx: 0 },
    { href: '/b', title: 'B', text: '', score: 1, idx: 1 },
  ];
  assert.equal(dedupeByHref(matches).length, 2);
});

test('dedupeByHref breaks an equal-score tie by keeping the earlier original index', () => {
  const matches = [
    { href: '/a', title: 'A', text: '', score: 1, idx: 5 },
    { href: '/a', title: 'A', text: '', score: 1, idx: 2 },
  ];
  assert.equal(dedupeByHref(matches)[0].idx, 2);
});

// --- rankResults -----------------------------------------------------

test('rankResults sorts title matches (score 2) above text-only matches (score 1)', () => {
  const matches = [
    { href: '/a', title: 'A', text: '', score: 1, idx: 0 },
    { href: '/b', title: 'B', text: '', score: 2, idx: 1 },
  ];
  const ranked = rankResults(matches);
  assert.equal(ranked[0].href, '/b');
  assert.equal(ranked[1].href, '/a');
});

test('rankResults breaks an equal-score tie deterministically by original input order', () => {
  const matches = [
    { href: '/z', title: 'Z', text: '', score: 1, idx: 3 },
    { href: '/a', title: 'A', text: '', score: 1, idx: 0 },
    { href: '/m', title: 'M', text: '', score: 1, idx: 1 },
  ];
  const ranked = rankResults(matches);
  assert.deepEqual(ranked.map((r) => r.href), ['/a', '/m', '/z']);
});

test('rankResults does not mutate its input array', () => {
  const matches = [{ href: '/b', title: 'B', text: '', score: 1, idx: 1 }, { href: '/a', title: 'A', text: '', score: 2, idx: 0 }];
  const original = [...matches];
  rankResults(matches);
  assert.deepEqual(matches, original);
});

// --- paginate -----------------------------------------------------

function makeList(n) {
  return Array.from({ length: n }, (_, i) => ({ href: `/item-${i}`, title: `Item ${i}`, text: '', score: 1, idx: i }));
}

test('paginate defaults to page 1 and the standard 20-per-page size', () => {
  const result = paginate(makeList(45), undefined);
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, PAGE_SIZE);
  assert.equal(result.results.length, 20);
  assert.equal(result.total, 45);
  assert.equal(result.totalPages, 3);
});

test('paginate returns the correct slice for an in-range page', () => {
  const result = paginate(makeList(45), 2);
  assert.equal(result.results.length, 20);
  assert.equal(result.results[0].href, '/item-20');
});

test('paginate returns a short final page', () => {
  const result = paginate(makeList(45), 3);
  assert.equal(result.results.length, 5);
});

test('paginate clamps an invalid page number (zero, negative, non-integer, missing) to page 1', () => {
  for (const bad of [0, -1, 1.5, NaN, null, undefined, 'two']) {
    const result = paginate(makeList(45), bad);
    assert.equal(result.page, 1, `page ${JSON.stringify(bad)} must clamp to 1`);
  }
});

test('paginate returns an empty results array for an out-of-range page, without clamping back to the last page', () => {
  const result = paginate(makeList(45), 99);
  assert.equal(result.page, 99, 'the requested page number is preserved, not silently substituted');
  assert.equal(result.results.length, 0);
  assert.equal(result.total, 45);
  assert.equal(result.totalPages, 3);
});

test('paginate handles an empty list without error', () => {
  const result = paginate([], 1);
  assert.equal(result.total, 0);
  assert.equal(result.totalPages, 0);
  assert.equal(result.results.length, 0);
});

// --- searchEntries (end-to-end) -----------------------------------------------------

test('searchEntries returns no results for an empty query', () => {
  const result = searchEntries(FIXTURES, '');
  assert.deepEqual(result.results, []);
  assert.equal(result.total, 0);
});

test('searchEntries returns no results for a whitespace-only query', () => {
  const result = searchEntries(FIXTURES, '   \t  ');
  assert.deepEqual(result.results, []);
});

test('searchEntries returns no results for a non-string query', () => {
  assert.deepEqual(searchEntries(FIXTURES, null).results, []);
  assert.deepEqual(searchEntries(FIXTURES, 42).results, []);
});

test('searchEntries is defensive when entries is not an array', () => {
  assert.deepEqual(searchEntries(null, 'about').results, []);
  assert.deepEqual(searchEntries(undefined, 'about').results, []);
  assert.deepEqual(searchEntries('not-an-array', 'about').results, []);
});

test('searchEntries finds a real title match case-insensitively', () => {
  const result = searchEntries(FIXTURES, 'CREDIBILITY');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].href, '/credibility');
  assert.equal(result.results[0].score, 2);
});

test('searchEntries ranks a title match above a text-only match for a broader query', () => {
  // "sanskrit" appears in /about's text and /donate's text and title-
  // adjacent copy; craft a case where one entry's title contains the query
  // and another's only text does, to assert ordering.
  const entries = [
    { href: '/x', title: 'General page', text: 'All about sanskrit learning.' },
    { href: '/sanskrit', title: 'Sanskrit', text: 'A page about something else.' },
  ];
  const result = searchEntries(entries, 'sanskrit');
  assert.equal(result.results[0].href, '/sanskrit', 'the title match must rank first');
});

test('searchEntries deduplicates by href end-to-end -- a single entry matching on both title and text appears once', () => {
  const entries = [{ href: '/donate', title: 'Donate', text: 'Donate to support Sanskrit education.' }];
  const result = searchEntries(entries, 'donate');
  assert.equal(result.results.length, 1);
});

test('searchEntries never collapses two distinct pages that happen to share matching text', () => {
  const entries = [
    { href: '/a', title: 'Page A', text: 'shared keyword here' },
    { href: '/b', title: 'Page B', text: 'shared keyword here too' },
  ];
  const result = searchEntries(entries, 'shared keyword');
  assert.equal(result.results.length, 2);
});

test('searchEntries truncates an over-200-code-point query rather than failing', () => {
  const entries = [{ href: '/a', title: 'a'.repeat(250), text: '' }];
  const result = searchEntries(entries, 'a'.repeat(250));
  assert.equal(result.query.length, 200);
  assert.equal(result.results.length, 1, 'the truncated query must still match the truncated-length-compatible title');
});

test('searchEntries supports Tamil queries end-to-end', () => {
  const entries = [{ href: '/tamil', title: 'தமிழ்', text: '' }, { href: '/other', title: 'Other', text: '' }];
  const result = searchEntries(entries, 'தமிழ்');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].href, '/tamil');
});

test('searchEntries supports Devanagari queries end-to-end', () => {
  const entries = [{ href: '/gita', title: 'गीता', text: '' }, { href: '/other', title: 'Other', text: '' }];
  const result = searchEntries(entries, 'गीता');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].href, '/gita');
});

test('searchEntries supports diacritic-insensitive Latin queries end-to-end ("Gita" matches "Gītā")', () => {
  const entries = [{ href: '/gita', title: 'Bhagavad Gītā', text: '' }, { href: '/other', title: 'Other', text: '' }];
  const result = searchEntries(entries, 'Gita');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].href, '/gita');
});

test('searchEntries paginates a large result set at 20 per page, with deterministic, stable ordering across pages', () => {
  const entries = Array.from({ length: 50 }, (_, i) => ({ href: `/match-${i}`, title: `Matching Item ${i}`, text: '' }));
  const page1 = searchEntries(entries, 'matching');
  const page2 = searchEntries(entries, 'matching', { page: 2 });
  assert.equal(page1.results.length, 20);
  assert.equal(page2.results.length, 20);
  assert.equal(page1.total, 50);
  assert.equal(page1.totalPages, 3);
  // No overlap between pages, and ordering is identical across repeated calls.
  const page1Again = searchEntries(entries, 'matching');
  assert.deepEqual(page1.results, page1Again.results);
  const hrefs1 = new Set(page1.results.map((r) => r.href));
  const hrefs2 = new Set(page2.results.map((r) => r.href));
  assert.equal([...hrefs1].some((h) => hrefs2.has(h)), false);
});

test('searchEntries handles an out-of-range page for a real query without throwing', () => {
  const result = searchEntries(FIXTURES, 'sanskrit', { page: 999 });
  assert.equal(result.results.length, 0);
  assert.ok(result.total > 0);
});

// --- Real Stage 1 registry integration -----------------------------------------------------

// Adapts the real Stage 1 SEARCH_REGISTRY ({path, title, description}) into
// this engine's canonical {href, title, text} shape -- done here, in the
// test, not inside searchEngine.js, so the engine itself never has to know
// Stage 1's field names.
function toEngineEntries(registry) {
  return registry.map((e) => ({ href: e.path, title: e.title, text: e.description }));
}

test('searchEntries works end-to-end against the real Stage 1 registry', () => {
  const entries = toEngineEntries(SEARCH_REGISTRY);
  const result = searchEntries(entries, 'Credibility');
  assert.ok(result.results.some((r) => r.href === '/credibility'), 'expected the real /credibility page to be found');
});

test('searchEntries against the real registry never returns an admin or dynamic-template href', () => {
  const entries = toEngineEntries(SEARCH_REGISTRY);
  const result = searchEntries(entries, 'Sanskrit');
  for (const r of result.results) {
    assert.ok(!r.href.startsWith('/admin'), `${r.href} must never be an admin route`);
    assert.ok(!r.href.includes('['), `${r.href} must never be a dynamic route template`);
  }
});
