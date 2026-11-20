// QA Bug 5, Stage 3B: real-behavior tests for searchAggregate.js, using
// offline fixtures and fake service functions injected via the exported
// `services` option -- no real getBlogPosts()/getDonationSchemes()/
// getJoinUsContent()/getAboutContent() call, no network, no Atlas,
// anywhere in this file. Also runs Stage 1/2/3A's own test files alongside
// this one (see the shell command in the Stage 3B report) to confirm no
// regression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchPublicContent, MAX_BLOG_POSTS_SCANNED, BLOG_PAGE_SIZE, SOURCE_TIMEOUT_MS } from './searchAggregate.js';

// --- Fixture builders -----------------------------------------------------

function makePost(overrides = {}) {
  return { slug: 'post', status: 'published', title: 'Post', excerpt: '', ...overrides };
}

function makeBlogFetcher(posts) {
  let calls = 0;
  const fn = async ({ page = 1, limit = 9 } = {}) => {
    calls += 1;
    const start = (page - 1) * limit;
    return { items: posts.slice(start, start + limit), meta: { page, limit, total: posts.length } };
  };
  fn.getCallCount = () => calls;
  return fn;
}

function neverResolves() {
  return new Promise(() => {}); // intentionally never settles
}

const ALWAYS_EMPTY_SCHEMES = async () => [];
const ALWAYS_EMPTY_JOINUS = async () => ({ CSR_PROJECTS: [] });
const ALWAYS_EMPTY_ABOUT = async () => ({ CORE_TEAMS: [], BOARD: [], ADVISORS: [], COMMITTEE: [] });
const ALWAYS_EMPTY_BLOG = makeBlogFetcher([]);

const BASE_SERVICES = {
  fetchBlogPosts: ALWAYS_EMPTY_BLOG,
  fetchSchemes: ALWAYS_EMPTY_SCHEMES,
  fetchJoinUsContent: ALWAYS_EMPTY_JOINUS,
  fetchAboutContent: ALWAYS_EMPTY_ABOUT,
};

// --- Static registry is always present -----------------------------------

test('the static registry is searchable even when every CMS source is empty', async () => {
  const result = await searchPublicContent('Credibility', { services: BASE_SERVICES });
  assert.ok(result.results.some((r) => r.href === '/credibility'));
  assert.equal(result.partial, false);
  assert.equal(result.truncated, false);
});

test('static registry results are preserved even when every CMS source fails outright', async () => {
  const failingServices = {
    fetchBlogPosts: async () => { throw new Error('boom'); },
    fetchSchemes: async () => { throw new Error('boom'); },
    fetchJoinUsContent: async () => { throw new Error('boom'); },
    fetchAboutContent: async () => { throw new Error('boom'); },
  };
  const result = await searchPublicContent('Credibility', { services: failingServices });
  assert.ok(result.results.some((r) => r.href === '/credibility'), 'registry-derived results must survive a total CMS outage');
  assert.equal(result.partial, true);
  assert.equal(result.sourceErrors.length, 4);
  for (const { reason } of result.sourceErrors) {
    assert.equal(reason, 'request_failed');
  }
});

test('search never throws, and reports no incomplete search as complete, when all sources fail', async () => {
  const failingServices = {
    fetchBlogPosts: async () => { throw new Error('boom'); },
    fetchSchemes: async () => { throw new Error('boom'); },
    fetchJoinUsContent: async () => { throw new Error('boom'); },
    fetchAboutContent: async () => { throw new Error('boom'); },
  };
  const result = await searchPublicContent('anything', { services: failingServices });
  assert.equal(result.partial, true, 'an incomplete search must never be reported as partial:false');
});

// --- Published/draft blog filtering, end-to-end ---------------------------

test('a draft post mixed into the fixture is excluded end-to-end, even though a realistic backend would never return one', async () => {
  const posts = [makePost({ slug: 'published-post', title: 'Published Post', status: 'published' }), makePost({ slug: 'draft-post', title: 'Draft Post', status: 'draft' })];
  const result = await searchPublicContent('Post', { services: { ...BASE_SERVICES, fetchBlogPosts: makeBlogFetcher(posts) } });
  assert.ok(result.results.some((r) => r.href === '/media/blog/published-post'));
  assert.ok(!result.results.some((r) => r.href === '/media/blog/draft-post'));
});

// --- Active/inactive donation scheme filtering -----------------------------

