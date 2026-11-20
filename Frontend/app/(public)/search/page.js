import Link from 'next/link';
import { searchPublicContent } from '@/lib/searchAggregate';
import { pageMetadata } from '@/lib/seo';

// QA Bug 5, Stage 4: the public search results page. A plain Server
// Component -- no 'use client' -- calling searchPublicContent() directly
// on the server. searchPublicContent() itself (Stage 3B) is server-only
// (it transitively reaches contentService.js's draftMode()-free, but
// still Next.js-runtime-only, apiClient.js path), so it and the backend
// URLs/response shapes it touches never reach the client bundle -- only
// this component's final rendered HTML does. No new backend API is
// introduced; this page is a pure consumer of the existing aggregator.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/search',
  title: 'Search',
  description: 'Search Vyoma.org for pages, blog posts, donation schemes, CSR projects, and our team.',
});

// --- Pure helpers (no JSX) ---------------------------------------------
//
// Kept pure and JSX-free so page.test.mjs can extract and genuinely
// execute each one's real source text directly (this project has no
// React-rendering harness for any JSX-returning file, the same
// already-established limitation as every other page.js/.jsx file in
// this codebase) -- the component below only ever calls these, never
// re-implements their logic inline.

// Handles missing ("q" absent), repeated (Next.js gives an array for a
// repeated query key), and non-string searchParams values by treating
// anything that isn't a plain string as an empty query. An empty or
// excessively long value is NOT specially handled here -- that's
// searchPublicContent()'s own, already-tested job (normalizeSearchQuery()
// returns '' for empty/whitespace, and truncates at 200 Unicode code
// points) -- this function's only job is to never hand it something that
// isn't a plain string in the first place.
export function parseQuery(sp) {
  const raw = sp?.q;
  return typeof raw === 'string' ? raw : '';
}

