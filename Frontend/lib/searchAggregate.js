// QA Bug 5, Stage 3B: a server-only public search aggregator composing
// Stage 1's SEARCH_REGISTRY, Stage 2's searchEngine.js, and Stage 3A's
// searchAdapters.js -- none of which are modified by this file. Blog and
// donation-scheme retrieval reuse getBlogPosts()/getDonationSchemes()
// (Frontend/services/blogService.js/donationService.js) unchanged. CSR and
// About-content retrieval do NOT reuse getJoinUsContent()/getAboutContent()
// -- see the "DRAFT MODE SECURITY CORRECTION" note below for why -- and
// instead call the lower-level apiRequest()/shouldUseMockData() directly.
// Nothing here ever reaches the network except through these
// already-existing, unmodified exports, and every adapter call below still
// passes through Stage 3A's own published/active filtering, unmodified.
//
// SERVER-ONLY, BY INHERITANCE, NOT BY ANY NEW RESTRICTION HERE: this file
// has no 'use client' directive and does not touch `window`/`document`.
// Its default service implementations (below) dynamically `import()` the
// real service/client modules. The import is deliberately *dynamic*, not a
// static top-level `import`, so that *loading this module at all* never
// depends on anything Next.js-runtime-specific (even after the correction
// below, blogService.js still transitively reaches 'next/headers' via its
// own preview-secret handling) -- confirmed: plain `node --test` cannot
// resolve 'next/headers', so a static top-level import of blogService.js
// would break this file's own offline test suite even though every test
// supplies its own fixture `services` and never needs the real ones.
// Next.js's own bundler still refuses to include a module that reaches
// next/headers in a Client Component bundle, so importing this file from a
// 'use client' file still fails at build time, not silently at runtime --
// no extra guard is added here because none is needed beyond not adding
// 'use client' to this file itself.
//
// DRAFT MODE SECURITY CORRECTION (Stage 3B security review): the first
// version of this file called getJoinUsContent()/getAboutContent()
// directly, which each call contentService.js's getPublicContent() --
// itself reading the ambient Next.js draftMode() cookie and, when an admin
// has it enabled (e.g. from clicking "Preview draft" on some other page in
// the same browser session) AND DRAFT_MODE_SECRET is configured, returning
// that type's *draft* data instead of its published data into search
// results. defaultFetchJoinUsContent()/defaultFetchAboutContent() below no
// longer call those two functions at all -- they call apiClient.js's
// apiRequest() (confirmed, by a full re-read, to have zero awareness of
// draftMode()/previewSecret of any kind) directly against the exact same
// `/public/${type}` path getPublicContent() itself would use on its own
// non-preview branch, so the result is unconditionally the published
// response, every time, regardless of any ambient Draft Mode state. In
// mock/dev mode, shouldUseMockData() (Frontend/lib/apiConfig.js, also
// re-read in full, equally draftMode()-agnostic) is checked exactly as
// getPublicContent() itself does, loading the same mock data this file
// already lives beside -- via relative imports
// ('./mockData/joinUs.js'/'./mockData/about.js'), not the '@/' alias
// pageService.js uses, since that alias is only configured for Next.js's
// own bundler/editor tooling and does not resolve under a plain Node
// import (confirmed) -- see the comment on defaultFetchJoinUsContent()/
// defaultFetchAboutContent() below for the full explanation.
// withPatronCategoriesCompat() (getAboutContent()'s own extra step,
// pageService.js) is deliberately NOT replicated here -- confirmed, by
// reading it in full, to be purely additive (it only ever adds a
// PATRON_CATEGORIES key derived from legacy PATRON_TIERS/PATRON_TIER_ROWS
// fields, explicitly leaving every other field, including CORE_TEAMS/
// BOARD/ADVISORS/COMMITTEE, "carried over exactly as received" per its own
// comment) -- this aggregator never reads PATRON_CATEGORIES, so skipping
// that compat step changes nothing this file actually uses.
// getBlogPosts()/getDonationSchemes() needed no such correction -- neither
// ever calls draftMode() at all (confirmed by reading both;
// listPostsPublic/listDonationSchemes have no previewSecret concept), so
// their retrieval is unchanged.
//
// NO CACHING: this module holds no module-level mutable state and performs
// no memoization of any kind. Every call to searchPublicContent() re-fetches
// every source fresh. This is deliberate -- a module-level cache here could
// leak one request's (possibly draft-mode) response into a later,
// unrelated request in the same server process. A future results page that
// wants caching must add its own, explicitly scoped mechanism (e.g. a
// Next.js fetch-level cache option on a specific call) -- this module
// provides none, and that is itself the safety property, not a gap to fill
// casually.
//
// TIMEOUT HONESTY: none of getBlogPosts/getDonationSchemes/getJoinUsContent/
// getAboutContent, nor the apiRequest/apiRequestWithMeta wrapper underneath
// them (Frontend/services/apiClient.js), accept an AbortSignal -- confirmed
// by reading apiClient.js in full; its fetch() call never receives a
// `signal` option. The withTimeout() helper below therefore only stops
// *waiting* for a slow source after the deadline; it does NOT cancel the
// underlying network request, which may still complete (or fail) in the
// background with its result simply discarded. This is stated explicitly
// in withTimeout()'s own error, never implied otherwise.

