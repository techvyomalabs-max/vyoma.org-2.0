// Pure, framework-free route-matching logic extracted from Header.jsx --
// fixes the site-wide duplicate-submenu-highlight bug (a dropdown's
// "<Label> Overview" link, or a child whose own href equals its parent's
// (e.g. Our Work's "Seven Schools" -> /our-work), is a path-prefix of every
// sibling child route, so naive prefix matching marked BOTH the
// overview/parent link and the real current child as active at once).
// Directly testable with node:test, no rendering needed -- same extraction
// pattern as resourcesTableLogic.mjs/repeatableListLogic.mjs (this project
// has no React-rendering harness for UI components wired to next/navigation
// hooks).

function normalize(path) {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

// Segment-aware match: exact, or nested strictly under `href` followed by a
// "/" -- never a bare string-prefix collision (e.g. "/credibility" must not
// match a hypothetical "/credibility-report"). "/" itself only ever matches
// the root pathname exactly, so Home is never active on every other route.
// Trailing slashes on either side are normalized away first; usePathname()
// never includes a query string or hash, so neither can affect this.
export function isRouteActive(pathname, href) {
  const p = normalize(pathname);
  const h = normalize(href);
  if (h === '/') return p === '/';
  return p === h || p.startsWith(`${h}/`);
}

// Given the full set of hrefs actually rendered as links in one dropdown
// (the synthetic "Overview" link's href, when rendered, plus every real
// child's href), returns the single href that should be highlighted -- the
// longest one that is actually active for `pathname` -- or null if none
// match. "Longest" correctly prefers a more specific child route (e.g.
// "/media/blog") over a shorter parent/overview route (e.g. "/media") when
// both are structurally active for the same pathname (a dynamic nested
// route like "/media/blog/some-post-slug" included), and an exact match is
// always at least as long as any nested-ancestor match, so an exact match
// on a submenu item always wins over its own parent/overview link.
export function getActiveSubmenuHref(pathname, candidates) {
  let best = null;
  for (const href of candidates) {
    if (!isRouteActive(pathname, href)) continue;
    if (!best || href.length > best.length) best = href;
  }
  return best;
}
