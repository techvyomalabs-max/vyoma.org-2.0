// Task 7D.33 — regression coverage for recordMigrationRevision()
// (scripts/wordpress/import/migrationRevision.mjs), the fix for Phase 2A's
// finding that the Patrons/Leadership/Awards migration scripts bypass the
// Admin CMS's revision-history system entirely. Runs against a disposable
// mongodb-memory-server instance only -- never any real or persistent
// database, and never mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { recordMigrationRevision } from '../../../scripts/wordpress/import/migrationRevision.mjs';
import { ContentRevisionModel } from './contentRevision.model.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

test('creates a new revision with action "migration", not "publish" or "restore"', async () => {
  await ContentRevisionModel.deleteMany({ contentType: 'pages/about' });
  const v = await recordMigrationRevision({ contentType: 'pages/about', data: { X: 1 }, scriptName: 'test-script.mjs' });

  const row = await ContentRevisionModel.findOne({ contentType: 'pages/about', version: v }).lean();
  assert.equal(row.action, 'migration');
  assert.equal(row.publishedBy, null);
  assert.equal(row.publishedByEmail, null);
  assert.deepEqual(row.data, { X: 1 });
  assert.equal(row.details.source, 'migration-script');
  assert.equal(row.details.scriptName, 'test-script.mjs');
});

test('version numbering continues from the last existing revision, whatever its action was', async () => {
  await ContentRevisionModel.deleteMany({ contentType: 'pages/credibility' });
  await ContentRevisionModel.create({ contentType: 'pages/credibility', version: 1, data: {}, action: 'publish', publishedBy: null, publishedByEmail: 'admin@example.test' });
  await ContentRevisionModel.create({ contentType: 'pages/credibility', version: 2, data: {}, action: 'restore', publishedBy: null, publishedByEmail: 'admin@example.test' });

  const v = await recordMigrationRevision({ contentType: 'pages/credibility', data: { Y: 2 }, scriptName: 'leadership-awards-images-migration.mjs' });
  assert.equal(v, 3);
});

test('never modifies or deletes any existing revision row -- purely additive', async () => {
  await ContentRevisionModel.deleteMany({ contentType: 'pages/donate' });
  const existing = await ContentRevisionModel.create({ contentType: 'pages/donate', version: 1, data: { ORIGINAL: true }, action: 'publish', publishedBy: null, publishedByEmail: 'admin@example.test' });

  await recordMigrationRevision({ contentType: 'pages/donate', data: { NEW: true }, scriptName: 'test-script.mjs' });

  const stillThere = await ContentRevisionModel.findById(existing._id).lean();
  assert.deepEqual(stillThere.data, { ORIGINAL: true }, 'the pre-existing revision must be completely untouched');
  assert.equal(stillThere.action, 'publish');
});

test('bounded retention: adding a migration revision past the 20-row limit prunes only the oldest row, exactly like a normal admin publish would', async () => {
  const TYPE = 'pages/faq-revision-test';
  await ContentRevisionModel.deleteMany({ contentType: TYPE });
  for (let i = 1; i <= 20; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ContentRevisionModel.create({ contentType: TYPE, version: i, data: { v: i }, action: 'publish', publishedBy: null, publishedByEmail: 'admin@example.test' });
  }

  await recordMigrationRevision({ contentType: TYPE, data: { v: 21 }, scriptName: 'test-script.mjs' });

  const remaining = await ContentRevisionModel.find({ contentType: TYPE }).sort({ version: 1 }).lean();
  assert.equal(remaining.length, 20, 'retention must stay bounded at 20, the same limit the admin controller enforces');
  assert.equal(remaining[0].version, 2, 'the single oldest row (version 1) must be the one pruned');
  assert.equal(remaining[remaining.length - 1].version, 21);
  assert.equal(remaining[remaining.length - 1].action, 'migration');
});

test('details carry the extra fields a caller provides, alongside the standard source/scriptName', async () => {
  await ContentRevisionModel.deleteMany({ contentType: 'pages/about-details-test' });
  const v = await recordMigrationRevision({
    contentType: 'pages/about-details-test',
    data: {},
    scriptName: 'patrons-migration.mjs',
    details: { totalPatronRows: 1375 },
  });
  const row = await ContentRevisionModel.findOne({ contentType: 'pages/about-details-test', version: v }).lean();
  assert.equal(row.details.totalPatronRows, 1375);
  assert.equal(row.details.scriptName, 'patrons-migration.mjs');
});
