// QA Bug 19 Stage 5A — pure, framework-free Load More logic for the public
// /media/testimonials page's "All Testimonials" section. Kept as a plain
// .js-importable module (not inline in TestimonialsAllGrid.jsx) for the
// same reason this project's other client-interaction logic is extracted
// this way (see modalContactState.mjs, repeatableListLogic.mjs): `node
// --test` cannot load a bare .jsx file at all, so pulling the actual
// decision logic out into its own pure functions lets it be genuinely,
// directly executed in tests rather than only pinned via source-string
// assertions.
//
// Every function here is a pure, allocation-only computation over its
// arguments -- none of them ever mutate the `items` array passed in
// (`.slice()`/comparisons only, never `.splice()`/index assignment/`.sort()`
// in place), so the same already-active-filtered array the page computes
// once can be handed to this module and to React state without either side
// ever seeing the other's mutations.

// The six-entry increment is the approved Stage 4 proposed implementation
// behavior, not a verified reference-design click increment (the reference
// screenshots confirm a "Load more" button and six initial cards, but not
// its exact per-click reveal count).
export const LOAD_MORE_INCREMENT = 6;

// The count to show before any click -- the smaller of the increment and
// however many active items actually exist, so e.g. a 1-, 5-, or 6-item
// dataset never incorrectly reserves room for a button that would have
// nothing further to reveal.
export function initialVisibleCount(itemsLength, increment = LOAD_MORE_INCREMENT) {
  return Math.min(increment, itemsLength);
}

// The exact slice to render for a given visibleCount -- always computed
// from the start of `items`, never appended to, so repeated calls with an
// increasing `visibleCount` can never produce a duplicate entry (each call
// is a fresh, independent slice of the same underlying array, not a
// concatenation of previously-returned slices).
export function getVisibleItems(items, visibleCount) {
  return items.slice(0, Math.max(0, visibleCount));
}

// Whether a "Load more" button should render at all -- false once every
// item is already visible (covers both "six or fewer total" and "already
// fully exhausted after enough clicks").
export function hasMoreTestimonials(items, visibleCount) {
  return visibleCount < items.length;
}

// The next visibleCount after one "Load more" click -- clamped to the
// array's real length, so the final click before exhaustion reveals
// whatever partial batch remains (fewer than a full increment) rather than
// overshooting.
export function nextVisibleCount(visibleCount, itemsLength, increment = LOAD_MORE_INCREMENT) {
  return Math.min(visibleCount + increment, itemsLength);
}