// Handles negative numbers, decimals, NaN, Infinity, and non-numeric
// strings by returning `undefined` for anything that isn't a finite
// number -- searchPublicContent()'s own paginate() already clamps a
// non-positive-integer `page` to 1 and treats an excessively large but
// valid positive integer as a real, out-of-range page request (returning
// an empty result set for it rather than guessing a "closer" page), so
// this function only needs to rule out non-finite values (NaN/Infinity)
// before they reach that logic -- Number.isFinite() rejects both
// explicitly, even though the downstream Number.isInteger() check would
// also reject Infinity on its own; being explicit here documents the
// intent at this boundary rather than relying solely on that.
export function parsePage(sp) {
  const raw = sp?.page;
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Builds a safe, internal /search?... URL preserving the current query
// across pagination -- never an external URL, never anything beyond this
// one fixed path with a controlled query string.
export function pageHref(query, page) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (page && page !== 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  const rawQuery = parseQuery(sp);
  const page = parsePage(sp);

  let result;
  let unexpectedError = false;
  try {
    result = await searchPublicContent(rawQuery, { page });
  } catch (err) {
    // searchPublicContent() is designed to never throw -- every source
    // failure is already caught internally and surfaced as `partial`/
    // `sourceErrors` -- this is a last-resort safety net for a genuinely
    // unexpected error (e.g. inside searchEntries() itself), matching the
    // same "never a fake success, never a silent crash" fallback pattern
    // already used by donate/page.js for its own data fetch.
    console.error('[search] searchPublicContent failed unexpectedly:', err.message);
    unexpectedError = true;
  }

  if (unexpectedError) {
    return (
      <div className="flex flex-col items-center gap-4 bg-white px-8 py-20 text-center font-sans">
        <h1 className="font-sans text-h2 font-bold text-vyoma-blue">Search temporarily unavailable</h1>
        <p className="max-w-[480px] font-sans text-[15px] text-charcoal">
          We couldn&apos;t complete this search just now — this is usually temporary. Please try again in a moment.
        </p>
      </div>
    );
  }

  const isEmptyQuery = !result.query;
  const hasNoResultsAtAll = !isEmptyQuery && result.total === 0;
  const isOutOfRangePage = !isEmptyQuery && result.total > 0 && result.results.length === 0;
  // Previous/Next must never be shown on an out-of-range page: paginate()
  // (searchEngine.js) never clamps an excessively large but otherwise
  // valid `page` back down to `totalPages` -- it returns an empty
  // `results` array for it instead (a deliberate choice, so the caller
  // can tell "you asked for page 9999" apart from "page 1, clamped").
  // That means result.page can be far past result.totalPages here, and
  // result.page - 1 / result.page + 1 would both still be out of range
  // too -- rendering them would just link to another empty page. Gating
  // the whole nav on `!isOutOfRangePage` (rather than only omitting one
  // of the two links) avoids ever computing or rendering either one in
  // this state; the "Go to the first page" link above already provides
  // the only valid way back out.
  const canPaginate = !isOutOfRangePage && result.totalPages > 1;

  return (
    <div className="font-sans">
      <section className="bg-vyoma-blue px-8 py-14 text-center">
        <h1 className="mx-auto mb-2 font-sans text-h1 font-bold text-white">Search</h1>
        {!isEmptyQuery && (
          <p className="mx-auto max-w-[620px] font-sans text-lg text-[var(--text-inverse-muted)]">
            {result.total > 0 ? `${result.total} result${result.total === 1 ? '' : 's'} for ` : 'No results for '}
            &ldquo;{result.query}&rdquo;
          </p>
        )}
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[760px]">
          {result.partial && (
            <p role="status" className="mb-4 rounded-md bg-sky-mist px-4 py-3 font-sans text-[14px] text-charcoal">
              Some results may be temporarily unavailable. Please try again shortly for complete results.
            </p>
          )}
          {result.truncated && (
            <p role="status" className="mb-4 rounded-md bg-sky-mist px-4 py-3 font-sans text-[14px] text-charcoal">
              Showing matches from our most recent blog posts only.
            </p>
          )}

          {isEmptyQuery && <p className="font-sans text-[15px] text-charcoal">Enter a search term above to search Vyoma.org.</p>}

          {hasNoResultsAtAll && <p className="font-sans text-[15px] text-charcoal">No matching pages, posts, or records were found.</p>}

          {isOutOfRangePage && (
            <p className="font-sans text-[15px] text-charcoal">
              This page has no results.{' '}
              <Link href={pageHref(result.query, 1)} className="font-semibold text-vyoma-blue">
                Go to the first page
              </Link>
              .
            </p>
          )}

          {result.results.length > 0 && (
            <ul className="flex flex-col gap-4">
              {result.results.map((r) => (
                <li
                  key={r.href}
                  className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-5 py-4"
                >
                  <Link href={r.href} className="font-sans text-lg font-bold text-vyoma-blue hover:underline">
                    {r.title}
                  </Link>
                  {r.text && <p className="mt-1 font-sans text-[14px] text-charcoal">{r.text}</p>}
                  {/* Approved Option 2 (Stage 3B): matchCount can reflect
                      several collapsed records sharing one destination --
                      never phrased as "people"/"items", since the count
                      may include the page's own registry listing too. */}
                  {r.matchCount > 1 && <p className="mt-1 font-sans text-xs text-charcoal/60">{r.matchCount} matches on this page</p>}
                </li>
              ))}
            </ul>
          )}

          {canPaginate && (
            <nav aria-label="Search results pages" className="mt-8 flex justify-center gap-4">
              {result.page > 1 && (
                <Link href={pageHref(result.query, result.page - 1)} className="font-sans text-sm font-semibold text-vyoma-blue">
                  ← Previous
                </Link>
              )}
              {result.page < result.totalPages && (
                <Link href={pageHref(result.query, result.page + 1)} className="font-sans text-sm font-semibold text-vyoma-blue">
                  Next →
                </Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </div>
  );
}
