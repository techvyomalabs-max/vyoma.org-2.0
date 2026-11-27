// Task 7D.33 — end-to-end regression coverage for patrons-migration.mjs and
// patron-categories-unify-migration.mjs's own main(), exercised against a
// disposable mongodb-memory-server instance ONLY -- never a real or
// persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. This mirrors this
// engagement's established convention for testing data-writing scripts
// (e.g. Backend/src/modules/content/aboutSeedPatronShape.test.js testing
// runSeed()) -- a disposable, in-memory fixture, not an "actual migration"
// against any real system.
//
// Covers Phase 2B's requested scenarios: correct execution order between
// the two scripts, draft/unrelated-content preservation, revision-history
// creation, and safe repeated execution (idempotency).
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';
import { MIGRATION_TARGET_ENV_VAR, MIGRATION_TARGET_CONFIRM_ENV_VAR } from '../../../scripts/wordpress/import/migrationTargetGuard.mjs';
import { main as patronsMain } from '../../../scripts/wordpress/import/patrons-migration.mjs';
import { main as unifyMain } from '../../../scripts/wordpress/import/patron-categories-unify-migration.mjs';

// The exact, hardcoded GOLDEN_WALL both scripts validate against -- copied
// verbatim from patrons-migration.mjs, not re-derived, so this test fixture
// matches the script's own expectation exactly.
const GOLDEN_WALL = [
  'Shri. B Krishnamurthy — Coimbatore',
  'Prof. B Mahadevan — Bangalore',
  'Smt. Rama Sivaraman — Chennai',
  'Shri. Sudhir Patavardhan — Bangalore',
  'Dr. Rajesh Nair — India',
  'Shri. Visvanathan Ganesan — Bangalore',
  'Smt. Malathi M, Shri. Shivashankar — Bangalore',
  'Shri. Rajesh Anandaramu, Smt. Sandhya Rajesh & Family — Bangalore',
  'Late Shri. Kuppuswamy; Shri Nagesh, Smt. Kamakshi; Shri Sarangan, Smt. Gomati; Shri Ananda, Smt. Prema; Shri Harish, Smt. Janani; Shri Mahesh, Smt. Aishwarya',
];

const TIER_NAMES = ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'];

function baselineAboutData(overrides = {}) {
  return {
    BOARD: [{ name: 'Someone', role: 'CEO', image: null, active: true }],
    GOLDEN_WALL,
    PATRON_TESTIMONIALS: [{ name: 'Patron Name', location: 'City', quote: 'Placeholder.', active: true }],
    PATRON_TIER_ROWS: {
      Prayojakas: [{ name: 'Sample Row', place: 'Bangalore', product: 'Sample', active: true }],
      Rakshakas: [],
      Samrakshakas: [],
      Poshakas: [],
      Mahaposhakas: [],
      Paripalakas: [],
    },
    ...overrides,
  };
}

const ORIGINAL_ENV = {
  [MIGRATION_TARGET_ENV_VAR]: process.env[MIGRATION_TARGET_ENV_VAR],
  [MIGRATION_TARGET_CONFIRM_ENV_VAR]: process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR],
};
const ORIGINAL_ARGV = [...process.argv];

let mem;
let uri;

before(async () => {
  mem = await MongoMemoryServer.create();
  uri = mem.getUri('vyoma_2_0_test');
  process.env[MIGRATION_TARGET_ENV_VAR] = uri;
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'vyoma_2_0_test';
  await mongoose.connect(uri);
});

// Each script's own main() calls disconnectDb() in its own finally block
// (correct, real behavior -- a real CLI invocation connects once and
// disconnects once) -- so between tests in this same file, the connection
// this test file itself needs for its own setUp/assertions must be
// re-established here rather than assumed still open from a previous test.
beforeEach(async () => {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
  await ContentModel.deleteMany({});
  await ContentRevisionModel.deleteMany({});
  process.argv = [...ORIGINAL_ARGV];
});

after(async () => {
  await mongoose.disconnect().catch(() => {});
  if (mem) await mem.stop();
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  process.argv = ORIGINAL_ARGV;
});

