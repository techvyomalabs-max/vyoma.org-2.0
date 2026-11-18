// Task 7D.34 (Phase 2D) — regression coverage for the read-only Atlas
// preflight (scripts/wordpress/import/atlasPreflightCheck.mjs). Runs against
// a disposable mongodb-memory-server instance only -- never a real or
// persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ContentModel } from './content.model.js';
import { ContentRevisionModel } from './contentRevision.model.js';
import { MIGRATION_TARGET_ENV_VAR, MIGRATION_TARGET_CONFIRM_ENV_VAR } from '../../../scripts/wordpress/import/migrationTargetGuard.mjs';
import { main as preflightMain } from '../../../scripts/wordpress/import/atlasPreflightCheck.mjs';

const SOURCE = fs.readFileSync(new URL('../../../scripts/wordpress/import/atlasPreflightCheck.mjs', import.meta.url), 'utf8');

// Strips `//` single-line comments before the write-capability checks below
// -- this script's own header comments legitimately explain, in prose, which
// operations it does NOT perform (e.g. "no ContentModel.updateOne()..."),
// which would otherwise trip a bare substring search. Only non-comment code
// needs to be free of these patterns.
const CODE_ONLY = SOURCE.split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

// --- Static source checks: this script must be structurally incapable of writing ---

test('imports connectToExplicitMigrationTarget from migrationTargetGuard.mjs (reused, not reimplemented)', () => {
  assert.match(SOURCE, /import\s*\{\s*connectToExplicitMigrationTarget\s*\}\s*from\s*'\.\/migrationTargetGuard\.mjs'/);
});

test('never imports connectToMigrationDb or a raw connectDb() call', () => {
  assert.ok(!CODE_ONLY.includes('connectToMigrationDb'), 'must not use the ambient-configuration guard');
  assert.ok(!/\bawait\s+connectDb\(\)/.test(CODE_ONLY), 'must not call connectDb() directly');
});

test('never imports or calls recordMigrationRevision -- this preflight creates no revision', () => {
  assert.ok(!CODE_ONLY.includes('recordMigrationRevision'), 'a read-only preflight must never record a revision');
});

test('contains no write-capable Mongoose operations anywhere in its actual code (comments aside)', () => {
  const writeOps = ['.updateOne(', '.updateMany(', '.deleteOne(', '.deleteMany(', '.create(', '.insertMany(', '.findOneAndUpdate(', '.findOneAndDelete(', '.save(', '$set', '$unset'];
  for (const op of writeOps) {
    assert.ok(!CODE_ONLY.includes(op), `source must not contain "${op}" outside comments -- this script must be read-only`);
  }
});

test('defines and exports main(), and only runs it on direct CLI invocation', () => {
  assert.match(SOURCE, /export async function main\(\)/);
  assert.match(SOURCE, /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/);
});

// --- Functional tests against a disposable in-memory fixture ---

const ORIGINAL_ENV = {
  [MIGRATION_TARGET_ENV_VAR]: process.env[MIGRATION_TARGET_ENV_VAR],
  [MIGRATION_TARGET_CONFIRM_ENV_VAR]: process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR],
};

let mem;
let uri;

before(async () => {
  mem = await MongoMemoryServer.create();
  uri = mem.getUri('vyoma_2_0_test');
  process.env[MIGRATION_TARGET_ENV_VAR] = uri;
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'vyoma_2_0_test';
  await mongoose.connect(uri);
});

async function ensureConnected() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(uri);
  }
  process.exitCode = undefined; // see other migration test files' identical note
}

beforeEach(async () => {
  await ensureConnected();
  await ContentModel.deleteMany({});
  await ContentRevisionModel.deleteMany({});
});

