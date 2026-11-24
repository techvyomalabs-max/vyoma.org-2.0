// Regression coverage for the site-wide nav dropdown duplicate-highlight
// fix: a dropdown's "<Label> Overview" link (or, for Our Work, the "Seven
// Schools" child whose href === the parent's own href) is a path-prefix of
// every sibling child route, so naive prefix matching marked BOTH it and
// the real current child as active at once. Exercises the real, unmodified
// navActiveLogic.mjs functions directly -- no rendering needed (same
// pattern as resourcesTableLogic.test.mjs) -- against the project's own,
// real NAV config, not a hand-typed duplicate, so this sweep stays correct
// if navConfig.js's routes ever change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRouteActive, getActiveSubmenuHref } from './navActiveLogic.mjs';
import { NAV } from '../../lib/navConfig.js';

function groupByLabel(label) {
  const item = NAV.find((n) => n.label === label);
  assert.ok(item, `NAV must contain a "${label}" item`);
  return item;
}

// Mirrors NavItem's own submenuCandidates computation exactly (the real
// rendered desktop link set: the synthetic Overview link, only when the
// parent isn't already one of its own children, plus every real child).
function desktopCandidates(item) {
  const parentAlreadyLinked = item.children.some((c) => c.href === item.href);
  return [...(parentAlreadyLinked ? [] : [item.href]), ...item.children.map((c) => c.href)];
}

// Mirrors MobileNavItem's own candidate computation exactly: mobile never
// renders a separate Overview link, so its candidates are just the real
// children's hrefs.
function mobileCandidates(item) {
  return item.children.map((c) => c.href);
}

const GROUPS_WITH_CHILDREN = NAV.filter((item) => !!item.children);

// --- isRouteActive: segment-aware matching, in isolation -------------------

test('isRouteActive: exact match', () => {
  assert.equal(isRouteActive('/credibility', '/credibility'), true);
});

test('isRouteActive: nested match requires a "/" boundary, not a bare string prefix', () => {
  assert.equal(isRouteActive('/credibility/audit-reports', '/credibility'), true);
  // The exact false-positive this fix targets: an unrelated route that merely
  // starts with the same characters must never match.
  assert.equal(isRouteActive('/credibility-report', '/credibility'), false);
  assert.equal(isRouteActive('/join-us-test', '/join-us'), false);
});

test('isRouteActive: "/" (Home) only ever matches the root path exactly, never every route', () => {
  assert.equal(isRouteActive('/', '/'), true);
  assert.equal(isRouteActive('/about', '/'), false);
  assert.equal(isRouteActive('/media/blog/some-post-slug', '/'), false);
});

test('isRouteActive: trailing slashes on either side are normalized away', () => {
  assert.equal(isRouteActive('/about/leadership/', '/about/leadership'), true);
  assert.equal(isRouteActive('/about/leadership', '/about/leadership/'), true);
});

test('isRouteActive: an unrelated path never matches', () => {
  assert.equal(isRouteActive('/search', '/credibility'), false);
  assert.equal(isRouteActive('/donate/some-scheme', '/join-us'), false);
});

// --- getActiveSubmenuHref: desktop candidates, the exact reported bugs ----

test('reported bug 1 — /about/leadership: Leadership only, not About Overview', () => {
  const about = groupByLabel('About');
  const active = getActiveSubmenuHref('/about/leadership', desktopCandidates(about));
  assert.equal(active, '/about/leadership');
});

test('reported bug 2 — /our-work/current: Current Work only, not Seven Schools', () => {
  const ourWork = groupByLabel('Our Work');
  const active = getActiveSubmenuHref('/our-work/current', desktopCandidates(ourWork));
  assert.equal(active, '/our-work/current');
});

test('reported bug 3 — /credibility/collaterals: Collaterals only, not Credibility Overview', () => {
  const credibility = groupByLabel('Credibility');
  const active = getActiveSubmenuHref('/credibility/collaterals', desktopCandidates(credibility));
  assert.equal(active, '/credibility/collaterals');
});

test('reported bug 4 — /credibility/audit-reports: Audit Reports only, not Credibility Overview', () => {
  const credibility = groupByLabel('Credibility');
  const active = getActiveSubmenuHref('/credibility/audit-reports', desktopCandidates(credibility));
  assert.equal(active, '/credibility/audit-reports');
});

// --- Explicit ticket-named checks ------------------------------------------

test('/about — About Overview only', () => {
  const about = groupByLabel('About');
  assert.equal(getActiveSubmenuHref('/about', desktopCandidates(about)), '/about');
});

test('/about/roadmap — Roadmap only', () => {
  const about = groupByLabel('About');
  assert.equal(getActiveSubmenuHref('/about/roadmap', desktopCandidates(about)), '/about/roadmap');
});

