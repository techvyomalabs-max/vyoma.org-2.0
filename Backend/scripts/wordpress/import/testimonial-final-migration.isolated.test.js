// QA Bug 19 — Stage 7 (+ focused safety corrections): genuinely isolated,
// zero-DB-connection coverage for testimonial-final-migration.mjs's own
// write-path functions AND its full orchestrateMigration() orchestration.
// Same established pattern as
// Backend/src/modules/content/content.admin.controller.isolated.test.js:
// the real, unmodified exported functions are called directly, with only
// ContentModel / ContentRevisionModel / AuditLogModel / mongoose.startSession
// replaced via node:test's built-in `t.mock.method()` — no mongoose
// connection, no real session, no network activity of any kind. A tiny
// in-memory fake store stands in for the actual MongoDB collection so that
// a mocked write is reflected in a later mocked read within the SAME test,
// exactly like a real database would behave within one transaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mongoose from 'mongoose';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { ContentRevisionModel } from '../../../src/modules/content/contentRevision.model.js';
import { AuditLogModel } from '../../../src/modules/audit/auditLog.model.js';
import {
  performGuardedWrites,
  verifyWritesWithinSession,
  verifyBaselineWithinSession,
  createMigrationRevisionInSession,
  createMigrationAuditLogInSession,
  orchestrateMigration,
  EXPECTED_MANIFEST_SHA256,
} from './testimonial-final-migration.mjs';
import {
  EXPECTED_DEMO_TESTIMONIALS_ALL,
  EXPECTED_DEMO_TESTIMONIALS_FEATURED,
  EXPECTED_DEMO_HOME_TESTIMONIALS,
  COMMIT_CONFIRMATION_PHRASE,
  EXPECTED_TARGET_DB_NAME,
  EXPECTED_ATLAS_CLUSTER_HOST,
  EXPECTED_RESTORE_CHECK_DB_NAME,
  computeBaselineFingerprint,
  sha256File,
} from '../../../src/modules/content/testimonialMigrationLogic.mjs';

const fakeSession = {};

// =====================================================================
// performGuardedWrites() — now guarded by `updatedAt` (see the script's own
// header comment on why `__v` alone is not reliable across every write path).
// =====================================================================
test('performGuardedWrites applies every write when every guarded filter matches (no stale document)', async (t) => {
  const calls = [];
  const u = new Date('2026-01-01T00:00:00.000Z');
  t.mock.method(ContentModel, 'findOneAndUpdate', async (filter, update) => {
    calls.push({ filter, update });
    return { _id: filter._id }; // simulate a successful match+update
  });

  const writes = [
    { type: 'pages/media', before: { _id: 'm1', updatedAt: u }, nextData: { TESTIMONIALS_ALL: ['a'] } },
    { type: 'media', before: { _id: 'm2', updatedAt: u }, nextData: { TESTIMONIALS_ALL: ['a'] } },
    { type: 'pages/home', before: { _id: 'h1', updatedAt: u }, nextData: { HOME_TESTIMONIALS: ['b'] } },
  ];
  await performGuardedWrites(fakeSession, writes);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].filter, { _id: 'm1', updatedAt: u });
  assert.deepEqual(calls[0].update, { $set: { data: { TESTIMONIALS_ALL: ['a'] } }, $inc: { __v: 1 } });
  assert.deepEqual(calls[2].filter, { _id: 'h1', updatedAt: u });
});

test('performGuardedWrites refuses an unguarded write when the baseline has no updatedAt at all', async () => {
  await assert.rejects(
    () => performGuardedWrites(fakeSession, [{ type: 'pages/media', before: { _id: 'm1' }, nextData: {} }]),
    /missing a baseline updatedAt timestamp/
  );
});