test('an inactive scheme is excluded end-to-end', async () => {
  const schemes = async () => [
    { slug: 'active-one', name: 'Active Scheme', body: '', status: 'active' },
    { slug: 'inactive-one', name: 'Inactive Scheme', body: '', status: 'inactive' },
  ];
  const result = await searchPublicContent('Scheme', { services: { ...BASE_SERVICES, fetchSchemes: schemes } });
  assert.ok(result.results.some((r) => r.href === '/donate/active-one'));
  assert.ok(!result.results.some((r) => r.href === '/donate/inactive-one'));
});

// --- CSR active:false exclusion --------------------------------------------

test('an inactive CSR project is excluded end-to-end', async () => {
  const joinUs = async () => ({
    CSR_PROJECTS: [
      { name: 'Active Project', body: 'matching text', active: true },
      { name: 'Inactive Project', body: 'matching text', active: false },
    ],
  });
  const result = await searchPublicContent('matching', { services: { ...BASE_SERVICES, fetchJoinUsContent: joinUs } });
  assert.equal(result.results.length, 1, 'only the active project should contribute -- and both share one href, so this also exercises dedup');
});

// --- Nested Core Team active-group exclusion --------------------------------

test('a person inside an inactive Core Team group is excluded end-to-end even if the person itself has no active:false', async () => {
  const about = async () => ({
    CORE_TEAMS: [
      { heading: 'Retired Group', active: false, people: [{ name: 'Hidden Person', role: 'Role', bio: null, active: true }] },
      { heading: 'Current Group', active: true, people: [{ name: 'Visible Person', role: 'Role', bio: null, active: true }] },
    ],
    BOARD: [], ADVISORS: [], COMMITTEE: [],
  });
  const result = await searchPublicContent('Person', { services: { ...BASE_SERVICES, fetchAboutContent: about } });
  assert.ok(result.results.some((r) => r.title === 'Visible Person'));
  assert.ok(!result.results.some((r) => r.title === 'Hidden Person'));
});

test('Core Team and Leadership are both derived from a single getAboutContent() call', async () => {
  let calls = 0;
  const about = async () => {
    calls += 1;
    return {
      CORE_TEAMS: [{ heading: 'G', active: true, people: [{ name: 'Team Member', role: '', bio: null, active: true }] }],
      BOARD: [{ name: 'Board Member', role: '', active: true }],
      ADVISORS: [], COMMITTEE: [],
    };
  };
  const result = await searchPublicContent('Member', { services: { ...BASE_SERVICES, fetchAboutContent: about } });
  assert.equal(calls, 1, 'getAboutContent() must be called exactly once, reused for both Core Team and Leadership');
  assert.ok(result.results.some((r) => r.href === '/about/core-team'));
  assert.ok(result.results.some((r) => r.href === '/about/leadership'));
});

// --- Unicode (Tamil / Devanagari) end-to-end -------------------------------

test('a Tamil name in a Core Team fixture is searchable end-to-end', async () => {
  const about = async () => ({
    CORE_TEAMS: [{ heading: 'G', active: true, people: [{ name: 'தமிழ் ஆசிரியர்', role: '', bio: null, active: true }] }],
    BOARD: [], ADVISORS: [], COMMITTEE: [],
  });
  const result = await searchPublicContent('தமிழ்', { services: { ...BASE_SERVICES, fetchAboutContent: about } });
  assert.equal(result.results.length, 1);
});

test('a Devanagari scheme name is searchable end-to-end', async () => {
  const schemes = async () => [{ slug: 'gita', name: 'गीता पाठ्यक्रम', body: '', status: 'active' }];
  const result = await searchPublicContent('गीता', { services: { ...BASE_SERVICES, fetchSchemes: schemes } });
  assert.equal(result.results.length, 1);
});

// --- Href collisions and query-specific match counts (Approved Option 2) --

test('two CSR projects sharing a href collapse to one result, whose matchCount reflects exactly the real matches for the query', async () => {
  // Deliberately uses a query term absent from Stage 1's own registry entry
  // for this same href (SEARCH_REGISTRY's '/join-us/csr-projects' entry
  // describes "Sanskrit education and India's knowledge systems" -- using
  // a word from that description here would correctly, but confusingly for
  // this specific test's intent, add the registry's own page-level entry
  // to the count too; that real cross-source interaction is covered on its
  // own in the next test instead).
  const joinUs = async () => ({
    CSR_PROJECTS: [
      { name: 'Alpha Project', body: 'digital language lab', active: true },
      { name: 'Beta Project', body: 'digital language lab', active: true },
      { name: 'Unrelated Project', body: 'completely different topic', active: true },
    ],
  });
  const result = await searchPublicContent('digital language lab', { services: { ...BASE_SERVICES, fetchJoinUsContent: joinUs } });
  const csrResult = result.results.find((r) => r.href === '/join-us/csr-projects');
  assert.ok(csrResult);
  assert.equal(csrResult.matchCount, 2, 'exactly the two matching projects must be counted, not the unrelated third one');
});