test('/our-work — Seven Schools only', () => {
  const ourWork = groupByLabel('Our Work');
  assert.equal(getActiveSubmenuHref('/our-work', desktopCandidates(ourWork)), '/our-work');
});

test('/our-work/all — "Seven Schools + Current Work" only, not Seven Schools', () => {
  const ourWork = groupByLabel('Our Work');
  assert.equal(getActiveSubmenuHref('/our-work/all', desktopCandidates(ourWork)), '/our-work/all');
});

// --- Dynamic nested route ownership ----------------------------------------

test('a dynamic blog post route (/media/blog/some-post-slug) activates Blog only, never Media Overview', () => {
  const media = groupByLabel('Media');
  const active = getActiveSubmenuHref('/media/blog/some-post-slug', desktopCandidates(media));
  assert.equal(active, '/media/blog');
});

// --- Exhaustive, navConfig-driven sweep (not a hand-typed route count) -----
// For every dropdown group, and every real desktop candidate href in it,
// visiting that candidate's own page must activate exactly itself and
// nothing else in the same dropdown -- covers every configured About,
// Our Work, Credibility, Media and Join Us route directly from the real
// NAV data, so this stays correct if navConfig.js ever changes.
for (const group of GROUPS_WITH_CHILDREN) {
  const candidates = desktopCandidates(group);
  for (const href of candidates) {
    test(`desktop candidate sweep — "${group.label}" at ${href}: exactly that href is active`, () => {
      assert.equal(getActiveSubmenuHref(href, candidates), href);
    });
  }
}

// --- Mobile: no separate Overview link, so only Our Work can still collide -

test('mobile Our Work — /our-work/current activates Current Work only (no Overview link exists on mobile, but Seven Schools shares the parent href)', () => {
  const ourWork = groupByLabel('Our Work');
  const active = getActiveSubmenuHref('/our-work/current', mobileCandidates(ourWork));
  assert.equal(active, '/our-work/current');
});

test('mobile Our Work — /our-work/all activates "Seven Schools + Current Work" only', () => {
  const ourWork = groupByLabel('Our Work');
  const active = getActiveSubmenuHref('/our-work/all', mobileCandidates(ourWork));
  assert.equal(active, '/our-work/all');
});

test('mobile — groups with no Overview link (About/Credibility/Media/Join Us) never had the duplicate bug, confirmed still exactly one match', () => {
  for (const label of ['About', 'Credibility', 'Media', 'Join Us']) {
    const item = groupByLabel(label);
    for (const href of mobileCandidates(item)) {
      assert.equal(getActiveSubmenuHref(href, mobileCandidates(item)), href, `"${label}" at ${href} (mobile)`);
    }
  }
});

// --- Unrelated routes and false-positive guards ----------------------------

test('an unrelated route never activates any submenu item in an unrelated dropdown', () => {
  const credibility = groupByLabel('Credibility');
  assert.equal(getActiveSubmenuHref('/search', desktopCandidates(credibility)), null);
  assert.equal(getActiveSubmenuHref('/donate/some-scheme', desktopCandidates(credibility)), null);
});

test('a similar route-name prefix never produces a false match', () => {
  // Synthetic candidates deliberately chosen to look like real routes with a
  // trailing-character collision, proving the segment-aware boundary (not
  // the real navConfig, which has no such pair today) actually holds.
  assert.equal(getActiveSubmenuHref('/credibility-archive', ['/credibility', '/credibility/audit-reports']), null);
});

// --- Query parameters -------------------------------------------------------
// Next.js's usePathname() never includes a query string or hash by its own
// documented contract -- Header.jsx only ever passes it a clean path, so
// there is nothing for this function to strip. This test documents that
// guarantee at the pure-function level: even a (contract-violating) pathname
// that somehow carried a "?" would simply fail to match (safely, as "no
// highlight") rather than silently matching the wrong, or an extra, item.
test('a pathname carrying a query string (which usePathname() never actually produces) still yields exactly one result, never a duplicate', () => {
  const about = groupByLabel('About');
  const active = getActiveSubmenuHref('/about/leadership?ref=newsletter', desktopCandidates(about));
  // Documented limitation, not a new runtime guard: this function assumes
  // `pathname` is already a clean path with no query string, exactly what
  // usePathname() guarantees Header.jsx always passes it. Given a
  // (contract-violating) dirty pathname, the raw "?ref=..." suffix means
  // "/about/leadership" no longer matches exactly, so this degrades to the
  // next-best segment-bounded match ("/about") -- safely, as a single
  // result, never as a duplicate of both Overview and Leadership at once.
  assert.equal(active, '/about');
});
