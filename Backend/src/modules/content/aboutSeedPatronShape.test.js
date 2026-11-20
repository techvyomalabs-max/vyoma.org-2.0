// Task 7D.30 — regression coverage for the Patrons page crash root cause:
// Backend/scripts/seedData/about.js previously exported the pre-unification
// PATRON_TIERS + PATRON_TIER_ROWS shape, and had no PATRON_TESTIMONIAL_GALLERY
// or PATRON_MATCHING_PARTNERS at all, while
// Frontend/app/(public)/about/patrons/page.js (and Frontend/lib/mockData/
// about.js) already expect PATRON_CATEGORIES (nested rows),
// PATRON_TESTIMONIAL_GALLERY, and PATRON_MATCHING_PARTNERS. Any database
// bootstrapped from this seed therefore had `PATRON_CATEGORIES === undefined`,
// crashing the page with "Cannot read properties of undefined (reading
// 'filter')". These tests cover both the static module shape and the real
// seeded Content document, against a disposable mongodb-memory-server
// instance only -- never a real or persistent database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from '../../../scripts/runSeed.js';
import { ContentModel } from './content.model.js';
import * as about from '../../../scripts/seedData/about.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

test('PATRON_CATEGORIES replaces PATRON_TIERS/PATRON_TIER_ROWS with the unified, nested shape the Frontend expects', () => {
  assert.equal('PATRON_TIERS' in about, false, 'the old, pre-unification export must be gone, not left alongside the new one');
  assert.equal('PATRON_TIER_ROWS' in about, false);
  assert.ok(Array.isArray(about.PATRON_CATEGORIES));
  assert.equal(about.PATRON_CATEGORIES.length, 6);
  for (const category of about.PATRON_CATEGORIES) {
    assert.equal(typeof category.sanskrit, 'string');
    assert.equal(typeof category.meaning, 'string');
    assert.equal(typeof category.note, 'string');
    assert.equal(typeof category.hasProductField, 'boolean');
    assert.equal(category.active, true);
    assert.ok(Array.isArray(category.rows));
  }
});

test('hasProductField is true only for Prayojakas, matching the live site, preserved exactly from before the restructure', () => {
  const byName = Object.fromEntries(about.PATRON_CATEGORIES.map((c) => [c.sanskrit, c]));
  assert.equal(byName.Prayojakas.hasProductField, true);
  for (const name of ['Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas']) {
    assert.equal(byName[name].hasProductField, false, `${name} must not have the Product Sponsored column`);
  }
});

test('no patron information was dropped: all 5 original Prayojakas rows and all 6 original tier names/notes are preserved', () => {
  const byName = Object.fromEntries(about.PATRON_CATEGORIES.map((c) => [c.sanskrit, c]));
  assert.equal(byName.Prayojakas.rows.length, 5);
  assert.deepEqual(
    byName.Prayojakas.rows.map((r) => r.name),
    ['Sandhya N S', 'Rajesh A', 'Rama Sivaraman', 'Krishnamurthy B', 'Sumanth Suresh']
  );
  assert.equal(byName.Rakshakas.meaning, 'Protectors');
  assert.equal(byName.Paripalakas.note, 'Our all-round supporters, who stand with Vyoma across every need.');
  for (const name of ['Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas']) {
    assert.deepEqual(byName[name].rows, [], `${name} had no rows before the restructure and still has none -- nothing invented`);
  }
});

test('GOLDEN_WALL and PATRON_TESTIMONIALS (the pre-existing, unrelated patron content) are completely untouched', () => {
  assert.equal(about.GOLDEN_WALL.length, 9);
  assert.equal(about.GOLDEN_WALL[0], 'Shri. B Krishnamurthy — Coimbatore');
  assert.equal(about.PATRON_TESTIMONIALS.length, 3);
  assert.equal(about.PATRON_TESTIMONIALS[0].name, 'Patron Name');
});

test('PATRON_TESTIMONIAL_GALLERY and PATRON_MATCHING_PARTNERS are now present as genuinely empty arrays, not fabricated data', () => {
  assert.ok(Array.isArray(about.PATRON_TESTIMONIAL_GALLERY));
  assert.deepEqual(about.PATRON_TESTIMONIAL_GALLERY, []);
  assert.ok(Array.isArray(about.PATRON_MATCHING_PARTNERS));
  assert.deepEqual(about.PATRON_MATCHING_PARTNERS, []);
});

test('a database seeded from scratch now has every field the Patrons page requires, so it no longer crashes with "Cannot read properties of undefined (reading \'filter\')"', async () => {
  await ContentModel.deleteMany({});
  await runSeed();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  assert.ok(Array.isArray(doc.data.PATRON_CATEGORIES), 'PATRON_CATEGORIES must be an array on the seeded document');
  assert.ok(Array.isArray(doc.data.PATRON_TESTIMONIAL_GALLERY));
  assert.ok(Array.isArray(doc.data.PATRON_MATCHING_PARTNERS));
  assert.ok(Array.isArray(doc.data.GOLDEN_WALL));

  // Simulates exactly what the Patrons page does on the real API response.
  assert.doesNotThrow(() => doc.data.PATRON_CATEGORIES.filter((c) => c.active !== false));
  assert.doesNotThrow(() => doc.data.PATRON_TESTIMONIAL_GALLERY.filter((t) => t.active !== false));
  assert.doesNotThrow(() => doc.data.PATRON_MATCHING_PARTNERS.filter((t) => t.active !== false));
});