import { SEARCH_REGISTRY } from './searchRegistry.js';
import {
  registryEntryToSearchEntry,
  blogPostsToSearchEntries,
  donationSchemesToSearchEntries,
  csrProjectsToSearchEntries,
  coreTeamGroupsToSearchEntries,
  leadershipMembersToSearchEntries,
} from './searchAdapters.js';
import { searchEntries, matchEntry, foldForSearch, normalizeSearchQuery } from './searchEngine.js';

export const MAX_BLOG_POSTS_SCANNED = 300;
export const BLOG_PAGE_SIZE = 50; // the backend's own verified cap (blog.controller.js's listPostsPublic: Math.min(50, ...))
export const SOURCE_TIMEOUT_MS = 5000;

// Lazy, dynamic defaults for the four real service functions -- NOT static
// top-level imports. blogService.js imports `draftMode` from
// 'next/headers' (for its own preview-secret handling on blog posts),
// which only resolves inside the real Next.js build/runtime, not under a
// plain `node --test` run -- a static top-level import of blogService.js
// would make *importing this file at all* fail outside Next.js, even for
// a test that only ever uses injected fixture functions and never touches
// the real services. donationService.js, apiConfig.js, and apiClient.js
// have no such dependency, but are deferred the same way here for
// consistency and so a future change to any of them can't silently
// reintroduce this exact failure mode. Deferring the import into these
// small wrapper functions means any Next.js-runtime-only dependency is
// only ever loaded when this module actually runs inside Next.js (where
// no override is given and resolution succeeds normally) -- every test in
// searchAggregate.test.mjs supplies its own `services` override, so this
// dynamic import path is never exercised there at all (except the three
// tests dedicated to exercising it directly -- see "Draft Mode security
// correction" below).
async function defaultFetchBlogPosts(...args) {
  const { getBlogPosts } = await import('../services/blogService.js');
  return getBlogPosts(...args);
}
async function defaultFetchSchemes(...args) {
  const { getDonationSchemes } = await import('../services/donationService.js');
  return getDonationSchemes(...args);
}
// Mirrors contentService.js's getPublicContent()'s own two branches (mock
// vs. real) exactly, MINUS its draftMode()/previewSecret branch -- see the
// file header's "DRAFT MODE SECURITY CORRECTION" note for the full
// rationale and the verification behind each claim made here.
async function fetchPublicContentAlwaysPublic(type, mockLoader) {
  const { shouldUseMockData } = await import('./apiConfig.js');
  if (shouldUseMockData()) return mockLoader();
  const { apiRequest } = await import('../services/apiClient.js');
  // No query suffix is ever appended here -- this call always takes
  // getPublicContent()'s own non-preview branch, unconditionally.
  return apiRequest(`/public/${type}`);
}

// Relative imports, not the '@/' alias pageService.js uses -- this file
// already lives inside Frontend/lib/, so Frontend/lib/mockData/*.js is a
// plain sibling path. '@/' is only configured via jsconfig.json's
// compilerOptions.paths for Next.js's own bundler/editor tooling; it is
// not resolvable by a plain Node ESM import (confirmed), so a relative
// path here is correct both for Next.js and for this file's own offline
// test suite -- not merely a workaround for the latter.
async function defaultFetchJoinUsContent() {
  return fetchPublicContentAlwaysPublic('pages/join-us', () => import('./mockData/joinUs.js'));
}
async function defaultFetchAboutContent() {
  return fetchPublicContentAlwaysPublic('pages/about', () => import('./mockData/about.js'));
}

