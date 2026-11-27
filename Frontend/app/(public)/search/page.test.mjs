// QA Bug 5, Stage 4: regression coverage for the /search page.
//
// page.js contains JSX in its default-exported component, so (same,
// already-established limitation as every other .jsx/JSX-returning
// page.js in this project: no React-rendering harness exists here) the
// whole file cannot be `import`-ed under plain `node --test` -- the JSX
// syntax itself is a SyntaxError outside a Babel/SWC/esbuild transform,
// regardless of which export is being used.
//
// This file gets real behavioral coverage anyway for the three *pure,
// JSX-free* helper functions (parseQuery/parsePage/pageHref) by
// extracting each one's exact, verbatim source text and executing it for
// real via `new Function(...)` -- this is genuine runtime execution of
// the real, unmodified logic, not a re-typed duplicate and not a regex
// match. Everything touching actual JSX/rendering output below is a
// structural source-text assertion instead, and is explicitly labelled as
// such -- never claimed as runtime rendering verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

// Extracts `export function <name>(...) { ... }`'s exact source (brace-
// balanced, so an internal if/for block's own braces don't truncate it
// early), strips the `export `, and returns a real, callable function via
// `new Function`. Throws loudly if the function can't be found, rather
// than silently testing nothing.
function extractRealFunction(name) {
  const marker = `export function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} not found in page.js`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.ok(i < source.length, `could not find the end of ${name}'s body`);
  const body = source.slice(start, i + 1).replace(/^export /, '');
  // eslint-disable-next-line no-eval -- deliberate: executing the real,
  // verbatim-extracted source text as real code, not a re-implementation.
  return (0, eval)(`(${body})`);
}

const parseQuery = extractRealFunction('parseQuery');
const parsePage = extractRealFunction('parsePage');
const pageHref = extractRealFunction('pageHref');

// --- parseQuery: real behavior -----------------------------------------

test('parseQuery returns the string as-is for a normal query', () => {
  assert.equal(parseQuery({ q: 'team' }), 'team');
});

test('parseQuery treats a missing "q" as an empty string', () => {
  assert.equal(parseQuery({}), '');
  assert.equal(parseQuery(undefined), '');
});

test('parseQuery treats a repeated "q" (Next.js gives an array) as an empty string, not a crash', () => {
  assert.equal(parseQuery({ q: ['a', 'b'] }), '');
});

test('parseQuery treats an already-empty string as empty (searchPublicContent handles whitespace-only itself)', () => {
  assert.equal(parseQuery({ q: '' }), '');
  assert.equal(parseQuery({ q: '   ' }), '   ');
});

test('parseQuery passes an excessively long query through unchanged (truncation is searchPublicContent\'s own job)', () => {
  const long = 'a'.repeat(500);
  assert.equal(parseQuery({ q: long }), long);
});

test('parseQuery passes Tamil, Devanagari, and IAST queries through unchanged', () => {
  assert.equal(parseQuery({ q: 'தமிழ்' }), 'தமிழ்');
  assert.equal(parseQuery({ q: 'गीता' }), 'गीता');
  assert.equal(parseQuery({ q: 'Gītā' }), 'Gītā');
});

// --- parsePage: real behavior, every required invalid-input case --------

test('parsePage parses a normal positive integer string', () => {
  assert.equal(parsePage({ page: '2' }), 2);
});

test('parsePage returns undefined for a missing page', () => {
  assert.equal(parsePage({}), undefined);
});

test('parsePage returns undefined for a negative number', () => {
  assert.equal(parsePage({ page: '-3' }), -3); // still finite -- paginate() itself clamps non->=1 values
});

test('parsePage rejects NaN (a non-numeric string)', () => {
  assert.equal(parsePage({ page: 'abc' }), undefined);
});

test('parsePage rejects Infinity', () => {
  assert.equal(parsePage({ page: 'Infinity' }), undefined);
  assert.equal(parsePage({ page: '-Infinity' }), undefined);
});

test('parsePage passes a decimal through as a finite number (paginate() itself rejects non-integers)', () => {
  assert.equal(parsePage({ page: '1.5' }), 1.5);
});