// --- 20 / 21. Stale baseline / concurrent update rejection + transaction abort ---
test('performGuardedWrites throws (aborting the transaction) when a guarded filter matches nothing — a stale/concurrent change', async (t) => {
  const u = new Date();
  t.mock.method(ContentModel, 'findOneAndUpdate', async (filter) => (filter._id === 'm1' ? null : { _id: filter._id }));

  await assert.rejects(
    () =>
      performGuardedWrites(fakeSession, [
        { type: 'pages/media', before: { _id: 'm1', updatedAt: u }, nextData: { TESTIMONIALS_ALL: ['a'] } },
        { type: 'media', before: { _id: 'm2', updatedAt: u }, nextData: { TESTIMONIALS_ALL: ['a'] } },
      ]),
    /Guarded update rejected for "pages\/media".*stale baseline \/ concurrent update/
  );
});

test('performGuardedWrites stops at the first failing write and never attempts the remaining ones', async (t) => {
  const u = new Date();
  const attempted = [];
  t.mock.method(ContentModel, 'findOneAndUpdate', async (filter) => {
    attempted.push(filter._id);
    return null; // every write fails
  });

  await assert.rejects(() =>
    performGuardedWrites(fakeSession, [
      { type: 'pages/media', before: { _id: 'm1', updatedAt: u }, nextData: {} },
      { type: 'media', before: { _id: 'm2', updatedAt: u }, nextData: {} },
      { type: 'pages/home', before: { _id: 'h1', updatedAt: u }, nextData: {} },
    ])
  );
  assert.deepEqual(attempted, ['m1']);
});

// =====================================================================
// verifyWritesWithinSession() / createMigrationRevisionInSession() /
// createMigrationAuditLogInSession() — isolated, direct unit coverage.
// =====================================================================
test('verifyWritesWithinSession passes when the re-read data matches the intended payload', async (t) => {
  t.mock.method(ContentModel, 'findOne', () => ({ session: () => ({ lean: async () => ({ data: { x: 1 } }) }) }));
  await assert.doesNotReject(() => verifyWritesWithinSession(fakeSession, [{ type: 'pages/media', before: { _id: 'm1' }, nextData: { x: 1 } }]));
});
test('verifyWritesWithinSession throws (pre-commit) when the re-read data does NOT match the intended payload', async (t) => {
  t.mock.method(ContentModel, 'findOne', () => ({ session: () => ({ lean: async () => ({ data: { x: 'WRONG' } }) }) }));
  await assert.rejects(
    () => verifyWritesWithinSession(fakeSession, [{ type: 'pages/media', before: { _id: 'm1' }, nextData: { x: 1 } }]),
    /Pre-commit verification failed for "pages\/media"/
  );
});

test('createMigrationRevisionInSession creates a version = last+1, action:"migration" row and throws if creation fails', async (t) => {
  t.mock.method(ContentRevisionModel, 'findOne', () => ({ sort: () => ({ session: () => ({ lean: async () => ({ version: 4 }) }) }) }));
  let createdWith = null;
  t.mock.method(ContentRevisionModel, 'create', async (docs) => {
    createdWith = docs[0];
    return [{ _id: 'rev1', ...docs[0] }];
  });
  await createMigrationRevisionInSession(fakeSession, { contentType: 'pages/media', data: { x: 1 }, scriptName: 's.mjs' });
  assert.equal(createdWith.version, 5);
  assert.equal(createdWith.action, 'migration');
});
test('createMigrationRevisionInSession throws if ContentRevisionModel.create returns nothing', async (t) => {
  t.mock.method(ContentRevisionModel, 'findOne', () => ({ sort: () => ({ session: () => ({ lean: async () => null }) }) }));
  t.mock.method(ContentRevisionModel, 'create', async () => []);
  await assert.rejects(() => createMigrationRevisionInSession(fakeSession, { contentType: 'pages/media', data: {}, scriptName: 's.mjs' }), /Failed to create a migration revision row/);
});
test('createMigrationAuditLogInSession throws if AuditLogModel.create returns nothing (deliberately NOT fire-and-forget, unlike recordAudit)', async (t) => {
  t.mock.method(AuditLogModel, 'create', async () => []);
  await assert.rejects(() => createMigrationAuditLogInSession(fakeSession, { action: 'x', targetType: 'Content', targetId: 'y' }), /Failed to create the migration audit log entry/);
});

