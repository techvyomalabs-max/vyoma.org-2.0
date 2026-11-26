// QA Bug 19 Stage 5A — executable, real-production-logic coverage for
// testimonialLoadMore.mjs. Every test here imports and calls the actual
// exported functions directly (no reimplementation, no mock) -- this is
// genuine executable-logic coverage, not a source-string assertion. The
// combination with toActiveContentArray() (contentArrays.js's own,
// separately and already-tested utility, reused unmodified here) is also
// exercised directly in a handful of integration-style tests below, to
// prove the two compose correctly end-to-end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOAD_MORE_INCREMENT,
  initialVisibleCount,
  getVisibleItems,
  hasMoreTestimonials,
  nextVisibleCount,
} from './testimonialLoadMore.mjs';
import { toActiveContentArray } from '../../../lib/contentArrays.js';

function makeItems(count, { namePrefix = 'Person' } = {}) {
  return Array.from({ length: count }, (_, i) => ({ name: `${namePrefix} ${i + 1}`, quote: `Quote ${i + 1}` }));
}

test('LOAD_MORE_INCREMENT is 6 (the approved Stage 4 proposed increment)', () => {
  assert.equal(LOAD_MORE_INCREMENT, 6);
});

// --- empty array -------------------------------------------------------

test('an empty array is handled safely: zero initial, empty visible, no "more"', () => {
  const items = [];
  assert.equal(initialVisibleCount(items.length), 0);
  assert.deepEqual(getVisibleItems(items, 0), []);
  assert.equal(hasMoreTestimonials(items, 0), false);
});

// --- one / five / six active entries: button must stay hidden ----------

test('one active entry: fully visible immediately, no Load more button', () => {
  const items = makeItems(1);
  const initial = initialVisibleCount(items.length);
  assert.equal(initial, 1);
  assert.deepEqual(getVisibleItems(items, initial), items);
  assert.equal(hasMoreTestimonials(items, initial), false);
});

test('five active entries: fully visible immediately, no Load more button', () => {
  const items = makeItems(5);
  const initial = initialVisibleCount(items.length);
  assert.equal(initial, 5);
  assert.deepEqual(getVisibleItems(items, initial), items);
  assert.equal(hasMoreTestimonials(items, initial), false);
});

test('exactly six active entries: fully visible immediately, no Load more button (six-or-fewer hides the button)', () => {
  const items = makeItems(6);
  const initial = initialVisibleCount(items.length);
  assert.equal(initial, 6);
  assert.deepEqual(getVisibleItems(items, initial), items);
  assert.equal(hasMoreTestimonials(items, initial), false);
});

// --- seven: the first case where the button must appear ----------------

test('seven active entries: shows the first six, button present; one click reveals the remaining one (partial final batch) and hides the button', () => {
  const items = makeItems(7);
  let visibleCount = initialVisibleCount(items.length);
  assert.equal(visibleCount, 6);
  assert.deepEqual(getVisibleItems(items, visibleCount), items.slice(0, 6));
  assert.equal(hasMoreTestimonials(items, visibleCount), true);

  visibleCount = nextVisibleCount(visibleCount, items.length);
  assert.equal(visibleCount, 7);
  assert.deepEqual(getVisibleItems(items, visibleCount), items);
  assert.equal(hasMoreTestimonials(items, visibleCount), false);
});

// --- twelve: exactly one full increment needed --------------------------

test('twelve active entries: one click reveals exactly the remaining six, then the button hides', () => {
  const items = makeItems(12);
  let visibleCount = initialVisibleCount(items.length);
  assert.equal(visibleCount, 6);
  assert.equal(hasMoreTestimonials(items, visibleCount), true);

  visibleCount = nextVisibleCount(visibleCount, items.length);
  assert.equal(visibleCount, 12);
  assert.deepEqual(getVisibleItems(items, visibleCount), items);
  assert.equal(hasMoreTestimonials(items, visibleCount), false);
});

// --- thirteen: two clicks, second is a partial batch of one -------------

test('thirteen active entries: two clicks needed, second reveals a partial batch of one, then the button hides', () => {
  const items = makeItems(13);
  let visibleCount = initialVisibleCount(items.length);
  assert.equal(visibleCount, 6);
  assert.equal(hasMoreTestimonials(items, visibleCount), true);

  visibleCount = nextVisibleCount(visibleCount, items.length);
  assert.equal(visibleCount, 12);
  assert.equal(hasMoreTestimonials(items, visibleCount), true, 'one more item remains -- button must still show');

  visibleCount = nextVisibleCount(visibleCount, items.length);
  assert.equal(visibleCount, 13, 'the final batch is a partial batch of 1, not a full 6 -- never overshoots the array length');
  assert.deepEqual(getVisibleItems(items, visibleCount), items);
  assert.equal(hasMoreTestimonials(items, visibleCount), false);
});

// --- a larger, realistic dataset (81 entries, matching the approved
// 58+2+7+... source scope's rough order of magnitude) -------------------

