// Regression coverage for runSeed()'s general ContentModel upsert (Phase 1
// Task 6I-B fix): `data` now lives under $setOnInsert (a one-time bootstrap
// value), never a bare replacement-style update, so an administrator's edit
// through the admin CMS survives any later reseed/restart -- exactly the
// same fix already proven for DonationSchemeModel (Task 5B). Runs against a
// disposable mongodb-memory-server instance only -- never MongoDB Atlas,
// never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. The real, installed
// `mongoose`/`mongodb` driver is exercised directly (no mocking), which is
// itself the confirmation that this update structure works with the actual
// installed version.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from '../../../scripts/runSeed.js';
import { ContentModel } from './content.model.js';
import * as about from '../../../scripts/seedData/about.js';
import * as faq from '../../../scripts/seedData/faq.js';
import * as contact from '../../../scripts/seedData/contact.js';
import * as donate from '../../../scripts/seedData/donate.js';

const ALL_TYPES = ['pages/home', 'pages/about', 'pages/our-work', 'pages/impact', 'pages/credibility', 'pages/join-us', 'pages/donate', 'pages/faq', 'pages/contact', 'pages/media', 'media'];

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

async function resetContent() {
  await ContentModel.deleteMany({});
}

test('seeding an empty collection creates all 11 content types with the correct data', async () => {
  await resetContent();
  const result = await runSeed();
  assert.equal(result.contentTypes, 11);

  const docs = await ContentModel.find().lean();
  assert.equal(docs.length, 11);
  assert.deepEqual(
    docs.map((d) => d.type).sort(),
    [...ALL_TYPES].sort()
  );

  const faqDoc = docs.find((d) => d.type === 'pages/faq');
  assert.deepEqual(faqDoc.data, { ...faq });

  const contactDoc = docs.find((d) => d.type === 'pages/contact');
  assert.deepEqual(contactDoc.data, { ...contact });
});

test('existing content transformations still work: pages/about gets imageUrl normalized onto every person', async () => {
  await resetContent();
  await runSeed();
  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();

  assert.ok(doc.data.BOARD.every((p) => typeof p.imageUrl === 'string'));
  assert.ok(doc.data.ADVISORS.every((p) => typeof p.imageUrl === 'string'));
  assert.ok(doc.data.COMMITTEE.every((p) => typeof p.imageUrl === 'string'));
  assert.ok(doc.data.CORE_TEAMS.every((group) => group.people.every((p) => typeof p.imageUrl === 'string')));
  // Unrelated fields on the module untouched by the transform.
  assert.deepEqual(doc.data.CORE_TEAMS.length, about.CORE_TEAMS.length);
});

test('existing content transformations still work: pages/donate has DONATION_SCHEMES stripped out', async () => {
  await resetContent();
  await runSeed();
  const doc = await ContentModel.findOne({ type: 'pages/donate' }).lean();

  assert.equal(doc.data.DONATION_SCHEMES, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(doc.data, 'DONATION_SCHEMES'));
  // Every other field from the module is preserved.
  const { DONATION_SCHEMES, ...expectedPageCopy } = donate;
  assert.deepEqual(doc.data, expectedPageCopy);
});

test('an administrator-edited content document survives reseeding', async () => {
  await resetContent();
  await runSeed();
  await ContentModel.updateOne({ type: 'pages/home' }, { $set: { data: { ADMIN_EDITED: true, HERO_SLIDES: [] } } });

  await runSeed();

  const doc = await ContentModel.findOne({ type: 'pages/home' }).lean();
  assert.deepEqual(doc.data, { ADMIN_EDITED: true, HERO_SLIDES: [] });
});

test('draftData and status survive reseeding untouched', async () => {
  await resetContent();
  await runSeed();
  await ContentModel.updateOne({ type: 'pages/faq' }, { $set: { draftData: { DRAFT: true }, status: 'draft' } });

  await runSeed();

  const doc = await ContentModel.findOne({ type: 'pages/faq' }).lean();
  assert.deepEqual(doc.draftData, { DRAFT: true });
  assert.equal(doc.status, 'draft');
  // data itself must also be untouched by this same reseed call (already-
  // seeded, not admin-edited this time -- still a no-op either way).
  assert.deepEqual(doc.data, { ...faq });
});