// Classifies a caught error into one of a small, fixed set of safe, generic
// reasons -- never the raw error message/stack, which could otherwise
// surface an internal path (e.g. apiClient.js's own "Request to /public/...
// failed" message) into what's meant to be safe-to-display metadata.
function classifyError(err) {
  if (err?.timedOut) return 'timeout';
  if (err?.networkError) return 'network_error';
  return 'request_failed';
}

// Races `promise` against a deadline. See the file header's "TIMEOUT
// HONESTY" note -- this never cancels `promise` itself, only stops this
// function from waiting on it. `promise` keeps exactly one reaction handler
// attached (via this race), so its eventual settlement -- whenever it
// happens -- can never surface as an unhandled rejection.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`${label} timed out after ${ms}ms (the underlying request was not cancelled)`);
        err.timedOut = true;
        reject(err);
      }, ms);
    }),
  ]);
}

// --- Bounded blog retrieval --------------------------------------------

// Never performs unbounded pagination. One cheap call establishes `total`;
// subsequent calls fetch at the server's own verified max page size
// (BLOG_PAGE_SIZE) until either every published post is retrieved or
// MAX_BLOG_POSTS_SCANNED is reached, whichever is smaller. `truncated` is
// reported explicitly rather than silently dropping older posts.
async function loadBlogEntries(fetchBlogPosts) {
  const first = await fetchBlogPosts({ limit: 1 });
  const total = Number.isFinite(first?.meta?.total) ? first.meta.total : 0;
  const cappedTotal = Math.min(total, MAX_BLOG_POSTS_SCANNED);
  const pageCount = Math.ceil(cappedTotal / BLOG_PAGE_SIZE);

  const posts = [];
  for (let page = 1; page <= pageCount; page += 1) {
    // eslint-disable-next-line no-await-in-loop -- deliberately sequential,
    // not an unbounded parallel burst, to stay gentle on the backend.
    const { items } = await fetchBlogPosts({ page, limit: BLOG_PAGE_SIZE });
    posts.push(...(Array.isArray(items) ? items : []));
    if (posts.length >= cappedTotal) break;
  }

  return {
    entries: blogPostsToSearchEntries(posts.slice(0, cappedTotal)),
    truncated: total > MAX_BLOG_POSTS_SCANNED,
  };
}

async function loadSchemeEntries(fetchSchemes) {
  const schemes = await fetchSchemes();
  return donationSchemesToSearchEntries(Array.isArray(schemes) ? schemes : []);
}

async function loadCsrEntries(fetchJoinUsContent) {
  const content = await fetchJoinUsContent();
  return csrProjectsToSearchEntries(Array.isArray(content?.CSR_PROJECTS) ? content.CSR_PROJECTS : []);
}

// Reuses the one getAboutContent() response for both Core Team and
// Leadership, per the approved scope -- a single fetch, not two.
async function loadAboutEntries(fetchAboutContent) {
  const content = await fetchAboutContent();
  const coreTeamEntries = coreTeamGroupsToSearchEntries(Array.isArray(content?.CORE_TEAMS) ? content.CORE_TEAMS : []);
  const leadershipEntries = [
    ...leadershipMembersToSearchEntries(Array.isArray(content?.BOARD) ? content.BOARD : []),
    ...leadershipMembersToSearchEntries(Array.isArray(content?.ADVISORS) ? content.ADVISORS : []),
    ...leadershipMembersToSearchEntries(Array.isArray(content?.COMMITTEE) ? content.COMMITTEE : []),
  ];
  return { coreTeamEntries, leadershipEntries };
}

// --- Query-specific match counts for collapsed CSR/Team/Leadership hrefs ---

// APPROVED OPTION 2 for href collisions: CSR projects, Core Team members,
// and Leadership members each share one parent-page href (no individual
// URL exists for any of them -- confirmed in Stage 3/3A's own source
// inspection; no anchor/id is ever rendered per item on those pages
// either, so none is invented here). searchEngine.js's dedupeByHref keeps
// only the single best-ranked match per href, exactly as already
// documented and tested in Stage 3A -- that behavior is NOT changed here.
// This function instead computes, alongside (not inside) searchEntries'
// own pass, how many of the *raw, pre-dedup* entries actually matched the
// *same, real* folded query -- using searchEngine.js's own unmodified
// matchEntry()/foldForSearch() exports, so a count can never diverge from
// what the engine itself would consider a match. A href with only one
// real source (every registry/blog/scheme entry) always counts as 1.
function countMatchesPerHref(allEntries, foldedQuery) {
  const counts = new Map();
  if (!foldedQuery) return counts;
  allEntries.forEach((entry, idx) => {
    const m = matchEntry(entry, foldedQuery, idx);
    if (m) counts.set(m.href, (counts.get(m.href) || 0) + 1);
  });
  return counts;
}

