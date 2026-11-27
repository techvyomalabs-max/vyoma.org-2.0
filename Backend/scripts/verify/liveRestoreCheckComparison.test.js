// QA Bug 19 — Stage 9.8B.1: offline-only regression tests for
// liveRestoreCheckComparison.mjs. Standalone (node --test on this one
// file), same convention as atlasReadOnlyConnectionCheck.test.mjs --
// not wired into the permanent `npm test` glob. No real or dummy network
// connection is ever opened: every "connection" in these tests is either
// a mocked `mongoose.connect`/`mongoose.disconnect`, or a hand-built fake
// `db` object with the same method shapes the native MongoDB driver's Db
// object exposes, passed directly to the exported fetch functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { serialize, ObjectId, Int32, Double, Long, Decimal128, Binary, Timestamp } from 'bson';
import {
  APPROVED_LIVE_TARGET_USERNAME,
  BSON_PRESERVING_OPTIONS,
  assertApprovedLiveTargetConfiguration,
  validateBackupsOffline,
  parseBsonFileDocuments,
  canonicalIdKey,
  buildDocumentInventory,
  compareBsonValues,
  compareDocuments,
  compareDocumentInventories,
  normalizeIndexDefinition,
  compareIndexDefinitions,
  formatBlockingIndexDiagnostics,
  compareCollectionOptions,
  normalizeUuidToHex,
  compareCollectionUuids,
  parseBackupMetadata,
  fetchLiveCollectionsMetadata,
  fetchLiveIndexes,
  fetchAllDocumentsViaCursor,
  connectReadOnly,
  disconnectReadOnly,
  runLiveRestoreCheckComparison,
  runPostRestoreVerification,
  runPostRecoveryVerification,
  EXIT_MATCH,
  EXIT_MISMATCH,
  EXIT_INCOMPLETE,
} from './liveRestoreCheckComparison.mjs';
import { finalizeVerifiedBackup, PRESERVATION_SOURCE_DB_NAME } from '../backup/restoreCheckPreservationBackup.mjs';
import { finalizeVerifiedTestBackup } from '../backup/backupDatabase.mjs';
import { BACKUP_SOURCE_DB_NAME, APPROVED_RESTORE_CLUSTER_HOST, ALLOWED_RESTORE_TARGET_DB_NAMES } from '../backup/protectedDbGuard.mjs';

const SOURCE = fs.readFileSync(new URL('./liveRestoreCheckComparison.mjs', import.meta.url), 'utf8');
const CODE_ONLY = SOURCE.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const RESTORE_TARGET_URI = `mongodb+srv://${APPROVED_LIVE_TARGET_USERNAME}:dummy-secret-password@${APPROVED_RESTORE_CLUSTER_HOST}/vyoma_2_0_test_restore_check`;

// Deterministic per-collection-name fixture uuid (32 lowercase hex chars,
// matching the REAL format confirmed by inspecting this project's actual
// preservation backup metadata.json files) -- lets a test build a matching
// "live" uuid for the MATCH case, or a deliberately different one for the
// mismatch case, without needing a real BSON Binary.
function fixtureUuidFor(name) {
  return crypto.createHash('md5').update(name).digest('hex');
}

function buildFixtureDump(restorePath, { collections = ['alpha'], docsPerCollection = 2 } = {}) {
  fs.mkdirSync(restorePath, { recursive: true });
  for (const name of collections) {
    const docs = Array.from({ length: docsPerCollection }, (_, i) => ({ _id: new ObjectId(), n: i }));
    fs.writeFileSync(path.join(restorePath, `${name}.bson`), Buffer.concat(docs.map((d) => serialize(d))));
    fs.writeFileSync(
      path.join(restorePath, `${name}.metadata.json`),
      JSON.stringify({ options: {}, indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }], uuid: fixtureUuidFor(name), collectionName: name, type: 'collection' })
    );
  }
  fs.writeFileSync(path.join(restorePath, 'prelude.json'), JSON.stringify({ ServerVersion: '8.0.0', ToolVersion: '100.20.1' }));
}

// =============================================================================
// Pre-connection configuration validation -- pure string parsing, no network
// =============================================================================
test('assertApprovedLiveTargetConfiguration accepts the exact approved username/host/database', () => {
  const r = assertApprovedLiveTargetConfiguration(RESTORE_TARGET_URI);
  assert.equal(r.username, APPROVED_LIVE_TARGET_USERNAME);
});
test('assertApprovedLiveTargetConfiguration rejects the protected database name before anything else', () => {
  assert.throws(() => assertApprovedLiveTargetConfiguration('mongodb://127.0.0.1:27017/vyoma_migration_dryrun'), /protected list/);
});
test('assertApprovedLiveTargetConfiguration rejects the wrong cluster host', () => {
  const uri = `mongodb+srv://${APPROVED_LIVE_TARGET_USERNAME}:p@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test_restore_check`;
  assert.throws(() => assertApprovedLiveTargetConfiguration(uri), /resolves to cluster host/);
});
test('assertApprovedLiveTargetConfiguration rejects a non-allowlisted target database', () => {
  const uri = `mongodb+srv://${APPROVED_LIVE_TARGET_USERNAME}:p@${APPROVED_RESTORE_CLUSTER_HOST}/vyoma_2_0_test`;
  assert.throws(() => assertApprovedLiveTargetConfiguration(uri));
});
test('assertApprovedLiveTargetConfiguration rejects the wrong username, and the error explicitly states the credential is readWrite, not IAM-enforced read-only', () => {
  const uri = `mongodb+srv://someone_else:p@${APPROVED_RESTORE_CLUSTER_HOST}/vyoma_2_0_test_restore_check`;
  assert.throws(() => assertApprovedLiveTargetConfiguration(uri), (err) => {
    assert.match(err.message, /does not match the one approved/);
    assert.match(err.message, /readWrite permissions/);
    assert.match(err.message, /NOT an IAM-enforced read-only credential/);
    assert.ok(!err.message.includes(uri), 'error must never contain the raw URI');
    return true;
  });
});

