// QA Bug 11 / Stage 3 — regression coverage proving where-sanskrit-migration.mjs
// now goes through migrationTargetGuard.mjs's strict allowlist (never the
// weaker, ambient-Backend/.env connectToMigrationDb() path it used before).
// Every test below runs against a disposable mongodb-memory-server instance
// ONLY -- never a real or remote database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. MIGRATION_TARGET_* env
// vars are deleted before each test and the real process.env is restored
// afterward, so a real credential sitting in the ambient environment is
// never read or relied on.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContentModel } from './content.model.js';
import { MIGRATION_TARGET_ENV_VAR, MIGRATION_TARGET_CONFIRM_ENV_VAR } from '../../../scripts/wordpress/import/migrationTargetGuard.mjs';
import {
  main as whereSanskritMain,
  APPROVED_RESOURCE_CATEGORIES,
  APPROVED_RESOURCE_ROWS,
} from '../../../scripts/wordpress/import/where-sanskrit-migration.mjs';

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// Built from the script's own exported APPROVED_RESOURCE_CATEGORIES rather
// than a hand-typed list, so this fixture cannot silently drift out of sync
// with the script's real category set (same principle
// leadershipAwardsImagesMigration.test.js's fixtures already use).
function fabricatedResourceRows() {
  const rows = {};
  for (const cat of APPROVED_RESOURCE_CATEGORIES) {
    rows[cat] = [{ title: `Placeholder - ${cat}`, desc: 'placeholder', link: '#' }];
  }
  return rows;
}

function baselineMediaData() {
  return {
    RESOURCE_CATEGORIES: APPROVED_RESOURCE_CATEGORIES,
    RESOURCE_ROWS: fabricatedResourceRows(),
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
});

// main() disconnects in its own finally block on every call (when it reaches
// one -- a pre-connection guard failure never connects at all), so each test
// re-establishes the connection it needs, exactly like
// leadershipAwardsImagesMigration.test.js's own ensureConnected().
async function ensureConnected(targetUri) {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(targetUri);
  }
  process.exitCode = undefined;
}

beforeEach(async () => {
  delete process.env[MIGRATION_TARGET_ENV_VAR];
  delete process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR];
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

async function seedBaseline() {
  await ensureConnected(uri);
  await ContentModel.deleteMany({});
  for (const type of MEDIA_CONTENT_TYPES) {
    await ContentModel.create({ type, data: baselineMediaData(), draftData: null, status: 'published' });
  }
}

async function assertBaselineUntouched() {
  await ensureConnected(uri);
  for (const type of MEDIA_CONTENT_TYPES) {
    const doc = await ContentModel.findOne({ type }).lean();
    assert.equal(
      doc.data.RESOURCE_ROWS[APPROVED_RESOURCE_CATEGORIES[0]][0].link,
      '#',
      `"${type}" must remain the fabricated placeholder -- no write should have happened`
    );
  }
}

test('missing MIGRATION_TARGET_MONGODB_URI: main() rejects before any connection attempt, no data changed', async () => {
  await seedBaseline();
  // Deliberately left unset by beforeEach -- never falls back to a real
  // MONGODB_URI/Backend/.env even if one happens to be set in this process.
  await assert.rejects(() => whereSanskritMain(), /must be set to the exact, explicit Atlas testing connection string/);
  await assertBaselineUntouched();
});

test('wrong MIGRATION_TARGET_CONFIRM: main() rejects, no data changed', async () => {
  await seedBaseline();
  process.env[MIGRATION_TARGET_ENV_VAR] = uri;
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'not-the-right-name';
  await assert.rejects(() => whereSanskritMain(), /explicitly confirm/);
  await assertBaselineUntouched();
});

test('non-allowlisted database name ("production-like"): main() rejects, no data changed', async () => {
  await seedBaseline();
  const otherUri = mem.getUri('production_like_name');

  // The allowlist check is pure URI-text parsing, before any mongoose
  // connection is attempted -- confirmed by reading migrationTargetGuard.mjs
  // directly -- so main() must reject without ever touching this other name.
  process.env[MIGRATION_TARGET_ENV_VAR] = otherUri;
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'production_like_name';
  await assert.rejects(() => whereSanskritMain(), /not on the.*explicit allowlist/);

  // The vyoma_2_0_test baseline (the only database main() could legitimately
  // have reached) is still untouched.
  await assertBaselineUntouched();
});

test('valid vyoma_2_0_test target: --commit migrates all 103 resources across 8 categories, and a repeated run is idempotent', async () => {
  await seedBaseline();
  process.env[MIGRATION_TARGET_ENV_VAR] = uri;
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'vyoma_2_0_test';

  await withCommit(() => whereSanskritMain());
  await ensureConnected(uri);

  for (const type of MEDIA_CONTENT_TYPES) {
    const doc = await ContentModel.findOne({ type }).lean();
    assert.deepEqual(doc.data.RESOURCE_CATEGORIES, APPROVED_RESOURCE_CATEGORIES);
    assert.deepEqual(doc.data.RESOURCE_ROWS, APPROVED_RESOURCE_ROWS);
    assert.equal(doc.data.UNRELATED_FIELD, 'must remain untouched', 'unrelated key must be untouched');
    const total = Object.values(doc.data.RESOURCE_ROWS).reduce((n, rows) => n + rows.length, 0);
    assert.equal(total, 103);
  }

  const afterFirst = await ContentModel.find().sort({ type: 1 }).lean();

  await withCommit(() => whereSanskritMain());
  await ensureConnected(uri);
  const afterSecond = await ContentModel.find().sort({ type: 1 }).lean();

  assert.deepEqual(
    afterSecond.map((d) => d.data),
    afterFirst.map((d) => d.data),
    'an already-migrated re-run must be a provable no-op'
  );
});