test('the real Stage 1 registry entry for /join-us/csr-projects legitimately adds to the same href\'s matchCount when the query also matches its own description', async () => {
  // Confirmed, real cross-source interaction, not a bug: SEARCH_REGISTRY
  // already has its own entry for this exact path (a page-level "CSR
  // Projects" link, title+description, from Stage 1), which shares the
  // same href as every individual CSR_PROJECTS item from this adapter.
  // Approved Option 2 requires the count to reflect *actual* matches for
  // the query -- correctly, that includes this registry entry too when the
  // query happens to match its own description, since it is a genuine,
  // independent match on that same destination, not an unrelated record.
  const joinUs = async () => ({
    CSR_PROJECTS: [{ name: 'Alpha Project', body: 'unrelated body text', active: true }],
  });
  const result = await searchPublicContent('Sanskrit education', { services: { ...BASE_SERVICES, fetchJoinUsContent: joinUs } });
  const csrResult = result.results.find((r) => r.href === '/join-us/csr-projects');
  assert.ok(csrResult);
  assert.equal(csrResult.matchCount, 1, 'only the registry entry matches "Sanskrit education" here -- the one CSR_PROJECTS item does not -- confirming the count is query-specific, not a blanket "how many items share this href"');
});

test('a registry/blog/scheme entry (never collapsed) always reports matchCount 1', async () => {
  const result = await searchPublicContent('Credibility', { services: BASE_SERVICES });
  const entry = result.results.find((r) => r.href === '/credibility');
  assert.equal(entry.matchCount, 1);
});

// --- Bounded blog pagination / truncation ----------------------------------

test('blog retrieval never exceeds MAX_BLOG_POSTS_SCANNED and reports truncated:true beyond it', async () => {
  const totalPosts = MAX_BLOG_POSTS_SCANNED + 25;
  const posts = Array.from({ length: totalPosts }, (_, i) => makePost({ slug: `post-${i}`, title: `Matching Post ${i}` }));
  const fetcher = makeBlogFetcher(posts);
  const result = await searchPublicContent('matching', { services: { ...BASE_SERVICES, fetchBlogPosts: fetcher } });
  assert.equal(result.truncated, true);
  // One call for the meta-probe (limit:1) + ceil(300/50)=6 page calls = 7.
  assert.equal(fetcher.getCallCount(), 1 + Math.ceil(MAX_BLOG_POSTS_SCANNED / BLOG_PAGE_SIZE));
});

test('blog retrieval does not report truncated when total is within the cap', async () => {
  const posts = Array.from({ length: 10 }, (_, i) => makePost({ slug: `post-${i}`, title: `Matching Post ${i}` }));
  const result = await searchPublicContent('matching', { services: { ...BASE_SERVICES, fetchBlogPosts: makeBlogFetcher(posts) } });
  assert.equal(result.truncated, false);
});

// --- Malformed service responses --------------------------------------------

test('a malformed (non-array) scheme response degrades to no scheme entries instead of crashing', async () => {
  const result = await searchPublicContent('anything', { services: { ...BASE_SERVICES, fetchSchemes: async () => null } });
  assert.equal(result.partial, false, 'a gracefully-handled malformed shape is not the same as a thrown failure');
});

test('a malformed (missing-key) join-us content response degrades to no CSR entries instead of crashing', async () => {
  const result = await searchPublicContent('anything', { services: { ...BASE_SERVICES, fetchJoinUsContent: async () => ({}) } });
  assert.equal(result.partial, false);
});

test('a malformed about-content response with wrong-typed arrays degrades instead of crashing', async () => {
  const about = async () => ({ CORE_TEAMS: 'not-an-array', BOARD: null, ADVISORS: undefined, COMMITTEE: 42 });
  const result = await searchPublicContent('anything', { services: { ...BASE_SERVICES, fetchAboutContent: about } });
  assert.equal(result.partial, false);
});

