// QA Bug 5, Stage 3A: pure, offline adapters converting each public content
// source's own real shape (verified against Backend/src/modules/blog/
// blog.controller.js's presentPublic(), Backend/src/modules/donations/
// publicSchemeShape.js's shapePublicScheme(), and
// Frontend/lib/mockData/joinUs.js's CSR_PROJECTS / about.js's CORE_TEAMS,
// BOARD, ADVISORS, COMMITTEE -- not assumed) into searchEngine.js's
// canonical `{href, title, text}` contract. No network/database access of
// any kind lives in this file -- every function here takes already-fetched
// plain data and returns plain data. Fetching that data (getBlogPosts(),
// getDonationSchemes(), getJoinUsContent(), getAboutContent()) is a later,
// separately-approved stage's job, not this one's.
//
// Allowlist discipline: every adapter below builds its output by naming
// each field explicitly (never `...entry`/`...post`), so a field this
// allowlist doesn't name can never reach a search result even if a future
// edit adds it to the source object -- the same posture already used by
// Backend/src/modules/content/sanitizePublicContent.js and
// Backend/src/modules/donations/publicSchemeShape.js for the exact same
// reason. Only `title`/`name` (-> `title`) and `description`/`excerpt`/
// `body`/`role`+`bio` (-> `text`) ever cross this boundary. Contact
// information, donor records, enquiry submissions, admin notes,
// credentials, and any other field are never read here, regardless of
// whether the source object happens to carry one.

// --- Safe href construction --------------------------------------------

// Validates an already-assembled internal path: must start with a single
// leading slash, must not be the admin tree, must carry no dynamic-route
// bracket, no query string, no hash fragment, and (other than the root
// path itself) no trailing slash. Never validates or returns an external
// (http(s)://, //) URL -- this engine only ever searches this site's own
// pages, and an absolute URL slipping through here would be a sign of a
// caller bug, not a real destination to link to.
function isSafeInternalHref(href) {
  if (typeof href !== 'string' || href.length === 0) return false;
  if (!href.startsWith('/')) return false;
  if (href.startsWith('//')) return false; // protocol-relative external URL
  if (href.startsWith('/admin')) return false;
  if (href.includes('[') || href.includes(']')) return false;
  if (href.includes('?') || href.includes('#')) return false;
  if (href.length > 1 && href.endsWith('/')) return false;
  return true;
}

// Builds `${basePath}/${encodeURIComponent(slug)}` and validates the
// result through the same safety check as every other href -- used for
// every slug-bearing source (blog posts, donation schemes) so a malformed,
// empty, or unexpectedly-shaped slug can never produce a broken or
// colliding destination. Returns null (never throws) on anything unsafe,
// so callers can treat it exactly like `matchEntry`'s own null-means-skip
// convention.
export function buildSlugHref(basePath, slug) {
  if (typeof slug !== 'string') return null;
  const trimmed = slug.trim();
  if (trimmed.length === 0) return null;
  const href = `${basePath}/${encodeURIComponent(trimmed)}`;
  return isSafeInternalHref(href) ? href : null;
}

// --- Stage 1 registry adapter --------------------------------------------

// {path, title, description} (searchRegistry.js's own, already-verified
// shape) -> {href, title, text}. searchRegistry.js itself is read-only
// here and never modified -- this only re-shapes its exported array.
export function registryEntryToSearchEntry(entry) {
  if (!entry || typeof entry.path !== 'string' || typeof entry.title !== 'string') return null;
  if (!isSafeInternalHref(entry.path)) return null;
  return { href: entry.path, title: entry.title, text: typeof entry.description === 'string' ? entry.description : '' };
}

// --- Blog post adapter --------------------------------------------

// Verified public shape, from Backend/src/modules/blog/blog.controller.js's
// presentPublic(): {_id, slug, status, publishedAt, title, excerpt, body,
// featuredImage, author, categories, tags, seo}. Only `slug`/`title`/
// `excerpt` are read -- `body` is deliberately excluded from `text` (kept
// out of the search payload; the public blog API itself already returns
// full-published-only posts via listPostsPublic's own `status: 'published'`
// filter, but this adapter re-checks `status` itself too, defensively, so
// it behaves correctly even if ever handed a differently-sourced or
// stale/malformed post object).
const BLOG_BASE_PATH = '/media/blog';

export function blogPostToSearchEntry(post) {
  if (!post || post.status !== 'published') return null;
  if (typeof post.title !== 'string' || post.title.trim().length === 0) return null;
  const href = buildSlugHref(BLOG_BASE_PATH, post.slug);
  if (!href) return null;
  return { href, title: post.title, text: typeof post.excerpt === 'string' ? post.excerpt : '' };
}

export function blogPostsToSearchEntries(posts) {
  return (Array.isArray(posts) ? posts : []).map(blogPostToSearchEntry).filter(Boolean);
}

// --- Donation scheme adapter --------------------------------------------

