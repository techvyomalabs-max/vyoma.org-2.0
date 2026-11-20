// Task 7D.32 — regression coverage for the Privacy/Terms migration-recovery
// fix: pages/privacy and pages/terms had NO Backend seed definition at all
// (confirmed absent from Backend/scripts/runSeed.js's CONTENT_SEED map
// before this fix), so GET /public/pages/privacy|terms 404'd
// CONTENT_NOT_FOUND unconditionally on any freshly bootstrapped database --
// the root cause of the Privacy/Terms page crash found in the migration
// audit. Runs against a disposable mongodb-memory-server instance only --
// never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { runSeed } from '../../../scripts/runSeed.js';
import { ContentModel } from './content.model.js';
import * as privacySeed from '../../../scripts/seedData/privacy.js';
import * as termsSeed from '../../../scripts/seedData/terms.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

test('Backend/scripts/seedData/privacy.js and terms.js exist and export the exact fields Frontend/app/(public)/privacy|terms/page.js destructures', () => {
  for (const mod of [privacySeed, termsSeed]) {
    assert.equal(typeof mod.TITLE, 'string');
    assert.ok('EFFECTIVE_DATE' in mod);
    assert.equal(typeof mod.BODY, 'string');
    assert.ok(mod.BODY.length > 0);
    assert.equal(typeof mod.SEO, 'object');
  }
});

test('seed content matches the Frontend mock exactly -- real, already-verified WordPress-migrated text, nothing invented', async () => {
  const privacyMock = await import('../../../../Frontend/lib/mockData/privacy.js');
  const termsMock = await import('../../../../Frontend/lib/mockData/terms.js');

  assert.equal(privacySeed.TITLE, privacyMock.TITLE);
  assert.equal(privacySeed.BODY, privacyMock.BODY);
  assert.deepEqual(privacySeed.SEO, privacyMock.SEO);

  assert.equal(termsSeed.TITLE, termsMock.TITLE);
  assert.equal(termsSeed.BODY, termsMock.BODY);
  assert.deepEqual(termsSeed.SEO, termsMock.SEO);
});

test('a database seeded from scratch now has pages/privacy and pages/terms documents, with the exact seed content, not 404', async () => {
  await ContentModel.deleteMany({});
  const result = await runSeed();
  assert.equal(result.contentTypes, 13);

  const privacyDoc = await ContentModel.findOne({ type: 'pages/privacy' }).lean();
  assert.ok(privacyDoc, 'pages/privacy must now be created by runSeed()');
  assert.equal(privacyDoc.data.TITLE, privacySeed.TITLE);
  assert.equal(privacyDoc.data.BODY, privacySeed.BODY);
  assert.equal(privacyDoc.status, 'published');

  const termsDoc = await ContentModel.findOne({ type: 'pages/terms' }).lean();
  assert.ok(termsDoc, 'pages/terms must now be created by runSeed()');
  assert.equal(termsDoc.data.TITLE, termsSeed.TITLE);
  assert.equal(termsDoc.data.BODY, termsSeed.BODY);
  assert.equal(termsDoc.status, 'published');
});

test('registering these two new seed types does not disturb the other 11 already-existing types or their data', async () => {
  await ContentModel.deleteMany({});
  await runSeed();

  const faqDoc = await ContentModel.findOne({ type: 'pages/faq' }).lean();
  const faqSeed = await import('../../../scripts/seedData/faq.js');
  assert.deepEqual(faqDoc.data, { ...faqSeed });

  assert.equal(await ContentModel.countDocuments(), 13);
});

test('re-running runSeed() against an already-seeded database is a no-op for pages/privacy and pages/terms too (same $setOnInsert-only protection as every other type)', async () => {
  await ContentModel.deleteMany({});
  await runSeed();
  await ContentModel.updateOne({ type: 'pages/privacy' }, { $set: { data: { ADMIN_EDITED: true } } });

  await runSeed();

  const doc = await ContentModel.findOne({ type: 'pages/privacy' }).lean();
  assert.deepEqual(doc.data, { ADMIN_EDITED: true }, 'an admin edit to pages/privacy must survive a reseed, exactly like every other content type');
});