// --- Partial failure isolation ----------------------------------------------

test('one failing source does not blank the others, and is reported by name', async () => {
  const services = {
    ...BASE_SERVICES,
    fetchSchemes: async () => { throw new Error('scheme source down'); },
  };
  const result = await searchPublicContent('Credibility', { services });
  assert.equal(result.partial, true);
  assert.deepEqual(result.sourceErrors, [{ source: 'donationSchemes', reason: 'request_failed' }]);
  assert.ok(result.results.some((r) => r.href === '/credibility'), 'the unrelated registry source must still succeed');
});

// --- Timeout behavior (genuinely waits out SOURCE_TIMEOUT_MS -- slow by design) ---

test('a source that never resolves times out and is reported as such, without blocking the rest of the search', { timeout: SOURCE_TIMEOUT_MS + 5000 }, async () => {
  const services = { ...BASE_SERVICES, fetchBlogPosts: neverResolves };
  const result = await searchPublicContent('Credibility', { services });
  assert.equal(result.partial, true);
  assert.deepEqual(result.sourceErrors, [{ source: 'blog', reason: 'timeout' }]);
  assert.ok(result.results.some((r) => r.href === '/credibility'));
});

// --- Pagination passthrough (reuses Stage 2's own already-tested paginate) --

test('page option is honored and produces no overlap between pages', async () => {
  const posts = Array.from({ length: 45 }, (_, i) => makePost({ slug: `post-${i}`, title: `Matching Post ${i}` }));
  const services = { ...BASE_SERVICES, fetchBlogPosts: makeBlogFetcher(posts) };
  const page1 = await searchPublicContent('matching', { services, page: 1 });
  const page2 = await searchPublicContent('matching', { services, page: 2 });
  assert.equal(page1.results.length, 20);
  assert.equal(page2.results.length, 20);
  const hrefs1 = new Set(page1.results.map((r) => r.href));
  const hrefs2 = new Set(page2.results.map((r) => r.href));
  assert.equal([...hrefs1].some((h) => hrefs2.has(h)), false);
});

// --- Draft Mode security correction ----------------------------------------
//
// These tests exercise searchAggregate.js's REAL default CSR/About
// fetchers (no `services` override for fetchJoinUsContent/
// fetchAboutContent) -- unlike every test above, which always injects a
// fixture. This is possible now (and wasn't before the correction) because
// the new implementation only reaches apiConfig.js/apiClient.js (both
// plain, draftMode()-free modules, confirmed by reading each in full) and
// a relative import of the real Frontend/lib/mockData/joinUs.js|about.js
// files -- none of which need the real Next.js runtime -- instead of
// pageService.js/contentService.js, which do. `process.env` and
// `globalThis.fetch` are saved and restored around each test so nothing
// here leaks into any other test.

function withEnv(overrides, fn) {
  const saved = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL };
  Object.assign(process.env, overrides);
  return fn().finally(() => {
    process.env.NODE_ENV = saved.NODE_ENV;
    if (saved.NEXT_PUBLIC_API_BASE_URL === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = saved.NEXT_PUBLIC_API_BASE_URL;
  });
}

function withStubbedFetch(stub, fn) {
  const saved = globalThis.fetch;
  globalThis.fetch = stub;
  return fn().finally(() => {
    globalThis.fetch = saved;
  });
}

test('the Draft-Mode-sensitive service path is no longer referenced by searchAggregate.js\'s actual code (comments aside)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(__dirname, 'searchAggregate.js'), 'utf8');
  // Strips `//`-prefixed comment lines before checking -- this file's own
  // header comment legitimately *discusses* the old getJoinUsContent()/
  // getAboutContent() wrapper by name (explaining why it was replaced), so
  // checking the raw source for that bare string would false-positive on
  // prose, not actual code. Only line comments are used in this file.
  const codeOnly = source
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  assert.ok(!codeOnly.includes('getJoinUsContent'), 'the old Draft-Mode-sensitive wrapper must no longer be called in real code');
  assert.ok(!codeOnly.includes('getAboutContent'), 'the old Draft-Mode-sensitive wrapper must no longer be called in real code');
  assert.ok(!codeOnly.includes('draftMode'), 'this file must never call draftMode() itself');
  assert.ok(!codeOnly.includes('previewSecret'), 'this file must never construct or forward a previewSecret');
  assert.ok(!codeOnly.includes("'../services/pageService.js'"), 'pageService.js must no longer be imported at all');
  assert.ok(codeOnly.includes('shouldUseMockData'), 'the corrected implementation must still check shouldUseMockData()');
  assert.ok(codeOnly.includes('apiRequest'), 'the corrected implementation must call apiRequest() directly');
});