// =============================================================================
// Mandatory offline backup verification
// =============================================================================
test('validateBackupsOffline: accepts two genuinely finalized, valid backups', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-offline-valid-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const result = validateBackupsOffline({ preservationRestorePath: presRestorePath, freshTestRestorePath: testRestorePath });
    assert.equal(result.ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateBackupsOffline: rejects when the preservation backup manifest is invalid (missing)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-offline-badpres-'));
  try {
    const presRestorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] }); // never finalized

    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const result = validateBackupsOffline({ preservationRestorePath: presRestorePath, freshTestRestorePath: testRestorePath });
    assert.equal(result.ok, false);
    assert.equal(result.preservation.ok, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// BSON-aware comparison: types, null/missing, array order, nested docs
// =============================================================================
test('compareBsonValues: Int32 vs Double with the same numeric value are NOT equal (type preserved, not promoted)', () => {
  const r = compareBsonValues(new Int32(5), new Double(5));
  assert.equal(r.equal, false);
  assert.equal(r.unsupported, false);
});
test('compareBsonValues: Long vs Int32 with the same numeric value are NOT equal', () => {
  const r = compareBsonValues(Long.fromNumber(5), new Int32(5));
  assert.equal(r.equal, false);
});
test('compareBsonValues: Decimal128 compares by canonical string value', () => {
  const a = Decimal128.fromString('10.50');
  const b = Decimal128.fromString('10.50');
  const c = Decimal128.fromString('10.51');
  assert.equal(compareBsonValues(a, b).equal, true);
  assert.equal(compareBsonValues(a, c).equal, false);
});
test('compareBsonValues: ObjectId vs a same-looking plain string are NOT equal', () => {
  const oid = new ObjectId();
  const r = compareBsonValues(oid, oid.toHexString());
  assert.equal(r.equal, false);
  assert.equal(r.unsupported, false);
});
test('compareDocuments: null value vs a genuinely MISSING field are NOT equal', () => {
  const r = compareDocuments({ a: 1, b: null }, { a: 1 });
  assert.equal(r.equal, false);
});
test('compareDocuments: two null values ARE equal', () => {
  const r = compareDocuments({ a: 1, b: null }, { a: 1, b: null });
  assert.equal(r.equal, true);
});
test('compareBsonValues: array element order matters -- reordered elements are NOT equal, and arrays are never sorted', () => {
  const r = compareBsonValues([1, 2, 3], [3, 2, 1]);
  assert.equal(r.equal, false);
});
test('compareDocuments: field order matters -- same keys/values in a different order are NOT equal', () => {
  const r = compareDocuments({ a: 1, b: 2 }, { b: 2, a: 1 });
  assert.equal(r.equal, false);
});
test('compareDocuments: nested documents and arrays-of-documents compare recursively and type-aware', () => {
  const a = { outer: { inner: new Int32(5), list: [{ x: 1 }, { x: 2 }] } };
  const b = { outer: { inner: new Int32(5), list: [{ x: 1 }, { x: 2 }] } };
  const c = { outer: { inner: new Double(5), list: [{ x: 1 }, { x: 2 }] } };
  assert.equal(compareDocuments(a, b).equal, true);
  assert.equal(compareDocuments(a, c).equal, false);
});
test('compareBsonValues: an unrecognized BSON type tag is reported as unsupported, never silently equal or unequal', () => {
  const fakeBsonType = { _bsontype: 'BSONRegExp', pattern: 'x' };
  const r = compareBsonValues(fakeBsonType, fakeBsonType);
  assert.equal(r.unsupported, true);
});

// =============================================================================
// Canonical identity keying and full inventory diffing
// =============================================================================
test('canonicalIdKey: ObjectId and a same-looking string never collide', () => {
  const oid = new ObjectId();
  const a = canonicalIdKey(oid);
  const b = canonicalIdKey(oid.toHexString());
  assert.notEqual(a.key, b.key);
});
test('canonicalIdKey: an unsupported _id type (unrecognized bsontype) is reported, never guessed', () => {
  const r = canonicalIdKey({ _bsontype: 'MinKey' });
  assert.equal(r.supported, false);
});
test('buildDocumentInventory: detects a duplicate canonical identity within one list', () => {
  const oid = new ObjectId();
  const inv = buildDocumentInventory([{ _id: oid, n: 1 }, { _id: oid, n: 2 }]);
  assert.equal(inv.duplicates.length, 1);
});
test('compareDocumentInventories: missing document (in backup, not live)', () => {
  const oid1 = new ObjectId();
  const oid2 = new ObjectId();
  const result = compareDocumentInventories([{ _id: oid1 }, { _id: oid2 }], [{ _id: oid1 }]);
  assert.equal(result.incomplete, false);
  assert.equal(result.missingCount, 1);
  assert.equal(result.matches, false);
});
test('compareDocumentInventories: additional document (in live, not backup)', () => {
  const oid1 = new ObjectId();
  const oid2 = new ObjectId();
  const result = compareDocumentInventories([{ _id: oid1 }], [{ _id: oid1 }, { _id: oid2 }]);
  assert.equal(result.additionalCount, 1);
  assert.equal(result.matches, false);
});
test('compareDocumentInventories: modified document content with UNCHANGED total document count', () => {
  const oid1 = new ObjectId();
  const oid2 = new ObjectId();
  const result = compareDocumentInventories(
    [{ _id: oid1, v: new Int32(1) }, { _id: oid2, v: new Int32(2) }],
    [{ _id: oid1, v: new Int32(1) }, { _id: oid2, v: new Int32(999) }]
  );
  assert.equal(result.totalBackup, result.totalLive);
  assert.equal(result.modifiedCount, 1);
  assert.equal(result.matches, false);
});
test('compareDocumentInventories: an unsupported _id anywhere forces an incomplete result, never a confident pass or fail', () => {
  const result = compareDocumentInventories([{ _id: { _bsontype: 'MinKey' } }], []);
  assert.equal(result.incomplete, true);
});

// =============================================================================
// Index and collection-metadata comparison
// =============================================================================
test('compareIndexDefinitions: compound index KEY ORDER difference is a mismatch (not sorted away)', () => {
  const backupIdx = [{ v: 2, name: 'compound_1', key: { a: 1, b: -1 } }];
  const liveIdx = [{ v: 2, name: 'compound_1', key: { b: -1, a: 1 } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, false);
  assert.deepEqual(result.modified, ['compound_1']);
});
test('compareIndexDefinitions: an index version (`v`) difference, with everything else identical, is a BLOCKING discrepancy, never silently discarded (QA Bug 19 Stage 9.8B.2A)', () => {
  const backupIdx = [{ v: 1, name: 'x_1', key: { x: 1 } }];
  const liveIdx = [{ v: 2, name: 'x_1', key: { x: 1 } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, false);
  assert.deepEqual(result.versionDifferences, ['x_1']);
  assert.deepEqual(result.modified, [], 'the key/name/options equality check itself must still pass -- only the separate version check fails');
});
test('compareIndexDefinitions: a matching index version produces no version difference', () => {
  const backupIdx = [{ v: 2, name: 'x_1', key: { x: 1 } }];
  const liveIdx = [{ v: 2, name: 'x_1', key: { x: 1 } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.deepEqual(result.versionDifferences, []);
  assert.equal(result.matches, true);
});
test('compareIndexDefinitions: the SAME unrecognized BSON type for `v` on both sides is reported as unsupportedVersion (ambiguous, never guessed) -- a type mismatch (different tags) is instead a definite, non-ambiguous inequality, correctly NOT "unsupported"', () => {
  const sameUnsupportedTag = { _bsontype: 'MinKey' };
  const ambiguous = compareIndexDefinitions(
    [{ v: sameUnsupportedTag, name: 'x_1', key: { x: 1 } }],
    [{ v: sameUnsupportedTag, name: 'x_1', key: { x: 1 } }]
  );
  assert.equal(ambiguous.unsupportedVersion, true);
  assert.equal(ambiguous.matches, false);

  const definiteMismatch = compareIndexDefinitions(
    [{ v: { _bsontype: 'MinKey' }, name: 'x_1', key: { x: 1 } }],
    [{ v: 2, name: 'x_1', key: { x: 1 } }]
  );
  assert.equal(definiteMismatch.unsupportedVersion, false);
  assert.deepEqual(definiteMismatch.versionDifferences, ['x_1']);
  assert.equal(definiteMismatch.matches, false);
});
test('compareIndexDefinitions: an unexpected ADDITIONAL live index not present in the backup is reported, never silently accepted', () => {
  const backupIdx = [{ v: 2, name: '_id_', key: { _id: 1 } }];
  const liveIdx = [{ v: 2, name: '_id_', key: { _id: 1 } }, { v: 2, name: 'unexpected_1', key: { x: 1 } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, false);
  assert.deepEqual(result.additional, ['unexpected_1']);
});
test('compareIndexDefinitions: an unrecognized index option key is explicitly reported, never silently discarded', () => {
  const backupIdx = [{ v: 2, name: 'x_1', key: { x: 1 } }];
  const liveIdx = [{ v: 2, name: 'x_1', key: { x: 1 }, someFutureOption: true }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, false);
  assert.ok(result.unrecognizedOptions.some((s) => s.includes('someFutureOption')));
});
test('normalizeIndexDefinition: missing unique/sparse is normalized to explicit false (semantically accurate, not a gap)', () => {
  const { normalized } = normalizeIndexDefinition({ v: 2, name: 'x_1', key: { x: 1 } });
  assert.equal(normalized.unique, false);
  assert.equal(normalized.sparse, false);
});
// =============================================================================
// `background` legacy index-build option (QA Bug 19 Stage 9.8B.4A) -- a
// pre-MongoDB-4.2 option with no operational meaning today; recognized as
// a non-blocking legacy field, never a general "ignore unknown options"
// mechanism.
// =============================================================================
test('compareIndexDefinitions: the ACTUAL auditlogs-shaped fixture (3 indexes, 2 secondary carrying `background`) now MATCHES when live omits `background` entirely (the exact Stage 9.8B.4 reproduction, now fixed)', () => {
  const backupIndexes = [
    { v: new Int32(2), key: { _id: new Int32(1) }, name: '_id_' },
    { v: new Int32(2), key: { createdAt: new Int32(-1), _id: new Int32(-1) }, name: 'createdAt_-1__id_-1', background: true },
    { v: new Int32(2), key: { actorId: new Int32(1), createdAt: new Int32(-1) }, name: 'actorId_1_createdAt_-1', background: true },
  ];
  const liveIndexesWithoutBackground = backupIndexes.map(({ background, ...rest }) => rest);
  const result = compareIndexDefinitions(backupIndexes, liveIndexesWithoutBackground);
  assert.equal(result.matches, true);
  assert.deepEqual(result.backgroundDifferences.sort(), ['actorId_1_createdAt_-1', 'createdAt_-1__id_-1']);
  assert.deepEqual(result.unrecognizedOptions, []);
});
test('compareIndexDefinitions: `background` present in backup, absent from live -- non-blocking', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: true }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, true);
  assert.deepEqual(result.backgroundDifferences, ['x_1']);
});
test('compareIndexDefinitions: `background` absent from backup, present in live -- non-blocking', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) } }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: false }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, true);
  assert.deepEqual(result.backgroundDifferences, ['x_1']);
});
test('compareIndexDefinitions: `background` true vs. false -- non-blocking, still reported', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: true }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: false }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, true);
  assert.deepEqual(result.backgroundDifferences, ['x_1']);
});
test('compareIndexDefinitions: matching `background` values produce no reported difference at all', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: true }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: true }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, true);
  assert.deepEqual(result.backgroundDifferences, []);
});
test('compareIndexDefinitions: an INVALID `background` representation (not a boolean) fails closed, never silently accepted', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: 'yes' }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.unsupportedBackground, true);
  assert.equal(result.matches, false);
});
test('compareIndexDefinitions: `background` recognition does NOT weaken detection of a genuinely unknown option on the SAME index', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, background: true, someGenuinelyUnknownOption: 'x' }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  assert.equal(result.matches, false);
  assert.ok(result.unrecognizedOptions.some((s) => s.includes('someGenuinelyUnknownOption')));
  assert.ok(!result.unrecognizedOptions.some((s) => s.includes('background')), '`background` itself must never appear in unrecognizedOptions');
});
test('formatBlockingIndexDiagnostics: exposes only index/field names and counts, never actual option values, partial-filter contents, or document data', () => {
  const backupIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) }, partialFilterExpression: { secretField: { $gt: 'SENSITIVE_VALUE_SHOULD_NOT_APPEAR' } } }];
  const liveIdx = [{ v: new Int32(2), name: 'x_1', key: { x: new Int32(1) } }];
  const result = compareIndexDefinitions(backupIdx, liveIdx);
  const diagnostic = formatBlockingIndexDiagnostics(result);
  assert.ok(diagnostic.includes('x_1'), 'must name the affected index');
  assert.ok(!diagnostic.includes('SENSITIVE_VALUE_SHOULD_NOT_APPEAR'), 'must never include actual option/filter values');
});
test('runLiveRestoreCheckComparison: the orchestration-level diagnostic prints non-blocking `background` differences even when the overall index comparison MATCHES', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-bg-nonblocking-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    fs.mkdirSync(presRestorePath, { recursive: true });
    const docs = [{ _id: new ObjectId(), n: 0 }];
    fs.writeFileSync(path.join(presRestorePath, 'alpha.bson'), Buffer.concat(docs.map((d) => serialize(d))));
    fs.writeFileSync(
      path.join(presRestorePath, 'alpha.metadata.json'),
      JSON.stringify({
        options: {},
        indexes: [{ v: 2, key: { _id: 1 }, name: '_id_' }, { v: 2, key: { n: 1 }, name: 'n_1', background: true }],
        uuid: fixtureUuidFor('alpha'),
        collectionName: 'alpha',
        type: 'collection',
      })
    );
    fs.writeFileSync(path.join(presRestorePath, 'prelude.json'), JSON.stringify({ ServerVersion: '8.0.0', ToolVersion: '100.20.1' }));
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: fixtureUuidFor('alpha') } }] }),
      collection: () => fakeCollection(liveDocs, { indexes: [{ v: new Int32(2), name: '_id_', key: { _id: new Int32(1) } }, { v: new Int32(2), name: 'n_1', key: { n: new Int32(1) } }] }), // no background on live side
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'match', 'a background-only difference must still produce an overall MATCH');
    const allLogged = logged.join('\n');
    assert.ok(allLogged.includes("index 'background' field differs"), 'the non-blocking legacy difference must still be printed even on an overall MATCH');
    assert.ok(allLogged.includes('n_1'));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('compareCollectionOptions: still defensively strips a `uuid` key IF ONE IS EVER NESTED INSIDE `options` itself (not where real mongodump output puts it -- see compareCollectionUuids() below for the REAL, top-level uuid comparison this tool actually relies on)', () => {
  const r = compareCollectionOptions({ uuid: 'aaaa' }, { uuid: 'bbbb' });
  assert.equal(r.equal, true);
});
test('compareCollectionOptions: a genuine option difference (e.g. capped) is NOT normalized away', () => {
  const r = compareCollectionOptions({ capped: true, size: 1000 }, { capped: false });
  assert.equal(r.equal, false);
});

