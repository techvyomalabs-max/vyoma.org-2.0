// Task 7D.31 — regression coverage for the temporary Patron-categories
// compatibility adapter: the Render test backend's live pages/about document
// still has the pre-unification PATRON_TIERS/PATRON_TIER_ROWS shape (see
// Frontend/lib/patronCategoriesAdapter.js's header comment), which left
// /about/patrons' "Patron tiers" section rendering "No patron categories
// yet." despite real data being present, just under the old field names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withPatronCategoriesCompat } from './patronCategoriesAdapter.js';

// Mirrors the REAL live response from the Render test backend (confirmed by
// a direct GET of /api/v1/public/pages/about during this investigation) --
// same 6 tiers, same 5 real Prayojakas rows, same empty rows for the other
// 5 tiers, same GOLDEN_WALL.
const LEGACY_ABOUT_DATA = {
  BOARD: [{ name: 'Dr. CA. Viswanathan P', role: 'CEO', image: null, active: true }],
  GOLDEN_WALL: ['Shri. B Krishnamurthy — Coimbatore', 'Prof. B Mahadevan — Bangalore'],
  PATRON_TESTIMONIALS: [{ name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder.', active: true }],
  PATRON_TIERS: [
    { sanskrit: 'Prayojakas', meaning: 'Initiators', note: "Those who helped set Vyoma's mission in motion.", active: true },
    { sanskrit: 'Rakshakas', meaning: 'Protectors', note: 'Supporters who safeguard and strengthen our work.', active: true },
    { sanskrit: 'Samrakshakas', meaning: 'Sustainers', note: 'Patrons whose steady support keeps our mission alive.', active: true },
    { sanskrit: 'Poshakas', meaning: 'Nourishers', note: 'Those who help our work grow and flourish.', active: true },
    { sanskrit: 'Mahaposhakas', meaning: 'Major Supporters', note: 'Patrons whose generosity powers Vyoma at scale.', active: true },
    { sanskrit: 'Paripalakas', meaning: 'Caretakers', note: 'Our all-round supporters, who stand with Vyoma across every need.', active: true },
  ],
  PATRON_TIER_ROWS: {
    Prayojakas: [
      { name: 'Sandhya N S', place: 'Bangalore', product: 'Sahasranama', active: true },
      { name: 'Rajesh A', place: 'Bangalore', product: '', active: true },
      { name: 'Rama Sivaraman', place: 'Chennai', product: 'Grammar Products', active: true },
      { name: 'Krishnamurthy B', place: 'Bangalore', product: 'Saptāhastotra Sāṅgrahaṇya & iOS App', active: true },
      { name: 'Sumanth Suresh', place: 'USA', product: 'Replenishment of old products', active: true },
    ],
    Rakshakas: [],
    Samrakshakas: [],
    Poshakas: [],
    Mahaposhakas: [],
    Paripalakas: [],
  },
};

test('converts the legacy PATRON_TIERS/PATRON_TIER_ROWS shape into PATRON_CATEGORIES with all 6 categories preserved', () => {
  const result = withPatronCategoriesCompat(LEGACY_ABOUT_DATA);
  assert.ok(Array.isArray(result.PATRON_CATEGORIES));
  assert.equal(result.PATRON_CATEGORIES.length, 6);
  assert.deepEqual(
    result.PATRON_CATEGORIES.map((c) => c.sanskrit),
    ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas']
  );
});

test('preserves all 5 existing Prayojakas rows exactly, and keeps the other 5 tiers correctly empty (nothing invented)', () => {
  const result = withPatronCategoriesCompat(LEGACY_ABOUT_DATA);
  const byName = Object.fromEntries(result.PATRON_CATEGORIES.map((c) => [c.sanskrit, c]));
  assert.equal(byName.Prayojakas.rows.length, 5);
  assert.deepEqual(byName.Prayojakas.rows, LEGACY_ABOUT_DATA.PATRON_TIER_ROWS.Prayojakas);
  for (const name of ['Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas']) {
    assert.deepEqual(byName[name].rows, []);
  }
});

test('hasProductField is true only for Prayojakas, matching the real migration script\'s own rule', () => {
  const result = withPatronCategoriesCompat(LEGACY_ABOUT_DATA);
  const byName = Object.fromEntries(result.PATRON_CATEGORIES.map((c) => [c.sanskrit, c]));
  assert.equal(byName.Prayojakas.hasProductField, true);
  for (const name of ['Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas']) {
    assert.equal(byName[name].hasProductField, false);
  }
});

test('GOLDEN_WALL and every other unrelated field pass through completely unchanged', () => {
  const result = withPatronCategoriesCompat(LEGACY_ABOUT_DATA);
  assert.deepEqual(result.GOLDEN_WALL, LEGACY_ABOUT_DATA.GOLDEN_WALL);
  assert.deepEqual(result.PATRON_TESTIMONIALS, LEGACY_ABOUT_DATA.PATRON_TESTIMONIALS);
  assert.deepEqual(result.BOARD, LEGACY_ABOUT_DATA.BOARD);
});

test('the legacy fields themselves are left in place too -- this adapter is purely additive, never destructive', () => {
  const result = withPatronCategoriesCompat(LEGACY_ABOUT_DATA);
  assert.deepEqual(result.PATRON_TIERS, LEGACY_ABOUT_DATA.PATRON_TIERS);
  assert.deepEqual(result.PATRON_TIER_ROWS, LEGACY_ABOUT_DATA.PATRON_TIER_ROWS);
});

test('does not mutate the original object passed in', () => {
  const clone = JSON.parse(JSON.stringify(LEGACY_ABOUT_DATA));
  withPatronCategoriesCompat(clone);
  assert.equal('PATRON_CATEGORIES' in clone, false, 'the input object itself must be untouched -- the adapter returns a new object');
});

// --- Modern shape (post-migration, or mock data, which already has this field) ---

test('a document that already has PATRON_CATEGORIES is returned completely unchanged, even though it also happens to have the legacy fields', () => {
  const modern = {
    PATRON_CATEGORIES: [{ sanskrit: 'Prayojakas', meaning: 'Initiators', note: 'Note', hasProductField: true, active: true, rows: [] }],
    PATRON_TIERS: LEGACY_ABOUT_DATA.PATRON_TIERS, // a transitional document could carry both -- modern must always win
    PATRON_TIER_ROWS: LEGACY_ABOUT_DATA.PATRON_TIER_ROWS,
    GOLDEN_WALL: ['Someone'],
  };
  const result = withPatronCategoriesCompat(modern);
  assert.equal(result, modern, 'must return the exact same object reference, never a reconstructed copy, when PATRON_CATEGORIES already exists');
});

test('an admin-emptied PATRON_CATEGORIES ([]) is respected as a deliberate value, not treated as "absent"', () => {
  const data = { PATRON_CATEGORIES: [], PATRON_TIERS: LEGACY_ABOUT_DATA.PATRON_TIERS, PATRON_TIER_ROWS: LEGACY_ABOUT_DATA.PATRON_TIER_ROWS };
  const result = withPatronCategoriesCompat(data);
  assert.deepEqual(result.PATRON_CATEGORIES, []);
});

// --- Defensive handling ---

test('tolerates null, undefined, and non-object input without throwing', () => {
  assert.equal(withPatronCategoriesCompat(null), null);
  assert.equal(withPatronCategoriesCompat(undefined), undefined);
  assert.equal(withPatronCategoriesCompat('not-an-object'), 'not-an-object');
});

test('a document with neither PATRON_CATEGORIES nor a usable legacy shape is returned unchanged, not fabricated', () => {
  assert.deepEqual(withPatronCategoriesCompat({ GOLDEN_WALL: ['Someone'] }), { GOLDEN_WALL: ['Someone'] });
  assert.deepEqual(withPatronCategoriesCompat({ PATRON_TIERS: 'not-an-array', PATRON_TIER_ROWS: {} }), {
    PATRON_TIERS: 'not-an-array',
    PATRON_TIER_ROWS: {},
  });
  assert.deepEqual(withPatronCategoriesCompat({ PATRON_TIERS: [], PATRON_TIER_ROWS: 'not-an-object' }), {
    PATRON_TIERS: [],
    PATRON_TIER_ROWS: 'not-an-object',
  });
});