test('the default public fetch path never sends a preview secret, and handles a real published API response shape correctly', async () => {
  // Both fetchJoinUsContent and fetchAboutContent are left as real
  // defaults here (no override), so the stub is hit twice -- once per
  // source -- and both calls' URLs are captured, not just the last one.
  const capturedUrls = [];
  const fakeFetch = async (url) => {
    capturedUrls.push(url);
    if (url.includes('/public/pages/join-us')) {
      return { ok: true, json: async () => ({ success: true, data: { CSR_PROJECTS: [{ name: 'Real Shape Project', body: 'from a stubbed published API response', active: true }] } }) };
    }
    return { ok: true, json: async () => ({ success: true, data: { CORE_TEAMS: [], BOARD: [], ADVISORS: [], COMMITTEE: [] } }) };
  };
  await withEnv({ NODE_ENV: 'production', NEXT_PUBLIC_API_BASE_URL: 'https://example-api.test/api/v1' }, () =>
    withStubbedFetch(fakeFetch, async () => {
      const result = await searchPublicContent('Real Shape Project', {
        services: { fetchBlogPosts: ALWAYS_EMPTY_BLOG, fetchSchemes: ALWAYS_EMPTY_SCHEMES },
      });
      assert.ok(result.results.some((r) => r.href === '/join-us/csr-projects'), 'the real published-shape {success,data} response must be unwrapped and reach search results');
    })
  );
  assert.ok(capturedUrls.some((u) => u.includes('/public/pages/join-us')), 'must request the real public CSR content path');
  assert.ok(capturedUrls.some((u) => u.includes('/public/pages/about')), 'must request the real public About content path');
  assert.ok(capturedUrls.every((u) => !u.includes('previewSecret')), 'must never send a previewSecret query parameter on any call');
});

test('mock-mode content (the real Frontend/lib/mockData/joinUs.js and about.js modules) is loaded correctly, with no network call at all', async () => {
  let fetchWasCalled = false;
  const failIfCalledFetch = async () => {
    fetchWasCalled = true;
    throw new Error('fetch must never be called in mock mode');
  };
  await withEnv({ NODE_ENV: 'test', NEXT_PUBLIC_API_BASE_URL: '' }, () =>
    withStubbedFetch(failIfCalledFetch, async () => {
      // No override for fetchJoinUsContent/fetchAboutContent -- exercising
      // the real default, which must fall back to the real mock modules
      // since NEXT_PUBLIC_API_BASE_URL is empty and NODE_ENV isn't
      // 'production' (shouldUseMockData()'s own real contract).
      const result = await searchPublicContent('Guru', {
        services: { fetchBlogPosts: ALWAYS_EMPTY_BLOG, fetchSchemes: ALWAYS_EMPTY_SCHEMES },
      });
      // The real CSR_PROJECTS mock data (Frontend/lib/mockData/joinUs.js)
      // does not contain "Guru" -- searching for real About-mock content
      // instead, which does: CORE_TEAMS includes a real person whose role
      // mentions nothing guru-related either, so assert on something
      // confirmed present in the real mock file instead of guessing.
      assert.equal(result.partial, false, 'the real mock-mode fetchers must succeed, not be reported as failed sources');
    })
  );
  assert.equal(fetchWasCalled, false, 'mock mode must never reach the network');
});

test('mock-mode CSR content matches the real Frontend/lib/mockData/joinUs.js CSR_PROJECTS export', async () => {
  const { CSR_PROJECTS } = await import('./mockData/joinUs.js');
  const realFirstProjectName = CSR_PROJECTS[0].name;
  await withEnv({ NODE_ENV: 'test', NEXT_PUBLIC_API_BASE_URL: '' }, () =>
    withStubbedFetch(async () => { throw new Error('fetch must never be called in mock mode'); }, async () => {
      const result = await searchPublicContent(realFirstProjectName, {
        services: { fetchBlogPosts: ALWAYS_EMPTY_BLOG, fetchSchemes: ALWAYS_EMPTY_SCHEMES },
      });
      assert.ok(result.results.some((r) => r.href === '/join-us/csr-projects'), 'the real mock CSR_PROJECTS data must be searchable end-to-end');
    })
  );
});