// =============================================================================
// Collection UUID comparison (QA Bug 19 Stage 9.8B.2A correction) -- the
// real, top-level uuid comparison, distinct from compareCollectionOptions
// above. Exercises the actual format confirmed by inspecting this
// project's real preservation backup (plain 32-hex-char string) as well
// as the native BSON Binary and Extended JSON forms defensively handled.
// =============================================================================
test('compareCollectionUuids: matching plain-hex-string UUIDs (the REAL backup format) are equal', () => {
  const r = compareCollectionUuids('5f4f8a987cf141de919fbaf0917e0da8', '5f4f8a987cf141de919fbaf0917e0da8');
  assert.equal(r.comparable, true);
  assert.equal(r.equal, true);
});
test('compareCollectionUuids: DIFFERENT UUIDs, with identical collection name/documents/indexes otherwise, is detected -- this is exactly the "collection recreated" scenario', () => {
  const r = compareCollectionUuids('5f4f8a987cf141de919fbaf0917e0da8', '00000000000000000000000000000000'.slice(0, 32));
  assert.equal(r.comparable, true);
  assert.equal(r.equal, false);
});
test('compareCollectionUuids: missing UUID evidence on either side is INCOMPLETE (comparable: false), never silently skipped', () => {
  assert.equal(compareCollectionUuids(undefined, '5f4f8a987cf141de919fbaf0917e0da8').comparable, false);
  assert.equal(compareCollectionUuids('5f4f8a987cf141de919fbaf0917e0da8', undefined).comparable, false);
  assert.equal(compareCollectionUuids(undefined, undefined).comparable, false);
});
test('compareCollectionUuids: an invalid/unsupported UUID representation is reported, never guessed at', () => {
  assert.equal(compareCollectionUuids('not-a-valid-uuid', '5f4f8a987cf141de919fbaf0917e0da8').comparable, false);
  assert.equal(compareCollectionUuids({ weird: 'shape' }, '5f4f8a987cf141de919fbaf0917e0da8').comparable, false);
});
test('compareCollectionUuids: native BSON Binary (the live driver\'s listCollections() info.uuid shape) compares correctly against the backup\'s plain-hex-string form', () => {
  const hex = '5f4f8a987cf141de919fbaf0917e0da8';
  const liveBinary = new Binary(Buffer.from(hex, 'hex'), 4); // subtype 4 == UUID, the documented MongoDB convention
  const r = compareCollectionUuids(hex, liveBinary);
  assert.equal(r.comparable, true);
  assert.equal(r.equal, true);
});
test('compareCollectionUuids: canonical Extended JSON {$binary:{base64,subType}} form is also handled correctly', () => {
  const hex = '5f4f8a987cf141de919fbaf0917e0da8';
  const ejsonForm = { $binary: { base64: Buffer.from(hex, 'hex').toString('base64'), subType: '04' } };
  const r = compareCollectionUuids(hex, ejsonForm);
  assert.equal(r.comparable, true);
  assert.equal(r.equal, true);
});
test('compareCollectionUuids: same hex bytes but a DIFFERENT Binary subtype is still a representation difference the normalizer records (subType is captured, even though equality here is by hex content)', () => {
  const hex = '5f4f8a987cf141de919fbaf0917e0da8';
  const normalized = normalizeUuidToHex(new Binary(Buffer.from(hex, 'hex'), 3)); // legacy UUID subtype
  assert.equal(normalized.supported, true);
  assert.equal(normalized.subType, 3);
});
test('normalizeUuidToHex: a 24-character ObjectId-shaped hex string is rejected as an unsupported uuid representation (uuid must be exactly 32 hex characters, never confused with a 12-byte ObjectId)', () => {
  const r = normalizeUuidToHex('5f4f8a987cf141de919fbaf0'); // 24 hex chars -- a valid ObjectId length, NOT a valid uuid length
  assert.equal(r.present, true);
  assert.equal(r.supported, false);
});
test('runLiveRestoreCheckComparison (orchestration path, not just the isolated comparator): a collection UUID mismatch, with identical name/documents/indexes otherwise, propagates to an overall MISMATCH verdict', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-uuid-mismatch-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson')); // identical documents
    const fakeDb = {
      // A DIFFERENT uuid from the backup's fixtureUuidFor('alpha') -- simulating the collection having been recreated.
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'mismatch', 'a uuid-only difference, with everything else identical, must still be a blocking MISMATCH, never a silent MATCH');
    assert.equal(result.exitCode, EXIT_MISMATCH);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: a collection index VERSION mismatch, with everything else identical, propagates to an overall MISMATCH verdict', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-indexversion-mismatch-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] }); // writes index v:2 (becomes Int32(2) via canonical EJSON)
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: fixtureUuidFor('alpha') } }] }),
      collection: () => fakeCollection(liveDocs, { indexes: [{ v: new Int32(1), name: '_id_', key: { _id: new Int32(1) } }] }), // v:1, not v:2
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'mismatch', 'an index version difference must propagate to a blocking MISMATCH, never a silent MATCH');
    assert.equal(result.exitCode, EXIT_MISMATCH);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// BSON round-trip: backup .bson parsing preserves types symmetrically with
