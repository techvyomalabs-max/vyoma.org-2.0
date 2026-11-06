// Pure, framework-free list-mutation and search/pagination logic extracted
// from RepeatableList.jsx -- a behavior-preserving extraction only, not a
// redesign. Every function here is the exact same logic that used to live
// inline as closures inside the component, now directly testable with
// node:test (this project has no React-rendering harness for UI components
// -- see components/layout/Header.a11y.test.mjs's own header comment).
//
// None of these functions call onChange/setState -- the component still
// owns that wiring. Each one computes the next value only, returning `null`
// for a mutation that should be a no-op (e.g. an out-of-bounds move), so the
// caller knows not to call onChange at all -- matching the original inline
// code's early `return;` with no state change.

export function updateItemAt(items, index, next) {
  const copy = items.slice();
  copy[index] = next;
  return copy;
}

// Deep-clones the last item (when cloneLastItem is true and items is
// non-empty) or newItemTemplate otherwise, and appends it. Uses
// JSON.parse(JSON.stringify(...)) for the clone, same as the original inline
// code, so the new item never shares nested object/array references with
// whatever it was cloned from.
export function addItem(items, { newItemTemplate, cloneLastItem = true } = {}) {
  const template =
    items.length && cloneLastItem ? JSON.parse(JSON.stringify(items[items.length - 1])) : JSON.parse(JSON.stringify(newItemTemplate));
  return [...items, template];
}

// Swaps the item at `index` with the one `delta` positions away. Returns
// null when the target position is out of bounds.
export function moveItem(items, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= items.length) return null;
  const copy = items.slice();
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

export function deleteItemAt(items, index) {
  return items.filter((_, i) => i !== index);
}

// Returns the absolute indices (into the full `items` array) that match the
// current search, or every index when search is disabled/empty. Defaults to
// every key of the first item when searchKeys is omitted -- same default as
// the original inline code.
export function getMatchedIndices(items, { searchable = false, search = '', searchKeys } = {}) {
  const all = items.map((_, i) => i);
  if (!searchable || !search.trim()) return all;
  const q = search.trim().toLowerCase();
  const keys = searchKeys || (items[0] ? Object.keys(items[0]) : []);
  return all.filter((i) => keys.some((k) => String(items[i]?.[k] ?? '').toLowerCase().includes(q)));
}

// Computes the pagination window over `matchedIndices`. `currentPage` is
// `page` clamped down to `totalPages` -- e.g. the page the user was on
// becomes out of range once a search/delete shrinks the result set -- same
// clamping the original inline code performed via Math.min(page, totalPages).
export function getPagination(matchedIndices, { pageSize, page = 1 } = {}) {
  const totalPages = pageSize ? Math.max(1, Math.ceil(matchedIndices.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages);
  const visibleIndices = pageSize ? matchedIndices.slice((currentPage - 1) * pageSize, currentPage * pageSize) : matchedIndices;
  return { totalPages, currentPage, visibleIndices };
}