// --- Holistic in-transaction baseline re-verification (content + draft + identity + metadata) ---
test('verifyBaselineWithinSession passes when the in-session re-read fingerprint exactly matches', async (t) => {
  const docs = { pagesMediaDoc: { _id: 'm1', data: { a: 1 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 }, mediaDoc: { _id: 'm2', data: { a: 1 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 }, pagesHomeDoc: { _id: 'h1', data: { b: 2 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 } };
  t.mock.method(ContentModel, 'findOne', (filter) => ({ session: () => ({ lean: async () => (filter.type === 'pages/media' ? docs.pagesMediaDoc : filter.type === 'media' ? docs.mediaDoc : docs.pagesHomeDoc) }) }));
  const expected = computeBaselineFingerprint(docs);
  await assert.doesNotReject(() => verifyBaselineWithinSession(fakeSession, expected));
});
test('verifyBaselineWithinSession throws when the in-session re-read no longer matches (content/identity/metadata changed)', async (t) => {
  const docs = { pagesMediaDoc: { _id: 'm1', data: { a: 1 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 }, mediaDoc: { _id: 'm2', data: { a: 1 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 }, pagesHomeDoc: { _id: 'h1', data: { b: 2 }, draftData: null, status: 'published', updatedAt: new Date('2026-01-01'), __v: 0 } };
  const expected = computeBaselineFingerprint(docs);
  // Simulate a change that happened between the outside-transaction read and this in-session re-read.
  const changedHome = { ...docs.pagesHomeDoc, data: { b: 'CHANGED' } };
  t.mock.method(ContentModel, 'findOne', (filter) => ({ session: () => ({ lean: async () => (filter.type === 'pages/media' ? docs.pagesMediaDoc : filter.type === 'media' ? docs.mediaDoc : changedHome) }) }));
  await assert.rejects(() => verifyBaselineWithinSession(fakeSession, expected), /Baseline re-verification failed WITHIN the transaction/);
});

// =====================================================================
// orchestrateMigration() — the full DB-touching orchestration, exercised
// against a tiny in-memory fake store (not a real/mocked network call).
// =====================================================================
function freshBaseline() {
  const mediaData = { NEWS: 'x', TESTIMONIALS_ALL: EXPECTED_DEMO_TESTIMONIALS_ALL, TESTIMONIALS_FEATURED: EXPECTED_DEMO_TESTIMONIALS_FEATURED };
  const u = new Date('2026-01-01T00:00:00.000Z');
  return {
    'pages/media': { _id: 'm1', type: 'pages/media', data: mediaData, draftData: null, status: 'published', updatedAt: u, __v: 0 },
    media: { _id: 'm2', type: 'media', data: { ...mediaData }, draftData: null, status: 'published', updatedAt: u, __v: 0 },
    'pages/home': { _id: 'h1', type: 'pages/home', data: { HERO: 'x', HOME_TESTIMONIALS: EXPECTED_DEMO_HOME_TESTIMONIALS }, draftData: null, status: 'published', updatedAt: u, __v: 0 },
  };
}

function minimalPayload() {
  const all = Array.from({ length: 86 }, (_, i) => {
    const type = i < 65 ? 'text' : i < 67 ? 'video' : 'image';
    const base = { id: `t-${i}`, sourceId: `s-${i}`, type, category: 'learner', active: true };
    return type === 'text' ? { ...base, quote: 'q' } : type === 'video' ? { ...base, url: 'https://res.cloudinary.com/x/video/upload/v.mp4' } : { ...base, testimonialImage: { url: 'https://vyoma.org/x.jpg' } };
  });
  return {
    TESTIMONIALS_ALL: all,
    HOME_TESTIMONIALS: Array.from({ length: 7 }, (_, i) => ({ id: `t-${i}`, sourceId: `s-${i}`, type: 'text', category: 'other', quote: 'q', active: true })),
    TESTIMONIALS_FEATURED: Array.from({ length: 3 }, (_, i) => ({ id: `t-${i}`, sourceId: `s-${i}`, type: 'text', category: 'other', quote: 'q', active: true })),
  };
}

// A minimal, self-contained in-memory fake of exactly the ContentModel
// surface orchestrateMigration() calls, so a mocked write is visible to a
// later mocked read WITHIN the same test — never a real database.
function installFakeStore(t, byType) {
  const fakeQuery = (value) => ({ lean: async () => value, session: () => fakeQuery(value) });
  t.mock.method(ContentModel, 'countDocuments', async ({ type }) => (byType[type] ? 1 : 0));
  t.mock.method(ContentModel, 'findOne', (filter) => {
    if (filter.type) return fakeQuery(byType[filter.type] ? { ...byType[filter.type] } : null);
    const doc = Object.values(byType).find((d) => d._id === filter._id);
    return fakeQuery(doc ? { ...doc } : null);
  });
  t.mock.method(ContentModel, 'findOneAndUpdate', async (filter, update) => {
    const entry = Object.entries(byType).find(([, d]) => d._id === filter._id);
    if (!entry) return null;
    const [type, doc] = entry;
    if (String(doc.updatedAt) !== String(filter.updatedAt)) return null; // stale
    byType[type] = { ...doc, data: update.$set.data, __v: doc.__v + 1 };
    return { ...byType[type] };
  });
  t.mock.method(ContentRevisionModel, 'findOne', () => ({ sort: () => ({ session: () => ({ lean: async () => null }) }) }));
  t.mock.method(ContentRevisionModel, 'find', () => ({ sort: () => ({ skip: () => ({ select: () => ({ lean: async () => [] }) }) }) }));
  t.mock.method(ContentRevisionModel, 'create', async (docs) => docs.map((d, i) => ({ _id: `rev-${i}`, ...d })));
  // Simulates every migration-created revision surviving post-commit pruning
  // (the structurally-guaranteed case — see the script's own comment on why).
  t.mock.method(ContentRevisionModel, 'countDocuments', async (filter) => filter?._id?.$in?.length ?? 0);
  t.mock.method(AuditLogModel, 'create', async (docs) => docs.map((d, i) => ({ _id: `audit-${i}`, ...d })));
  t.mock.method(mongoose, 'startSession', async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tml-orch-'));
}

function writeFullEvidence(baselineFingerprint) {
  const dir = tmpDir();
  // A small but COMPLETE 2-collection inventory (name not hardcoded to any
  // real collection count/list — see the logic module's own comment on why).
  const files = {
    'contents.bson': 'fake contents bson',
    'contents.metadata.json': '{}',
    'contentrevisions.bson': 'fake contentrevisions bson',
    'contentrevisions.metadata.json': '{}',
  };
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  const restoreReportFile = path.join(dir, 'restore-report.txt');
  const dryRunReportFile = path.join(dir, 'dryrun-report.txt');
  fs.writeFileSync(restoreReportFile, 'Restore verification: SUCCESS');
  fs.writeFileSync(
    dryRunReportFile,
    `DRY-RUN complete: no writes were made.\nmanifestSha256=${EXPECTED_MANIFEST_SHA256}\nbaselineFingerprint=${baselineFingerprint}\n`
  );
  const t0 = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const t1 = new Date('2026-01-01T01:00:00.000Z').toISOString();
  const t2 = new Date('2026-01-01T02:00:00.000Z').toISOString();
  const collections = [
    { name: 'contents', bsonFile: { path: 'contents.bson', sha256: sha256File(path.join(dir, 'contents.bson')) }, metadataFile: { path: 'contents.metadata.json', sha256: sha256File(path.join(dir, 'contents.metadata.json')) } },
    { name: 'contentrevisions', bsonFile: { path: 'contentrevisions.bson', sha256: sha256File(path.join(dir, 'contentrevisions.bson')) }, metadataFile: { path: 'contentrevisions.metadata.json', sha256: sha256File(path.join(dir, 'contentrevisions.metadata.json')) } },
  ];
  const evidence = {
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    baselineFingerprint,
    operatorConfirmation: COMMIT_CONFIRMATION_PHRASE,
    target: { dbName: EXPECTED_TARGET_DB_NAME, clusterHost: EXPECTED_ATLAS_CLUSTER_HOST },
    backup: { completedAt: t0, dbName: EXPECTED_TARGET_DB_NAME, dumpDir: dir, collections },
    restoreCheck: {
      completedAt: t1,
      outcome: 'success',
      databaseName: EXPECTED_RESTORE_CHECK_DB_NAME,
      backupIdentityUsed: dir,
      verifiedCollections: collections.map((c) => c.name),
      reportPath: restoreReportFile,
      reportSha256: sha256File(restoreReportFile),
    },
    dryRun: { completedAt: t2, result: 'PASS', reportPath: dryRunReportFile, reportSha256: sha256File(dryRunReportFile) },
  };
  const evidencePath = path.join(dir, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  return { evidencePath, dir };
}

// --- Default dry run: zero mutations, no revisions/audit, no transaction start ---
test('orchestrateMigration (dry run): zero DB mutations, zero revisions/audit, mongoose.startSession never called', async (t) => {
  const byType = freshBaseline();
  installFakeStore(t, byType);
  const updateCalls = ContentModel.findOneAndUpdate.mock;
  const revisionCalls = ContentRevisionModel.create.mock;
  const auditCalls = AuditLogModel.create.mock;
  const sessionCalls = mongoose.startSession.mock;
  const reportDir = tmpDir();

  const result = await orchestrateMigration({ commit: false, payload: minimalPayload(), manifestSha256: EXPECTED_MANIFEST_SHA256, reportDir, log: [] });

  assert.equal(result.outcome, 'dry-run');
  assert.equal(updateCalls.callCount(), 0);
  assert.equal(revisionCalls.callCount(), 0);
  assert.equal(auditCalls.callCount(), 0);
  assert.equal(sessionCalls.callCount(), 0);
  assert.ok(fs.existsSync(result.reportPath));
});

// --- Blocked baseline: zero mutations ---------------------------------------
test('orchestrateMigration: a blocked baseline (pending draft) performs zero mutations', async (t) => {
  const byType = freshBaseline();
  byType['media'].draftData = { x: true };
  installFakeStore(t, byType);
  const result = await orchestrateMigration({ commit: false, payload: minimalPayload(), manifestSha256: EXPECTED_MANIFEST_SHA256, reportDir: tmpDir(), log: [] });
  assert.equal(result.outcome, 'blocked');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0);
});

// --- Missing/invalid commit evidence: zero mutations ------------------------
test('orchestrateMigration (commit): missing evidence file performs zero mutations', async (t) => {
  const byType = freshBaseline();
  installFakeStore(t, byType);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath: '/no/such/evidence.json',
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'missing-evidence');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0);
});
test('orchestrateMigration (commit): invalid/mismatched evidence performs zero mutations', async (t) => {
  const byType = freshBaseline();
  installFakeStore(t, byType);
  const evidenceDir = tmpDir();
  const evidencePath = path.join(evidenceDir, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify({ manifestSha256: 'wrong-hash' }));
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'invalid-evidence');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0);
});

// --- Failed pre-change backup: zero mutations -------------------------------
test('orchestrateMigration (commit): a pre-change snapshot write failure performs zero mutations', async (t) => {
  const byType = freshBaseline();
  installFakeStore(t, byType);
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  const { evidencePath } = writeFullEvidence(fingerprint);
  // A FILE (not a directory) as the snapshot dir makes fs.mkdirSync fail naturally.
  const notADirectory = path.join(tmpDir(), 'this-is-a-file');
  fs.writeFileSync(notADirectory, 'x');
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: notADirectory,
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'backup-failed');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0);
  assert.equal(ContentRevisionModel.create.mock.callCount(), 0);
  assert.equal(AuditLogModel.create.mock.callCount(), 0);
});