// the SAME options a live connection would use
// =============================================================================
test('parseBsonFileDocuments: round-trips Int32/Double/ObjectId distinctly, with BSON_PRESERVING_OPTIONS', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-bsonparse-'));
  try {
    const oid = new ObjectId();
    const doc = { _id: oid, i: new Int32(5), d: new Double(5) };
    const filePath = path.join(tmp, 'alpha.bson');
    fs.writeFileSync(filePath, serialize(doc));
    const [parsed] = parseBsonFileDocuments(filePath);
    assert.equal(parsed._id._bsontype, 'ObjectId');
    assert.equal(parsed.i._bsontype, 'Int32');
    assert.equal(parsed.d._bsontype, 'Double');
    assert.equal(compareBsonValues(parsed.i, parsed.d).equal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
// QA Bug 19 — Stage 9.8B.2A: closes the exact test-coverage gap the
// targeted review found -- Decimal128/Long/Binary/Timestamp/Date are all
// implementation-covered (compareBsonValues) but were previously only
// exercised via direct in-memory object construction, never through an
// actual .bson file round trip. This test proves the full
// serialize()->file->parseBsonFileDocuments() path preserves every one of
// them distinctly, not merely that the comparator logic itself is correct
// in isolation.
test('parseBsonFileDocuments: round-trips Decimal128, Long, Binary (with subtype), Timestamp, and Date through an actual .bson file, all preserved distinctly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-bsonparse-fulltypes-'));
  try {
    const doc = {
      _id: new ObjectId(),
      dec: Decimal128.fromString('10.50'),
      long: Long.fromNumber(123456789012),
      bin: new Binary(Buffer.from([1, 2, 3]), 0),
      ts: new Timestamp({ t: 1000, i: 1 }),
      dt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const filePath = path.join(tmp, 'alpha.bson');
    fs.writeFileSync(filePath, serialize(doc));
    const [parsed] = parseBsonFileDocuments(filePath);

    assert.equal(parsed.dec._bsontype, 'Decimal128');
    assert.equal(parsed.dec.toString(), '10.50');
    assert.equal(parsed.long._bsontype, 'Long');
    assert.equal(parsed.long.toString(), '123456789012');
    assert.equal(parsed.bin._bsontype, 'Binary');
    assert.equal(parsed.bin.sub_type, 0);
    assert.equal(Buffer.compare(parsed.bin.buffer, Buffer.from([1, 2, 3])), 0);
    assert.equal(parsed.ts._bsontype, 'Timestamp');
    assert.ok(parsed.dt instanceof Date);
    assert.equal(parsed.dt.getTime(), new Date('2026-01-01T00:00:00.000Z').getTime());

    // Round-tripped values compare correctly equal against a second,
    // independently-constructed-and-round-tripped copy of the same document.
    const filePath2 = path.join(tmp, 'beta.bson');
    fs.writeFileSync(filePath2, serialize({ ...doc, _id: doc._id }));
    const [parsed2] = parseBsonFileDocuments(filePath2);
    assert.equal(compareDocuments(parsed, parsed2).equal, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// Dedicated comparator tests: Binary, Date, Timestamp, Decimal128/Long,
// and nested BSON values (QA Bug 19 Stage 9.8B.2A coverage gap closure)
// =============================================================================
test('compareBsonValues: identical Binary contents and subtype ARE equal', () => {
  const a = new Binary(Buffer.from([1, 2, 3]), 0);
  const b = new Binary(Buffer.from([1, 2, 3]), 0);
  assert.equal(compareBsonValues(a, b).equal, true);
});
test('compareBsonValues: different Binary contents, same subtype, are NOT equal', () => {
  const a = new Binary(Buffer.from([1, 2, 3]), 0);
  const b = new Binary(Buffer.from([1, 2, 4]), 0);
  assert.equal(compareBsonValues(a, b).equal, false);
});
test('compareBsonValues: identical Binary contents with DIFFERENT subtypes are NOT equal (subtype is part of identity)', () => {
  const a = new Binary(Buffer.from([1, 2, 3]), 0);
  const b = new Binary(Buffer.from([1, 2, 3]), 4); // e.g. subtype 4 == UUID
  assert.equal(compareBsonValues(a, b).equal, false);
});
test('compareBsonValues: Date equality and inequality', () => {
  assert.equal(compareBsonValues(new Date('2026-01-01'), new Date('2026-01-01')).equal, true);
  assert.equal(compareBsonValues(new Date('2026-01-01'), new Date('2026-01-02')).equal, false);
});
test('compareBsonValues: Timestamp equality and inequality', () => {
  const t1 = new Timestamp({ t: 1000, i: 1 });
  const t2 = new Timestamp({ t: 1000, i: 1 });
  const t3 = new Timestamp({ t: 1000, i: 2 });
  assert.equal(compareBsonValues(t1, t2).equal, true);
  assert.equal(compareBsonValues(t1, t3).equal, false);
});
test('compareBsonValues: Date vs. Timestamp (same underlying moment conceptually) are NOT equal -- never cross-type coerced', () => {
  const r = compareBsonValues(new Date('2026-01-01'), new Timestamp({ t: 1000, i: 1 }));
  assert.equal(r.equal, false);
  assert.equal(r.unsupported, false);
});
test('compareBsonValues: Decimal128 value differences are detected', () => {
  assert.equal(compareBsonValues(Decimal128.fromString('1.00'), Decimal128.fromString('1.01')).equal, false);
});
test('compareBsonValues: Long value differences are detected', () => {
  assert.equal(compareBsonValues(Long.fromNumber(100), Long.fromNumber(200)).equal, false);
});
test('compareBsonValues: nested BSON values (Decimal128/Binary/Timestamp inside a nested document) compare correctly, recursively', () => {
  const a = { outer: { dec: Decimal128.fromString('5.00'), bin: new Binary(Buffer.from([9]), 0), ts: new Timestamp({ t: 1, i: 1 }) } };
  const b = { outer: { dec: Decimal128.fromString('5.00'), bin: new Binary(Buffer.from([9]), 0), ts: new Timestamp({ t: 1, i: 1 }) } };
  const c = { outer: { dec: Decimal128.fromString('5.01'), bin: new Binary(Buffer.from([9]), 0), ts: new Timestamp({ t: 1, i: 1 }) } };
  assert.equal(compareDocuments(a, b).equal, true);
  assert.equal(compareDocuments(a, c).equal, false);
});

// =============================================================================
// Live fetch functions against a hand-built fake `db` (no real/mocked
// mongoose connection needed for these -- they take `db` directly)
// =============================================================================
// Default indexes use Int32-wrapped v/key values -- realistically matching
// what a live connection under BSON_PRESERVING_OPTIONS actually returns,
// and what the backup side now produces via parseBackupMetadata()'s
// canonical EJSON parsing (QA Bug 19 Stage 9.8B.2A).
function fakeCollection(docs, { indexes = [{ v: new Int32(2), name: '_id_', key: { _id: new Int32(1) } }], failAfter = null } = {}) {
  return {
    find: () => {
      let i = 0;
      return {
        hasNext: async () => i < docs.length,
        next: async () => {
          if (failAfter !== null && i >= failAfter) throw Object.assign(new Error('simulated cursor failure'), { name: 'MongoNetworkError' });
          return docs[i++];
        },
        close: async () => {},
      };
    },
    listIndexes: () => ({ toArray: async () => indexes }),
  };
}

test('fetchAllDocumentsViaCursor: enumerates every document via manual cursor iteration (hasNext/next), not a single toArray()', async () => {
  const docs = [{ _id: new ObjectId() }, { _id: new ObjectId() }, { _id: new ObjectId() }];
  const fakeDb = { collection: () => fakeCollection(docs) };
  const result = await fetchAllDocumentsViaCursor(fakeDb, 'alpha');
  assert.equal(result.incomplete, false);
  assert.equal(result.docs.length, 3);
});
test('fetchAllDocumentsViaCursor: a PARTIAL cursor failure is reported as incomplete, with the partial count preserved, and the cursor is still closed', async () => {
  const docs = [{ _id: new ObjectId() }, { _id: new ObjectId() }, { _id: new ObjectId() }];
  let closed = false;
  const col = fakeCollection(docs, { failAfter: 2 });
  col.find = (() => {
    const orig = col.find;
    return (...args) => {
      const cursor = orig(...args);
      const originalClose = cursor.close;
      cursor.close = async () => {
        closed = true;
        return originalClose();
      };
      return cursor;
    };
  })();
  const fakeDb = { collection: () => col };
  const result = await fetchAllDocumentsViaCursor(fakeDb, 'alpha');
  assert.equal(result.incomplete, true);
  assert.equal(result.docs.length, 2, 'the 2 documents fetched before the failure must still be reported');
  assert.match(result.reason, /fetched 2 document\(s\) before the failure/);
  assert.equal(closed, true, 'the cursor must still be closed even after a mid-enumeration failure');
});
test('fetchLiveCollectionsMetadata: a listCollections() failure is reported as incomplete, never thrown uncaught', async () => {
  const fakeDb = { listCollections: () => ({ toArray: async () => { throw Object.assign(new Error('boom'), { name: 'MongoNetworkError' }); } }) };
  const result = await fetchLiveCollectionsMetadata(fakeDb);
  assert.equal(result.incomplete, true);
  assert.match(result.reason, /MongoNetworkError/);
});
test('fetchLiveIndexes: a listIndexes() failure is reported as incomplete', async () => {
  const fakeDb = { collection: () => ({ listIndexes: () => ({ toArray: async () => { throw Object.assign(new Error('boom'), { name: 'MongoServerError' }); } }) }) };
  const result = await fetchLiveIndexes(fakeDb, 'alpha');
  assert.equal(result.incomplete, true);
});

// =============================================================================
// Orchestrator: default never connects, explicit gate, connection failure,
// guaranteed disconnect, credential-safe error output, full match/mismatch
// =============================================================================
function makeValidBackupPair(tmp) {
  const presBackupPath = path.join(tmp, 'pres');
  const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
  buildFixtureDump(presRestorePath, { collections: ['alpha'] });
  finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

  const testBackupPath = path.join(tmp, 'test');
  const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
  buildFixtureDump(testRestorePath, { collections: ['alpha'] });
  finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

  return { presRestorePath, testRestorePath };
}

test('runLiveRestoreCheckComparison: the DEFAULT invocation (no --execute-live-readonly) never calls mongoose.connect', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-default-'));
  try {
    const { presRestorePath, testRestorePath } = makeValidBackupPair(tmp);
    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runLiveRestoreCheckComparison({ preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: false, confirmNoConcurrentWrites: false });
    assert.equal(connectCalls, 0, 'mongoose.connect must never be called by the default invocation');
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: --execute-live-readonly WITHOUT --confirm-no-concurrent-writes refuses and never connects', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-noconfirm-'));
  try {
    const { presRestorePath, testRestorePath } = makeValidBackupPair(tmp);
    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runLiveRestoreCheckComparison({ preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: false });
    assert.equal(connectCalls, 0);
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: an invalid backup manifest blocks the run BEFORE any connection is attempted, even with both live flags set', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-badbackup-noconnect-'));
  try {
    const presRestorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] }); // never finalized -- invalid
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(connectCalls, 0, 'an invalid backup manifest must block the run before any connection attempt');
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: a connection failure is reported credential-safely (only err.name, never the URI or password), and disconnect is still called', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-connectfail-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const { presRestorePath, testRestorePath } = makeValidBackupPair(tmp);
    let disconnectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { throw Object.assign(new Error(`auth failed for ${RESTORE_TARGET_URI}`), { name: 'MongoServerError' }); });
    t.mock.method(mongoose, 'disconnect', async () => { disconnectCalls += 1; });
    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
    assert.equal(disconnectCalls, 1, 'disconnect must still be called after a connection failure');
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(RESTORE_TARGET_URI));
    assert.ok(allLogged.includes('MongoServerError'));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: a full successful live comparison reports MATCH and never authorizes a restore', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-match-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: fixtureUuidFor('alpha') } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    let disconnectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => { disconnectCalls += 1; });

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'match');
    assert.equal(result.exitCode, EXIT_MATCH);
    assert.equal(disconnectCalls, 1);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: a modified live document reports MISMATCH, with ACTUAL RESTORE AUTHORIZATION: BLOCKED', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-mismatch-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    liveDocs[0] = { ...liveDocs[0], n: new Int32(99999) }; // tamper
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: fixtureUuidFor('alpha') } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'mismatch');
    assert.equal(result.exitCode, EXIT_MISMATCH);
    assert.ok(logged.join('\n').includes('ACTUAL RESTORE AUTHORIZATION: BLOCKED'));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runLiveRestoreCheckComparison: an unexpected ADDITIONAL live collection reports INCOMPLETE, not a silent pass', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'livecheck-extracollection-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {} }, { name: 'unexpected_collection', options: {} }] }),
      collection: () => fakeCollection([]),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runLiveRestoreCheckComparison({
      uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true,
    });
    assert.equal(result.result, 'incomplete');
    assert.ok(result.nameDiff.additionalInLive.includes('unexpected_collection'));
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// Static source checks: safety properties proven without executing a
// connection-attempting code path at all
// =============================================================================
test('source contains no write-capable MongoDB operations anywhere in its actual code (comments aside)', () => {
  const writeOps = [
    '.insertOne(', '.insertMany(', '.updateOne(', '.updateMany(', '.deleteOne(', '.deleteMany(',
    '.findOneAndUpdate(', '.findOneAndDelete(', '.replaceOne(', '.createIndex(', '.createIndexes(',
    '.dropIndex(', '.drop(', '.dropDatabase(', '.createCollection(', '.renameCollection(',
    '.bulkWrite(', '.save(', '.runCommand(', '$out', '$merge', '$set', '$unset',
  ];
  for (const op of writeOps) {
    assert.ok(!CODE_ONLY.includes(op), `source must not contain "${op}" outside comments -- this tool must be strictly read-only`);
  }
});
test('source never imports or instantiates any Mongoose Model', () => {
  assert.ok(!CODE_ONLY.includes('.model.js'));
  assert.ok(!/mongoose\.model\(/.test(CODE_ONLY));
});
test('source only runs main() on direct CLI invocation, not merely on import', () => {
  assert.match(SOURCE, /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/);
  assert.match(SOURCE, /if \(isDirectCliInvocation\) \{/);
});
test('source always disconnects in a finally block around the connected read-operation step', () => {
  assert.match(CODE_ONLY, /finally\s*\{\s*await disconnectReadOnly\(\);\s*\}/);
});
test('source requires BOTH executeLive and confirmNoConcurrentWrites before ever resolving a URI or connecting', () => {
  assert.match(CODE_ONLY, /if \(!executeLive\)/);
  assert.match(CODE_ONLY, /if \(!confirmNoConcurrentWrites\)/);
});
test('source never hardcodes a literal credential-shaped connection string', () => {
  assert.ok(!/mongodb(\+srv)?:\/\/\w+:\w+@/.test(CODE_ONLY), 'the implementation must never embed a connection string with credentials -- uri is always a parameter');
});

// =============================================================================
// QA Bug 19 — Stage 9.9A: runPostRestoreVerification() -- a separate,
// additive post-restore entry point. UUID is observational only here
// (never blocking), since mongorestore assigns the destination a brand-new
// UUID; this must never affect the match/mismatch/incomplete verdict.
// =============================================================================
test('runPostRestoreVerification: the DEFAULT invocation (no --execute-live-readonly) never calls mongoose.connect', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-default-'));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runPostRestoreVerification({ freshTestBackup: testRestorePath, executeLive: false, confirmNoConcurrentWrites: false });
    assert.equal(connectCalls, 0);
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: missing --fresh-test-backup is incomplete', async () => {
  const result = await runPostRestoreVerification({ executeLive: false, confirmNoConcurrentWrites: false });
  assert.equal(result.exitCode, EXIT_INCOMPLETE);
});
test('runPostRestoreVerification: an invalid TEST backup manifest blocks the run before any connection, even with both live flags set', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-badbackup-'));
  try {
    const testRestorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] }); // never finalized -- invalid
    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(connectCalls, 0);
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: a CHANGED collection UUID (the expected, normal post-restore outcome) still reports MATCH -- UUID never blocks this verdict', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-match-uuidchanged-'));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(testRestorePath, 'alpha.bson'));
    const fakeDb = {
      // Deliberately a DIFFERENT uuid from fixtureUuidFor('alpha') -- exactly
      // what a real mongorestore is expected to produce.
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'match');
    assert.equal(result.exitCode, EXIT_MATCH);
    assert.equal(result.perCollection[0].uuidObservation.comparable, true);
    assert.equal(result.perCollection[0].uuidObservation.equal, false, 'sanity: the uuid really did differ in this fixture');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: an UNCHANGED collection UUID (unusual, but not itself a failure) still reports MATCH -- flagged informationally only', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-match-uuidunchanged-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(testRestorePath, 'alpha.bson'));
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: fixtureUuidFor('alpha') } }] }), // SAME as backup
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'match', 'an unchanged uuid must still produce MATCH -- it is informational, never blocking, even though unusual');
    assert.ok(logged.join('\n').includes('UNCHANGED'));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: a genuine modified document still reports MISMATCH (content comparison is unaffected by the UUID policy change)', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-mismatch-'));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(testRestorePath, 'alpha.bson'));
    liveDocs[0] = { ...liveDocs[0], n: new Int32(99999) }; // tamper
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'mismatch');
    assert.equal(result.exitCode, EXIT_MISMATCH);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: a missing live collection reports INCOMPLETE', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-missingcol-'));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha', 'beta'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }), // 'beta' missing
      collection: () => fakeCollection([]),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'incomplete');
    assert.ok(result.nameDiff.missingFromLive.includes('beta'));
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRestoreVerification: a connection failure is credential-safe and still disconnects', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrestore-connectfail-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const testBackupPath = path.join(tmp, 'test');
    const testRestorePath = path.join(testBackupPath, BACKUP_SOURCE_DB_NAME);
    buildFixtureDump(testRestorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath: testBackupPath, restorePath: testRestorePath, dbName: BACKUP_SOURCE_DB_NAME });

    let disconnectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { throw Object.assign(new Error(`auth failed for ${RESTORE_TARGET_URI}`), { name: 'MongoServerError' }); });
    t.mock.method(mongoose, 'disconnect', async () => { disconnectCalls += 1; });

    const result = await runPostRestoreVerification({ uri: RESTORE_TARGET_URI, freshTestBackup: testRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
    assert.equal(disconnectCalls, 1);
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(RESTORE_TARGET_URI));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('source: the shared runNonBlockingUuidVerification() implementation (used by BOTH runPostRestoreVerification and runPostRecoveryVerification) never references uuid in its collectionMatches calculation (structural confirmation that UUID cannot block either verdict)', () => {
  const fnText = CODE_ONLY.slice(CODE_ONLY.indexOf('async function runNonBlockingUuidVerification'), CODE_ONLY.indexOf('export async function runPostRestoreVerification'));
  const collectionMatchesLine = fnText.match(/const collectionMatches = [^;]+;/);
  assert.ok(collectionMatchesLine, 'collectionMatches assignment must exist in this function');
  assert.ok(!/uuid/i.test(collectionMatchesLine[0]), `collectionMatches must never reference uuid: "${collectionMatchesLine[0]}"`);
});
test('source: runPostRestoreVerification and runPostRecoveryVerification are both thin wrappers delegating to the SAME shared implementation -- no duplicated UUID policy to drift out of sync', () => {
  assert.match(CODE_ONLY, /export async function runPostRestoreVerification\([^)]*\)\s*\{\s*return runNonBlockingUuidVerification\(/);
  assert.match(CODE_ONLY, /export async function runPostRecoveryVerification\([^)]*\)\s*\{\s*return runNonBlockingUuidVerification\(/);
});
test('source: runLiveRestoreCheckComparison (pre-restore) is completely unmodified by the post-restore addition -- its own collectionMatches STILL requires uuidResult.equal', () => {
  const fnText = CODE_ONLY.slice(CODE_ONLY.indexOf('export async function runLiveRestoreCheckComparison'), CODE_ONLY.indexOf('export async function runPostRestoreVerification'));
  const collectionMatchesLine = fnText.match(/const collectionMatches = [^;]+;/);
  assert.ok(collectionMatchesLine[0].includes('uuidResult.equal'), 'the existing pre-restore path must still strictly require uuid equality');
});

// =============================================================================
// QA Bug 19 — Stage 9.9A.1: runPostRecoveryVerification() -- verifies a
// preservation-recovery restore succeeded without incorrectly treating the
// recovered collection's new UUID as a failure (restoreCheckSelfRecovery.mjs
// never passes --preserveUUID either, confirmed by source inspection).
// =============================================================================
test('runPostRecoveryVerification: the DEFAULT invocation never calls mongoose.connect', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-default-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runPostRecoveryVerification({ preservationBackup: presRestorePath, executeLive: false, confirmNoConcurrentWrites: false });
    assert.equal(connectCalls, 0);
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRecoveryVerification: missing --preservation-backup is incomplete', async () => {
  const result = await runPostRecoveryVerification({ executeLive: false, confirmNoConcurrentWrites: false });
  assert.equal(result.exitCode, EXIT_INCOMPLETE);
});
test('runPostRecoveryVerification: an invalid preservation backup manifest blocks the run before any connection, even with both live flags set', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-badbackup-'));
  try {
    const presRestorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] }); // never finalized -- invalid
    let connectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { connectCalls += 1; });
    const result = await runPostRecoveryVerification({ uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(connectCalls, 0);
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRecoveryVerification: a CHANGED collection UUID (the expected, normal post-recovery outcome -- restoreCheckSelfRecovery.mjs never passes --preserveUUID either) still reports MATCH', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-match-uuidchanged-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRecoveryVerification({ uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'match');
    assert.equal(result.exitCode, EXIT_MATCH);
    assert.equal(result.perCollection[0].uuidObservation.equal, false, 'sanity: the uuid really did differ in this fixture');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRecoveryVerification: a genuine modified document still reports MISMATCH', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-mismatch-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    const liveDocs = parseBsonFileDocuments(path.join(presRestorePath, 'alpha.bson'));
    liveDocs[0] = { ...liveDocs[0], n: new Int32(99999) }; // tamper
    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }),
      collection: () => fakeCollection(liveDocs),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRecoveryVerification({ uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'mismatch');
    assert.equal(result.exitCode, EXIT_MISMATCH);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRecoveryVerification: a missing live collection reports INCOMPLETE', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-missingcol-'));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha', 'beta'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    const fakeDb = {
      listCollections: () => ({ toArray: async () => [{ name: 'alpha', options: {}, info: { uuid: 'ffffffffffffffffffffffffffffffff' } }] }), // 'beta' missing
      collection: () => fakeCollection([]),
    };
    t.mock.method(mongoose, 'connect', async () => { mongoose.connection.db = fakeDb; });
    t.mock.method(mongoose, 'disconnect', async () => {});

    const result = await runPostRecoveryVerification({ uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.result, 'incomplete');
    assert.ok(result.nameDiff.missingFromLive.includes('beta'));
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('runPostRecoveryVerification: a connection failure is credential-safe and still disconnects', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postrecovery-connectfail-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const presBackupPath = path.join(tmp, 'pres');
    const presRestorePath = path.join(presBackupPath, PRESERVATION_SOURCE_DB_NAME);
    buildFixtureDump(presRestorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath: presBackupPath, restorePath: presRestorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    let disconnectCalls = 0;
    t.mock.method(mongoose, 'connect', async () => { throw Object.assign(new Error(`auth failed for ${RESTORE_TARGET_URI}`), { name: 'MongoServerError' }); });
    t.mock.method(mongoose, 'disconnect', async () => { disconnectCalls += 1; });

    const result = await runPostRecoveryVerification({ uri: RESTORE_TARGET_URI, preservationBackup: presRestorePath, executeLive: true, confirmNoConcurrentWrites: true });
    assert.equal(result.exitCode, EXIT_INCOMPLETE);
    assert.equal(disconnectCalls, 1);
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(RESTORE_TARGET_URI));
  } finally {
    console.log = originalLog;
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('source: runPostRecoveryVerification uses validateManifestForRecovery (the strengthened preservation-backup validator), never a weakened or bypassed check', () => {
  const fnText = CODE_ONLY.slice(CODE_ONLY.indexOf('export async function runPostRecoveryVerification'));
  assert.match(fnText, /validateManifestForRecovery\(p,\s*\{\s*expectedSourceDbName:\s*PRESERVATION_SOURCE_DB_NAME\s*\}\)/);
});
test('source: no generic UUID bypass flag exists anywhere in the implementation', () => {
  assert.ok(!/uuidBypass|skipUuid|ignoreUuid|bypassUuid/i.test(CODE_ONLY));
});