function withCommit(fn) {
  process.argv = [...ORIGINAL_ARGV, '--commit'];
  return fn();
}

// Every script's own main() disconnects in its own finally block when it
// returns -- reconnect before any direct ContentModel/ContentRevisionModel
// access that follows a main() call in a test body. Also resets
// process.exitCode: main() intentionally sets it to 1 as its CLI-facing
// signal for a safe, expected abort (e.g. the wrong-execution-order test
// below) -- correct for a real `node script.mjs` invocation, but it would
// otherwise leak into and fail this whole test FILE's own reported exit
// code even though every individual assertion passed.
async function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
  process.exitCode = undefined;
}

test('patrons-migration.mjs --commit replaces PATRON_TIER_ROWS with the full 1,375-row real dataset and records a migration revision', async () => {
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData(), draftData: null, status: 'published' });

  await withCommit(() => patronsMain());
  await ensureConnected();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  const total = Object.values(doc.data.PATRON_TIER_ROWS).reduce((s, rows) => s + rows.length, 0);
  assert.equal(total, 1375);
  assert.equal(doc.data.PATRON_TESTIMONIALS, undefined, 'fabricated placeholder testimonials must be removed');
  assert.ok(Array.isArray(doc.data.PATRON_TESTIMONIAL_GALLERY) && doc.data.PATRON_TESTIMONIAL_GALLERY.length === 13);
  assert.ok(Array.isArray(doc.data.PATRON_MATCHING_PARTNERS) && doc.data.PATRON_MATCHING_PARTNERS.length === 15);
  assert.deepEqual(doc.data.GOLDEN_WALL, GOLDEN_WALL, 'GOLDEN_WALL must be untouched');
  assert.deepEqual(doc.data.BOARD, baselineAboutData().BOARD, 'an unrelated key (BOARD) must be completely untouched');

  const revision = await ContentRevisionModel.findOne({ contentType: 'pages/about' }).sort({ version: -1 }).lean();
  assert.equal(revision.action, 'migration');
  assert.equal(revision.details.scriptName, 'patrons-migration.mjs');
});

test('protects unpublished drafts: aborts entirely (no write) when draftData is non-null', async () => {
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData(), draftData: { SOME: 'pending-edit' }, status: 'published' });

  await withCommit(() => patronsMain());
  await ensureConnected();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  assert.deepEqual(doc.draftData, { SOME: 'pending-edit' }, 'draftData must be completely untouched');
  const total = Object.values(doc.data.PATRON_TIER_ROWS).reduce((s, rows) => s + rows.length, 0);
  assert.equal(total, 1, 'the migration must not have run at all -- still the 1-row baseline fixture, not 1375');
  assert.equal(await ContentRevisionModel.countDocuments({ contentType: 'pages/about' }), 0, 'no revision should be recorded for an aborted run');
});

test('safe repeated execution: running patrons-migration.mjs --commit twice is a no-op the second time, with no second revision', async () => {
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData(), draftData: null, status: 'published' });

  await withCommit(() => patronsMain());
  await ensureConnected();
  const afterFirst = await ContentModel.findOne({ type: 'pages/about' }).lean();
  const revisionsAfterFirst = await ContentRevisionModel.countDocuments({ contentType: 'pages/about' });

  await withCommit(() => patronsMain());
  await ensureConnected();
  const afterSecond = await ContentModel.findOne({ type: 'pages/about' }).lean();
  const revisionsAfterSecond = await ContentRevisionModel.countDocuments({ contentType: 'pages/about' });

  assert.deepEqual(afterSecond.data, afterFirst.data, 'a safe re-run must leave the data exactly as the first run left it');
  assert.equal(revisionsAfterSecond, revisionsAfterFirst, 'an already-migrated no-op re-run must not create a second revision');
});