// --- Concurrent changes abort the transaction -------------------------------
test('orchestrateMigration (commit): a concurrent change detected mid-write aborts the whole transaction, zero revisions/audit', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  // Simulate a concurrent change to "media" right before the guarded write runs.
  t.mock.method(ContentModel, 'findOneAndUpdate', async (filter) => (filter._id === 'm2' ? null : { _id: filter._id }));
  const { evidencePath } = writeFullEvidence(fingerprint);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'transaction-aborted');
  assert.ok(result.errors.some((e) => /stale baseline \/ concurrent update/.test(e)));
  assert.equal(ContentRevisionModel.create.mock.callCount(), 0);
  assert.equal(AuditLogModel.create.mock.callCount(), 0);
});

// --- The holistic in-transaction fingerprint re-check catches a change the ---
// --- per-document updatedAt guard alone would miss ---------------------------
test('orchestrateMigration (commit): a concurrent content change with an (unrealistically) unchanged updatedAt is still caught by the in-transaction baseline re-check', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  // Mutate "pages/home"'s content directly (out-of-band), WITHOUT touching
  // its updatedAt/__v, simulating the exact gap this holistic check exists
  // to close — performGuardedWrites' own updatedAt-based guard would NOT
  // notice this by itself.
  t.mock.method(mongoose, 'startSession', async () => ({
    withTransaction: async (fn) => {
      byType['pages/home'].data = { ...byType['pages/home'].data, HOME_TESTIMONIALS: ['TAMPERED_OUT_OF_BAND'] };
      return fn();
    },
    endSession: async () => {},
  }));
  const { evidencePath } = writeFullEvidence(fingerprint);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'transaction-aborted');
  assert.ok(result.errors.some((e) => /Baseline re-verification failed WITHIN the transaction/.test(e)));
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0); // never even reached the guarded write
  assert.equal(ContentRevisionModel.create.mock.callCount(), 0);
  assert.equal(AuditLogModel.create.mock.callCount(), 0);
});

