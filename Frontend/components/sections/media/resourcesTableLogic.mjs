// Pure, framework-free logic extracted from ResourcesTable.jsx -- category/
// page-size/page validation (safe handling of an invalid or out-of-range
// value restored from the URL), search filtering, pagination math, and the
// query-string this component's state is mirrored to. Directly testable
// with node:test, no rendering needed -- same extraction pattern as
// repeatableListLogic.mjs (see that file's own header comment: this project
// has no React-rendering harness for UI components, only a hook-rendering
// one -- see lib/testSupport/reactTestEnv.mjs -- so a component wired to
// next/navigation's router/searchParams hooks is kept as a thin wrapper
// around logic like this instead).

export const PAGE_SIZES = [10, 25, 50];
export const DEFAULT_PAGE_SIZE = 10;

// Falls back to the first category whenever the URL's "category" value
// isn't one of the real categories -- covers both a missing param and a
// stale/tampered one (QA Bug 11 Issue 2's "safely handle ... invalid
// categories" requirement).
export function parseCategory(raw, categories) {
  return categories.includes(raw) ? raw : categories[0];
}

// Falls back to the default page size for anything other than exactly one
// of the three supported values.
export function parsePageSize(raw) {
  const n = Number(raw);
  return PAGE_SIZES.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

// Falls back to page 1 for anything that isn't a positive integer. Does NOT
// clamp against totalPages here -- that depends on the current filtered
// result count, which this function doesn't know; see getPagination()'s own
// clamping for the out-of-range case.
export function parsePage(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export function filterRows(rows, search) {
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q));
}

// currentPage clamps `page` down to totalPages -- e.g. a page restored from
// the URL (or left over from a wider result set) that is now out of range
// once a search/category/page-size change has shrunk it.
export function getPagination(filteredLength, { perPage, page }) {
  const totalPages = Math.max(1, Math.ceil(filteredLength / perPage));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (currentPage - 1) * perPage;
  return { totalPages, currentPage, startIndex };
}

// Builds the query string this component's state is mirrored to (so browser
// Back restores category/page/size/search -- QA Bug 11 Issue 2). Only
// non-default values are written, so the common case (first category,
// default page size, page 1, no search) keeps a clean, param-free URL.
export function buildQueryString({ category, defaultCategory, search, perPage, page }) {
  const params = new URLSearchParams();
  if (category !== defaultCategory) params.set('category', category);
  if (search) params.set('q', search);
  if (perPage !== DEFAULT_PAGE_SIZE) params.set('size', String(perPage));
  if (page !== 1) params.set('page', String(page));
  return params.toString();
}
