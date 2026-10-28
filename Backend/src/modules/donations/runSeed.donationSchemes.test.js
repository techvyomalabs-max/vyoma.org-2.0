// Regression coverage for runSeed()'s DonationSchemeModel upsert (Phase 1
// Task 5B fix): name/description/note/displayOrder now live under
// $setOnInsert (a one-time bootstrap value), never $set, so an
// administrator's edit through the admin CRUD API survives any later
// reseed/restart. Runs against a disposable mongodb-memory-server instance
// only -- never MongoDB Atlas, never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. The real, installed
// `mongoose`/`mongodb` driver is exercised directly (no mocking), which is
// itself the confirmation that this update structure works with the actual
// installed version.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from '../../../scripts/runSeed.js';
import { DONATION_SCHEMES } from '../../../scripts/seedData/donate.js';
import { DonationSchemeModel } from './donationScheme.model.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

async function resetDonationSchemes() {
  await DonationSchemeModel.deleteMany({});
}

test('seeding an empty collection creates all 9 donation schemes with the correct name/description/note/displayOrder/status', async () => {
  await resetDonationSchemes();
  const result = await runSeed();
  assert.equal(result.donationSchemes, 9);

  const schemes = await DonationSchemeModel.find().lean();
  assert.equal(schemes.length, 9);

  DONATION_SCHEMES.forEach((s, i) => {
    const doc = schemes.find((d) => d.slug === s.slug);
    assert.ok(doc, `expected a document for slug "${s.slug}"`);
    assert.equal(doc.name, s.name);
    assert.equal(doc.description, s.body);
    assert.equal(doc.note, s.note || null);
    assert.equal(doc.displayOrder, i);
    assert.equal(doc.status, 'active');
  });
});

test('an administrator-edited name survives reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'vidya-danam' }, { $set: { name: 'Administrator-edited name' } });

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'vidya-danam' }).lean();
  assert.equal(doc.name, 'Administrator-edited name');
});

test('an administrator-edited description survives reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'grantha-danam' }, { $set: { description: 'Administrator-edited description.' } });

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'grantha-danam' }).lean();
  assert.equal(doc.description, 'Administrator-edited description.');
});

test('an administrator-edited note survives reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'anna-danam' }, { $set: { note: 'Administrator-added note.' } });

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'anna-danam' }).lean();
  assert.equal(doc.note, 'Administrator-added note.');
});

test('an administrator-edited displayOrder survives reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'general-donation' }, { $set: { displayOrder: 42 } });

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'general-donation' }).lean();
  assert.equal(doc.displayOrder, 42);
});

test('a scheme disabled by an administrator (status: inactive) remains inactive after reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'events-and-projects' }, { $set: { status: 'inactive' } });

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'events-and-projects' }).lean();
  assert.equal(doc.status, 'inactive');
});

test('amountOptions/paymentMode/image set via the admin CRUD API remain unchanged after reseeding', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne(
    { slug: 'bala-gurukulam' },
    { $set: { amountOptions: [111, 222], paymentMode: 'bank-transfer', image: { url: 'https://example.test/photo.jpg' } } }
  );

  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'bala-gurukulam' }).lean();
  assert.deepEqual(doc.amountOptions, [111, 222]);
  assert.equal(doc.paymentMode, 'bank-transfer');
  assert.equal(doc.image.url, 'https://example.test/photo.jpg');
});

// This task's scope forbids modifying scripts/seedData/donate.js, so a truly
// new scheme can't be introduced there for this test. A real missing-then-
// seeded scheme is simulated instead by deleting one of the real 9 schemes
// (standing in for "a scheme that doesn't exist in this database yet") and
// confirming a single runSeed() call both (a) recreates it correctly and
// (b) leaves an unrelated, already-customized scheme completely alone --
// exactly the mixed insert+protected-no-op-update scenario a real newly-
// introduced seedData entry would produce.
test('a scheme missing from the database is (re)created correctly while an existing customized scheme is left alone', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'guru-dakshina' }, { $set: { description: 'Administrator customized this scheme.' } });
  await DonationSchemeModel.deleteOne({ slug: 'vidyarthi-nidhi' }); // stands in for "not yet introduced"

  await runSeed();

  const recreated = await DonationSchemeModel.findOne({ slug: 'vidyarthi-nidhi' }).lean();
  const seedEntry = DONATION_SCHEMES.find((s) => s.slug === 'vidyarthi-nidhi');
  assert.ok(recreated, 'the missing scheme must be recreated by the next reseed');
  assert.equal(recreated.name, seedEntry.name);
  assert.equal(recreated.description, seedEntry.body);
  assert.equal(recreated.status, 'active');

  const customized = await DonationSchemeModel.findOne({ slug: 'guru-dakshina' }).lean();
  assert.equal(customized.description, 'Administrator customized this scheme.', 'an unrelated, already-customized scheme must remain untouched');

  assert.equal(await DonationSchemeModel.countDocuments(), 9, 'reseeding must not create duplicate documents for schemes that already exist');
});

test('repeated reseeding is idempotent: a protected field stays stable across multiple reseed calls, not just one', async () => {
  await resetDonationSchemes();
  await runSeed();
  await DonationSchemeModel.updateOne({ slug: 'sabha-ujjivanam' }, { $set: { description: 'Stable administrator edit.' } });

  await runSeed();
  await runSeed();
  await runSeed();

  const doc = await DonationSchemeModel.findOne({ slug: 'sabha-ujjivanam' }).lean();
  assert.equal(doc.description, 'Stable administrator edit.');
});

// Investigative only (per this task's explicit scope: report the finding,
// do not change timestamp behavior as part of this fix).
//
// FINDING: updatedAt DOES still change on every reseed call, even now that
// every donation-scheme field is $setOnInsert-only and has no effect on an
// already-existing document. This is Mongoose's own `{ timestamps: true }`
// schema option: its findOneAndUpdate middleware unconditionally injects an
// updatedAt bump into the update document it sends to MongoDB, regardless
// of whether $set/$setOnInsert would otherwise change anything for the
// matched document. This is pre-existing Mongoose behavior, not something
// this fix introduced or changed, and (per this task's explicit scope) is
// not being altered here -- recorded as a finding only.
test('finding: updatedAt still changes on every reseed call, even a content-level no-op, due to Mongoose\'s own timestamps middleware', async () => {
  await resetDonationSchemes();
  await runSeed();
  const firstRead = await DonationSchemeModel.findOne({ slug: 'general-donation' }).lean();

  await new Promise((resolve) => setTimeout(resolve, 10)); // ensure a measurable clock difference
  await runSeed();

  const secondRead = await DonationSchemeModel.findOne({ slug: 'general-donation' }).lean();
  assert.ok(
    new Date(secondRead.updatedAt).getTime() > new Date(firstRead.updatedAt).getTime(),
    'FINDING: updatedAt advances on every reseed call, including a no-op one for content purposes -- Mongoose\'s timestamps middleware bumps it unconditionally, independent of $setOnInsert having no effect on an existing document.'
  );
  // Content itself, meanwhile, is genuinely unchanged -- confirms the bump
  // above is purely a timestamp artifact, not an actual content rewrite.
  assert.equal(secondRead.description, firstRead.description);
  assert.equal(secondRead.name, firstRead.name);
});