// --- Revision/audit failures abort the transaction --------------------------
test('orchestrateMigration (commit): a revision-creation failure aborts the transaction before any audit write', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  t.mock.method(ContentRevisionModel, 'create', async () => { throw new Error('simulated revision write failure'); });
  const { evidencePath } = writeFullEvidence(fingerprint);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'transaction-aborted');
  assert.ok(result.errors.some((e) => /simulated revision write failure/.test(e)));
  assert.equal(AuditLogModel.create.mock.callCount(), 0);
});
test('orchestrateMigration (commit): an audit-write failure aborts the transaction (deliberately, unlike ordinary fire-and-forget audit logging)', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  t.mock.method(AuditLogModel, 'create', async () => { throw new Error('simulated audit write failure'); });
  const { evidencePath } = writeFullEvidence(fingerprint);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'transaction-aborted');
  assert.ok(result.errors.some((e) => /simulated audit write failure/.test(e)));
});

// --- Post-update verification failure BEFORE commit aborts the transaction ---
test('orchestrateMigration (commit): pre-commit verification failure aborts before commit (never reported as success)', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  // Make the in-session re-read (verifyWritesWithinSession) see something
  // OTHER than what was just written, without touching the guarded write itself.
  const realFindOne = ContentModel.findOne;
  let sessionReadCount = 0;
  t.mock.method(ContentModel, 'findOne', (filter) => {
    if (filter._id) {
      sessionReadCount += 1;
      return { session: () => ({ lean: async () => ({ data: { TAMPERED: true } }) }) };
    }
    return realFindOne.call(ContentModel, filter);
  });
  const { evidencePath } = writeFullEvidence(fingerprint);
  const result = await orchestrateMigration({
    commit: true,
    payload: minimalPayload(),
    manifestSha256: EXPECTED_MANIFEST_SHA256,
    evidencePath,
    preChangeBackupDir: tmpDir(),
    reportDir: tmpDir(),
    log: [],
  });
  assert.equal(result.outcome, 'transaction-aborted');
  assert.ok(result.errors.some((e) => /Pre-commit verification failed/.test(e)));
  assert.ok(sessionReadCount > 0);
});

