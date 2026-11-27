// Task 7D.32 — regression coverage for the Press seed reconciliation: the
// migration audit found Backend/scripts/seedData/media.js only had the old
// PRESS_FEATURED/PRESS_CLIPPINGS flat arrays, while
// Frontend/services/mediaService.js's getPressCoverage() reads
// PRESS_CLIPPING_SECTIONS (grouped { heading, items }) -- a field this seed
// never exported at all, so a freshly seeded database's /media/press page
// silently rendered an empty "In the Press" section despite 9 real
// placeholder items sitting unread under the old field names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as media from '../../../scripts/seedData/media.js';

test('PRESS_FEATURED and PRESS_CLIPPINGS are left completely intact -- nothing was deleted by the reconciliation', () => {
  assert.equal(media.PRESS_FEATURED.length, 3);
  assert.equal(media.PRESS_CLIPPINGS.length, 6);
  assert.equal(media.PRESS_FEATURED[0].pub, 'The Hindu');
  assert.equal(media.PRESS_CLIPPINGS[0].pub, 'Kannada Prabha');
});

test('PRESS_CLIPPING_SECTIONS now exists, grouped into the shape app/(public)/media/press/page.js actually reads', () => {
  assert.ok(Array.isArray(media.PRESS_CLIPPING_SECTIONS));
  assert.equal(media.PRESS_CLIPPING_SECTIONS.length, 2);
  for (const section of media.PRESS_CLIPPING_SECTIONS) {
    assert.equal(typeof section.heading, 'string');
    assert.ok(Array.isArray(section.items));
  }
});

test('every real PRESS_FEATURED/PRESS_CLIPPINGS item is represented in PRESS_CLIPPING_SECTIONS, with no information lost', () => {
  const allItems = media.PRESS_CLIPPING_SECTIONS.flatMap((s) => s.items);
  assert.equal(allItems.length, media.PRESS_FEATURED.length + media.PRESS_CLIPPINGS.length);

  const originalPubs = [...media.PRESS_FEATURED, ...media.PRESS_CLIPPINGS].map((r) => r.pub).sort();
  const reconciledTitles = allItems.map((item) => item.title).sort();
  assert.deepEqual(reconciledTitles, originalPubs, 'every pub name must survive, just renamed to `title`');

  const originalNotes = [...media.PRESS_FEATURED, ...media.PRESS_CLIPPINGS].map((r) => r.note).sort();
  const reconciledCaptions = allItems.map((item) => item.caption).sort();
  assert.deepEqual(reconciledCaptions, originalNotes, 'every note must survive, just renamed to `caption`');

  const originalDates = [...media.PRESS_FEATURED, ...media.PRESS_CLIPPINGS].map((r) => r.date).sort();
  const reconciledDates = allItems.map((item) => item.date).sort();
  assert.deepEqual(reconciledDates, originalDates, 'date must be carried over, not dropped');
});

test('every reconciled item has image: null (honest -- no photo exists for any of these) and active: true', () => {
  for (const section of media.PRESS_CLIPPING_SECTIONS) {
    for (const item of section.items) {
      assert.equal(item.image, null);
      assert.equal(item.active, true);
    }
  }
});