// Verified public shape, from Backend/src/modules/donations/
// publicSchemeShape.js's shapePublicScheme(): {slug, name, body, image,
// status}. Only explicitly `status === 'active'` schemes are included --
// re-checked here for the same defensive reason as the blog adapter above,
// even though GET /public/donation-schemes already filters to active-only
// server-side.
const DONATE_BASE_PATH = '/donate';

export function donationSchemeToSearchEntry(scheme) {
  if (!scheme || scheme.status !== 'active') return null;
  if (typeof scheme.name !== 'string' || scheme.name.trim().length === 0) return null;
  const href = buildSlugHref(DONATE_BASE_PATH, scheme.slug);
  if (!href) return null;
  return { href, title: scheme.name, text: typeof scheme.body === 'string' ? scheme.body : '' };
}

export function donationSchemesToSearchEntries(schemes) {
  return (Array.isArray(schemes) ? schemes : []).map(donationSchemeToSearchEntry).filter(Boolean);
}

// --- CSR project adapter --------------------------------------------

// Verified shape, from Frontend/lib/mockData/joinUs.js's CSR_PROJECTS:
// {name, category, cost, body, active} -- no `slug` field exists on this
// array at all, confirmed by reading its full definition, not assumed.
// Every CSR project therefore shares one single, documented public
// destination (/join-us/csr-projects, where CSRProjectsBoard.jsx actually
// renders every project) -- never an invented per-project URL. See the
// dedup note in searchEntries' own documentation: because every project
// maps to this same href, searchEngine.js's dedupeByHref will keep only
// the single best-ranked CSR match among however many projects a query
// happens to match -- item-level CSR search coverage is NOT complete
// end-to-end until/unless a later stage gives CSR projects individual
// URLs or changes how multi-match-same-href results are surfaced. This
// adapter alone does not resolve that; it only maps what each item
// individually would look like before Stage 2's own deduplication runs.
const CSR_PROJECTS_HREF = '/join-us/csr-projects';

export function csrProjectToSearchEntry(project) {
  if (!project || project.active === false) return null;
  if (typeof project.name !== 'string' || project.name.trim().length === 0) return null;
  return { href: CSR_PROJECTS_HREF, title: project.name, text: typeof project.body === 'string' ? project.body : '' };
}

export function csrProjectsToSearchEntries(projects) {
  return (Array.isArray(projects) ? projects : []).map(csrProjectToSearchEntry).filter(Boolean);
}

// --- Core Team adapter (nested groups) --------------------------------------------

// Verified shape, from Frontend/lib/mockData/about.js's CORE_TEAMS: an
// array of GROUPS, each `{heading, active, people: [{name, role, bio,
// image, active}]}` -- not a flat array of people, confirmed by reading
// its full definition. A person is included only when BOTH the person's
// own `active !== false` AND their containing group's `active !== false`
// -- a person nested inside an inactive group must not leak into search
// just because the person object itself has no explicit `active: false`.
// All Core Team entries share the one documented public destination
// (/about/core-team) -- same dedup caveat as CSR projects above applies
// here too.
const CORE_TEAM_HREF = '/about/core-team';

export function coreTeamGroupsToSearchEntries(groups) {
  const out = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    if (!group || group.active === false || !Array.isArray(group.people)) continue;
    for (const person of group.people) {
      if (!person || person.active === false) continue;
      if (typeof person.name !== 'string' || person.name.trim().length === 0) continue;
      const role = typeof person.role === 'string' ? person.role : '';
      const bio = typeof person.bio === 'string' ? person.bio : '';
      const text = [role, bio].filter(Boolean).join(' — ');
      out.push({ href: CORE_TEAM_HREF, title: person.name, text });
    }
  }
  return out;
}

// --- Leadership adapter (BOARD / ADVISORS / COMMITTEE -- flat lists) ----

// Verified shape, from Frontend/lib/mockData/about.js's BOARD/ADVISORS/
// COMMITTEE: flat arrays of {name, role, bio?, image, active} -- `bio` is
// confirmed optionally null on real entries (e.g. BOARD's own CEO/COO
// rows), so it is defaulted to '' rather than assumed present. All three
// arrays render on the one documented public destination
// (/about/leadership) -- same dedup caveat as above applies.
const LEADERSHIP_HREF = '/about/leadership';

export function leadershipMemberToSearchEntry(member) {
  if (!member || member.active === false) return null;
  if (typeof member.name !== 'string' || member.name.trim().length === 0) return null;
  const role = typeof member.role === 'string' ? member.role : '';
  const bio = typeof member.bio === 'string' ? member.bio : '';
  const text = [role, bio].filter(Boolean).join(' — ');
  return { href: LEADERSHIP_HREF, title: member.name, text };
}

export function leadershipMembersToSearchEntries(members) {
  return (Array.isArray(members) ? members : []).map(leadershipMemberToSearchEntry).filter(Boolean);
}