// --- Already-migrated execution is a true no-op -----------------------------
test('orchestrateMigration: an already-fully-migrated baseline is a true no-op (zero mutations, zero revisions/audit)', async (t) => {
  const payload = minimalPayload();
  const byType = freshBaseline();
  const mediaData = { NEWS: 'x', TESTIMONIALS_ALL: payload.TESTIMONIALS_ALL, TESTIMONIALS_FEATURED: payload.TESTIMONIALS_FEATURED };
  byType['pages/media'].data = mediaData;
  byType.media.data = { ...mediaData };
  byType['pages/home'].data = { HERO: 'x', HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS };
  installFakeStore(t, byType);
  const result = await orchestrateMigration({ commit: true, payload, manifestSha256: EXPECTED_MANIFEST_SHA256, evidencePath: '/irrelevant', preChangeBackupDir: tmpDir(), reportDir: tmpDir(), log: [] });
  assert.equal(result.outcome, 'noop');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 0);
  assert.equal(ContentRevisionModel.create.mock.callCount(), 0);
  assert.equal(AuditLogModel.create.mock.callCount(), 0);
});

// --- Partial migration remains blocked --------------------------------------
test('orchestrateMigration: a partially-migrated state remains blocked, never auto-completed', async (t) => {
  const payload = minimalPayload();
  const byType = freshBaseline();
  byType['pages/home'].data = { HERO: 'x', HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS }; // home migrated, media not
  installFakeStore(t, byType);
  const result = await orchestrateMigration({ commit: false, payload, manifestSha256: EXPECTED_MANIFEST_SHA256, reportDir: tmpDir(), log: [] });
  assert.equal(result.outcome, 'blocked');
  assert.ok(result.errors.some((e) => /Partial migration state detected/.test(e)));
});