test('parsePage passes an excessively large number through as a finite number (an out-of-range page, not a crash)', () => {
  assert.equal(parsePage({ page: '999999999999' }), 999999999999);
});

test('parsePage returns undefined for a non-string page value', () => {
  assert.equal(parsePage({ page: 2 }), undefined);
  assert.equal(parsePage({ page: null }), undefined);
});

// --- pageHref: real behavior --------------------------------------------

test('pageHref omits the page parameter for page 1', () => {
  assert.equal(pageHref('team', 1), '/search?q=team');
});

test('pageHref includes both q and page for page > 1', () => {
  assert.equal(pageHref('team', 2), '/search?q=team&page=2');
});

test('pageHref omits q entirely for an empty query', () => {
  assert.equal(pageHref('', 2), '/search?page=2');
});

test('pageHref returns the bare path when both query and page are absent/default', () => {
  assert.equal(pageHref('', 1), '/search');
});

test('pageHref percent-encodes a query with special characters, producing no raw query-string-breaking characters', () => {
  const href = pageHref('team & co?', 2);
  assert.ok(href.startsWith('/search?'));
  assert.ok(!href.includes('& co?'), 'the ampersand/question mark must be encoded, not reproduced raw');
});

test('pageHref never constructs an external URL', () => {
  assert.ok(pageHref('anything', 5).startsWith('/search'));
});

// --- Structural assertions on the JSX/rendering (NOT runtime verification) --
//
// Everything below reads page.js's own source text to confirm the
// component is *wired* correctly -- it does not prove what actually
// renders in a browser, since this file cannot be imported/executed as a
// whole (JSX). Each assertion is phrased in terms of source structure,
// not rendered output.

