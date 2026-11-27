// Task 7D.30 — regression coverage for the Patrons page crash
// ("Cannot read properties of undefined (reading 'filter')" on
// app/(public)/about/patrons/page.js, and the same latent pattern on
// app/(public)/about/core-team/page.js): a Content document's `data` field
// is free-form JSON, so a field a page expects can be missing or malformed,
// e.g. from a stale seed that predates it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toContentArray, toActiveContentArray } from './contentArrays.js';

test('toContentArray returns the array unchanged when given a real array', () => {
  const arr = [{ a: 1 }, { a: 2 }];
  assert.equal(toContentArray(arr), arr);
});

test('toContentArray tolerates undefined, null, and non-array values without throwing', () => {
  assert.deepEqual(toContentArray(undefined), []);
  assert.deepEqual(toContentArray(null), []);
  assert.deepEqual(toContentArray('not-an-array'), []);
  assert.deepEqual(toContentArray(42), []);
  assert.deepEqual(toContentArray({ not: 'an array' }), []);
});

test('toActiveContentArray filters out items explicitly marked active: false', () => {
  const result = toActiveContentArray([
    { name: 'A', active: true },
    { name: 'B', active: false },
    { name: 'C' }, // no `active` field at all -- treated as visible, matching every existing page's `!== false` convention
  ]);
  assert.deepEqual(
    result.map((r) => r.name),
    ['A', 'C']
  );
});

test('toActiveContentArray tolerates undefined, null, and non-array values without throwing -- the exact crash this task fixes', () => {
  assert.doesNotThrow(() => toActiveContentArray(undefined).filter(() => true));
  assert.deepEqual(toActiveContentArray(undefined), []);
  assert.deepEqual(toActiveContentArray(null), []);
  assert.deepEqual(toActiveContentArray('not-an-array'), []);
});

test('toActiveContentArray skips a malformed (null) entry inside an otherwise-valid array instead of throwing', () => {
  const result = toActiveContentArray([{ name: 'A', active: true }, null, { name: 'B', active: true }]);
  assert.deepEqual(
    result.map((r) => r.name),
    ['A', 'B']
  );
});

// Mirrors the real shape Backend/scripts/seedData/about.js now exports for
// PATRON_CATEGORIES (Task 7D.30) -- confirms the corrected data structure
// (nested `rows`, `hasProductField` only on Prayojakas) flows through the
// page's filtering step unchanged.
test('the corrected PATRON_CATEGORIES shape (nested rows, hasProductField) passes through toActiveContentArray unchanged', () => {
  const categories = [
    {
      sanskrit: 'Prayojakas',
      meaning: 'Initiators',
      note: "Those who helped set Vyoma's mission in motion.",
      hasProductField: true,
      active: true,
      rows: [{ name: 'Sandhya N S', place: 'Bangalore', product: 'Sahasranama', active: true }],
    },
    { sanskrit: 'Rakshakas', meaning: 'Protectors', note: 'Supporters.', hasProductField: false, active: true, rows: [] },
  ];
  const result = toActiveContentArray(categories);
  assert.equal(result.length, 2);
  assert.equal(result[0].hasProductField, true);
  assert.deepEqual(result[0].rows, categories[0].rows);
  assert.equal(result[1].hasProductField, false);
});