test('correct execution order (1/2): running patron-categories-unify-migration.mjs BEFORE patrons-migration.mjs fails safely, with no write and no revision', async () => {
  const tiers = TIER_NAMES.map((sanskrit) => ({ sanskrit, meaning: 'M', note: 'N', active: true }));
  await ContentModel.create({
    type: 'pages/about',
    data: baselineAboutData({ PATRON_TIERS: tiers }),
    draftData: null,
    status: 'published',
  });

  await withCommit(() => unifyMain());
  await ensureConnected();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  // unify ran fine here (both PATRON_TIERS and PATRON_TIER_ROWS were present
  // and matched), converting the 1-row Prayojakas sample -- but the REAL
  // 1,375-row dataset was never applied, because patrons-migration.mjs never
  // ran. This demonstrates why the order matters for actually restoring the
  // full dataset, even though this particular step itself didn't fail.
  const totalAfterUnify = doc.data.PATRON_CATEGORIES.reduce((s, c) => s + c.rows.length, 0);
  assert.equal(totalAfterUnify, 1, 'only the 1-row sample was unified -- the real dataset was never applied');

  // Now run patrons-migration.mjs -- it only knows how to write the OLD
  // PATRON_TIER_ROWS shape, which the unify script just removed. It must
  // fail safely rather than silently doing nothing useful or corrupting data.
  await withCommit(() => patronsMain());
  await ensureConnected();
  const afterPatrons = await ContentModel.findOne({ type: 'pages/about' }).lean();
  assert.ok(Array.isArray(afterPatrons.data.PATRON_CATEGORIES), 'PATRON_CATEGORIES must be untouched by the failed patrons-migration run');
  assert.equal(afterPatrons.data.PATRON_TIER_ROWS, undefined, 'PATRON_TIER_ROWS must still be absent -- patrons-migration.mjs could not have reintroduced it');
});

test('correct execution order (2/2): patrons-migration.mjs THEN patron-categories-unify-migration.mjs restores the full real dataset correctly', async () => {
  const tiers = TIER_NAMES.map((sanskrit) => ({ sanskrit, meaning: 'M', note: 'N', active: true }));
  await ContentModel.create({
    type: 'pages/about',
    data: baselineAboutData({ PATRON_TIERS: tiers }),
    draftData: null,
    status: 'published',
  });

  await withCommit(() => patronsMain());
  await withCommit(() => unifyMain());
  await ensureConnected();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  assert.equal(doc.data.PATRON_TIER_ROWS, undefined);
  assert.equal(doc.data.PATRON_TIERS, undefined);
  assert.ok(Array.isArray(doc.data.PATRON_CATEGORIES));
  const total = doc.data.PATRON_CATEGORIES.reduce((s, c) => s + c.rows.length, 0);
  assert.equal(total, 1375, 'the full real dataset must survive the merge into PATRON_CATEGORIES');
  assert.ok(Array.isArray(doc.data.PATRON_TESTIMONIAL_GALLERY) && doc.data.PATRON_TESTIMONIAL_GALLERY.length === 13);

  const revisions = await ContentRevisionModel.find({ contentType: 'pages/about' }).sort({ version: 1 }).lean();
  assert.equal(revisions.length, 2, 'both scripts must each record their own revision');
  assert.deepEqual(revisions.map((r) => r.details.scriptName), ['patrons-migration.mjs', 'patron-categories-unify-migration.mjs']);
});

test('dry-run (no --commit) makes no write and records no revision for either script', async () => {
  const tiers = TIER_NAMES.map((sanskrit) => ({ sanskrit, meaning: 'M', note: 'N', active: true }));
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData({ PATRON_TIERS: tiers }), draftData: null, status: 'published' });

  process.argv = [...ORIGINAL_ARGV]; // no --commit
  await patronsMain();
  await ensureConnected();

  const doc = await ContentModel.findOne({ type: 'pages/about' }).lean();
  const total = Object.values(doc.data.PATRON_TIER_ROWS).reduce((s, rows) => s + rows.length, 0);
  assert.equal(total, 1, 'dry-run must not write anything');
  assert.equal(await ContentRevisionModel.countDocuments({}), 0, 'dry-run must not record a revision');
});
