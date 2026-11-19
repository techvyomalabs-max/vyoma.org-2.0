// QA Bug 5, Stage 3A: real-behavior tests for searchAdapters.js, against
// local, hand-built fixtures only -- no CMS/API/database access anywhere.
// Also exercises compatibility with the real Stage 1 registry and the real
// Stage 2 engine (searchRegistry.js / searchEngine.js), imported unmodified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSlugHref,
  registryEntryToSearchEntry,
  blogPostToSearchEntry,
  blogPostsToSearchEntries,
  donationSchemeToSearchEntry,
  donationSchemesToSearchEntries,
  csrProjectToSearchEntry,
  csrProjectsToSearchEntries,
  coreTeamGroupsToSearchEntries,
  leadershipMemberToSearchEntry,
  leadershipMembersToSearchEntries,
} from './searchAdapters.js';
import { SEARCH_REGISTRY } from './searchRegistry.js';
import { searchEntries, dedupeByHref } from './searchEngine.js';

// Every adapter's output must only ever carry exactly these three keys --
// shared assertion reused across every adapter below to enforce the
// allowlist structurally, not just by convention.
function assertAllowlistedShape(entry) {
  assert.deepEqual(Object.keys(entry).sort(), ['href', 'text', 'title']);
  assert.equal(typeof entry.href, 'string');
  assert.equal(typeof entry.title, 'string');
  assert.equal(typeof entry.text, 'string');
}

// --- buildSlugHref -----------------------------------------------------

test('buildSlugHref builds a safe, encoded internal href', () => {
  assert.equal(buildSlugHref('/media/blog', 'my-post'), '/media/blog/my-post');
});

test('buildSlugHref percent-encodes a slug containing reserved characters', () => {
  const href = buildSlugHref('/media/blog', 'a slug/with?weird#chars');
  assert.ok(href.startsWith('/media/blog/'));
  assert.ok(!href.includes('?'), 'the encoded slug must not reintroduce a query string');
  assert.ok(!href.includes('#'), 'the encoded slug must not reintroduce a hash fragment');
});

test('buildSlugHref rejects a malformed or empty slug', () => {
  assert.equal(buildSlugHref('/media/blog', ''), null);
  assert.equal(buildSlugHref('/media/blog', '   '), null);
  assert.equal(buildSlugHref('/media/blog', null), null);
  assert.equal(buildSlugHref('/media/blog', undefined), null);
  assert.equal(buildSlugHref('/media/blog', 42), null);
});

test('buildSlugHref trims whitespace around an otherwise-valid slug', () => {
  assert.equal(buildSlugHref('/donate', '  my-scheme  '), '/donate/my-scheme');
});

// --- registryEntryToSearchEntry -----------------------------------------------------

test('registryEntryToSearchEntry maps {path,title,description} to {href,title,text}', () => {
  const entry = registryEntryToSearchEntry({ path: '/credibility', title: 'Credibility', description: 'Reports and recognition.' });
  assertAllowlistedShape(entry);
  assert.deepEqual(entry, { href: '/credibility', title: 'Credibility', text: 'Reports and recognition.' });
});

test('registryEntryToSearchEntry rejects a malformed entry rather than throwing', () => {
  assert.equal(registryEntryToSearchEntry(null), null);
  assert.equal(registryEntryToSearchEntry({}), null);
  assert.equal(registryEntryToSearchEntry({ path: '/x' }), null);
  assert.equal(registryEntryToSearchEntry({ path: '/admin/users', title: 'Users' }), null, 'must reject an admin path even if one were ever mistakenly passed in');
  assert.equal(registryEntryToSearchEntry({ path: '/media/blog/[slug]', title: 'Blog post' }), null, 'must reject a dynamic route template');
});

test('every real Stage 1 registry entry adapts successfully with no field loss', () => {
  for (const raw of SEARCH_REGISTRY) {
    const entry = registryEntryToSearchEntry(raw);
    assert.ok(entry, `${raw.path} must adapt successfully`);
    assertAllowlistedShape(entry);
    assert.equal(entry.href, raw.path);
    assert.equal(entry.title, raw.title);
    assert.equal(entry.text, raw.description);
  }
});

// --- blogPostToSearchEntry -----------------------------------------------------

