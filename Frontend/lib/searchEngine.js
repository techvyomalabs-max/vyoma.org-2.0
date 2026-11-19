// QA Bug 5, Stage 2: a pure, offline, reusable search matching engine.
// Every function here is a pure function over plain data -- no CMS fetch,
// no API call, no database query, and nothing is rendered as HTML. The
// caller (a future Stage 3 aggregator, not built yet) is responsible for
// assembling the `entries` array from already-authorized public sources
// (e.g. Stage 1's searchRegistry.js, or a published-only blog/scheme list)
// and for re-applying its own visibility rules before entries ever reach
// this file -- this engine has no opinion on where an entry came from or
// what shape its *source* had (registry entries use `path`/`description`,
// a future blog entry might use `slug`/`excerpt` -- neither is assumed
// here).
//
// Canonical entry shape this engine actually consumes:
//   { href: string, title: string, text?: string }
// `href` is the entry's real, final destination URL (never invented).
// `title` is the primary name/heading, ranked above `text` (secondary
// body/description/excerpt content, optional, defaults to '').
//
// All text is ever only compared as plain strings -- nothing here
// constructs HTML, evaluates input, or otherwise treats query/entry text
// as anything but inert data.

export const MAX_QUERY_CODEPOINTS = 200;
export const PAGE_SIZE = 20;