test('a larger dataset of 81 active entries: repeated clicks progress 6,12,18,...,78,81 and the button hides only after the true final partial batch', () => {
  const items = makeItems(81);
  let visibleCount = initialVisibleCount(items.length);
  const expectedProgression = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 81];
  assert.equal(visibleCount, expectedProgression[0]);

  for (let i = 1; i < expectedProgression.length; i++) {
    assert.equal(hasMoreTestimonials(items, visibleCount), true, `expected more items to remain before reaching ${expectedProgression[i]}`);
    visibleCount = nextVisibleCount(visibleCount, items.length);
    assert.equal(visibleCount, expectedProgression[i]);
  }
  assert.equal(hasMoreTestimonials(items, visibleCount), false);
  assert.deepEqual(getVisibleItems(items, visibleCount), items);
  // Repeated clicks past exhaustion must never exceed the array length.
  const overshoot = nextVisibleCount(visibleCount, items.length);
  assert.equal(overshoot, 81);
});

// --- repeated clicks must never append/duplicate ------------------------

test('repeated Load more clicks never append duplicate entries -- each click recomputes a fresh slice from the start of the array, never concatenates onto the previous one', () => {
  const items = makeItems(20);
  let visibleCount = initialVisibleCount(items.length);
  const seenSoFar = new Set();
  for (let i = 0; i < 10; i++) {
    const visible = getVisibleItems(items, visibleCount);
    const names = visible.map((item) => item.name);
    assert.equal(new Set(names).size, names.length, 'no duplicate within a single visible slice');
    for (const name of names) seenSoFar.add(name);
    if (!hasMoreTestimonials(items, visibleCount)) break;
    visibleCount = nextVisibleCount(visibleCount, items.length);
  }
  assert.equal(seenSoFar.size, 20, 'every distinct entry was eventually revealed exactly once each');
});

// --- original ordering preserved ----------------------------------------

test('original array order is preserved at every visible count, never reordered', () => {
  const items = makeItems(10);
  for (const visibleCount of [0, 1, 6, 9, 10]) {
    const visible = getVisibleItems(items, visibleCount);
    assert.deepEqual(
      visible.map((i) => i.name),
      items.slice(0, visibleCount).map((i) => i.name)
    );
  }
});

// --- source array is never mutated --------------------------------------

test('the source array is never mutated by any function in this module', () => {
  const items = Object.freeze(makeItems(15).map((item) => Object.freeze(item)));
  assert.doesNotThrow(() => {
    let visibleCount = initialVisibleCount(items.length);
    getVisibleItems(items, visibleCount);
    hasMoreTestimonials(items, visibleCount);
    visibleCount = nextVisibleCount(visibleCount, items.length);
    getVisibleItems(items, visibleCount);
  }, 'a frozen array/items must never be written to by this module');
});

// --- distinct entries sharing the same name remain separate -------------

test('two distinct entries sharing the exact same name are never deduplicated -- both remain present and distinct', () => {
  const items = [
    { name: 'Meenakshi', quote: 'First genuine testimonial from a person named Meenakshi.' },
    { name: 'Meenakshi', quote: 'A second, different genuine testimonial from a different person also named Meenakshi.' },
  ];
  const visible = getVisibleItems(items, initialVisibleCount(items.length));
  assert.equal(visible.length, 2);
  assert.notEqual(visible[0].quote, visible[1].quote);
});

// --- mixed active/inactive + legacy entries without `active` at all -----
// (toActiveContentArray itself is covered exhaustively by its own test
// file, contentArrays.test.mjs -- these tests prove this module composes
// correctly with its real, unmodified output, not that the filter itself
// is correct.)

test('mixed active/inactive entries: inactive ones are excluded before this module ever sees them, and pagination operates only on the already-filtered, active set', () => {
  const raw = [
    { name: 'Active One', active: true },
    { name: 'Hidden One', active: false },
    { name: 'Legacy, no active field at all' },
    { name: 'Active Two', active: true },
    { name: 'Hidden Two', active: false },
  ];
  const active = toActiveContentArray(raw);
  assert.deepEqual(
    active.map((i) => i.name),
    ['Active One', 'Legacy, no active field at all', 'Active Two']
  );
  const visibleCount = initialVisibleCount(active.length);
  assert.equal(visibleCount, 3);
  assert.equal(hasMoreTestimonials(active, visibleCount), false);
});

test('legacy entries with no `active` field at all remain visible and counted toward the six-per-page total', () => {
  const raw = makeItems(8); // none of these carry an `active` field
  const active = toActiveContentArray(raw);
  assert.equal(active.length, 8, 'every legacy entry with no active field must remain active');
  const visibleCount = initialVisibleCount(active.length);
  assert.equal(visibleCount, 6);
  assert.equal(hasMoreTestimonials(active, visibleCount), true);
});