test('repeated reseeding is idempotent: an admin edit stays stable across multiple reseed calls, not just one', async () => {
  await resetContent();
  await runSeed();
  await ContentModel.updateOne({ type: 'pages/contact' }, { $set: { data: { STABLE_EDIT: true } } });

  await runSeed();
  await runSeed();
  await runSeed();

  const doc = await ContentModel.findOne({ type: 'pages/contact' }).lean();
  assert.deepEqual(doc.data, { STABLE_EDIT: true });
});

// This task's scope forbids modifying seedData files or CONTENT_SEED, so a
// truly new content type can't be introduced there for this test. A real
// missing-then-seeded type is simulated instead by deleting one of the real
// 11 documents (standing in for "a content type that doesn't exist in this
// database yet") and confirming a single runSeed() call both (a) recreates
// it correctly and (b) leaves an unrelated, already-customized type
// completely alone -- exactly the mixed insert+protected-no-op-update
// scenario a real newly-introduced CONTENT_SEED entry would produce.
test('a content type missing from the database is (re)created correctly while an existing customized type is left alone', async () => {
  await resetContent();
  await runSeed();
  await ContentModel.updateOne({ type: 'pages/impact' }, { $set: { data: { CUSTOMIZED: true } } });
  await ContentModel.deleteOne({ type: 'pages/our-work' }); // stands in for "not yet introduced"

  await runSeed();

  const recreated = await ContentModel.findOne({ type: 'pages/our-work' }).lean();
  assert.ok(recreated, 'the missing content type must be recreated by the next reseed');
  assert.deepEqual(recreated.data, { ...(await import('../../../scripts/seedData/ourWork.js')) });

  const customized = await ContentModel.findOne({ type: 'pages/impact' }).lean();
  assert.deepEqual(customized.data, { CUSTOMIZED: true }, 'an unrelated, already-customized content type must remain untouched');

  assert.equal(await ContentModel.countDocuments(), 11, 'reseeding must not create duplicate documents for types that already exist');
});

test('seed summary counts remain correct after the fix', async () => {
  await resetContent();
  const result = await runSeed();
  assert.equal(result.contentTypes, 11);
  assert.equal(result.donationSchemes, 9);
  assert.equal(result.blogPosts, (await import('../../../scripts/seedData/blog.js')).BLOG_POSTS.length);
});

test('no regression in other seed workflows: donation schemes and settings still seed correctly alongside the ContentModel change', async () => {
  const { DonationSchemeModel } = await import('../donations/donationScheme.model.js');
  const { SiteSettingsModel } = await import('../settings/setting.model.js');
  await resetContent();
  await DonationSchemeModel.deleteMany({});
  await SiteSettingsModel.deleteMany({});

  await runSeed();

  assert.equal(await DonationSchemeModel.countDocuments(), 9);
  const settings = await SiteSettingsModel.findOne().lean();
  assert.ok(settings, 'SiteSettings document must still be created on first seed');
});

// Investigative only (per this task's explicit scope: report the finding,
// do not change timestamp behavior as part of this fix) -- consistent with
// the identical, already-documented finding for DonationSchemeModel.
//
// FINDING: updatedAt DOES still change on every reseed call, even now that
// `data` is $setOnInsert-only and has no effect on an already-existing
// document. This is Mongoose's own `{ timestamps: true }` schema option:
// its findOneAndUpdate middleware unconditionally injects an updatedAt bump
// into the update document it sends to MongoDB, regardless of whether
// $setOnInsert would otherwise change anything for the matched document.
// This is pre-existing Mongoose behavior, not something this fix introduced
// or changed, and (per this task's explicit scope) is not being altered
// here -- recorded as a finding only.
test('finding: updatedAt still changes on every reseed call, even a content-level no-op, due to Mongoose\'s own timestamps middleware', async () => {
  await resetContent();
  await runSeed();
  const firstRead = await ContentModel.findOne({ type: 'pages/media' }).lean();

  await new Promise((resolve) => setTimeout(resolve, 10)); // ensure a measurable clock difference
  await runSeed();

  const secondRead = await ContentModel.findOne({ type: 'pages/media' }).lean();
  assert.ok(
    new Date(secondRead.updatedAt).getTime() > new Date(firstRead.updatedAt).getTime(),
    'FINDING: updatedAt advances on every reseed call, including a no-op one for content purposes -- Mongoose\'s timestamps middleware bumps it unconditionally, independent of $setOnInsert having no effect on an existing document.'
  );
  // Content itself, meanwhile, is genuinely unchanged -- confirms the bump
  // above is purely a timestamp artifact, not an actual content rewrite.
  assert.deepEqual(secondRead.data, firstRead.data);
});