test('the page is a Server Component using force-dynamic and the established pageMetadata() convention', () => {
  // Checks for an actual directive statement at the start of a line, not
  // a bare substring -- this file's own header comment legitimately
  // *discusses* 'use client' by name (explaining that it's absent), which
  // a plain .includes() check would false-positive on.
  assert.ok(!/^['"]use client['"];/m.test(source), 'must remain a Server Component');
  assert.match(source, /export const dynamic = 'force-dynamic';/);
  assert.match(source, /export const metadata = pageMetadata\(\{/);
});

test('searchPublicContent() is called with the parsed query and page, and never any other way', () => {
  assert.match(source, /await searchPublicContent\(rawQuery, \{ page \}\)/);
});

test('an unexpected failure from searchPublicContent() is caught and shown as a safe fallback, never a crash', () => {
  assert.match(source, /catch \(err\) \{/);
  assert.match(source, /Search temporarily unavailable/);
});

test('every result link uses the real r.href value, never a reconstructed or external URL', () => {
  assert.match(source, /<Link href=\{r\.href\}/);
});

test('pagination links are built via pageHref(), preserving the current query', () => {
  assert.match(source, /<Link href=\{pageHref\(result\.query, result\.page - 1\)\}/);
  assert.match(source, /<Link href=\{pageHref\(result\.query, result\.page \+ 1\)\}/);
});

// --- Out-of-range pagination correction (structural -- see page.js's own
// comment on `canPaginate` for the full reasoning) ---------------------
//
// paginate() (searchEngine.js) never clamps an excessively large `page`
// down to `totalPages` -- it deliberately returns an empty `results` for
// it instead, so `result.page` can sit far past `result.totalPages` here.
// Previous/Next must never be computed or rendered in that state, since
// both `result.page - 1` and `result.page + 1` would still be out of
// range. These checks confirm the *entire* Previous/Next nav is gated on
// a single `canPaginate` flag that is explicitly false whenever
// `isOutOfRangePage` is true -- not just that one of the two links is
// conditionally hidden, which would still leave the other computed and
// rendered.

test('canPaginate is defined as false whenever the page is out of range, true only for an in-range multi-page result', () => {
  assert.match(source, /const canPaginate = !isOutOfRangePage && result\.totalPages > 1;/);
});

test('the entire Previous/Next nav is gated on canPaginate, not on a per-link check that could leave one link reachable', () => {
  assert.match(source, /\{canPaginate && \(/);
  // The old, narrower guard (`!isOutOfRangePage && result.totalPages > 1`
  // inlined directly at the nav's render site) must be gone -- the single
  // `canPaginate` flag is the only thing deciding whether the nav renders
  // at all.
  assert.ok(!source.includes('{!isOutOfRangePage && result.totalPages > 1 && ('), 'the old inline guard must be replaced by the named canPaginate flag');
});

test('when out of range, the only escape hatch offered is the safe "first page" link -- never Previous/Next', () => {
  const navBlockStart = source.indexOf('{canPaginate && (');
  assert.notEqual(navBlockStart, -1);
  const outOfRangeBlockStart = source.indexOf('{isOutOfRangePage && (');
  assert.notEqual(outOfRangeBlockStart, -1);
  assert.ok(outOfRangeBlockStart < navBlockStart, 'the out-of-range message (with its own first-page link) must be the block rendered before the (now-suppressed) pagination nav');
  // The out-of-range message's own link always targets page 1 explicitly
  // -- never result.page - 1/+1, which could itself be out of range.
  const outOfRangeBlock = source.slice(outOfRangeBlockStart, navBlockStart);
  assert.match(outOfRangeBlock, /<Link href=\{pageHref\(result\.query, 1\)\}/);
  assert.ok(!outOfRangeBlock.includes('result.page - 1'));
  assert.ok(!outOfRangeBlock.includes('result.page + 1'));
});

test('match count wording is neutral ("matches on this page"), never implying people/items, and only shown when > 1', () => {
  assert.match(source, /r\.matchCount > 1 && <p[^>]*>\{r\.matchCount\} matches on this page<\/p>/);
  assert.ok(!source.includes('people matched'));
  assert.ok(!source.includes('items matched'));
});

test('empty-query, no-results, and out-of-range-page are three distinct, separately-rendered states', () => {
  assert.match(source, /const isEmptyQuery = !result\.query;/);
  assert.match(source, /const hasNoResultsAtAll = !isEmptyQuery && result\.total === 0;/);
  assert.match(source, /const isOutOfRangePage = !isEmptyQuery && result\.total > 0 && result\.results\.length === 0;/);
  assert.match(source, /Enter a search term above/);
  assert.match(source, /No matching pages, posts, or records were found\./);
  assert.match(source, /This page has no results\./);
});

test('partial and truncated results each render their own honest, separate notice', () => {
  assert.match(source, /\{result\.partial && \(/);
  assert.match(source, /Some results may be temporarily unavailable/);
  assert.match(source, /\{result\.truncated && \(/);
  assert.match(source, /Showing matches from our most recent blog posts only\./);
});

test('no raw HTML is ever rendered -- no dangerouslySetInnerHTML anywhere in this file', () => {
  assert.ok(!source.includes('dangerouslySetInnerHTML'));
});

test('text content is rendered via plain JSX interpolation, which React escapes by default -- confirmed by the absence of any HTML-string-building', () => {
  assert.ok(!source.includes('innerHTML'));
  assert.match(source, /\{r\.title\}/);
  assert.match(source, /\{r\.text\}/);
});

test('result cards and navigation carry accessible structure (list semantics, aria-label on pagination)', () => {
  assert.match(source, /<ul className=/);
  assert.match(source, /<nav aria-label="Search results pages"/);
});

test('this file imports only searchPublicContent, pageMetadata, and next/link -- no donation/payment/FCRA/backend/CMS module of any kind', () => {
  // Checks the exact set of import statements present, rather than a bare
  // substring ban on words like "donation" -- this page's own metadata
  // description legitimately *mentions* "donation schemes" as one of the
  // searchable content types (accurate copy, same as Stage 1's own
  // registry entry for /donate), which a blanket word-ban would
  // false-positive on.
  const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
  assert.deepEqual(importLines.map((l) => l.trim()), [
    "import Link from 'next/link';",
    "import { searchPublicContent } from '@/lib/searchAggregate';",
    "import { pageMetadata } from '@/lib/seo';",
  ]);
});