test('all entries inactive: the active-filtered array is empty, and this module handles that empty array safely with no button', () => {
  const raw = makeItems(10).map((item) => ({ ...item, active: false }));
  const active = toActiveContentArray(raw);
  assert.deepEqual(active, []);
  const visibleCount = initialVisibleCount(active.length);
  assert.equal(visibleCount, 0);
  assert.equal(hasMoreTestimonials(active, visibleCount), false);
});

// --- QA Bug 19 Stage 5C: the approved 88-item migration-scale fixture -----
// (58 Endorsal text + 2 Endorsal video + 7 homepage text + 6 Learner image +
// 5 Teacher image + 10 Volunteer image = 88), confirming this pagination
// logic needs no change for the real, full-scale migrated dataset.

function makeMigrationScaleFixture() {
  const items = [];
  for (let i = 0; i < 58; i++) items.push({ id: `endorsal-text-${i}`, type: 'text', name: `Endorsal Learner ${i}`, quote: `Quote ${i}` });
  for (let i = 0; i < 2; i++) items.push({ id: `endorsal-video-${i}`, type: 'video', name: `Endorsal Video Person ${i}`, url: 'https://res.cloudinary.com/endorsal-io/video/upload/videos/example.mp4' });
  for (let i = 0; i < 7; i++) items.push({ id: `homepage-text-${i}`, type: 'text', name: `Homepage Person ${i}`, quote: `Quote ${i}` });
  for (let i = 0; i < 6; i++) items.push({ id: `learner-image-${i}`, type: 'image', name: null, testimonialImage: { url: `https://vyoma.org/wp-content/uploads/2023/03/Learner-Testimonial-${i + 1}.jpg` } });
  for (let i = 0; i < 5; i++) items.push({ id: `teacher-image-${i}`, type: 'image', name: null, testimonialImage: { url: `https://vyoma.org/wp-content/uploads/2023/03/Teacher-Testimonial-${i + 1}.jpg` } });
  for (let i = 0; i < 10; i++) items.push({ id: `volunteer-image-${i}`, type: 'image', name: null, testimonialImage: { url: `https://example.com/volunteer-${i + 1}.jpg` } });
  return items;
}

test('the 88-item migration-scale fixture: all 88 are active (no active field set -- legacy-compatible), initial reveal is 6, and repeated clicks correctly progress to full exhaustion with a final partial batch of 4', () => {
  const items = makeMigrationScaleFixture();
  assert.equal(items.length, 88);
  const active = toActiveContentArray(items);
  assert.equal(active.length, 88, 'every entry with no active field must remain active, regardless of type');

  let visibleCount = initialVisibleCount(active.length);
  assert.equal(visibleCount, 6);
  let clicks = 0;
  while (hasMoreTestimonials(active, visibleCount)) {
    visibleCount = nextVisibleCount(visibleCount, active.length);
    clicks += 1;
  }
  assert.equal(visibleCount, 88);
  assert.equal(clicks, 14, 'initial 6 + 13 clicks of 6 each (84) + 1 final partial-batch click of 4 (88) -- 14 clicks total');
  assert.equal(hasMoreTestimonials(active, visibleCount), false);
  assert.deepEqual(getVisibleItems(active, visibleCount), active, 'every one of the 88 is eventually visible, in original order');
});

test('no duplicate items are ever introduced across the full 88-item reveal sequence', () => {
  const items = makeMigrationScaleFixture();
  const active = toActiveContentArray(items);
  let visibleCount = initialVisibleCount(active.length);
  const seenIds = new Set();
  while (true) {
    const visible = getVisibleItems(active, visibleCount);
    const ids = visible.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate within a single visible slice');
    for (const id of ids) seenIds.add(id);
    if (!hasMoreTestimonials(active, visibleCount)) break;
    visibleCount = nextVisibleCount(visibleCount, active.length);
  }
  assert.equal(seenIds.size, 88);
});

test('a mixed text/video/image collection (with some entries explicitly inactive) is paginated correctly -- type is completely irrelevant to this module\'s own logic', () => {
  const raw = [
    { id: '1', type: 'text', name: 'A', quote: 'q', active: true },
    { id: '2', type: 'video', name: 'B', url: 'https://example.com/b.mp4', active: false },
    { id: '3', type: 'image', name: null, testimonialImage: { url: 'https://example.com/c.jpg' } },
    { id: '4', type: 'text', name: 'D', quote: 'q' },
    { id: '5', type: 'video', name: 'E', url: 'https://example.com/e.mp4', active: true },
    { id: '6', type: 'image', name: null, testimonialImage: { url: 'https://example.com/f.jpg' } },
    { id: '7', type: 'text', name: 'G', quote: 'q', active: false },
  ];
  const active = toActiveContentArray(raw);
  assert.deepEqual(
    active.map((i) => i.id),
    ['1', '3', '4', '5', '6']
  );
  const visibleCount = initialVisibleCount(active.length);
  assert.equal(visibleCount, 5);
  assert.equal(hasMoreTestimonials(active, visibleCount), false);
});