const PUBLISHED_POST = { slug: 'why-sanskrit', status: 'published', title: 'Why Sanskrit?', excerpt: 'An introduction.', body: 'Full long body text never surfaced in search.', author: 'Jane Doe' };
const DRAFT_POST = { ...PUBLISHED_POST, slug: 'unpublished-draft', status: 'draft' };

test('blogPostToSearchEntry maps a published post to the allowlisted shape', () => {
  const entry = blogPostToSearchEntry(PUBLISHED_POST);
  assertAllowlistedShape(entry);
  assert.deepEqual(entry, { href: '/media/blog/why-sanskrit', title: 'Why Sanskrit?', text: 'An introduction.' });
});

test('blogPostToSearchEntry excludes the long-form body field entirely', () => {
  const entry = blogPostToSearchEntry(PUBLISHED_POST);
  assert.ok(!entry.text.includes('Full long body text'), 'body must never reach the search payload');
});

test('blogPostToSearchEntry rejects a draft post', () => {
  assert.equal(blogPostToSearchEntry(DRAFT_POST), null);
});

test('blogPostToSearchEntry rejects a missing/empty slug or title', () => {
  assert.equal(blogPostToSearchEntry({ ...PUBLISHED_POST, slug: '' }), null);
  assert.equal(blogPostToSearchEntry({ ...PUBLISHED_POST, slug: undefined }), null);
  assert.equal(blogPostToSearchEntry({ ...PUBLISHED_POST, title: '' }), null);
  assert.equal(blogPostToSearchEntry({ ...PUBLISHED_POST, title: null }), null);
});

test('blogPostToSearchEntry rejects a null/malformed post without throwing', () => {
  assert.equal(blogPostToSearchEntry(null), null);
  assert.equal(blogPostToSearchEntry(undefined), null);
  assert.equal(blogPostToSearchEntry('not an object'), null);
});

test('blogPostsToSearchEntries keeps only published posts from a mixed list', () => {
  const result = blogPostsToSearchEntries([PUBLISHED_POST, DRAFT_POST]);
  assert.equal(result.length, 1);
  assert.equal(result[0].href, '/media/blog/why-sanskrit');
});

test('blogPostsToSearchEntries is defensive against a non-array input', () => {
  assert.deepEqual(blogPostsToSearchEntries(null), []);
  assert.deepEqual(blogPostsToSearchEntries(undefined), []);
});

// --- donationSchemeToSearchEntry -----------------------------------------------------

const ACTIVE_SCHEME = { slug: 'guru-dakshina', name: 'Guru Dakṣiṇā', body: "Sponsor a teacher's remuneration.", status: 'active' };
const INACTIVE_SCHEME = { ...ACTIVE_SCHEME, slug: 'retired-scheme', status: 'inactive' };

test('donationSchemeToSearchEntry maps an active scheme to the allowlisted shape', () => {
  const entry = donationSchemeToSearchEntry(ACTIVE_SCHEME);
  assertAllowlistedShape(entry);
  assert.deepEqual(entry, { href: '/donate/guru-dakshina', title: 'Guru Dakṣiṇā', text: "Sponsor a teacher's remuneration." });
});

test('donationSchemeToSearchEntry rejects a non-active scheme', () => {
  assert.equal(donationSchemeToSearchEntry(INACTIVE_SCHEME), null);
});

test('donationSchemeToSearchEntry rejects a missing/empty slug or name', () => {
  assert.equal(donationSchemeToSearchEntry({ ...ACTIVE_SCHEME, slug: '' }), null);
  assert.equal(donationSchemeToSearchEntry({ ...ACTIVE_SCHEME, name: '' }), null);
});

test('donationSchemesToSearchEntries keeps only active schemes from a mixed list', () => {
  const result = donationSchemesToSearchEntries([ACTIVE_SCHEME, INACTIVE_SCHEME]);
  assert.equal(result.length, 1);
  assert.equal(result[0].href, '/donate/guru-dakshina');
});

// --- csrProjectToSearchEntry -----------------------------------------------------

const ACTIVE_CSR = { name: 'Digital Sanskrit Language Lab', category: 'Education', cost: '₹5.5L', body: 'A scalable digital lab model.', active: true };
const INACTIVE_CSR = { ...ACTIVE_CSR, name: 'Retired CSR Project', active: false };