// --- Main entry point --------------------------------------------------

// Result contract (deterministic, documented):
//   {
//     query: string,            // the normalized query actually searched
//     page, pageSize, total, totalPages,
//     results: [{ href, title, text, score, matchCount }],
//     partial: boolean,         // true if any CMS source failed/timed out
//     truncated: boolean,       // true if the blog retrieval cap was hit
//     sourceErrors: [{ source, reason }],  // safe, generic reasons only --
//       never a raw error message, stack, credential, or internal URL.
//   }
//
// `services` lets tests substitute fixture functions for the four real
// service calls -- the same dependency-injection-by-parameter pattern this
// codebase already uses elsewhere in place of module mocking (which this
// project's test suite does not use).
export async function searchPublicContent(query, { page, services = {} } = {}) {
  const {
    fetchBlogPosts = defaultFetchBlogPosts,
    fetchSchemes = defaultFetchSchemes,
    fetchJoinUsContent = defaultFetchJoinUsContent,
    fetchAboutContent = defaultFetchAboutContent,
  } = services;

  // The static registry is synchronous, zero-async-risk, and therefore
  // always present in `entries` regardless of whether any CMS source below
  // succeeds -- satisfying "preserve static registry results even if CMS
  // sources fail" by construction, not as a special case.
  const registryEntries = SEARCH_REGISTRY.map(registryEntryToSearchEntry).filter(Boolean);

  const sourceErrors = [];
  let truncated = false;

  const [blogResult, schemeResult, csrResult, aboutResult] = await Promise.allSettled([
    withTimeout(loadBlogEntries(fetchBlogPosts), SOURCE_TIMEOUT_MS, 'blog'),
    withTimeout(loadSchemeEntries(fetchSchemes), SOURCE_TIMEOUT_MS, 'donationSchemes'),
    withTimeout(loadCsrEntries(fetchJoinUsContent), SOURCE_TIMEOUT_MS, 'csrProjects'),
    withTimeout(loadAboutEntries(fetchAboutContent), SOURCE_TIMEOUT_MS, 'about'),
  ]);

  let blogEntries = [];
  if (blogResult.status === 'fulfilled') {
    blogEntries = blogResult.value.entries;
    truncated = blogResult.value.truncated;
  } else {
    sourceErrors.push({ source: 'blog', reason: classifyError(blogResult.reason) });
  }

  let schemeEntries = [];
  if (schemeResult.status === 'fulfilled') {
    schemeEntries = schemeResult.value;
  } else {
    sourceErrors.push({ source: 'donationSchemes', reason: classifyError(schemeResult.reason) });
  }

  let csrEntries = [];
  if (csrResult.status === 'fulfilled') {
    csrEntries = csrResult.value;
  } else {
    sourceErrors.push({ source: 'csrProjects', reason: classifyError(csrResult.reason) });
  }

  // One fetch backs both Core Team and Leadership -- a single failure here
  // is reported once (as 'about'), honestly reflecting that both derived
  // sources were affected by the same underlying failure, not as two
  // separately-failing sources.
  let coreTeamEntries = [];
  let leadershipEntries = [];
  if (aboutResult.status === 'fulfilled') {
    ({ coreTeamEntries, leadershipEntries } = aboutResult.value);
  } else {
    sourceErrors.push({ source: 'about', reason: classifyError(aboutResult.reason) });
  }

  const allEntries = [...registryEntries, ...blogEntries, ...schemeEntries, ...csrEntries, ...coreTeamEntries, ...leadershipEntries];

  const base = searchEntries(allEntries, query, { page });

  const normalizedQuery = normalizeSearchQuery(query);
  const foldedQuery = foldForSearch(normalizedQuery);
  const matchCounts = countMatchesPerHref(allEntries, foldedQuery);
  const results = base.results.map((r) => ({ ...r, matchCount: matchCounts.get(r.href) ?? 1 }));

  return {
    query: base.query,
    page: base.page,
    pageSize: base.pageSize,
    total: base.total,
    totalPages: base.totalPages,
    results,
    partial: sourceErrors.length > 0,
    truncated,
    sourceErrors,
  };
}