// --- Successful planned replacement: full happy-path commit -----------------
test('orchestrateMigration (commit): a correct, fully-evidenced commit succeeds, writes all 3 docs + 3 revisions + 1 audit entry, and verifies post-write', async (t) => {
  const byType = freshBaseline();
  const fingerprint = computeBaselineFingerprint({ pagesMediaDoc: byType['pages/media'], mediaDoc: byType.media, pagesHomeDoc: byType['pages/home'] });
  installFakeStore(t, byType);
  const { evidencePath } = writeFullEvidence(fingerprint);
  const payload = minimalPayload();
  const result = await orchestrateMigration({ commit: true, payload, manifestSha256: EXPECTED_MANIFEST_SHA256, evidencePath, preChangeBackupDir: tmpDir(), reportDir: tmpDir(), log: [] });
  assert.equal(result.outcome, 'committed');
  assert.equal(ContentModel.findOneAndUpdate.mock.callCount(), 3);
  assert.equal(ContentRevisionModel.create.mock.callCount(), 3);
  assert.equal(AuditLogModel.create.mock.callCount(), 1);
  assert.deepEqual(byType['pages/media'].data.TESTIMONIALS_ALL, payload.TESTIMONIALS_ALL);
  assert.deepEqual(byType.media.data.TESTIMONIALS_ALL, payload.TESTIMONIALS_ALL);
  assert.deepEqual(byType['pages/home'].data.HOME_TESTIMONIALS, payload.HOME_TESTIMONIALS);
});