test('csrProjectToSearchEntry maps an active project to the allowlisted shape, using the one documented CSR page href', () => {
  const entry = csrProjectToSearchEntry(ACTIVE_CSR);
  assertAllowlistedShape(entry);
  assert.equal(entry.href, '/join-us/csr-projects');
  assert.equal(entry.title, 'Digital Sanskrit Language Lab');
});

test('csrProjectToSearchEntry excludes an active:false project', () => {
  assert.equal(csrProjectToSearchEntry(INACTIVE_CSR), null);
});

test('csrProjectToSearchEntry never leaks the cost/category fields', () => {
  const entry = csrProjectToSearchEntry(ACTIVE_CSR);
  assert.ok(!JSON.stringify(entry).includes('₹5.5L'));
  assert.ok(!JSON.stringify(entry).includes('Education'));
});

test('csrProjectsToSearchEntries excludes inactive projects from a mixed list', () => {
  const result = csrProjectsToSearchEntries([ACTIVE_CSR, INACTIVE_CSR]);
  assert.equal(result.length, 1);
});

test('multiple active CSR projects collapse to a single result when deduplicated by href -- documenting the known limitation, not a bug', () => {
  const projectA = { name: 'Project A', body: 'About A', active: true };
  const projectB = { name: 'Project B', body: 'About B', active: true };
  const matches = csrProjectsToSearchEntries([projectA, projectB]).map((e, idx) => ({ ...e, score: 1, idx }));
  const deduped = dedupeByHref(matches);
  assert.equal(deduped.length, 1, 'both share /join-us/csr-projects, so only one survives dedup -- item-level CSR coverage is not complete end-to-end');
});

// --- coreTeamGroupsToSearchEntries -----------------------------------------------------

const CORE_TEAM_GROUPS = [
  { heading: "CXO's Office", active: true, people: [
    { name: 'Sripriya Krishnamoorthy', role: 'Senior Linguist Assistant', bio: 'Attention to detail', active: true },
    { name: 'Inactive Person', role: 'Former Role', bio: null, active: false },
  ] },
  { heading: 'Retired Group', active: false, people: [
    { name: 'Should Not Appear', role: 'Anything', bio: null, active: true },
  ] },
];

test('coreTeamGroupsToSearchEntries includes only active people in active groups', () => {
  const result = coreTeamGroupsToSearchEntries(CORE_TEAM_GROUPS);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Sripriya Krishnamoorthy');
  assert.equal(result[0].href, '/about/core-team');
  assertAllowlistedShape(result[0]);
});

test('coreTeamGroupsToSearchEntries excludes an active person nested inside an inactive group', () => {
  const result = coreTeamGroupsToSearchEntries(CORE_TEAM_GROUPS);
  assert.ok(!result.some((r) => r.title === 'Should Not Appear'), 'group-level active:false must suppress every person inside it, even an individually active one');
});

test('coreTeamGroupsToSearchEntries combines role and bio into text, and tolerates a null bio', () => {
  const groups = [{ heading: 'X', active: true, people: [{ name: 'No Bio Person', role: 'Some Role', bio: null, active: true }] }];
  const result = coreTeamGroupsToSearchEntries(groups);
  assert.equal(result[0].text, 'Some Role');
});

test('coreTeamGroupsToSearchEntries is defensive against malformed groups', () => {
  assert.deepEqual(coreTeamGroupsToSearchEntries(null), []);
  assert.deepEqual(coreTeamGroupsToSearchEntries([null, {}, { people: 'not-an-array' }]), []);
});

// --- leadershipMemberToSearchEntry -----------------------------------------------------

test('leadershipMemberToSearchEntry maps an active member to the allowlisted shape', () => {
  const entry = leadershipMemberToSearchEntry({ name: 'Dr. B. Mahadevan', role: 'Chief Advisor', bio: 'Retired Professor.', active: true });
  assertAllowlistedShape(entry);
  assert.equal(entry.href, '/about/leadership');
  assert.equal(entry.title, 'Dr. B. Mahadevan');
  assert.equal(entry.text, 'Chief Advisor — Retired Professor.');
});