after(async () => {
  await mongoose.disconnect().catch(() => {});
  if (mem) await mem.stop();
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function withCapturedLogs(fn) {
  const logs = [];
  const original = console.log;
  console.log = (...args) => logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  return fn().finally(() => {
    console.log = original;
  }).then((result) => ({ result, logs }));
}

test('performs zero writes: every document is byte-identical before and after, and no revision is created', async () => {
  await ContentModel.create({
    type: 'pages/about',
    data: {
      PATRON_TIER_ROWS: { Prayojakas: [{ name: 'A Real Person Name', place: 'City', product: 'X', active: true }], Rakshakas: [], Samrakshakas: [], Poshakas: [], Mahaposhakas: [], Paripalakas: [] },
      PATRON_TIERS: ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'].map((sanskrit) => ({ sanskrit, meaning: 'M', note: 'N', active: true })),
      BOARD: [{ name: 'Someone', image: null, active: true }],
      GOLDEN_WALL: ['X'],
    },
    draftData: null,
    status: 'published',
  });
  await ContentModel.create({ type: 'pages/credibility', data: { AWARDS_ITEMS: [{ title: 'Award', image: null, active: true }] }, draftData: null, status: 'published' });
  await ContentRevisionModel.create({ contentType: 'pages/about', version: 1, data: {}, action: 'publish', publishedBy: null, publishedByEmail: 'a@example.test' });

  const before = await ContentModel.find().sort({ type: 1 }).lean();
  const revisionsBefore = await ContentRevisionModel.countDocuments({});

  await preflightMain();
  await ensureConnected();

  const after = await ContentModel.find().sort({ type: 1 }).lean();
  const revisionsAfter = await ContentRevisionModel.countDocuments({});

  assert.deepEqual(after, before, 'preflight must not alter any document in any way');
  assert.equal(revisionsAfter, revisionsBefore, 'preflight must never create a revision');
});

test('never logs the connection string or any Patron personal data, only counts and structural facts', async () => {
  const distinctivePersonalName = 'Zzyxw-Uniquely-Identifiable-Test-Donor-998877';
  await ContentModel.create({
    type: 'pages/about',
    data: {
      PATRON_TIER_ROWS: { Prayojakas: [{ name: distinctivePersonalName, place: 'Secret City', product: 'Secret Product', active: true }], Rakshakas: [], Samrakshakas: [], Poshakas: [], Mahaposhakas: [], Paripalakas: [] },
    },
    draftData: null,
    status: 'published',
  });

  const { logs } = await withCapturedLogs(() => preflightMain());
  await ensureConnected();

  const combined = logs.join('\n');
  assert.ok(!combined.includes(uri), 'must never log the connection string/URI');
  assert.ok(!combined.toLowerCase().includes('mongodb://'), 'must never log any connection-string-shaped text');
  assert.ok(!combined.includes(distinctivePersonalName), 'must never log an actual Patron row name');
  assert.ok(!combined.includes('Secret City'), 'must never log an actual Patron row place');
  assert.ok(!combined.includes('Secret Product'), 'must never log an actual Patron row product');
  assert.ok(combined.includes('vyoma_2_0_test'), 'the resolved database NAME (not the URI) is expected to be printed');
});

test('reports legacy Patron shape, counts, and ordering correctly, without exposing row content', async () => {
  await ContentModel.create({
    type: 'pages/about',
    data: {
      PATRON_TIERS: ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'].map((sanskrit) => ({ sanskrit, meaning: 'M', note: 'N', active: true })),
      PATRON_TIER_ROWS: { Prayojakas: [{ name: 'A', active: true }, { name: 'B', active: true }], Rakshakas: [{ name: 'C', active: true }], Samrakshakas: [], Poshakas: [], Mahaposhakas: [], Paripalakas: [] },
    },
    draftData: null,
    status: 'published',
  });

  const result = await preflightMain();
  await ensureConnected();

  assert.equal(result.prerequisites.patronsMigration, true);
  assert.equal(result.prerequisites.patronCategoriesUnify, true, 'both legacy shapes present, not yet unified -- unify is ready to run');
});

test('reports already-unified Patron shape correctly', async () => {
  await ContentModel.create({
    type: 'pages/about',
    data: { PATRON_CATEGORIES: [{ sanskrit: 'Prayojakas', meaning: 'M', note: 'N', hasProductField: true, active: true, rows: [] }] },
    draftData: null,
    status: 'published',
  });

  const result = await preflightMain();
  await ensureConnected();

  assert.equal(result.prerequisites.patronsMigration, false, 'no legacy PATRON_TIER_ROWS to replace');
  assert.equal(result.prerequisites.patronCategoriesUnify, false, 'already unified -- nothing to merge');
});

test('reports prerequisites as not-ready when pages/about has a pending draft', async () => {
  await ContentModel.create({
    type: 'pages/about',
    data: { PATRON_TIERS: [], PATRON_TIER_ROWS: {} },
    draftData: { SOME: 'pending-edit' },
    status: 'published',
  });
  await ContentModel.create({ type: 'pages/credibility', data: {}, draftData: null, status: 'published' });

  const result = await preflightMain();
  await ensureConnected();

  assert.equal(result.prerequisites.patronsMigration, false);
  assert.equal(result.prerequisites.patronCategoriesUnify, false);
  assert.equal(result.prerequisites.leadershipAwardsImages, false);
});

test('reports missing documents correctly (neither pages/about nor pages/credibility exist)', async () => {
  const result = await preflightMain();
  await ensureConnected();

  assert.equal(result.totalContentDocs, 0);
  assert.deepEqual(result.contentTypes, []);
  assert.equal(result.prerequisites.patronsMigration, false);
  assert.equal(result.prerequisites.patronCategoriesUnify, false);
  assert.equal(result.prerequisites.leadershipAwardsImages, false);
});

test('resolves and returns the connected database name, matching the explicit target', async () => {
  const result = await preflightMain();
  await ensureConnected();
  assert.equal(result.dbName, 'vyoma_2_0_test');
});

test('still enforces the full database-target guard: missing MIGRATION_TARGET_CONFIRM rejects before any connection', async () => {
  delete process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR];
  await assert.rejects(() => preflightMain(), /explicitly confirm/);
  process.env[MIGRATION_TARGET_CONFIRM_ENV_VAR] = 'vyoma_2_0_test';
  await ensureConnected();
});