// Case-insensitive, Latin-diacritic-insensitive folding, used identically
// on both the query and every candidate field so comparisons are symmetric.
//
// NFD decomposes a precomposed Latin letter-with-diacritic (as used
// throughout this codebase's own IAST Sanskrit transliteration, e.g. the
// "ī"/"ā"/"ṭ"/"ṇ"/"ṣ" already seen in Frontend/lib/mockData/donate.js's
// "Gītā" citation) into a bare base letter plus one or more combining marks
// in the U+0300-U+036F block, which are then stripped -- so "Gītā" folds to
// "gita", matching a plain-ASCII query of "Gita". This is a pure character
// fold, never a transliteration: it does not and must not claim to convert
// between scripts (Tamil U+0B80-U+0BFF, Devanagari U+0900-U+097F, and Latin
// remain their own distinct scripts before and after folding). Tamil has no
// case and no combining marks in that stripped range, and Devanagari's own
// combining vowel signs/virama live outside U+0300-U+036F, so both scripts
// pass through this fold unchanged other than the harmless, no-op
// `.toLowerCase()` call -- confirmed intentional, not an oversight: this one
// function is safe to reuse across all three scripts because it only ever
// *removes* Latin combining diacritics and *lowercases* Latin case, neither
// of which exists in Tamil or Devanagari text.
export function foldForSearch(text) {
  if (typeof text !== 'string') return '';
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Trims whitespace and enforces the 200-code-point cap by truncation (not
// rejection) -- a query longer than the cap is still searched, just capped
// at its first 200 Unicode code points, so an over-length paste degrades
// gracefully instead of being thrown away entirely. Counting by code point
// (via the string iterator, Array.from) rather than UTF-16 code unit is
// deliberate: a single Devanagari/Tamil character is one code point and
// (for every character actually used in this codebase's content) one UTF-16
// unit too, but this guards correctly against any future content using
// characters outside the Basic Multilingual Plane, which would otherwise be
// undercounted by `.length`. NFC (not NFD) is used here -- NFC is the
// composed, "one visible character on screen" form, the right choice for a
// user-facing length limit; NFD (decomposed) is reserved for foldForSearch's
// internal matching use only, never surfaced back to a caller.
export function normalizeSearchQuery(rawQuery) {
  if (typeof rawQuery !== 'string') return '';
  const trimmed = rawQuery.normalize('NFC').trim();
  if (trimmed.length === 0) return '';
  const codepoints = Array.from(trimmed);
  return codepoints.length > MAX_QUERY_CODEPOINTS ? codepoints.slice(0, MAX_QUERY_CODEPOINTS).join('') : trimmed;
}

// Scores one candidate entry against an already-folded, non-empty query.
// Returns null when the entry doesn't match at all, or isn't a usable
// shape (missing/non-string `href`/`title` -- skipped rather than thrown,
// consistent with this codebase's own established tolerance for a
// malformed/defensively-defaulted item, e.g. lib/contentArrays.js).
// `idx` (the entry's position in the caller's original list) is carried
// through purely for deterministic tie-breaking later -- never used in
// scoring itself.
export function matchEntry(entry, foldedQuery, idx = 0) {
  if (!entry || typeof entry.href !== 'string' || typeof entry.title !== 'string') return null;
  if (!foldedQuery) return null;

  const title = entry.title;
  const text = typeof entry.text === 'string' ? entry.text : '';
  const foldedTitle = foldForSearch(title);
  const foldedText = foldForSearch(text);

  let score = 0;
  if (foldedTitle.includes(foldedQuery)) score = 2;
  else if (foldedText.includes(foldedQuery)) score = 1;
  if (score === 0) return null;

  return { href: entry.href, title, text, score, idx };
}

// Deduplicates by `href` -- the canonical internal destination -- keeping
// only the best-ranked match for that destination. Two matches that merely
// share a title/text are never collapsed; only an identical `href` is. A
// genuinely different page or blog post always keeps its own `href` and is
// therefore never affected by this function, by construction.
export function dedupeByHref(matches) {
  const best = new Map();
  for (const m of matches) {
    const existing = best.get(m.href);
    if (!existing || m.score > existing.score || (m.score === existing.score && m.idx < existing.idx)) {
      best.set(m.href, m);
    }
  }
  return [...best.values()];
}

// Ranks title matches (score 2) above description/excerpt/body-only matches
// (score 1). Ties break deterministically by the entry's original input
// position (ascending) -- an explicit secondary sort key, not a reliance on
// `Array.prototype.sort`'s own stability guarantee, so the ordering is
// obviously deterministic from reading this function alone.
export function rankResults(matches) {
  return [...matches].sort((a, b) => b.score - a.score || a.idx - b.idx);
}

// Paginates an already-ranked list at a fixed page size. An invalid page
// (non-integer, zero, negative, or simply omitted) is clamped to page 1
// rather than thrown on. A page past the end of the result set is NOT
// clamped back to the last valid page -- it deliberately returns an empty
// `results` array for that page (while `total`/`totalPages` still describe
// the real result set), since silently substituting a different page than
// the one asked for would misrepresent what the caller requested; the
// caller can detect this itself by comparing `page` to `totalPages`.
export function paginate(list, page, pageSize = PAGE_SIZE) {
  const total = list.length;
  const totalPages = Math.ceil(total / pageSize);
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const start = (safePage - 1) * pageSize;
  const results = safePage > totalPages ? [] : list.slice(start, start + pageSize);
  return { page: safePage, pageSize, total, totalPages, results };
}

// The composed, end-to-end entry point: normalize -> fold -> match -> dedupe
// -> rank -> paginate. An empty/whitespace-only (or entirely non-string)
// query returns no results without matching/ranking/paginating anything, as
// required -- not merely because an empty substring would otherwise match
// everything (though it would), but because this is the deliberate, visible
// contract for "no query" rather than an accidental side effect of the
// substring check. `entries` is defensively treated as empty when it isn't
// an array at all (e.g. null/undefined), same tolerance as
// lib/contentArrays.js's own toContentArray().
export function searchEntries(entries, rawQuery, { page } = {}) {
  const query = normalizeSearchQuery(rawQuery);
  if (!query) {
    return { query: '', page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0, results: [] };
  }

  const list = Array.isArray(entries) ? entries : [];
  const foldedQuery = foldForSearch(query);

  const matches = [];
  list.forEach((entry, idx) => {
    const m = matchEntry(entry, foldedQuery, idx);
    if (m) matches.push(m);
  });

  const deduped = dedupeByHref(matches);
  const ranked = rankResults(deduped);
  const { page: safePage, pageSize, total, totalPages, results } = paginate(ranked, page);

  return {
    query,
    page: safePage,
    pageSize,
    total,
    totalPages,
    results: results.map(({ href, title, text, score }) => ({ href, title, text, score })),
  };
}
