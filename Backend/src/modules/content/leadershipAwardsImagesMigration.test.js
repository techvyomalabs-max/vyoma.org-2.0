// Task 7D.33 — end-to-end regression coverage for
// leadership-awards-images-migration.mjs's own main(), exercised against a
// disposable mongodb-memory-server instance ONLY -- never a real or
// persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
//
// The fixture documents below are built directly FROM the script's own
// exported image maps (BOARD_IMAGES, ADVISORS_IMAGES, etc. -- exported in
// this same task specifically to make this possible) rather than hand-typed
// copies of the 93 real names, so there is no risk of this test's fixture
// silently drifting out of sync with the script's own real data.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';
import { MIGRATION_TARGET_ENV_VAR, MIGRATION_TARGET_CONFIRM_ENV_VAR } from '../../../scripts/wordpress/import/migrationTargetGuard.mjs';
import {
  main as leadershipAwardsMain,
  BOARD_IMAGES,
  ADVISORS_IMAGES,
  COMMITTEE_IMAGES,
  CORE_TEAM_IMAGES,
  AWARDS_IMAGES,
} from '../../../scripts/wordpress/import/leadership-awards-images-migration.mjs';

function peopleFrom(imageMap, roleLabel) {
  return Object.keys(imageMap).map((name) => ({ name, role: roleLabel, bio: null, image: null, active: true }));
}

function baselineAboutData() {
  return {
    BOARD: peopleFrom(BOARD_IMAGES, 'Board Member'),
    ADVISORS: peopleFrom(ADVISORS_IMAGES, 'Advisor'),
    COMMITTEE: peopleFrom(COMMITTEE_IMAGES, 'Committee Member'),
    CORE_TEAMS: [{ heading: 'Everyone (test fixture -- real data has 13 groups)', active: true, people: peopleFrom(CORE_TEAM_IMAGES, 'Team Member') }],
    PATRON_TIER_ROWS: { Prayojakas: [], Rakshakas: [], Samrakshakas: [], Poshakas: [], Mahaposhakas: [], Paripalakas: [] },
    GOLDEN_WALL: ['Someone'],
  };
}

function baselineCredibilityData() {
  return {
    AWARDS_ITEMS: Object.keys(AWARDS_IMAGES).map((title) => ({ title, body: 'Test award body', image: null, active: true })),
    UNRELATED_FIELD: 'must remain untouched',
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

// main() disconnects in its own finally block on every call -- reconnect
// before this test file's own setUp/assertions, exactly like
// patronsRestorationMigrations.test.js. Also resets process.exitCode (see
// that file's comment on ensureConnected() for why).
async function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
  process.exitCode = undefined;
}

beforeEach(async () => {
  await ensureConnected();
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

async function seed() {
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData(), draftData: null, status: 'published' });
  await ContentModel.create({ type: 'pages/credibility', data: baselineCredibilityData(), draftData: null, status: 'published' });
}

function withCommit(fn) {
  process.argv = [...ORIGINAL_ARGV, '--commit'];
  return fn();
}

test('--commit sets every expected image on both documents and records one revision per document actually changed', async () => {
  await seed();

  await withCommit(() => leadershipAwardsMain());
  await ensureConnected();

  const about = await ContentModel.findOne({ type: 'pages/about' }).lean();
  for (const p of about.data.BOARD) assert.deepEqual(p.image, BOARD_IMAGES[p.name]);
  for (const p of about.data.ADVISORS) assert.deepEqual(p.image, ADVISORS_IMAGES[p.name]);
  for (const p of about.data.COMMITTEE) assert.deepEqual(p.image, COMMITTEE_IMAGES[p.name]);
  for (const p of about.data.CORE_TEAMS[0].people) assert.deepEqual(p.image, CORE_TEAM_IMAGES[p.name]);
  assert.deepEqual(about.data.GOLDEN_WALL, ['Someone'], 'unrelated key must be untouched');

  const cred = await ContentModel.findOne({ type: 'pages/credibility' }).lean();
  for (const a of cred.data.AWARDS_ITEMS) assert.deepEqual(a.image, AWARDS_IMAGES[a.title]);
  assert.equal(cred.data.UNRELATED_FIELD, 'must remain untouched');

  const aboutRevisions = await ContentRevisionModel.find({ contentType: 'pages/about' }).lean();
  const credRevisions = await ContentRevisionModel.find({ contentType: 'pages/credibility' }).lean();
  assert.equal(aboutRevisions.length, 1);
  assert.equal(credRevisions.length, 1);
  assert.equal(aboutRevisions[0].action, 'migration');
  assert.equal(credRevisions[0].action, 'migration');
});

test('protects unpublished drafts: a draft on EITHER document aborts the whole run, with no writes and no revisions on either', async () => {
  await ContentModel.create({ type: 'pages/about', data: baselineAboutData(), draftData: { PENDING: true }, status: 'published' });
  await ContentModel.create({ type: 'pages/credibility', data: baselineCredibilityData(), draftData: null, status: 'published' });

  await withCommit(() => leadershipAwardsMain());
  await ensureConnected();

  const about = await ContentModel.findOne({ type: 'pages/about' }).lean();
  const cred = await ContentModel.findOne({ type: 'pages/credibility' }).lean();
  assert.ok(about.data.BOARD.every((p) => p.image === null), 'pages/about must be untouched');
  assert.ok(cred.data.AWARDS_ITEMS.every((a) => a.image === null), 'pages/credibility must ALSO be untouched -- the draft on the other document aborts this whole run');
  assert.equal(await ContentRevisionModel.countDocuments({}), 0);
});

test('safe repeated execution: a second --commit run is a no-op, with no additional revisions', async () => {
  await seed();
  await withCommit(() => leadershipAwardsMain());
  await ensureConnected();
  const afterFirst = await ContentModel.find().sort({ type: 1 }).lean();
  const revisionsAfterFirst = await ContentRevisionModel.countDocuments({});

  await withCommit(() => leadershipAwardsMain());
  await ensureConnected();
  const afterSecond = await ContentModel.find().sort({ type: 1 }).lean();
  const revisionsAfterSecond = await ContentRevisionModel.countDocuments({});

  assert.deepEqual(
    afterSecond.map((d) => d.data),
    afterFirst.map((d) => d.data)
  );
  assert.equal(revisionsAfterSecond, revisionsAfterFirst, 'an already-migrated re-run must not create any new revisions');
});

test('dry-run (no --commit) makes no write and records no revision', async () => {
  await seed();
  await leadershipAwardsMain(); // process.argv has no --commit (reset in beforeEach)
  await ensureConnected();

  const about = await ContentModel.findOne({ type: 'pages/about' }).lean();
  assert.ok(about.data.BOARD.every((p) => p.image === null));
  assert.equal(await ContentRevisionModel.countDocuments({}), 0);
});