test('leadershipMemberToSearchEntry tolerates a null bio (confirmed real shape on BOARD entries)', () => {
  const entry = leadershipMemberToSearchEntry({ name: 'Dr. CA. Viswanathan P', role: 'Chief Executive Officer (CEO)', bio: null, active: true });
  assert.equal(entry.text, 'Chief Executive Officer (CEO)');
});

test('leadershipMemberToSearchEntry excludes an active:false member', () => {
  assert.equal(leadershipMemberToSearchEntry({ name: 'X', role: 'Y', active: false }), null);
});

test('leadershipMembersToSearchEntries filters a mixed BOARD/ADVISORS/COMMITTEE-style list', () => {
  const result = leadershipMembersToSearchEntries([
    { name: 'Active One', role: 'Role', active: true },
    { name: 'Inactive One', role: 'Role', active: false },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Active One');
});

// --- No private field leakage -----------------------------------------------------

test('no adapter ever surfaces contact info, donor records, admin notes, or credentials present on the source object', () => {
  const poisoned = [
    blogPostToSearchEntry({ ...PUBLISHED_POST, email: 'leak@example.com', phone: '555-0100' }),
    donationSchemeToSearchEntry({ ...ACTIVE_SCHEME, note: 'internal-only note', paymentMode: 'razorpay', amountOptions: [1, 2] }),
    csrProjectToSearchEntry({ ...ACTIVE_CSR, donorEmail: 'donor@example.com', adminNote: 'secret' }),
    leadershipMemberToSearchEntry({ name: 'X', role: 'Y', active: true, personalPhone: '555-0100', salary: 'confidential' }),
  ];
  for (const entry of poisoned) {
    const json = JSON.stringify(entry);
    assert.ok(!json.includes('example.com'), 'no email must leak');
    assert.ok(!json.includes('555-0100'), 'no phone must leak');
    assert.ok(!json.includes('internal-only'), 'no internal note must leak');
    assert.ok(!json.includes('razorpay'), 'no payment detail must leak');
    assert.ok(!json.includes('secret'), 'no admin note must leak');
    assert.ok(!json.includes('confidential'), 'no salary/credential-like field must leak');
  }
});

// --- Tamil / Devanagari / IAST integration with the real Stage 2 engine -----------------------------------------------------

test('adapted entries support Tamil queries end-to-end through the real searchEntries', () => {
  const groups = [{ heading: 'X', active: true, people: [{ name: 'தமிழ் ஆசிரியர்', role: 'Teacher', bio: null, active: true }] }];
  const entries = coreTeamGroupsToSearchEntries(groups);
  const result = searchEntries(entries, 'தமிழ்');
  assert.equal(result.results.length, 1);
});

test('adapted entries support Devanagari queries end-to-end through the real searchEntries', () => {
  const scheme = { slug: 'gita-course', name: 'गीता पाठ्यक्रम', body: '', status: 'active' };
  const entries = donationSchemesToSearchEntries([scheme]);
  const result = searchEntries(entries, 'गीता');
  assert.equal(result.results.length, 1);
});

test('adapted entries support diacritic-insensitive IAST queries end-to-end ("Gita" matches "Gītā")', () => {
  const post = { slug: 'bhagavad-gita', status: 'published', title: 'Bhagavad Gītā', excerpt: '' };
  const entries = blogPostsToSearchEntries([post]);
  const result = searchEntries(entries, 'Gita');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].href, '/media/blog/bhagavad-gita');
});

// --- Compatibility with Stage 1 and Stage 2, combined -----------------------------------------------------

test('registry + blog + schemes + CSR + team entries all compose together through the real searchEntries with no crash or collision', () => {
  const entries = [
    ...SEARCH_REGISTRY.map(registryEntryToSearchEntry).filter(Boolean),
    ...blogPostsToSearchEntries([PUBLISHED_POST]),
    ...donationSchemesToSearchEntries([ACTIVE_SCHEME]),
    ...csrProjectsToSearchEntries([ACTIVE_CSR]),
    ...coreTeamGroupsToSearchEntries(CORE_TEAM_GROUPS),
  ];
  const result = searchEntries(entries, 'sanskrit');
  assert.ok(Array.isArray(result.results));
  for (const r of result.results) {
    assert.ok(!r.href.startsWith('/admin'));
    assert.ok(!r.href.includes('['));
  }
});
