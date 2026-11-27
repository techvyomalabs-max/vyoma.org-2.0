// Task 7D.3 — regression coverage for scripts/backup/protectedDbGuard.mjs,
// backupDatabase.mjs, and restoreDatabase.mjs (Task 7P), none of which had
// any dedicated test file before this task. These three were audited
// alongside every other Backend script capable of connecting to MongoDB, to
// confirm none of them can be used to read, write, back up from, or restore
// into the standing-rules-protected database ("vyoma_migration_dryrun").
//
// restoreDatabase.mjs still takes its target only as an explicit --uri CLI
// argument. backupDatabase.mjs (Task 7P-SEC) additionally accepts the
// MONGODB_URI environment variable, and additionally enforces an exact
// allowlist (ALLOWED_BACKUP_DB_NAMES, currently just "vyoma_2_0_test") on
// top of the pre-existing protected-name blocklist -- both are covered
// below, with dummy/unreachable URIs only.
//
// Task 7P-SEC4: restoreDatabase.mjs has its OWN, separate exact-name
// allowlist for its restore TARGET (ALLOWED_RESTORE_TARGET_DB_NAMES,
// currently just "vyoma_2_0_test_restore_check") -- deliberately not the
// same set as backupDatabase.mjs's, since restore must never be allowed to
// target the same live database ("vyoma_2_0_test") a backup is read from.
//
// No real mongodump/mongorestore process is ever spawned here: every
// protected-target or non-allowlisted-target test below asserts rejection
// happens BEFORE backupDatabase()/restoreDatabase() would reach execFile()
// at all (both guard checks are backupDatabase()'s first two statements),
// and every allowlisted-target test below uses commit: false (the default,
// dry-run-only mode), which the scripts themselves document as never
// spawning a process or touching disk beyond validation. No MongoDB
// connection of any kind is opened by this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  PROTECTED_DB_NAMES,
  ALLOWED_BACKUP_DB_NAMES,
  ALLOWED_RESTORE_TARGET_DB_NAMES,
  BACKUP_SOURCE_DB_NAME,
  extractDatabaseName,
  assertNotProtectedDbUri,
  assertAllowedBackupDbUri,
  assertAllowedRestoreTargetUri,
  assertExpectedRestoreClusterHost,
  APPROVED_RESTORE_CLUSTER_HOST,
} from '../../scripts/backup/protectedDbGuard.mjs';
import {
  backupDatabase,
  resolveBackupUri,
  MONGODB_URI_ENV_VAR,
  verifyEffectiveBackupTarget,
  markBackupIncomplete,
  finalizeVerifiedTestBackup,
  validateTestBackupManifestForRestore,
} from '../../scripts/backup/backupDatabase.mjs';
import {
  restoreDatabase,
  resolveRestoreUri,
  findIncompleteBackupMarker,
  INCOMPLETE_MARKER_FILENAMES,
  assertExpectedSourceNamespace,
  splitCredentialsFromUri,
  buildRestoreConfigYaml,
  writeTempRestoreConfig,
  cleanupTempRestoreConfig,
  buildMongorestoreArgs,
  runRestoreProcess,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  looksLikeAMongodumpDirectory,
} from '../../scripts/backup/restoreDatabase.mjs';
import { restoreCheckRecovery, RECOVERY_DB_NAME } from '../../scripts/backup/restoreCheckSelfRecovery.mjs';
import { serialize, ObjectId } from 'bson';
import {
  PRESERVATION_SOURCE_DB_NAME,
  assertApprovedPreservationBackupSourceUri,
  verifyDumpIntegrity,
  finalizeVerifiedBackup,
  writeAndVerifyManifest,
  validateManifestForRecovery,
  restoreCheckPreservationBackup,
} from '../../scripts/backup/restoreCheckPreservationBackup.mjs';

const RESTORE_DATABASE_SOURCE = fs.readFileSync(new URL('../../scripts/backup/restoreDatabase.mjs', import.meta.url), 'utf8');
const RECOVERY_SOURCE = fs.readFileSync(new URL('../../scripts/backup/restoreCheckSelfRecovery.mjs', import.meta.url), 'utf8');
const RECOVERY_CODE_ONLY = RECOVERY_SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
const RESTORE_CODE_ONLY = RESTORE_DATABASE_SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

const BACKUP_DATABASE_SOURCE = fs.readFileSync(new URL('../../scripts/backup/backupDatabase.mjs', import.meta.url), 'utf8');

const PROTECTED_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';
const PROTECTED_URI_TRAILING_SLASH = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun/';
// QA Bug 19 — Stage 9.6C: hostname is now the real approved TEST cluster
// (backupDatabase() additionally validates this -- see
// assertExpectedRestoreClusterHost) -- credentials here are a fixed, fake
// dummy pair for test fixtures only, never a real secret.
const ALLOWED_URI = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test';
const NOT_ALLOWLISTED_URI = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/some_disposable_db';
// The only allowed restore TARGET (Task 7P-SEC4) -- deliberately different
// from ALLOWED_URI (vyoma_2_0_test) above, since restore must never be
// allowed to target the same database backupDatabase.mjs reads from.
// QA Bug 19 — Stage 9.3A: hostname is now the real approved TEST cluster
// (restoreDatabase() additionally validates this -- see
// assertExpectedRestoreClusterHost) -- credentials here are a fixed, fake
// dummy pair for test fixtures only, never a real secret.
const RESTORE_TARGET_URI = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check';
const LIVE_TEST_DB_AS_RESTORE_TARGET_URI = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test';

test('PROTECTED_DB_NAMES contains exactly the one standing-rules-protected name', () => {
  assert.deepEqual([...PROTECTED_DB_NAMES], ['vyoma_migration_dryrun']);
});

test('extractDatabaseName strips a trailing slash before comparison (already fixed during Task 7P review; re-verified here)', () => {
  assert.equal(extractDatabaseName(PROTECTED_URI), 'vyoma_migration_dryrun');
  assert.equal(extractDatabaseName(PROTECTED_URI_TRAILING_SLASH), 'vyoma_migration_dryrun');
});

test('extractDatabaseName returns null (never throws) for an ambiguous or unparseable URI', () => {
  assert.equal(extractDatabaseName('mongodb://127.0.0.1:27017'), null);
  assert.equal(extractDatabaseName('not a uri at all'), null);
});

// Task 7D.5 — confirmed directly (by connecting a disposable
// mongodb-memory-server instance with a percent-encoded database-name
// segment and observing mongoose.connection.name resolve to the decoded
// value) that the real MongoDB driver decodes this segment before using it
// as the database name. extractDatabaseName() previously compared the raw,
// still-encoded string, so this would have silently passed through.
test('extractDatabaseName decodes a percent-encoded database name segment', () => {
  assert.equal(extractDatabaseName('mongodb://127.0.0.1:27017/%76yoma_migration_dryrun'), 'vyoma_migration_dryrun');
});

test('extractDatabaseName returns null (never throws) for a malformed percent-encoding', () => {
  assert.equal(extractDatabaseName('mongodb://127.0.0.1:27017/%zz'), null);
});

test('assertNotProtectedDbUri rejects the exact protected name and the trailing-slash variant', () => {
  assert.throws(() => assertNotProtectedDbUri(PROTECTED_URI, { label: 'test' }), /vyoma_migration_dryrun.*protected list/s);
  assert.throws(() => assertNotProtectedDbUri(PROTECTED_URI_TRAILING_SLASH, { label: 'test' }), /vyoma_migration_dryrun.*protected list/s);
});

test('assertNotProtectedDbUri rejects a percent-encoded variant of the protected name (the exact bypass this task found and fixed)', () => {
  assert.throws(
    () => assertNotProtectedDbUri('mongodb://127.0.0.1:27017/%76yoma_migration_dryrun', { label: 'test' }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('assertNotProtectedDbUri rejects differently-cased variants of the protected name (case-insensitive match)', () => {
  assert.throws(
    () => assertNotProtectedDbUri('mongodb://127.0.0.1:27017/VYOMA_MIGRATION_DRYRUN', { label: 'test' }),
    /protected list/i
  );
});

test('assertNotProtectedDbUri allows a non-protected target through', () => {
  assert.equal(assertNotProtectedDbUri('mongodb://127.0.0.1:27017/some_disposable_db', { label: 'test' }), 'some_disposable_db');
});

test('backupDatabase() rejects the protected database before any mongodump process would be spawned, even with --commit', async () => {
  await assert.rejects(
    () => backupDatabase({ uri: PROTECTED_URI, commit: true }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('backupDatabase() rejects a percent-encoded variant of the protected database (the exact bypass this task found and fixed)', async () => {
  await assert.rejects(
    () => backupDatabase({ uri: 'mongodb://127.0.0.1:27017/%76yoma_migration_dryrun', commit: true }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('backupDatabase() rejects a trailing-slash variant of the protected database (the exact bypass class this task hunted for)', async () => {
  await assert.rejects(
    () => backupDatabase({ uri: PROTECTED_URI_TRAILING_SLASH, commit: true }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('backupDatabase() dry-run (commit: false, the default) against the allowlisted target validates and reports without spawning any process', async () => {
  const result = await backupDatabase({ uri: ALLOWED_URI, commit: false });
  assert.equal(result.ranForReal, false);
  assert.equal(result.dbName, 'vyoma_2_0_test');
  // Dry-run must not have created anything on disk, including the backup
  // directory itself -- not just "no mongodump process".
  assert.equal(fs.existsSync(result.backupPath), false);
});

// --- Task 7P-SEC: exact-name allowlist (ALLOWED_BACKUP_DB_NAMES) ----------

test('ALLOWED_BACKUP_DB_NAMES contains exactly the one currently-approved backup target', () => {
  assert.deepEqual([...ALLOWED_BACKUP_DB_NAMES], ['vyoma_2_0_test']);
});

test('assertAllowedBackupDbUri allows the exact allowlisted name and the comparison is case-insensitive', () => {
  assert.equal(assertAllowedBackupDbUri(ALLOWED_URI, { label: 'test' }), 'vyoma_2_0_test');
  // The match itself is case-insensitive (this does not throw); the
  // returned value is still the raw extracted name, unmodified -- same
  // convention as assertNotProtectedDbUri's own return value.
  assert.equal(assertAllowedBackupDbUri('mongodb://127.0.0.1:27017/VYOMA_2_0_TEST', { label: 'test' }), 'VYOMA_2_0_TEST');
});

test('assertAllowedBackupDbUri rejects a non-protected but non-allowlisted database, and the error never contains the URI', () => {
  assert.throws(() => assertAllowedBackupDbUri(NOT_ALLOWLISTED_URI, { label: 'test' }), (err) => {
    assert.match(err.message, /some_disposable_db.*allowlist/s);
    assert.ok(!err.message.includes(NOT_ALLOWLISTED_URI), 'error message must never contain the raw URI');
    return true;
  });
});

test('assertAllowedBackupDbUri rejects a URI with no database-name segment at all', () => {
  assert.throws(() => assertAllowedBackupDbUri('mongodb://127.0.0.1:27017', { label: 'test' }), /none.*allowlist/s);
});

test('backupDatabase() rejects a non-allowlisted (but otherwise harmless) database before spawning any process, even with --commit', async () => {
  await assert.rejects(() => backupDatabase({ uri: NOT_ALLOWLISTED_URI, commit: true }), /some_disposable_db.*allowlist/s);
});

test('the protected-name blocklist and the allowlist are both enforced independently: the protected name is still rejected by its own check even though it would also fail the allowlist', async () => {
  await assert.rejects(() => backupDatabase({ uri: PROTECTED_URI, commit: true }), /vyoma_migration_dryrun.*protected list/s);
});

// --- Task 7P-SEC: MONGODB_URI environment-variable support (backupDatabase.mjs only) ---

test('resolveBackupUri prefers an explicit --uri over the environment variable', () => {
  const result = resolveBackupUri({ uri: 'mongodb://explicit/vyoma_2_0_test', env: { [MONGODB_URI_ENV_VAR]: 'mongodb://ambient/vyoma_2_0_test' } });
  assert.equal(result, 'mongodb://explicit/vyoma_2_0_test');
});

test('resolveBackupUri falls back to MONGODB_URI when --uri is not given', () => {
  const result = resolveBackupUri({ uri: undefined, env: { [MONGODB_URI_ENV_VAR]: ALLOWED_URI } });
  assert.equal(result, ALLOWED_URI);
});

test('resolveBackupUri returns null (never throws) when neither --uri nor the environment variable is set', () => {
  assert.equal(resolveBackupUri({ uri: undefined, env: {} }), null);
  assert.equal(resolveBackupUri({ uri: '', env: { [MONGODB_URI_ENV_VAR]: '   ' } }), null);
});

test('backupDatabase() reports a clear error (never a credential) when neither --uri nor MONGODB_URI is set', async () => {
  const originalEnv = process.env[MONGODB_URI_ENV_VAR];
  delete process.env[MONGODB_URI_ENV_VAR];
  try {
    await assert.rejects(() => backupDatabase({ uri: undefined, commit: false }), new RegExp(`--uri is required, or set the ${MONGODB_URI_ENV_VAR}`));
  } finally {
    if (originalEnv === undefined) delete process.env[MONGODB_URI_ENV_VAR];
    else process.env[MONGODB_URI_ENV_VAR] = originalEnv;
  }
});

test('backupDatabase() picks up a dummy connection string from MONGODB_URI end to end, in dry-run only', async () => {
  const originalEnv = process.env[MONGODB_URI_ENV_VAR];
  process.env[MONGODB_URI_ENV_VAR] = ALLOWED_URI;
  try {
    const result = await backupDatabase({ uri: undefined, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, 'vyoma_2_0_test');
  } finally {
    if (originalEnv === undefined) delete process.env[MONGODB_URI_ENV_VAR];
    else process.env[MONGODB_URI_ENV_VAR] = originalEnv;
  }
});

// --- Task 7P-SEC: post-run effective-target verification (pure filesystem, no network) ---

test('verifyEffectiveBackupTarget passes when the actual mongodump output directory matches the allowlist', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-verify-ok-'));
  try {
    fs.mkdirSync(path.join(tmp, 'vyoma_2_0_test'));
    assert.equal(verifyEffectiveBackupTarget(tmp), 'vyoma_2_0_test');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('verifyEffectiveBackupTarget throws when the actual output directory does not match the allowlist, naming only directory names (never a URI, since none is passed to it)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-verify-bad-'));
  try {
    fs.mkdirSync(path.join(tmp, 'some_other_db'));
    assert.throws(() => verifyEffectiveBackupTarget(tmp), /some_other_db.*unexpected effective database/s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Task 7P-SEC2: failed/interrupted backups are marked INCOMPLETE, partial files preserved ---

test('markBackupIncomplete() writes a clear marker file, preserving any existing partial files untouched', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-incomplete-'));
  try {
    // Simulate a partial mongodump output: one collection file already
    // written before the (simulated) failure.
    fs.writeFileSync(path.join(tmp, 'somecollection.bson'), 'partial-data-placeholder');

    markBackupIncomplete(tmp, 'mongodump failed (exit code 1).');

    const markerPath = path.join(tmp, 'INCOMPLETE_BACKUP.txt');
    assert.ok(fs.existsSync(markerPath), 'marker file must be created');
    const markerContent = fs.readFileSync(markerPath, 'utf8');
    assert.match(markerContent, /INCOMPLETE/);
    assert.match(markerContent, /DO NOT USE FOR RESTORATION/);
    assert.match(markerContent, /mongodump failed \(exit code 1\)/);

    // The pre-existing partial file must still be there, untouched.
    assert.ok(fs.existsSync(path.join(tmp, 'somecollection.bson')), 'partial files must be preserved, never deleted');
    assert.equal(fs.readFileSync(path.join(tmp, 'somecollection.bson'), 'utf8'), 'partial-data-placeholder');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('markBackupIncomplete() never throws even if writing the marker itself fails (best-effort only)', () => {
  // A path that does not exist at all: fs.writeFileSync inside
  // markBackupIncomplete will fail (ENOENT), and that failure must be
  // swallowed -- the real error is always thrown separately by the caller.
  assert.doesNotThrow(() => markBackupIncomplete('C:\\this\\path\\does\\not\\exist\\at\\all', 'some reason'));
});

test('markBackupIncomplete() never includes a connection string -- only the caller-supplied, already-redacted reason text', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-incomplete-redaction-'));
  try {
    markBackupIncomplete(tmp, 'mongodump failed (exit code 1).\n<REDACTED_URI> was never included here.');
    const markerContent = fs.readFileSync(path.join(tmp, 'INCOMPLETE_BACKUP.txt'), 'utf8');
    assert.ok(!/mongodb(\+srv)?:\/\//.test(markerContent), 'marker must never contain a connection-string-shaped value');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('backupDatabase.mjs source: every fail-closed path calls markBackupIncomplete() before rethrowing (Stage 9.6C: now 5 call sites, up from 2, since the TEST backup fail-closed lifecycle mirrors restoreCheckPreservationBackup.mjs\'s own)', () => {
  const codeOnly = BACKUP_DATABASE_SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const occurrences = codeOnly.match(/markBackupIncomplete\(/g) || [];
  // One occurrence is the function's own definition
  // (`export function markBackupIncomplete(...)`); the other five are its
  // call sites: the pre-emptive marker (written before mongodump runs), the
  // mongodump-failure catch block (both in backupDatabase()), and -- inside
  // finalizeVerifiedTestBackup() -- the nonzero-exit-code check, the
  // verifyEffectiveBackupTarget catch block, and the structural-integrity-
  // verification-failure check.
  assert.equal(occurrences.length, 6, `expected 1 definition + 5 call sites, found ${occurrences.length} total occurrences`);
});

test('backupDatabase() dry-run never creates a backup directory, so there is nothing to mark incomplete or otherwise', async () => {
  const result = await backupDatabase({ uri: ALLOWED_URI, commit: false });
  assert.equal(fs.existsSync(result.backupPath), false);
  assert.equal(fs.existsSync(path.join(result.backupPath, 'INCOMPLETE_BACKUP.txt')), false);
});

// --- Task 7P-SEC3: restoreDatabase() independently rejects an INCOMPLETE backup ---

// QA Bug 19 — Stage 9.6D: restoreDatabase() now also requires a valid
// completion manifest, which in turn requires the dump to be REAL,
// parseable BSON (not makeDummyBackupTree's placeholder text below) -- so
// this fixture is built with buildValidDumpFixture() and immediately
// finalized via finalizeVerifiedTestBackup(), producing a genuinely
// manifest-valid TEST backup. This is the correct baseline for any test
// that is about a LEGITIMATE restore succeeding (dry-run or otherwise)
// rather than about shape/marker/namespace rejection -- those continue to
// use makeDummyBackupTree() unchanged below, since all of those checks run
// BEFORE the new manifest check and so are entirely unaffected by it.
function makeFinalizedTestBackupTree(tmpRoot) {
  const outerDir = fs.mkdtempSync(path.join(tmpRoot, `${BACKUP_SOURCE_DB_NAME}-`));
  const nestedDir = path.join(outerDir, BACKUP_SOURCE_DB_NAME);
  buildValidDumpFixture(nestedDir, { collections: ['somecollection'] });
  finalizeVerifiedTestBackup({ backupPath: outerDir, restorePath: nestedDir, dbName: BACKUP_SOURCE_DB_NAME });
  return { outerDir, nestedDir };
}

// Builds a disposable, dummy mongodump-shaped directory tree:
//   <tmp>/<dbName>-<fake-timestamp>/            (the "outer" backupPath)
//     <dbName>/                                 (the "nested" restorePath -- what --from should point to)
//       somecollection.bson
// Returns { outerDir, nestedDir }. Caller is responsible for fs.rmSync(outerDir, {recursive: true}) afterward.
function makeDummyBackupTree(tmpRoot, dbName = 'vyoma_2_0_test') {
  const outerDir = fs.mkdtempSync(path.join(tmpRoot, `${dbName}-`));
  const nestedDir = path.join(outerDir, dbName);
  fs.mkdirSync(nestedDir);
  fs.writeFileSync(path.join(nestedDir, 'somecollection.bson'), 'dummy-data-placeholder');
  fs.writeFileSync(path.join(nestedDir, 'somecollection.metadata.json'), '{}');
  return { outerDir, nestedDir };
}

test('findIncompleteBackupMarker: returns null for a clean backup tree with no marker anywhere', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-clean-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    assert.equal(findIncompleteBackupMarker(nestedDir), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findIncompleteBackupMarker: finds the marker when it is in the parent of the given directory (the documented, expected case)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-parent-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE_BACKUP.txt'), 'INCOMPLETE -- test fixture');
    const found = findIncompleteBackupMarker(nestedDir);
    assert.equal(found, path.join(outerDir, 'INCOMPLETE_BACKUP.txt'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('findIncompleteBackupMarker: finds the marker when it is directly inside the given directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-direct-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(nestedDir, 'INCOMPLETE_BACKUP.txt'), 'INCOMPLETE -- test fixture');
    assert.equal(findIncompleteBackupMarker(nestedDir), path.join(nestedDir, 'INCOMPLETE_BACKUP.txt'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- QA Bug 19 — Stage 9.3A: the second, bare "INCOMPLETE" marker convention ---
test('INCOMPLETE_MARKER_FILENAMES covers exactly the two known marker conventions', () => {
  assert.deepEqual(INCOMPLETE_MARKER_FILENAMES, ['INCOMPLETE_BACKUP.txt', 'INCOMPLETE']);
});
test('findIncompleteBackupMarker: finds a bare "INCOMPLETE" marker in the PARENT directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-bare-parent-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE'), '');
    assert.equal(findIncompleteBackupMarker(nestedDir), path.join(outerDir, 'INCOMPLETE'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('findIncompleteBackupMarker: finds a bare "INCOMPLETE" marker DIRECTLY inside the given directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-bare-direct-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(nestedDir, 'INCOMPLETE'), '');
    assert.equal(findIncompleteBackupMarker(nestedDir), path.join(nestedDir, 'INCOMPLETE'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('findIncompleteBackupMarker: rejects when BOTH marker names are present (still refuses, reports the first match, no bypass)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-both-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE_BACKUP.txt'), 'mongodump failed.');
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE'), '');
    const found = findIncompleteBackupMarker(nestedDir);
    assert.ok(found === path.join(outerDir, 'INCOMPLETE_BACKUP.txt') || found === path.join(outerDir, 'INCOMPLETE'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreDatabase() refuses a backup marked with the bare "INCOMPLETE" marker, even in dry-run, and never touches any file', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-incomplete-bare-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE'), '');
    const beforeNested = fs.readdirSync(nestedDir).sort();
    const beforeOuter = fs.readdirSync(outerDir).sort();

    await assert.rejects(() => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }), /INCOMPLETE.*marks this backup as INCOMPLETE/s);

    assert.deepEqual(fs.readdirSync(nestedDir).sort(), beforeNested);
    assert.deepEqual(fs.readdirSync(outerDir).sort(), beforeOuter);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('findIncompleteBackupMarker: returns null when the directory tree is clean of BOTH marker conventions (no false positive)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-marker-clean-both-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    assert.equal(findIncompleteBackupMarker(nestedDir), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() dry-run succeeds against a clean, complete backup tree (regression: the new check must not affect a good backup)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-good-'));
  try {
    const { nestedDir } = makeFinalizedTestBackupTree(tmp);
    const result = await restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() refuses a backup marked INCOMPLETE in the parent directory, even in dry-run, before any shape check, and never touches any file', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-incomplete-parent-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE_BACKUP.txt'), 'mongodump failed (exit code 1).');

    const beforeNested = fs.readdirSync(nestedDir).sort();
    const beforeOuter = fs.readdirSync(outerDir).sort();

    await assert.rejects(
      () => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /INCOMPLETE_BACKUP\.txt.*INCOMPLETE/s
    );

    // Nothing in either directory was created, deleted, or renamed by the check.
    assert.deepEqual(fs.readdirSync(nestedDir).sort(), beforeNested);
    assert.deepEqual(fs.readdirSync(outerDir).sort(), beforeOuter);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() refuses a backup marked INCOMPLETE directly inside --from, and the rejection even survives --commit --confirm-restore (defense in depth)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-incomplete-direct-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(nestedDir, 'INCOMPLETE_BACKUP.txt'), 'mongodump failed (exit code 1).');

    await assert.rejects(
      () =>
        restoreDatabase({
          uri: RESTORE_TARGET_URI,
          from: nestedDir,
          commit: true,
          confirmRestore: true,
          understandsProduction: true,
        }),
      /INCOMPLETE_BACKUP\.txt.*INCOMPLETE/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() rejects an INCOMPLETE backup and the error never contains the raw URI', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-incomplete-redaction-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE_BACKUP.txt'), 'mongodump failed.');

    await assert.rejects(() => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }), (err) => {
      assert.ok(!err.message.includes(RESTORE_TARGET_URI), 'error message must never contain the raw URI');
      return true;
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() rejects the protected database before even checking whether --from exists, even with --commit --confirm-restore', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: PROTECTED_URI,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
        understandsProduction: true,
      }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('restoreDatabase() rejects a trailing-slash variant of the protected database (the exact bypass class this task hunted for)', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: PROTECTED_URI_TRAILING_SLASH,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
        understandsProduction: true,
      }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('restoreDatabase() against an allowlisted target still fails closed on a missing --from directory (proves the target-validation checks run first, not that a missing directory is ever silently accepted)', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: RESTORE_TARGET_URI,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: false,
      }),
    /Backup directory does not exist/
  );
});

// --- Task 7P-SEC4: restoreDatabase() target allowlist (restore into an isolated, disposable database only) ---

test('ALLOWED_RESTORE_TARGET_DB_NAMES contains exactly the one isolated, disposable verification database -- and it is NOT vyoma_2_0_test', () => {
  assert.deepEqual([...ALLOWED_RESTORE_TARGET_DB_NAMES], ['vyoma_2_0_test_restore_check']);
  assert.ok(!ALLOWED_RESTORE_TARGET_DB_NAMES.has('vyoma_2_0_test'), 'the live test database must never be on this allowlist');
});

test('assertAllowedRestoreTargetUri specifically and clearly rejects vyoma_2_0_test (the live test database), with its own distinct message', () => {
  assert.throws(() => assertAllowedRestoreTargetUri(LIVE_TEST_DB_AS_RESTORE_TARGET_URI, { label: 'test' }), (err) => {
    assert.match(err.message, /vyoma_2_0_test.*LIVE test database/s);
    assert.ok(!err.message.includes(LIVE_TEST_DB_AS_RESTORE_TARGET_URI), 'error message must never contain the raw URI');
    return true;
  });
});

test('assertAllowedRestoreTargetUri rejects a differently-cased variant of vyoma_2_0_test too (case-insensitive match)', () => {
  assert.throws(
    () => assertAllowedRestoreTargetUri('mongodb://127.0.0.1:27017/VYOMA_2_0_TEST', { label: 'test' }),
    /LIVE test database/
  );
});

test('assertAllowedRestoreTargetUri rejects any other non-allowlisted database generically (not the live test db, still refused)', () => {
  assert.throws(() => assertAllowedRestoreTargetUri(NOT_ALLOWLISTED_URI, { label: 'test' }), /some_disposable_db.*target allowlist/s);
});

test('assertAllowedRestoreTargetUri rejects the protected database name too (generic allowlist rejection, independent of the separate blocklist check)', () => {
  assert.throws(() => assertAllowedRestoreTargetUri(PROTECTED_URI, { label: 'test' }), /vyoma_migration_dryrun.*target allowlist/s);
});

test('assertAllowedRestoreTargetUri allows the exact allowlisted restore-check database, case-insensitively', () => {
  assert.equal(assertAllowedRestoreTargetUri(RESTORE_TARGET_URI, { label: 'test' }), 'vyoma_2_0_test_restore_check');
  assert.equal(
    assertAllowedRestoreTargetUri('mongodb://127.0.0.1:27017/VYOMA_2_0_TEST_RESTORE_CHECK', { label: 'test' }),
    'VYOMA_2_0_TEST_RESTORE_CHECK'
  );
});

// --- QA Bug 19 — Stage 9.3A: exact cluster-hostname validation (Stage 9.2C's confirmed gap) ---
test('APPROVED_RESTORE_CLUSTER_HOST is the exact expected TEST cluster', () => {
  assert.equal(APPROVED_RESTORE_CLUSTER_HOST, 'vyoma-test-cluster.ctnt2ww.mongodb.net');
});
test('assertExpectedRestoreClusterHost accepts the exact approved cluster host', () => {
  assert.equal(
    assertExpectedRestoreClusterHost(`mongodb+srv://u:p@${APPROVED_RESTORE_CLUSTER_HOST}/vyoma_2_0_test_restore_check`, { label: 'test' }),
    APPROVED_RESTORE_CLUSTER_HOST
  );
});
test('assertExpectedRestoreClusterHost rejects an entirely different hostname', () => {
  assert.throws(
    () => assertExpectedRestoreClusterHost('mongodb+srv://u:p@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test_restore_check', { label: 'test' }),
    /resolves to cluster host "some-other-cluster\.abc123\.mongodb\.net"/
  );
});
test('assertExpectedRestoreClusterHost rejects a deceptive hostname SUFFIX match (substring is not enough)', () => {
  assert.throws(
    () => assertExpectedRestoreClusterHost(`mongodb+srv://u:p@evil-${APPROVED_RESTORE_CLUSTER_HOST}/vyoma_2_0_test_restore_check`, { label: 'test' }),
    /resolves to cluster host/
  );
});
test('assertExpectedRestoreClusterHost rejects a deceptive hostname PREFIX match (the real host as a sub-path of an attacker domain)', () => {
  assert.throws(
    () => assertExpectedRestoreClusterHost(`mongodb+srv://u:p@${APPROVED_RESTORE_CLUSTER_HOST}.attacker.example/vyoma_2_0_test_restore_check`, { label: 'test' }),
    /resolves to cluster host "vyoma-test-cluster\.ctnt2ww\.mongodb\.net\.attacker\.example"/
  );
});
test('assertExpectedRestoreClusterHost rejects a malformed/unparseable URI', () => {
  assert.throws(() => assertExpectedRestoreClusterHost('not a url at all', { label: 'test' }), /could not be parsed/);
});
test('assertExpectedRestoreClusterHost rejects localhost (the dummy host every OTHER existing fixture used before this stage)', () => {
  assert.throws(() => assertExpectedRestoreClusterHost('mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check', { label: 'test' }), /resolves to cluster host "127\.0\.0\.1"/);
});
test('assertExpectedRestoreClusterHost never includes the raw URI (only the parsed hostname) in its error', () => {
  const uri = 'mongodb+srv://realuser:realpass@wrong-cluster.example.mongodb.net/vyoma_2_0_test_restore_check';
  try {
    assertExpectedRestoreClusterHost(uri, { label: 'test' });
    assert.fail('expected to throw');
  } catch (err) {
    assert.ok(!err.message.includes('realuser'));
    assert.ok(!err.message.includes('realpass'));
  }
});

test('restoreDatabase() refuses a correct database name on the WRONG cluster host, even with full --commit flags, before touching --from', async () => {
  const wrongClusterUri = 'mongodb+srv://u:p@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test_restore_check';
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: wrongClusterUri,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
      }),
    /resolves to cluster host "some-other-cluster\.abc123\.mongodb\.net"/
  );
});
test('restoreDatabase() dry-run against the correct cluster host and allowlisted database still succeeds (the new check does not break legitimate restore validation)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-correct-cluster-'));
  try {
    const { nestedDir } = makeFinalizedTestBackupTree(tmp);
    const result = await restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() refuses vyoma_2_0_test as a restore target before touching --from at all, even with a nonexistent directory and full --commit flags', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: LIVE_TEST_DB_AS_RESTORE_TARGET_URI,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
        understandsProduction: true,
      }),
    /vyoma_2_0_test.*LIVE test database/s
  );
});

test('restoreDatabase() refuses an unrelated, non-allowlisted database as a restore target, even with full --commit flags', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: NOT_ALLOWLISTED_URI,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
        understandsProduction: true,
      }),
    /some_disposable_db.*target allowlist/s
  );
});

test('restoreDatabase() still enforces the protected-name blocklist independently: it, not the new allowlist, is what fires for the protected name', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: PROTECTED_URI,
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: true,
        confirmRestore: true,
        understandsProduction: true,
      }),
    /vyoma_migration_dryrun.*protected list/s
  );
});

test('restoreDatabase() dry-run against the correctly-allowlisted restore-check target still succeeds (the new allowlist does not break legitimate restore validation)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-allowed-target-'));
  try {
    // --from's directory is named after the SOURCE database
    // ("vyoma_2_0_test", makeDummyBackupTree's default -- Task 7P-SEC11's
    // namespace check requires this); --uri (the TARGET) is the separately
    // allowlisted restore-check database. These are two independent names
    // on purpose -- conflating them in this test was itself a bug fixed
    // alongside Task 7P-SEC11's own change.
    const { nestedDir } = makeFinalizedTestBackupTree(tmp);
    const result = await restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, 'vyoma_2_0_test_restore_check');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('backupDatabase() dry-run against its own (different) allowlisted source target is entirely unaffected by the new restore-target allowlist', async () => {
  // Task 7P-SEC4's requirement "does not interfere with legitimate backup
  // creation" -- backupDatabase.mjs never imports or calls
  // assertAllowedRestoreTargetUri at all, so this is really just a
  // regression guard confirming backupDatabase() still behaves exactly as
  // before.
  const result = await backupDatabase({ uri: ALLOWED_URI, commit: false });
  assert.equal(result.ranForReal, false);
  assert.equal(result.dbName, 'vyoma_2_0_test');
});

// --- Task 7P-SEC11: explicit namespace mapping (--from must be named after the source) ---

test('BACKUP_SOURCE_DB_NAME is exactly "vyoma_2_0_test", the single source of truth ALLOWED_BACKUP_DB_NAMES is built from', () => {
  assert.equal(BACKUP_SOURCE_DB_NAME, 'vyoma_2_0_test');
  assert.ok(ALLOWED_BACKUP_DB_NAMES.has(BACKUP_SOURCE_DB_NAME));
});

test('assertExpectedSourceNamespace accepts a directory literally named after the source database', () => {
  assert.equal(assertExpectedSourceNamespace('/some/path/vyoma_2_0_test'), 'vyoma_2_0_test');
});

test('assertExpectedSourceNamespace rejects a directory named after anything else, naming only directory names (no URI involved at all)', () => {
  assert.throws(() => assertExpectedSourceNamespace('/some/path/some_other_db'), /some_other_db.*vyoma_2_0_test/s);
});

test('restoreDatabase() refuses a backup whose --from directory is not named "vyoma_2_0_test", even though the target URI is correctly allowlisted', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-wrong-source-name-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp, 'some_other_db');
    await assert.rejects(
      () => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /some_other_db.*vyoma_2_0_test/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreDatabase() refuses a wrongly-named --from directory even with full --commit flags, before any process would be spawned', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-wrong-source-name-commit-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp, 'some_other_db');
    await assert.rejects(
      () =>
        restoreDatabase({
          uri: RESTORE_TARGET_URI,
          from: nestedDir,
          commit: true,
          confirmRestore: true,
          understandsProduction: true,
        }),
      /some_other_db.*vyoma_2_0_test/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Task 7P-SEC16: MONGODB_URI environment-variable fallback (pure string selection, no network) ---

test('resolveRestoreUri: an explicit --uri always wins over MONGODB_URI', () => {
  const result = resolveRestoreUri({ uri: RESTORE_TARGET_URI, env: { MONGODB_URI: 'mongodb://127.0.0.1:27017/some_other_db' } });
  assert.equal(result, RESTORE_TARGET_URI);
});

test('resolveRestoreUri: falls back to MONGODB_URI when --uri is omitted', () => {
  const result = resolveRestoreUri({ uri: undefined, env: { MONGODB_URI: RESTORE_TARGET_URI } });
  assert.equal(result, RESTORE_TARGET_URI);
});

test('resolveRestoreUri: returns null (never throws) when neither --uri nor MONGODB_URI is present, or MONGODB_URI is blank/whitespace-only', () => {
  assert.equal(resolveRestoreUri({ uri: undefined, env: {} }), null);
  assert.equal(resolveRestoreUri({ uri: undefined, env: { MONGODB_URI: '' } }), null);
  assert.equal(resolveRestoreUri({ uri: undefined, env: { MONGODB_URI: '   ' } }), null);
});

test('restoreDatabase() throws a clear error naming both the --uri flag and the MONGODB_URI environment variable when neither is given', async () => {
  // This test's own environment (running the suite via `npm test`) may
  // itself have MONGODB_URI set to a placeholder, which resolveRestoreUri()
  // would otherwise legitimately pick up -- temporarily cleared here so
  // this test actually exercises the "neither is given" case.
  const originalEnv = process.env.MONGODB_URI;
  try {
    delete process.env.MONGODB_URI;
    await assert.rejects(() => restoreDatabase({ uri: undefined, from: '/irrelevant', commit: false }), (err) => {
      assert.match(err.message, /--uri is required, or set the MONGODB_URI environment variable/);
      return true;
    });
  } finally {
    if (originalEnv === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalEnv;
  }
});

test('restoreDatabase() dry-run succeeds using MONGODB_URI alone (no --uri argument at all), and never prints or logs the URI, username, or password from either source', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-env-fallback-'));
  const credentialedEnvUri = 'mongodb+srv://envuser:env-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check';
  const originalEnv = process.env.MONGODB_URI;
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    process.env.MONGODB_URI = credentialedEnvUri;
    const { nestedDir } = makeFinalizedTestBackupTree(tmp);
    const result = await restoreDatabase({ uri: undefined, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, 'vyoma_2_0_test_restore_check');
    const allLoggedText = logged.join('\n');
    assert.ok(!allLoggedText.includes('envuser'), 'the username must never be printed/logged');
    assert.ok(!allLoggedText.includes('env-secret-password'), 'the password must never be printed/logged');
    assert.ok(!allLoggedText.includes(credentialedEnvUri), 'the raw URI must never be printed/logged');
  } finally {
    console.log = originalLog;
    if (originalEnv === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalEnv;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Task 7P-SEC11: credential splitting (pure string parsing, no network) ---

test('splitCredentialsFromUri splits username and password apart and strips them from the returned URI, preserving the rest', () => {
  const result = splitCredentialsFromUri('mongodb+srv://myuser:mypass@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check?retryWrites=true');
  assert.equal(result.username, 'myuser');
  assert.equal(result.password, 'mypass');
  assert.ok(!result.uriWithoutCredentials.includes('myuser'), 'returned URI must not contain the username');
  assert.ok(!result.uriWithoutCredentials.includes('mypass'), 'returned URI must not contain the password');
  assert.match(result.uriWithoutCredentials, /^mongodb\+srv:\/\/vyoma-test-cluster\.ctnt2ww\.mongodb\.net\/vyoma_2_0_test_restore_check\?retryWrites=true$/);
});

test('splitCredentialsFromUri decodes a percent-encoded password', () => {
  // Dummy password containing an encoded @ character.
  const result = splitCredentialsFromUri('mongodb://fixture-user:fixture%40password@localhost:27017/test_fixture');
  assert.equal(result.password, 'fixture@password');
});

test('splitCredentialsFromUri returns the URI unchanged (and null credentials) when there are none to split', () => {
  const bare = 'mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check';
  const result = splitCredentialsFromUri(bare);
  assert.equal(result.username, null);
  assert.equal(result.password, null);
  assert.equal(result.uriWithoutCredentials, bare);
});

// --- Task 7P-SEC14: temporary --config YAML (replaces the stdin-password approach) ---

test('buildRestoreConfigYaml includes uri/password as simple key: value lines, properly quoted', () => {
  const yaml = buildRestoreConfigYaml({
    uriWithoutCredentials: 'mongodb+srv://vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check',
    password: 'dummy-secret-value',
  });
  assert.match(yaml, /^uri: "mongodb\+srv:\/\/vyoma-test-cluster\.ctnt2ww\.mongodb\.net\/vyoma_2_0_test_restore_check"$/m);
  assert.match(yaml, /^password: "dummy-secret-value"$/m);
});

// Task 7P-SEC15 regression test — reproduces the exact real-world failure:
// a real restore attempt against the SEC14 version of this file failed
// with `error parsing config file: [2:1] unknown field "username"`,
// because mongorestore's documented --config schema is only `password`,
// `uri`, and `sslPEMKeyPassword` (confirmed directly against MongoDB's
// official mongorestore/mongodump reference docs for the installed
// 100.20.1) -- `username` has never been a valid key in this file, at any
// supported version. Even if a caller mistakenly passes a `username`
// property, the function must never write a `username:` line, since doing
// so is exactly the bug that caused the real failure.
test('buildRestoreConfigYaml never writes a "username" key -- it is not part of mongorestore\'s documented --config schema (regression test for the real "unknown field \\"username\\"" failure)', () => {
  const yaml = buildRestoreConfigYaml({
    uriWithoutCredentials: 'mongodb+srv://vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check',
    username: 'vyoma_backup_readonly',
    password: 'dummy-secret-value',
  });
  assert.ok(!yaml.includes('username'), 'the config file must never contain a "username" field -- mongorestore does not support one there');
});

test('buildRestoreConfigYaml omits the password line entirely when there is none', () => {
  const yaml = buildRestoreConfigYaml({ uriWithoutCredentials: 'mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check', password: null });
  assert.ok(!yaml.includes('password:'));
  assert.ok(!yaml.includes('username:'));
});

test('buildRestoreConfigYaml escapes double quotes and backslashes in a password so the resulting YAML stays valid and unambiguous', () => {
  const tricky = 'p"a\\ss#word: not-a-comment';
  const yaml = buildRestoreConfigYaml({ uriWithoutCredentials: 'mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check', password: tricky });
  // The raw, unescaped tricky value must never appear verbatim; only its escaped form should.
  assert.ok(!yaml.includes(`"${tricky}"`), 'the unescaped password must not appear as a bare quoted scalar');
  assert.match(yaml, /password: "p\\"a\\\\ss#word: not-a-comment"/);
});

test('writeTempRestoreConfig writes the file outside the repository, under the OS temp root, and cleanupTempRestoreConfig removes it completely', () => {
  const yaml = buildRestoreConfigYaml({ uriWithoutCredentials: 'mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check', password: 'dummy-secret-value' });
  const { configDir, configPath } = writeTempRestoreConfig(yaml);
  try {
    assert.ok(configDir.startsWith(os.tmpdir()), 'the temp directory must be created under the OS temp root, never inside the repo');
    assert.ok(fs.existsSync(configPath));
    assert.equal(fs.readFileSync(configPath, 'utf8'), yaml);
  } finally {
    cleanupTempRestoreConfig(configDir);
  }
  assert.ok(!fs.existsSync(configDir), 'the temp directory (and the config file inside it) must be fully removed after cleanup');
});

test('cleanupTempRestoreConfig never throws, even for a directory that does not exist or was already removed', () => {
  assert.doesNotThrow(() => cleanupTempRestoreConfig('C:\\this\\path\\does\\not\\exist\\at\\all'));
  assert.doesNotThrow(() => cleanupTempRestoreConfig(null));
  assert.doesNotThrow(() => cleanupTempRestoreConfig(undefined));
});

// --- Task 7P-SEC14: mongorestore argument construction (pure, no process spawned) ---

test('buildMongorestoreArgs without a username only ever contains --config, the namespace mapping, and --drop/from -- never a URI or password', () => {
  const args = buildMongorestoreArgs({
    configPath: 'C:\\temp\\vyoma-restore-config-xyz\\mongorestore-config.yaml',
    from: '/some/path/vyoma_2_0_test',
    dbName: 'vyoma_2_0_test_restore_check',
    drop: false,
  });
  assert.deepEqual(args, [
    '--config=C:\\temp\\vyoma-restore-config-xyz\\mongorestore-config.yaml',
    '--nsInclude=vyoma_2_0_test.*',
    '--nsFrom=vyoma_2_0_test.*',
    '--nsTo=vyoma_2_0_test_restore_check.*',
    '/some/path/vyoma_2_0_test',
  ]);
  const joined = args.join(' ').toLowerCase();
  assert.ok(!joined.includes('password'), 'args must never mention a password flag at all');
  assert.ok(!joined.includes('--uri='), 'the URI must live in the config file, never as its own CLI argument');
});

// Task 7P-SEC15 — username is now an explicit --username=<value> CLI
// argument (it is not a supported --config file field; see
// buildRestoreConfigYaml()'s own comment), placed immediately after
// --config and before the namespace-mapping flags.
test('buildMongorestoreArgs includes --username=<value> when a username is given, and still never a password or raw URI', () => {
  const args = buildMongorestoreArgs({
    configPath: 'C:\\temp\\config.yaml',
    from: '/some/path/vyoma_2_0_test',
    dbName: 'vyoma_2_0_test_restore_check',
    drop: false,
    username: 'vyoma_backup_readonly',
  });
  assert.deepEqual(args, [
    '--config=C:\\temp\\config.yaml',
    '--username=vyoma_backup_readonly',
    '--nsInclude=vyoma_2_0_test.*',
    '--nsFrom=vyoma_2_0_test.*',
    '--nsTo=vyoma_2_0_test_restore_check.*',
    '/some/path/vyoma_2_0_test',
  ]);
  const joined = args.join(' ').toLowerCase();
  assert.ok(!joined.includes('password'), 'args must never mention a password flag at all');
  assert.ok(!joined.includes('--uri='), 'the URI must live in the config file, never as its own CLI argument');
});

test('buildMongorestoreArgs includes --drop only when explicitly requested', () => {
  const args = buildMongorestoreArgs({
    configPath: 'C:\\temp\\config.yaml',
    from: '/some/path/vyoma_2_0_test',
    dbName: 'vyoma_2_0_test_restore_check',
    drop: true,
  });
  assert.ok(args.includes('--drop'));
});

// --- Task 7P-SEC14: runRestoreProcess, tested against a harmless Node stand-in, never mongorestore ---

test('runRestoreProcess resolves with captured stdout/stderr for a normal, fast-completing process, with no stdin pipe involved', async () => {
  const args = ['-e', 'process.stdout.write("fine");'];
  const { stdout } = await runRestoreProcess(process.execPath, args);
  assert.equal(stdout, 'fine');
});

test('runRestoreProcess rejects with the exit code and captured output when the child exits non-zero', async () => {
  const args = ['-e', 'process.stderr.write("boom"); process.exit(7);'];
  await assert.rejects(() => runRestoreProcess(process.execPath, args), (err) => {
    assert.equal(err.code, 7);
    assert.ok(err.stderr.includes('boom'));
    return true;
  });
});

test('runRestoreProcess rejects cleanly if the binary itself does not exist (never mongorestore, never a real connection)', async () => {
  await assert.rejects(() => runRestoreProcess('this-binary-definitely-does-not-exist-anywhere', []));
});

test('runRestoreProcess kills a process that produces NO output at all and rejects with TIMEOUT_STARTUP once the startup window elapses', async () => {
  // A stand-in that deliberately never exits AND never produces any
  // output -- never mongorestore, never a real connection.
  const args = ['-e', 'setInterval(() => {}, 1000);'];
  const start = Date.now();
  await assert.rejects(() => runRestoreProcess(process.execPath, args, { startupTimeoutMs: 300, idleTimeoutMs: 100000 }), (err) => {
    assert.equal(err.code, 'TIMEOUT_STARTUP');
    assert.match(err.message, /did not exit within 300ms of starting/);
    return true;
  });
  assert.ok(Date.now() - start < 5000, 'expected the startup timeout to fire quickly');
});

test('runRestoreProcess does NOT kill a process that keeps producing output for longer than a single short timeout would allow (the idle timer, not a flat whole-process timeout, governs once output begins)', async () => {
  // Produces output every 100ms for a full 2 seconds -- comfortably longer
  // than SEC12's old flat DEFAULT_TIMEOUT_MS (15s is generous too, but the
  // point is duration-independence, not a specific number). If the
  // (replaced) flat/whole-process timeout were still in effect with a
  // short value, this would have been killed partway through; the
  // idle-based design must not kill it, since it never actually goes
  // quiet. startupTimeoutMs is deliberately generous here (unrelated to
  // what's being tested) to avoid flakiness from Node's own process-start
  // overhead under load.
  const args = [
    '-e',
    "let n = 0; const t = setInterval(() => { process.stdout.write('tick '); if (++n >= 20) { clearInterval(t); process.exit(0); } }, 100);",
  ];
  const { stdout } = await runRestoreProcess(process.execPath, args, { startupTimeoutMs: 5000, idleTimeoutMs: 5000 });
  assert.ok(stdout.includes('tick'), 'expected to see the periodic output, proving the process ran to completion rather than being killed');
});

test('runRestoreProcess kills a process that produces some output, then goes silent, and rejects with TIMEOUT_IDLE, including whatever partial output was already captured', async () => {
  const args = ['-e', "process.stdout.write('partial-output'); setInterval(() => {}, 1000);"];
  await assert.rejects(() => runRestoreProcess(process.execPath, args, { startupTimeoutMs: 5000, idleTimeoutMs: 300 }), (err) => {
    assert.equal(err.code, 'TIMEOUT_IDLE');
    assert.match(err.message, /no further output for 300ms/);
    assert.ok(err.stdout.includes('partial-output'), 'partial output captured before the stall must still be surfaced to the caller');
    return true;
  });
});

test('runRestoreProcess spawns with stdin explicitly ignored -- nothing is ever written to or read from it', () => {
  assert.match(RESTORE_CODE_ONLY, /stdio:\s*\['ignore',\s*'pipe',\s*'pipe'\]/);
  assert.ok(!RESTORE_CODE_ONLY.includes('.stdin.write'), 'no code path may write to a child\'s stdin anymore');
});

test('DEFAULT_STARTUP_TIMEOUT_MS and DEFAULT_IDLE_TIMEOUT_MS are sane, bounded values, with the idle window clearly longer than the startup window', () => {
  assert.ok(DEFAULT_STARTUP_TIMEOUT_MS >= 5000 && DEFAULT_STARTUP_TIMEOUT_MS <= 60000);
  assert.ok(DEFAULT_IDLE_TIMEOUT_MS > DEFAULT_STARTUP_TIMEOUT_MS);
  assert.ok(DEFAULT_IDLE_TIMEOUT_MS <= 600000, 'the idle timeout should still be bounded, not effectively infinite');
});

// --- Task 7P-SEC14: restoreDatabase()'s own wiring (static checks -- no mongorestore execution) ---

test('restoreDatabase() reports a mid-restore failure with explicit "RESTORE INCOMPLETE" wording, never implying success', () => {
  assert.match(RESTORE_CODE_ONLY, /RESTORE INCOMPLETE -- mongorestore failed/);
  assert.match(RESTORE_CODE_ONLY, /may contain partial data; do not treat this as a successful restore/);
});

test('restoreDatabase() always cleans up the temporary config directory via a finally block, regardless of outcome', () => {
  assert.match(RESTORE_CODE_ONLY, /finally\s*\{\s*cleanupTempRestoreConfig\(configDir\);\s*\}/);
});

test('restoreDatabase() no longer imports or references the removed stdin-password mechanism', () => {
  assert.ok(!RESTORE_CODE_ONLY.includes('runProcessWithStdinSecret'));
  assert.ok(!RESTORE_CODE_ONLY.includes('DEFAULT_TIMEOUT_MS'));
});

// --- Task 7P-SEC15: fix for the real "unknown field \"username\"" mongorestore failure ---

test('buildRestoreConfigYaml\'s source never writes a "username" key into the config file -- confirmed at the source-text level, not just via its return value', () => {
  const fnSource = RESTORE_CODE_ONLY.slice(
    RESTORE_CODE_ONLY.indexOf('export function buildRestoreConfigYaml'),
    RESTORE_CODE_ONLY.indexOf('export function writeTempRestoreConfig')
  );
  assert.ok(!fnSource.includes('username'), 'buildRestoreConfigYaml must never reference "username" at all -- it is not a supported --config file field');
});

test('restoreDatabase() passes the parsed username to buildMongorestoreArgs (as a CLI argument), never to buildRestoreConfigYaml (not a supported config-file field)', () => {
  assert.match(RESTORE_CODE_ONLY, /buildRestoreConfigYaml\(\{\s*uriWithoutCredentials,\s*password\s*\}\)/);
  assert.match(RESTORE_CODE_ONLY, /buildMongorestoreArgs\(\{\s*configPath,\s*from,\s*dbName,\s*drop,\s*username\s*\}\)/);
});

// --- Task 7P-SEC16: static checks -- resolveRestoreUri() is the only way `uri` is ever determined ---

test('restoreDatabase() resolves its uri exclusively through resolveRestoreUri(), never by reading --uri directly', () => {
  assert.match(RESTORE_CODE_ONLY, /resolveRestoreUri\(\{\s*uri\s*\}\)/);
});

test('restoreDatabase.mjs imports MONGODB_URI_ENV_VAR (and, as of Stage 9.3C, buildChildEnvWithoutMongoUri) from backupDatabase.mjs rather than declaring a second, independent copy of either', () => {
  assert.match(RESTORE_CODE_ONLY, /import\s*\{[^}]*\bMONGODB_URI_ENV_VAR\b[^}]*\}\s*from\s*'\.\/backupDatabase\.mjs'/);
  assert.match(RESTORE_CODE_ONLY, /import\s*\{[^}]*\bbuildChildEnvWithoutMongoUri\b[^}]*\}\s*from\s*'\.\/backupDatabase\.mjs'/);
  assert.ok(!RESTORE_CODE_ONLY.includes('function buildChildEnvWithoutMongoUri'), 'must not redeclare buildChildEnvWithoutMongoUri -- it must come from backupDatabase.mjs');
});

// =====================================================================
// QA Bug 19 — Stage 9.3A: restoreCheckSelfRecovery.mjs (narrowly scoped
// self-recovery of the vyoma_2_0_test_restore_check preservation backup).
// =====================================================================

test('RECOVERY_DB_NAME is exactly the one disposable restore-check database, same value for both source and target', () => {
  assert.equal(RECOVERY_DB_NAME, 'vyoma_2_0_test_restore_check');
});

test('restoreCheckSelfRecovery.mjs reuses restoreDatabase.mjs\'s own helpers rather than duplicating them', () => {
  assert.match(RECOVERY_CODE_ONLY, /import\s*\{[\s\S]*?\}\s*from\s*'\.\/restoreDatabase\.mjs'/);
  assert.ok(!RECOVERY_CODE_ONLY.includes('function buildMongorestoreArgs'), 'must not redeclare buildMongorestoreArgs');
  assert.ok(!RECOVERY_CODE_ONLY.includes('function runRestoreProcess'), 'must not redeclare runRestoreProcess');
  assert.ok(!RECOVERY_CODE_ONLY.includes('function splitCredentialsFromUri'), 'must not redeclare splitCredentialsFromUri');
  assert.ok(!RECOVERY_CODE_ONLY.includes('function findIncompleteBackupMarker'), 'must not redeclare findIncompleteBackupMarker');
});
test('restoreCheckSelfRecovery.mjs imports the same protected-database and cluster-host guards as restoreDatabase.mjs, unchanged', () => {
  assert.match(RECOVERY_CODE_ONLY, /import\s*\{\s*assertNotProtectedDbUri,\s*assertAllowedRestoreTargetUri,\s*assertExpectedRestoreClusterHost\s*\}\s*from\s*'\.\/protectedDbGuard\.mjs'/);
});
test('restoreCheckSelfRecovery.mjs always overrides sourceDbName to RECOVERY_DB_NAME, never leaving it at buildMongorestoreArgs\' default', () => {
  assert.match(RECOVERY_CODE_ONLY, /buildMongorestoreArgs\(\{[^}]*sourceDbName:\s*RECOVERY_DB_NAME/);
});
test('restoreCheckSelfRecovery.mjs cleans up its temp config file in a finally block, same as restoreDatabase.mjs', () => {
  assert.match(RECOVERY_CODE_ONLY, /finally\s*\{\s*cleanupTempRestoreConfig\(configDir\);\s*\}/);
});
test('restoreCheckSelfRecovery.mjs never pipes anything to a child process\'s stdin', () => {
  assert.match(RECOVERY_CODE_ONLY, /stdio:\s*\['ignore',\s*'pipe',\s*'pipe'\]|runRestoreProcess\(/);
  assert.ok(!RECOVERY_CODE_ONLY.includes('.stdin.write'));
});
test('restoreCheckSelfRecovery.mjs reports recovery failure with explicit "RECOVERY INCOMPLETE" wording, never implying success', () => {
  assert.match(RECOVERY_CODE_ONLY, /RECOVERY INCOMPLETE -- mongorestore failed/);
  assert.match(RECOVERY_CODE_ONLY, /may contain partial data; do not treat this as a successful recovery/);
});

// --- Import safety: importing the module must never execute anything or connect ---
test('import safety: restoreCheckSelfRecovery.mjs only calls main() inside the same isDirectCliInvocation guard restoreDatabase.mjs uses, never unconditionally at module scope', () => {
  assert.match(RECOVERY_CODE_ONLY, /const isDirectCliInvocation = process\.argv\[1\][\s\S]*if \(isDirectCliInvocation\) \{\s*main\(\)/);
});

// Stage 9.4B: restoreCheckRecovery() now also requires a valid completion
// manifest, which in turn requires the dump to be REAL, parseable BSON (not
// makeDummyBackupTree's placeholder text) -- so this fixture is built with
// buildValidDumpFixture() and immediately finalized, producing a genuinely
// manifest-valid recovery backup, the correct baseline for every test below
// that is about the recovery TARGET/scenario rather than about shape/BSON
// validity itself (those are covered separately above).
function makeRecoveryBackupTree(tmpRoot) {
  const outerDir = fs.mkdtempSync(path.join(tmpRoot, `${RECOVERY_DB_NAME}-`));
  const nestedDir = path.join(outerDir, RECOVERY_DB_NAME);
  buildValidDumpFixture(nestedDir, { collections: ['somecollection'] });
  finalizeVerifiedBackup({ backupPath: outerDir, restorePath: nestedDir, dbName: RECOVERY_DB_NAME });
  return { outerDir, nestedDir };
}

test('restoreCheckRecovery() dry-run succeeds against a clean, correctly-named recovery backup, correct target, and correct cluster', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-good-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    const result = await restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, RECOVERY_DB_NAME);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() refuses a --from directory named "vyoma_2_0_test" (the ORIGINAL TEST backup source, not this tool\'s own recovery source)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-wrong-source-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp, 'vyoma_2_0_test');
    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /vyoma_2_0_test.*vyoma_2_0_test_restore_check/s
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() refuses an unrelated/unrecognized --from directory name', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-unrelated-source-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp, 'some_other_db');
    await assert.rejects(() => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() refuses the live vyoma_2_0_test as a recovery TARGET, same allowlist as restoreDatabase.mjs, unchanged', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-wrong-target-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    await assert.rejects(
      () => restoreCheckRecovery({ uri: LIVE_TEST_DB_AS_RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /LIVE test database/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() refuses a non-allowlisted recovery target database', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-not-allowlisted-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    await assert.rejects(() => restoreCheckRecovery({ uri: NOT_ALLOWLISTED_URI, from: nestedDir, commit: false }), /target allowlist/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() refuses the wrong cluster host, even with the correct recovery database name', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-wrong-cluster-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    const wrongClusterUri = 'mongodb+srv://u:p@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test_restore_check';
    await assert.rejects(() => restoreCheckRecovery({ uri: wrongClusterUri, from: nestedDir, commit: false }), /resolves to cluster host/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Resolves the Stage 9.2C "marker contradiction": the preserved recovery ---
// --- backup currently has an INCOMPLETE marker, and MUST be correctly rejected ---
test('restoreCheckRecovery() correctly REJECTS a recovery backup marked with the bare "INCOMPLETE" marker (resolves the Stage 9.2C contradiction -- the actual preserved backup is NOT currently restorable by design, not by bypass)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-incomplete-'));
  try {
    const { outerDir, nestedDir } = makeRecoveryBackupTree(tmp);
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE'), '');
    const beforeNested = fs.readdirSync(nestedDir).sort();
    await assert.rejects(() => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }), /marks this backup as INCOMPLETE/);
    assert.deepEqual(fs.readdirSync(nestedDir).sort(), beforeNested);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckRecovery() correctly rejects the INCOMPLETE_BACKUP.txt convention too, in the recovery backup\'s own directory', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-incomplete-txt-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    fs.writeFileSync(path.join(nestedDir, 'INCOMPLETE_BACKUP.txt'), 'mongodump failed.');
    await assert.rejects(() => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }), /marks this backup as INCOMPLETE/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('restoreCheckRecovery() requires --commit AND --confirm-restore together, refusing --commit alone', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-missing-confirm-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: true, confirmRestore: false }),
      /--confirm-restore/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Mocked partial-restore failure (no real mongorestore is ever spawned) ---
test('restoreCheckRecovery() reports a mocked mongorestore failure as "RECOVERY INCOMPLETE", cleans up its temp config regardless, and never claims success', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-mocked-failure-'));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    let capturedConfigDir = null;
    const realWrite = fs.writeFileSync;
    t.mock.method(fs, 'writeFileSync', (p, ...rest) => {
      if (String(p).endsWith('mongorestore-config.yaml')) capturedConfigDir = path.dirname(p);
      return realWrite(p, ...rest);
    });

    // Point at a nonexistent binary so the real child_process spawn fails
    // immediately with ENOENT -- this exercises the exact failure/cleanup
    // path without ever successfully running (or needing) a real mongorestore.
    await assert.rejects(
      () =>
        restoreCheckRecovery({
          uri: RESTORE_TARGET_URI,
          from: nestedDir,
          toolsDir: tmp, // mongorestore(.exe) does not exist here
          commit: true,
          confirmRestore: true,
        }),
      /RECOVERY INCOMPLETE/
    );

    assert.ok(capturedConfigDir, 'expected a temp config file to have been written before the spawn attempt');
    assert.equal(fs.existsSync(capturedConfigDir), false, 'temp config directory must be cleaned up even after a spawn failure');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Credential redaction + temp config permissions, reused unchanged from restoreDatabase.mjs ---
test('restoreCheckRecovery() never logs the raw uri, username, or password, including on a mocked failure', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-redaction-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const { nestedDir } = makeRecoveryBackupTree(tmp);
    const credentialedUri = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check';
    await assert.rejects(() =>
      restoreCheckRecovery({ uri: credentialedUri, from: nestedDir, toolsDir: tmp, commit: true, confirmRestore: true })
    );
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(credentialedUri));
  } finally {
    console.log = originalLog;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =====================================================================
// QA Bug 19 — Stage 9.3C: restoreCheckPreservationBackup.mjs (narrowly
// scoped preservation backup of vyoma_2_0_test_restore_check, BEFORE a
// destructive restore drill ever reuses it).
// =====================================================================

test('PRESERVATION_SOURCE_DB_NAME is exactly the one disposable restore-check database', () => {
  assert.equal(PRESERVATION_SOURCE_DB_NAME, 'vyoma_2_0_test_restore_check');
});

test('assertApprovedPreservationBackupSourceUri accepts the exact approved source', () => {
  assert.equal(assertApprovedPreservationBackupSourceUri(RESTORE_TARGET_URI, { label: 'test' }), 'vyoma_2_0_test_restore_check');
});
test("assertApprovedPreservationBackupSourceUri rejects vyoma_2_0_test (the ORIGINAL TEST backup source, not this tool's own source)", () => {
  assert.throws(() => assertApprovedPreservationBackupSourceUri(LIVE_TEST_DB_AS_RESTORE_TARGET_URI, { label: 'test' }), /vyoma_2_0_test.*not the.*approved preservation-backup source/s);
});
test('assertApprovedPreservationBackupSourceUri rejects any other unrelated database', () => {
  assert.throws(() => assertApprovedPreservationBackupSourceUri(NOT_ALLOWLISTED_URI, { label: 'test' }), /some_disposable_db/);
});

function makeFakeObjectId() {
  return new ObjectId();
}

// Builds a hand-crafted, genuinely VALID mongodump-shaped dump directory --
// real BSON documents (serialized with the real `bson` package, same one
// the production code uses to parse them), real JSON metadata, a real
// prelude.json. This stands in for "a dump mongodump already successfully
// produced" without ever invoking mongodump itself.
function buildValidDumpFixture(restorePath, { collections = ['testcol'], docsPerCollection = 2 } = {}) {
  fs.mkdirSync(restorePath, { recursive: true });
  for (const name of collections) {
    const docs = Array.from({ length: docsPerCollection }, (_, i) => ({ _id: makeFakeObjectId(), n: i }));
    const buf = Buffer.concat(docs.map((d) => serialize(d)));
    fs.writeFileSync(path.join(restorePath, `${name}.bson`), buf);
    fs.writeFileSync(path.join(restorePath, `${name}.metadata.json`), JSON.stringify({ options: {}, indexes: [{ key: { _id: 1 }, name: '_id_' }] }));
  }
  fs.writeFileSync(path.join(restorePath, 'prelude.json'), JSON.stringify({ ServerVersion: '8.0.0', ToolVersion: '100.20.1' }));
}

// --- Deep structural verification (new logic) -----------------------------
test('verifyDumpIntegrity reports success (no errors) for a genuinely valid dump fixture, with real counts/hashes', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-valid-'));
  try {
    buildValidDumpFixture(tmp, { collections: ['alpha', 'beta'], docsPerCollection: 3 });
    const result = verifyDumpIntegrity(tmp);
    assert.deepEqual(result.errors, []);
    assert.equal(result.collections.length, 2);
    assert.equal(result.totalDocuments, 6);
    assert.equal(result.totalIndexes, 2);
    assert.ok(result.collections.every((c) => /^[0-9a-f]{64}$/.test(c.bsonSha256) && /^[0-9a-f]{64}$/.test(c.metaSha256)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('verifyDumpIntegrity reports an error for a truncated/corrupt .bson file', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-corrupt-'));
  try {
    buildValidDumpFixture(tmp, { collections: ['alpha'] });
    const buf = fs.readFileSync(path.join(tmp, 'alpha.bson'));
    fs.writeFileSync(path.join(tmp, 'alpha.bson'), buf.subarray(0, buf.length - 3)); // truncate
    const result = verifyDumpIntegrity(tmp);
    assert.ok(result.errors.some((e) => /BSON parse FAILED|not fully consumed/.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('verifyDumpIntegrity reports an error for a collection missing its metadata.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-nometa-'));
  try {
    buildValidDumpFixture(tmp, { collections: ['alpha'] });
    fs.rmSync(path.join(tmp, 'alpha.metadata.json'));
    const result = verifyDumpIntegrity(tmp);
    assert.ok(result.errors.some((e) => /missing its \.metadata\.json/.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('verifyDumpIntegrity reports an error for an empty directory (no .bson files at all)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-empty-'));
  try {
    const result = verifyDumpIntegrity(tmp);
    assert.ok(result.errors.some((e) => /No \.bson files found/.test(e)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Backup finalization lifecycle: successful "mocked dump completion" ---
// --- (the fixture stands in for mongodump's own real output) --------------
test('finalizeVerifiedBackup: on a valid fixture, removes the pre-existing marker and writes complete evidence (successful mocked dump completion + finalization evidence)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-finalize-ok-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'] });
    // Simulate the pre-dump marker this tool itself would have written
    // before invoking mongodump (the fail-closed-by-default step).
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Preservation backup in progress.');

    const integrity = finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME, mongodumpExitCode: 0 });

    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), false, 'marker must be removed after verified success');
    const evidencePath = path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json');
    assert.ok(fs.existsSync(evidencePath), 'completion evidence file must be written');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.sourceDatabase, PRESERVATION_SOURCE_DB_NAME);
    assert.equal(evidence.mongodumpExitCode, 0);
    assert.equal(evidence.classification, 'completed-and-integrity-verified');
    assert.equal(evidence.restoreVerification.performed, false);
    assert.equal(evidence.structuralVerification.totalDocuments, integrity.totalDocuments);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Backup finalization lifecycle: failed/invalid "mocked dump" ----------
// --- marker PRESERVATION on failure (never removed, never bypassed) ------
test('finalizeVerifiedBackup: PRESERVES the marker and never writes evidence when structural verification fails (invalid/interrupted mocked dump)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-finalize-bad-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    fs.mkdirSync(restorePath, { recursive: true }); // deliberately empty/invalid dump
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Preservation backup in progress.');

    assert.throws(
      () => finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME, mongodumpExitCode: 0 }),
      /Structural integrity verification FAILED/
    );
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true, 'marker must be PRESERVED, never removed, on a failed verification');
    assert.equal(fs.existsSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json')), false, 'no completion evidence must ever be written for a failed verification');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedBackup: PRESERVES the marker when the expected effective-target subdirectory is missing entirely', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-finalize-notarget-'));
  try {
    const backupPath = tmp; // no 'vyoma_2_0_test_restore_check' subdir created at all
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Preservation backup in progress.');
    assert.throws(() => finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME }));
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- restoreCheckPreservationBackup() orchestrator: pre-spawn guards + dry-run ---
test('restoreCheckPreservationBackup() rejects the protected database before anything else', async () => {
  await assert.rejects(() => restoreCheckPreservationBackup({ uri: PROTECTED_URI, commit: true }), /protected list/);
});
test('restoreCheckPreservationBackup() rejects the live vyoma_2_0_test as a source, even with --commit', async () => {
  await assert.rejects(() => restoreCheckPreservationBackup({ uri: LIVE_TEST_DB_AS_RESTORE_TARGET_URI, commit: true }), /not the.*approved preservation-backup source/s);
});
test('restoreCheckPreservationBackup() rejects an unrelated, non-allowlisted database as a source', async () => {
  await assert.rejects(() => restoreCheckPreservationBackup({ uri: NOT_ALLOWLISTED_URI, commit: true }));
});
test('restoreCheckPreservationBackup() rejects the wrong cluster host, even with the correct database name', async () => {
  const wrongClusterUri = 'mongodb+srv://u:p@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test_restore_check';
  await assert.rejects(() => restoreCheckPreservationBackup({ uri: wrongClusterUri, commit: true }), /resolves to cluster host/);
});
test('restoreCheckPreservationBackup() dry-run succeeds, reports the correct backup/restore paths, and spawns nothing', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-dryrun-'));
  try {
    const result = await restoreCheckPreservationBackup({ uri: RESTORE_TARGET_URI, outDir: tmp, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, 'vyoma_2_0_test_restore_check');
    assert.equal(fs.readdirSync(tmp).length, 0, 'dry-run must create no files or directories at all');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckPreservationBackup() never overwrites an existing backup directory (same timestamp forced via mocked Date)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-01T00:00:00.000Z') });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-collision-'));
  try {
    const expectedDirName = `vyoma_2_0_test_restore_check-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.mkdirSync(path.join(tmp, expectedDirName), { recursive: true });
    await assert.rejects(
      () => restoreCheckPreservationBackup({ uri: RESTORE_TARGET_URI, outDir: tmp, toolsDir: tmp, commit: true }),
      /Refusing to overwrite an existing backup directory/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckPreservationBackup() marks INCOMPLETE and reports failure when mongodump cannot even be spawned (nonexistent binary -- no real mongodump ever runs)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-spawn-fail-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-spawn-fail-out-'));
  try {
    await assert.rejects(
      () => restoreCheckPreservationBackup({ uri: RESTORE_TARGET_URI, outDir, toolsDir: tmp, commit: true }),
      /mongodump failed|Marked INCOMPLETE/
    );
    const created = fs.readdirSync(outDir);
    assert.equal(created.length, 1, 'exactly one backup directory should have been created');
    const markerPath = path.join(outDir, created[0], 'INCOMPLETE_BACKUP.txt');
    assert.equal(fs.existsSync(markerPath), true, 'the pre-emptive marker must survive a spawn failure');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

// --- Recovery compatibility (offline only -- does NOT claim restorability is proven) ---
test('recovery compatibility: a finalized preservation backup (valid fixture + finalizeVerifiedBackup) is accepted by restoreCheckRecovery() in dry-run', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-recovery-compat-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'in progress');
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    // Confirmed offline only: dry-run acceptance. This does NOT claim an
    // actual restore has been tested -- see restoreCheckRecovery()'s own
    // "DRY-RUN complete" wording, never "restored successfully".
    const result = await restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false });
    assert.equal(result.ranForReal, false);
    assert.equal(result.dbName, RECOVERY_DB_NAME);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test("recovery compatibility: restoreCheckRecovery() correctly rejects a preservation backup that still carries its marker (not finalized)", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-recovery-notfinalized-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'in progress'); // never finalized
    await assert.rejects(() => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false }), /marks this backup as INCOMPLETE/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Credential safety (dummy credentials only) ---------------------------
test('restoreCheckPreservationBackup() never logs the raw uri, username, or password, including on a spawn failure', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-redaction-tools-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-redaction-out-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const credentialedUri = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check';
    await assert.rejects(() => restoreCheckPreservationBackup({ uri: credentialedUri, outDir, toolsDir: tmp, commit: true }));
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(credentialedUri));
  } finally {
    console.log = originalLog;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

// --- Child-process environment scrubbing (Stage 9.3C credential-safety fix) ---
test('buildChildEnvWithoutMongoUri removes MONGODB_URI from a copy of the given environment, leaving everything else untouched', async () => {
  const { buildChildEnvWithoutMongoUri } = await import('../../scripts/backup/backupDatabase.mjs');
  const fakeEnv = { MONGODB_URI: 'mongodb+srv://u:p@vyoma-test-cluster.ctnt2ww.mongodb.net/db', PATH: '/usr/bin', OTHER: 'x' };
  const scrubbed = buildChildEnvWithoutMongoUri(fakeEnv);
  assert.equal(scrubbed.MONGODB_URI, undefined);
  assert.equal(scrubbed.PATH, '/usr/bin');
  assert.equal(scrubbed.OTHER, 'x');
  assert.equal(fakeEnv.MONGODB_URI, 'mongodb+srv://u:p@vyoma-test-cluster.ctnt2ww.mongodb.net/db', 'the original object passed in must not be mutated');
});
test('restoreDatabase.mjs and restoreCheckSelfRecovery.mjs both pass a scrubbed env to runRestoreProcess, never the raw process.env', () => {
  assert.match(RESTORE_CODE_ONLY, /runRestoreProcess\(mongorestoreBin,\s*execArgs,\s*\{\s*env:\s*buildChildEnvWithoutMongoUri\(\)\s*\}\)/);
  assert.match(RECOVERY_CODE_ONLY, /runRestoreProcess\(mongorestoreBin,\s*execArgs,\s*\{\s*env:\s*buildChildEnvWithoutMongoUri\(\)\s*\}\)/);
});
test("backupDatabase.mjs and restoreCheckPreservationBackup.mjs both pass a scrubbed env to their mongodump execFileAsync call", () => {
  const BACKUP_CODE_ONLY = BACKUP_DATABASE_SOURCE.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const PRESERVATION_SOURCE = fs.readFileSync(new URL('../../scripts/backup/restoreCheckPreservationBackup.mjs', import.meta.url), 'utf8');
  const PRESERVATION_CODE_ONLY = PRESERVATION_SOURCE.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  assert.match(BACKUP_CODE_ONLY, /execFileAsync\(mongodumpBin,\s*\[[^\]]*\],\s*\{\s*env:\s*buildChildEnvWithoutMongoUri\(\)\s*\}\)/);
  assert.match(PRESERVATION_CODE_ONLY, /execFileAsync\(mongodumpBin,\s*\[[^\]]*\],\s*\{\s*env:\s*buildChildEnvWithoutMongoUri\(\)\s*\}\)/);
});

// =============================================================================
// QA Bug 19 — Stage 9.4B: atomic backup finalization + recovery manifest
// validation. Uses only temporary fixtures and mocked filesystem failures --
// never a real mongodump/mongorestore process.
// =============================================================================

function sampleManifestEvidence(overrides = {}) {
  return {
    sourceDatabase: PRESERVATION_SOURCE_DB_NAME,
    clusterHost: APPROVED_RESTORE_CLUSTER_HOST,
    backupPath: '/irrelevant/for/these/unit/tests',
    restorePath: '/irrelevant/for/these/unit/tests',
    completedAt: new Date().toISOString(),
    mongodumpExitCode: 0,
    classification: 'completed-and-integrity-verified',
    restoreVerification: { performed: false, note: 'test fixture' },
    structuralVerification: { errors: [], collections: [], totalDocuments: 0, totalIndexes: 0, totalFiles: 0, totalSizeBytes: 0 },
    ...overrides,
  };
}

// Writes a completion manifest DIRECTLY (bypassing finalizeVerifiedBackup
// entirely), for testing validateManifestForRecovery()'s own defenses
// against a manifest that is malformed, tampered with, or otherwise never
// could have been produced by finalizeVerifiedBackup itself.
function writeFakeManifest(backupPath, overrides = {}) {
  fs.writeFileSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json'), JSON.stringify(sampleManifestEvidence(overrides)));
}

// --- Correct finalization ordering (successful case) -----------------------
test('finalizeVerifiedBackup: correct operation ordering -- the marker stays present through the rename and is removed only last; no temp manifest file is left behind', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-order-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const markerPath = path.join(backupPath, 'INCOMPLETE_BACKUP.txt');
    fs.writeFileSync(markerPath, 'in progress');

    const calls = [];
    const originalRenameSync = fs.renameSync.bind(fs);
    const originalRmSync = fs.rmSync.bind(fs);
    t.mock.method(fs, 'renameSync', (from, to) => {
      calls.push('rename');
      assert.equal(fs.existsSync(markerPath), true, 'marker must still be present at rename time');
      return originalRenameSync(from, to);
    });
    t.mock.method(fs, 'rmSync', (p, opts) => {
      if (p === markerPath) calls.push('marker-removed');
      return originalRmSync(p, opts);
    });

    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    assert.deepEqual(calls, ['rename', 'marker-removed'], 'the manifest rename must happen strictly before marker removal');
    assert.equal(fs.existsSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json')), true);
    assert.equal(fs.existsSync(markerPath), false);
    const leftoverTemp = fs.readdirSync(backupPath).filter((f) => f.includes('.tmp-'));
    assert.deepEqual(leftoverTemp, [], 'no temp manifest file should remain after a successful finalize');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Manifest write failure --------------------------------------------------
test('writeAndVerifyManifest: temp-file open/write failure throws, writes no final manifest, and leaves no temp file behind', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-write-fail-'));
  try {
    t.mock.method(fs, 'openSync', () => { throw new Error('simulated ENOSPC on open'); });
    assert.throws(() => writeAndVerifyManifest(tmp, sampleManifestEvidence(), 'PRESERVATION_BACKUP_COMPLETE.json'), /simulated ENOSPC on open/);
    assert.equal(fs.existsSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
    assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.includes('.tmp-')), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Manifest synchronization (fsync) failure -------------------------------
test('writeAndVerifyManifest: fsync failure throws, writes no final manifest, and leaves no temp file behind', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-fsync-fail-'));
  try {
    t.mock.method(fs, 'fsyncSync', () => { throw new Error('simulated fsync failure'); });
    assert.throws(() => writeAndVerifyManifest(tmp, sampleManifestEvidence(), 'PRESERVATION_BACKUP_COMPLETE.json'), /simulated fsync failure/);
    assert.equal(fs.existsSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
    assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.includes('.tmp-')), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedBackup: an fsync failure during manifest write leaves the INCOMPLETE marker present and writes no manifest (interrupted finalization)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-interrupted-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const markerPath = path.join(backupPath, 'INCOMPLETE_BACKUP.txt');
    fs.writeFileSync(markerPath, 'in progress');

    t.mock.method(fs, 'fsyncSync', () => { throw new Error('simulated interruption'); });

    assert.throws(() => finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME }), /simulated interruption/);
    assert.equal(fs.existsSync(markerPath), true, 'marker must remain present after an interrupted finalization');
    assert.equal(fs.existsSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Manifest rename failure -------------------------------------------------
test('writeAndVerifyManifest: rename failure throws, writes no final manifest, and leaves no temp file behind', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-rename-fail-'));
  try {
    t.mock.method(fs, 'renameSync', () => { throw new Error('simulated rename failure'); });
    assert.throws(() => writeAndVerifyManifest(tmp, sampleManifestEvidence(), 'PRESERVATION_BACKUP_COMPLETE.json'), /simulated rename failure/);
    assert.equal(fs.existsSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
    assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.includes('.tmp-')), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Manifest read-back / validation failure (before rename) ---------------
test('writeAndVerifyManifest: temp-file read-back failure (content silently corrupted during write) is caught before rename -- no final manifest is ever produced', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-readback-mismatch-'));
  try {
    const originalWriteSync = fs.writeSync.bind(fs);
    t.mock.method(fs, 'writeSync', (fd, data) => originalWriteSync(fd, typeof data === 'string' ? '{"not":"the expected evidence"}' : data));
    assert.throws(() => writeAndVerifyManifest(tmp, sampleManifestEvidence(), 'PRESERVATION_BACKUP_COMPLETE.json'), /failed read-back validation/);
    assert.equal(fs.existsSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
    assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.includes('.tmp-')), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('writeAndVerifyManifest: temp-file read-back failure (truncated/invalid JSON) is caught before rename -- no final manifest is ever produced', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-readback-invalid-'));
  try {
    const originalWriteSync = fs.writeSync.bind(fs);
    t.mock.method(fs, 'writeSync', (fd, data) => originalWriteSync(fd, typeof data === 'string' ? '{not valid json' : data));
    assert.throws(() => writeAndVerifyManifest(tmp, sampleManifestEvidence(), 'PRESERVATION_BACKUP_COMPLETE.json'), /not valid JSON/);
    assert.equal(fs.existsSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json')), false);
    assert.deepEqual(fs.readdirSync(tmp).filter((f) => f.includes('.tmp-')), []);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedBackup: a final read-back failure AFTER a successful rename still throws, and leaves the INCOMPLETE marker present (backup remains non-recovery-eligible)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-final-readback-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const markerPath = path.join(backupPath, 'INCOMPLETE_BACKUP.txt');
    fs.writeFileSync(markerPath, 'in progress');

    const originalReadFileSync = fs.readFileSync.bind(fs);
    let callCount = 0;
    t.mock.method(fs, 'readFileSync', (p, enc) => {
      callCount += 1;
      if (callCount === 2) throw new Error('simulated final read-back failure');
      return originalReadFileSync(p, enc);
    });

    assert.throws(() => finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME }));
    assert.equal(fs.existsSync(markerPath), true, 'marker must remain present when the final read-back fails, even though the rename itself already succeeded');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Marker removal failure --------------------------------------------------
test('finalizeVerifiedBackup: a marker-removal failure leaves the manifest written but the marker still present, so the backup remains non-recovery-eligible', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-marker-rm-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const markerPath = path.join(backupPath, 'INCOMPLETE_BACKUP.txt');
    fs.writeFileSync(markerPath, 'in progress');

    const originalRmSync = fs.rmSync.bind(fs);
    t.mock.method(fs, 'rmSync', (p, opts) => {
      if (p === markerPath) throw new Error('simulated permission error removing marker');
      return originalRmSync(p, opts);
    });

    assert.throws(
      () => finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME }),
      /removing the INCOMPLETE marker failed/
    );
    assert.equal(fs.existsSync(markerPath), true, 'marker must remain present when its removal fails');
    assert.equal(fs.existsSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json')), true, 'the manifest itself was written and verified successfully');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Recovery manifest validation: missing / malformed ----------------------
test('validateManifestForRecovery: rejects when the completion manifest is simply missing', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-missing-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects malformed (invalid JSON) manifest content', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-malformed-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json'), '{not valid json');
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a manifest missing a required field', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-missing-field-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const evidence = sampleManifestEvidence();
    delete evidence.mongodumpExitCode;
    fs.writeFileSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json'), JSON.stringify(evidence));
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /missing one or more required fields/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Recovery manifest validation: incorrect identity / exit code / errors --
test('validateManifestForRecovery: rejects a manifest recording the wrong source database', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-wrongdb-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeManifest(tmp, { sourceDatabase: 'some_other_db' });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /source database.*does not match/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a manifest recording the wrong cluster host', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-wrongcluster-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeManifest(tmp, { clusterHost: 'evil-cluster.example.net' });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /cluster host.*does not match/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a manifest recording a nonzero mongodump exit code', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-nonzero-exit-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeManifest(tmp, { mongodumpExitCode: 1 });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /nonzero mongodump exit code/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a manifest recording structural verification errors', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-recorded-errors-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeManifest(tmp, { structuralVerification: { errors: ['fake recorded error'], collections: [], totalDocuments: 0, totalIndexes: 0, totalFiles: 0, totalSizeBytes: 0 } });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /structural verification errors/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery does not require restoreVerification.performed to be true -- an integrity-verified-only backup still qualifies', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-norestoreverify-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const manifest = JSON.parse(fs.readFileSync(path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json'), 'utf8'));
    assert.equal(manifest.restoreVerification.performed, false, 'sanity check: finalizeVerifiedBackup never claims a restore was performed');
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, true, 'an integrity-verified-but-never-restored backup must still be accepted for its first restore attempt');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Tampering after finalization: BSON/metadata hash or size mismatch -----
test('validateManifestForRecovery / restoreCheckRecovery: rejects a backup whose .bson file was modified after finalization (hash and size mismatch)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-tamper-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });

    // Tamper AFTER finalization: still a structurally valid, parseable BSON
    // stream (so verifyDumpIntegrity's own error list stays empty), but
    // different content, size, and hash than what the manifest recorded.
    buildValidDumpFixture(restorePath, { collections: ['alpha'], docsPerCollection: 5 });

    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /modified since finalization/);

    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false }),
      /modified since finalization/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- End-to-end: restoreCheckRecovery() enforces the manifest requirement, --
// --- and every rejection happens before --commit is even consulted ---------
test('restoreCheckRecovery(): refuses a syntactically valid but never-finalized backup (no manifest at all) before any commit/restore logic runs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-e2e-missing-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] }); // no marker, no manifest -- never finalized
    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false }),
      /completion manifest validation failed -- Completion manifest not found/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckRecovery(): a properly finalized preservation backup is still accepted (regression -- the new manifest requirement does not break the legitimate case)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-e2e-valid-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const result = await restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false });
    assert.equal(result.ranForReal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckRecovery(): the existing INCOMPLETE-marker rejection still fires BEFORE the new manifest check (regression -- ordering unchanged)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-e2e-marker-first-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(tmp, 'INCOMPLETE_BACKUP.txt'), 'in progress'); // not finalized -- no manifest either
    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false }),
      /marks this backup as INCOMPLETE/ // the marker reason, not the (also-true) missing-manifest reason
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckRecovery(): the existing namespace-protection regression still holds (wrong --from directory name refused regardless of manifest state)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'preservation-manifest-e2e-namespace-'));
  try {
    const wrongNameRestorePath = path.join(tmp, 'some_other_db_name');
    buildValidDumpFixture(wrongNameRestorePath, { collections: ['alpha'] });
    await assert.rejects(() => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: wrongNameRestorePath, commit: false }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// =============================================================================
// QA Bug 19 — Stage 9.6C: TEST backup fail-closed completion-evidence
// lifecycle (backupDatabase.mjs / finalizeVerifiedTestBackup(), sharing
// dumpIntegrity.mjs with restoreCheckPreservationBackup.mjs). Uses only
// temporary fixtures and mocked filesystem failures -- never a real
// mongodump process.
// =============================================================================

function sampleTestBackupEvidence(overrides = {}) {
  return {
    sourceDatabase: BACKUP_SOURCE_DB_NAME,
    clusterHost: APPROVED_RESTORE_CLUSTER_HOST,
    backupPath: '/irrelevant/for/these/unit/tests',
    restorePath: '/irrelevant/for/these/unit/tests',
    completedAt: new Date().toISOString(),
    mongodumpExitCode: 0,
    classification: 'completed-and-integrity-verified',
    restoreVerification: { performed: false, note: 'test fixture' },
    structuralVerification: { errors: [], collections: [], totalDocuments: 0, totalIndexes: 0, totalFiles: 0, totalSizeBytes: 0 },
    ...overrides,
  };
}

// --- Successful finalization produces valid completion evidence ------------
test('finalizeVerifiedTestBackup: on a valid fixture, removes the pre-existing marker and writes complete BACKUP_COMPLETE.json evidence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-finalize-ok-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    const integrity = finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME, mongodumpExitCode: 0 });

    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), false, 'marker must be removed after verified success');
    const evidencePath = path.join(backupPath, 'BACKUP_COMPLETE.json');
    assert.ok(fs.existsSync(evidencePath), 'BACKUP_COMPLETE.json must be written');
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.sourceDatabase, BACKUP_SOURCE_DB_NAME);
    assert.equal(evidence.clusterHost, APPROVED_RESTORE_CLUSTER_HOST);
    assert.equal(evidence.mongodumpExitCode, 0);
    assert.equal(evidence.classification, 'completed-and-integrity-verified');
    assert.equal(evidence.restoreVerification.performed, false);
    assert.equal(evidence.structuralVerification.totalDocuments, integrity.totalDocuments);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Invalid/truncated BSON and missing metadata are rejected ---------------
test('finalizeVerifiedTestBackup: PRESERVES the marker and never writes evidence when the BSON stream is truncated/corrupt', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-finalize-corrupt-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const buf = fs.readFileSync(path.join(restorePath, 'alpha.bson'));
    fs.writeFileSync(path.join(restorePath, 'alpha.bson'), buf.subarray(0, buf.length - 3));
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    assert.throws(
      () => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME, mongodumpExitCode: 0 }),
      /Structural integrity verification FAILED/
    );
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true, 'marker must be PRESERVED on a failed verification');
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedTestBackup: PRESERVES the marker and never writes evidence when a collection is missing its .metadata.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-finalize-nometa-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.rmSync(path.join(restorePath, 'alpha.metadata.json'));
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    assert.throws(
      () => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME, mongodumpExitCode: 0 }),
      /Structural integrity verification FAILED/
    );
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Nonzero mongodump exit code is refused even before any other check ----
test('finalizeVerifiedTestBackup: refuses to finalize a nonzero recorded mongodump exit code, and marks INCOMPLETE', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-finalize-nonzero-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    assert.throws(
      () => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME, mongodumpExitCode: 1 }),
      /recorded mongodump exit code was 1, not 0/
    );
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Hash/inventory correctness: the manifest's recorded hashes genuinely ---
// --- match the actual files, independently recomputed here -----------------
test('finalizeVerifiedTestBackup: every recorded SHA256/size in BACKUP_COMPLETE.json matches an independent recomputation from the actual files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-finalize-hashcheck-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'], docsPerCollection: 4 });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME, mongodumpExitCode: 0 });

    const evidence = JSON.parse(fs.readFileSync(path.join(backupPath, 'BACKUP_COMPLETE.json'), 'utf8'));
    for (const entry of evidence.structuralVerification.collections) {
      const bsonBuf = fs.readFileSync(path.join(restorePath, `${entry.name}.bson`));
      const metaBuf = fs.readFileSync(path.join(restorePath, `${entry.name}.metadata.json`));
      assert.equal(entry.bsonSha256, crypto.createHash('sha256').update(bsonBuf).digest('hex'));
      assert.equal(entry.bsonSizeBytes, bsonBuf.length);
      assert.equal(entry.metaSha256, crypto.createHash('sha256').update(metaBuf).digest('hex'));
      assert.equal(entry.metaSizeBytes, metaBuf.length);
    }
    assert.equal(evidence.structuralVerification.collections.length, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
// --- Manifest write / fsync / rename / read-back failures retain the marker -
test('finalizeVerifiedTestBackup: a manifest write failure (open) leaves the marker present and writes no evidence', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-write-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    t.mock.method(fs, 'openSync', () => { throw new Error('simulated ENOSPC on open'); });

    assert.throws(() => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME }), /simulated ENOSPC on open/);
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedTestBackup: a manifest fsync failure leaves the marker present and writes no evidence (interrupted finalization)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-fsync-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    t.mock.method(fs, 'fsyncSync', () => { throw new Error('simulated interruption'); });

    assert.throws(() => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME }), /simulated interruption/);
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedTestBackup: a manifest rename failure leaves the marker present and writes no evidence', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-rename-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    t.mock.method(fs, 'renameSync', () => { throw new Error('simulated rename failure'); });

    assert.throws(() => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME }), /simulated rename failure/);
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('finalizeVerifiedTestBackup: a manifest read-back failure (content silently corrupted during write) leaves the marker present and writes no evidence', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-readback-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt'), 'Backup in progress.');

    const originalWriteSync = fs.writeSync.bind(fs);
    t.mock.method(fs, 'writeSync', (fd, data) => originalWriteSync(fd, typeof data === 'string' ? '{"not":"the expected evidence"}' : data));

    assert.throws(() => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME }), /failed read-back validation/);
    assert.equal(fs.existsSync(path.join(backupPath, 'INCOMPLETE_BACKUP.txt')), true);
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), false);
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Marker removal failure never reports successful completion ------------
test('finalizeVerifiedTestBackup: a marker-removal failure leaves the manifest written but the marker still present, and the call itself throws (never reports success)', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-marker-rm-fail-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const markerPath = path.join(backupPath, 'INCOMPLETE_BACKUP.txt');
    fs.writeFileSync(markerPath, 'Backup in progress.');

    const originalRmSync = fs.rmSync.bind(fs);
    t.mock.method(fs, 'rmSync', (p, opts) => {
      if (p === markerPath) throw new Error('simulated permission error removing marker');
      return originalRmSync(p, opts);
    });

    assert.throws(
      () => finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME }),
      /removing the INCOMPLETE marker failed/
    );
    assert.equal(fs.existsSync(markerPath), true, 'marker must remain present when its removal fails');
    assert.equal(fs.existsSync(path.join(backupPath, 'BACKUP_COMPLETE.json')), true, 'the manifest itself was written and verified successfully');
  } finally {
    t.mock.restoreAll();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Full backupDatabase() orchestrator: marker-before-dump, overwrite -----
// --- protection, mongodump-failure, and credential redaction ---------------
test('backupDatabase() refuses to overwrite an existing backup directory, even with --commit (same timestamp forced via mocked Date)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-02T00:00:00.000Z') });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-collision-'));
  try {
    const expectedDirName = `${BACKUP_SOURCE_DB_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.mkdirSync(path.join(tmp, expectedDirName), { recursive: true });
    await assert.rejects(
      () => backupDatabase({ uri: ALLOWED_URI, outDir: tmp, toolsDir: tmp, commit: true }),
      /Refusing to overwrite an existing backup directory/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('backupDatabase() marks INCOMPLETE (the marker written BEFORE mongodump is ever invoked) when mongodump cannot even be spawned (nonexistent binary -- no real mongodump ever runs)', async () => {
  const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-spawn-fail-tools-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-spawn-fail-out-'));
  try {
    await assert.rejects(
      () => backupDatabase({ uri: ALLOWED_URI, outDir, toolsDir, commit: true }),
      /mongodump failed|Marked INCOMPLETE/
    );
    const created = fs.readdirSync(outDir);
    assert.equal(created.length, 1, 'exactly one backup directory should have been created');
    const markerPath = path.join(outDir, created[0], 'INCOMPLETE_BACKUP.txt');
    assert.equal(fs.existsSync(markerPath), true, 'the pre-emptive marker must survive a spawn failure');
    const markerContent = fs.readFileSync(markerPath, 'utf8');
    assert.match(markerContent, /INCOMPLETE/);
  } finally {
    fs.rmSync(toolsDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
test('backupDatabase() never logs the raw uri, username, or password, including on a spawn failure (credentials excluded from logs)', async () => {
  const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-redaction-tools-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-redaction-out-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const credentialedUri = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test';
    await assert.rejects(() => backupDatabase({ uri: credentialedUri, outDir, toolsDir, commit: true }));
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(credentialedUri));
  } finally {
    console.log = originalLog;
    fs.rmSync(toolsDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
test('backupDatabase() never writes credentials into BACKUP_COMPLETE.json -- a spawn failure produces only INCOMPLETE_BACKUP.txt, and its content never contains the raw URI', async () => {
  const toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-manifest-cred-tools-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testbackup-manifest-cred-out-'));
  try {
    const credentialedUri = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test';
    await assert.rejects(() => backupDatabase({ uri: credentialedUri, outDir, toolsDir, commit: true }));
    const created = fs.readdirSync(outDir);
    assert.equal(fs.existsSync(path.join(outDir, created[0], 'BACKUP_COMPLETE.json')), false);
    const markerContent = fs.readFileSync(path.join(outDir, created[0], 'INCOMPLETE_BACKUP.txt'), 'utf8');
    assert.ok(!markerContent.includes('dummy-secret-password'));
    assert.ok(!markerContent.includes(credentialedUri));
  } finally {
    fs.rmSync(toolsDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

// --- No circular module dependency ------------------------------------------
test('dumpIntegrity.mjs has zero dependency on backupDatabase.mjs, restoreDatabase.mjs, or restoreCheckPreservationBackup.mjs (no circular import is possible)', () => {
  const dumpIntegritySource = fs.readFileSync(new URL('../../scripts/backup/dumpIntegrity.mjs', import.meta.url), 'utf8');
  assert.ok(!/from\s+['"]\.\/backupDatabase\.mjs['"]/.test(dumpIntegritySource));
  assert.ok(!/from\s+['"]\.\/restoreDatabase\.mjs['"]/.test(dumpIntegritySource));
  assert.ok(!/from\s+['"]\.\/restoreCheckPreservationBackup\.mjs['"]/.test(dumpIntegritySource));
});
test('backupDatabase.mjs does not import from restoreDatabase.mjs or restoreCheckPreservationBackup.mjs (both of which import FROM backupDatabase.mjs -- importing back would close a cycle)', () => {
  assert.ok(!/from\s+['"]\.\/restoreDatabase\.mjs['"]/.test(BACKUP_DATABASE_SOURCE));
  assert.ok(!/from\s+['"]\.\/restoreCheckPreservationBackup\.mjs['"]/.test(BACKUP_DATABASE_SOURCE));
});
test('backupDatabase.mjs and restoreCheckPreservationBackup.mjs both reuse the SAME shared writeAndVerifyManifest/verifyDumpIntegrity from dumpIntegrity.mjs, with their own distinct manifest filenames, rather than duplicating the logic', () => {
  const PRESERVATION_SOURCE = fs.readFileSync(new URL('../../scripts/backup/restoreCheckPreservationBackup.mjs', import.meta.url), 'utf8');
  assert.match(BACKUP_DATABASE_SOURCE, /import\s*\{[^}]*\bverifyDumpIntegrity\b[^}]*\bwriteAndVerifyManifest\b[^}]*\}\s*from\s*'\.\/dumpIntegrity\.mjs'/s);
  assert.match(PRESERVATION_SOURCE, /from\s*'\.\/dumpIntegrity\.mjs'/);
  assert.ok(!BACKUP_DATABASE_SOURCE.includes('function verifyDumpIntegrity'), 'must not redeclare verifyDumpIntegrity');
  assert.ok(!PRESERVATION_SOURCE.includes('function verifyDumpIntegrity'), 'must not redeclare verifyDumpIntegrity');
  assert.match(BACKUP_DATABASE_SOURCE, /writeAndVerifyManifest\(backupPath,\s*evidence,\s*BACKUP_COMPLETE_MANIFEST_FILENAME\)/);
  assert.match(PRESERVATION_SOURCE, /writeAndVerifyManifest\(backupPath,\s*evidence,\s*COMPLETION_MANIFEST_FILENAME\)/);
});

// =============================================================================
// QA Bug 19 — Stage 9.6D: mandatory TEST restore completion-manifest
// enforcement (restoreDatabase.mjs / validateTestBackupManifestForRestore(),
// backupDatabase.mjs). Uses only temporary fixtures -- never a real
// mongodump/mongorestore process.
// =============================================================================

// Writes a completion manifest DIRECTLY (bypassing finalizeVerifiedTestBackup
// entirely), for testing validateTestBackupManifestForRestore()'s own
// defenses against a manifest that is malformed, tampered with, or otherwise
// never could have been produced by finalizeVerifiedTestBackup itself.
function writeFakeTestBackupManifest(backupPath, overrides = {}) {
  fs.writeFileSync(path.join(backupPath, 'BACKUP_COMPLETE.json'), JSON.stringify(sampleTestBackupEvidence(overrides)));
}

// --- Valid manifest accepted; missing/malformed manifest rejected -----------
test('validateTestBackupManifestForRestore: accepts a genuinely finalized TEST backup', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-valid-'));
  try {
    const { outerDir, nestedDir } = (() => {
      const outerDir = fs.mkdtempSync(path.join(tmp, `${BACKUP_SOURCE_DB_NAME}-`));
      const nestedDir = path.join(outerDir, BACKUP_SOURCE_DB_NAME);
      buildValidDumpFixture(nestedDir, { collections: ['alpha'] });
      finalizeVerifiedTestBackup({ backupPath: outerDir, restorePath: nestedDir, dbName: BACKUP_SOURCE_DB_NAME });
      return { outerDir, nestedDir };
    })();
    const result = validateTestBackupManifestForRestore(nestedDir);
    assert.equal(result.ok, true);
    assert.equal(result.manifest.restoreVerification.performed, false, 'sanity: an integrity-verified-but-never-restored backup must still qualify');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects when BACKUP_COMPLETE.json is simply missing (legacy backup)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-missing-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /not found/);
    assert.match(result.reason, /fresh TEST backup/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects malformed (invalid JSON) manifest content', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-malformed-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(tmp, 'BACKUP_COMPLETE.json'), '{not valid json');
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /not valid JSON/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects a manifest missing a required field, or with a wrongly-typed field', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-badschema-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    const missingField = sampleTestBackupEvidence();
    delete missingField.mongodumpExitCode;
    fs.writeFileSync(path.join(tmp, 'BACKUP_COMPLETE.json'), JSON.stringify(missingField));
    const r1 = validateTestBackupManifestForRestore(restorePath);
    assert.equal(r1.ok, false);
    assert.match(r1.reason, /missing one or more required fields/);

    fs.rmSync(path.join(tmp, 'BACKUP_COMPLETE.json'));
    writeFakeTestBackupManifest(tmp, { mongodumpExitCode: '0' }); // string, not number -- "incorrectly typed"
    const r2 = validateTestBackupManifestForRestore(restorePath);
    assert.equal(r2.ok, false);
    assert.match(r2.reason, /missing one or more required fields|wrong type/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Identity / exit-code / classification / recorded-error rejections -----
test('validateTestBackupManifestForRestore: rejects a manifest recording the wrong source database', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-wrongdb-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeTestBackupManifest(tmp, { sourceDatabase: 'some_other_db' });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /source database.*does not match/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects a manifest recording the wrong cluster host', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-wrongcluster-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeTestBackupManifest(tmp, { clusterHost: 'evil-cluster.example.net' });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /cluster host.*does not match/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects a manifest recording a nonzero mongodump exit code', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-nonzero-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeTestBackupManifest(tmp, { mongodumpExitCode: 1 });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /nonzero mongodump exit code/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects an incorrect completion classification', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-classification-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeTestBackupManifest(tmp, { classification: 'exit-code-only' });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /classification.*is not "completed-and-integrity-verified"/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects a manifest recording structural verification errors', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-recorded-errors-'));
  try {
    const restorePath = path.join(tmp, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    writeFakeTestBackupManifest(tmp, { structuralVerification: { errors: ['fake recorded error'], collections: [], totalDocuments: 0, totalIndexes: 0, totalFiles: 0, totalSizeBytes: 0 } });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /structural verification errors/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Preservation-backup manifest rejected by the NORMAL TEST restore tool -
test('validateTestBackupManifestForRestore: rejects a preservation-backup manifest (PRESERVATION_BACKUP_COMPLETE.json) with a specific, distinct diagnostic', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-preservation-confused-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME }); // writes PRESERVATION_BACKUP_COMPLETE.json, not BACKUP_COMPLETE.json
    const result = validateTestBackupManifestForRestore(restorePath, { expectedSourceDbName: BACKUP_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /PRESERVATION_BACKUP_COMPLETE\.json.*instead of.*BACKUP_COMPLETE\.json/s);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Inventory mismatches: missing file, additional file, counts, hashes ---
test('validateTestBackupManifestForRestore: rejects when a collection recorded in the manifest is missing from the backup directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-missingfile-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'] });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    fs.rmSync(path.join(restorePath, 'beta.bson'));
    fs.rmSync(path.join(restorePath, 'beta.metadata.json'));
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /lists 2 collection\(s\) but the backup directory currently contains 1/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects an ADDITIONAL restorable file not recorded in the manifest (unexpected extra file)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-extrafile-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    // Add a brand-new, genuinely valid collection file AFTER finalization --
    // structurally fine on its own, but never recorded in the manifest.
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'sneaky'] });
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /lists 1 collection\(s\) but the backup directory currently contains 2/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects a document-count or index-count mismatch even when the file hash happens to differ too', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-countmismatch-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'], docsPerCollection: 2 });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    buildValidDumpFixture(restorePath, { collections: ['alpha'], docsPerCollection: 9 }); // tamper: different doc count
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /document count mismatch|SHA256\/size mismatch/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects when a .bson or .metadata.json file was modified after finalization (SHA256/size mismatch)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-tamper-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    const manifestBefore = JSON.parse(fs.readFileSync(path.join(backupPath, 'BACKUP_COMPLETE.json'), 'utf8'));
    // Append one harmless byte to the metadata file without changing its
    // document/index COUNTS (still valid JSON with the same indexes array
    // length) -- isolates the SHA256/size check from the count check above.
    fs.appendFileSync(path.join(restorePath, 'alpha.metadata.json'), ' ');
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /\.metadata\.json.*SHA256\/size mismatch/);
    assert.notEqual(manifestBefore.structuralVerification.collections[0].metaSizeBytes, fs.statSync(path.join(restorePath, 'alpha.metadata.json')).size);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateTestBackupManifestForRestore: rejects invalid/truncated BSON discovered during live re-verification, even though the manifest itself claims success', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-livecorrupt-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    const buf = fs.readFileSync(path.join(restorePath, 'alpha.bson'));
    fs.writeFileSync(path.join(restorePath, 'alpha.bson'), buf.subarray(0, buf.length - 3)); // truncate AFTER finalization
    const result = validateTestBackupManifestForRestore(restorePath);
    assert.equal(result.ok, false);
    assert.match(result.reason, /Live re-verification.*structural errors/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- Fail-closed restore enforcement: ordering, dry-run, and commit paths --
test('restoreDatabase(): refuses a legacy markerless backup without any BACKUP_COMPLETE.json, in dry-run, before any commit logic runs', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-legacy-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp); // no marker, no manifest -- exactly a "legacy" backup
    await assert.rejects(
      () => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /completion manifest validation failed -- Completion manifest \(BACKUP_COMPLETE\.json\) not found/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreDatabase(): the existing INCOMPLETE-marker rejection still fires BEFORE the new manifest check (ordering regression)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-marker-first-'));
  try {
    const { outerDir, nestedDir } = makeDummyBackupTree(tmp); // no manifest either -- both reasons would be true
    fs.writeFileSync(path.join(outerDir, 'INCOMPLETE_BACKUP.txt'), 'in progress');
    await assert.rejects(
      () => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false }),
      /marks this backup as INCOMPLETE/ // the marker reason, not the (also-true) missing-manifest reason
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreDatabase(): a --commit attempt against a legacy (manifest-less) backup is refused before any mongorestore process could be spawned (never a spawn-related error)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-legacy-commit-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    await assert.rejects(
      () => restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, toolsDir: tmp, commit: true, confirmRestore: true }),
      /completion manifest validation failed -- Completion manifest \(BACKUP_COMPLETE\.json\) not found/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreDatabase(): both the preflight and the immediately-pre-spawn re-validation call sites exist in source (structural confirmation of the TOCTOU-narrowing double-check)', () => {
  const codeOnly = RESTORE_CODE_ONLY;
  const matches = codeOnly.match(/validateTestBackupManifestForRestore\(from\)/g) || [];
  assert.equal(matches.length, 2, `expected exactly 2 call sites (preflight + immediately-pre-spawn), found ${matches.length}`);
});
test('restoreDatabase(): a genuinely valid, finalized TEST backup is accepted end-to-end (regression -- the new mandatory check does not break the legitimate case)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-e2e-valid-'));
  try {
    const { nestedDir } = makeFinalizedTestBackupTree(tmp);
    const result = await restoreDatabase({ uri: RESTORE_TARGET_URI, from: nestedDir, commit: false });
    assert.equal(result.ranForReal, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreDatabase(): never logs the raw uri, username, or password when refusing a legacy backup, even with --commit', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-legacy-redaction-'));
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
    const credentialedUri = 'mongodb+srv://dummyuser:dummy-secret-password@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test_restore_check';
    await assert.rejects(() => restoreDatabase({ uri: credentialedUri, from: nestedDir, toolsDir: tmp, commit: true, confirmRestore: true }));
    const allLogged = logged.join('\n');
    assert.ok(!allLogged.includes('dummy-secret-password'));
    assert.ok(!allLogged.includes(credentialedUri));
  } finally {
    console.log = originalLog;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('BACKUP_COMPLETE.json never contains a connection string or password, by construction (schema has no such field, and sourceDatabase/clusterHost are parsed values only)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'testrestore-manifest-nocreds-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, BACKUP_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedTestBackup({ backupPath, restorePath, dbName: BACKUP_SOURCE_DB_NAME });
    const manifestText = fs.readFileSync(path.join(backupPath, 'BACKUP_COMPLETE.json'), 'utf8');
    assert.ok(!manifestText.includes('mongodb://'));
    assert.ok(!manifestText.includes('mongodb+srv://'));
    assert.ok(!/password/i.test(manifestText));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// --- No circular dependency introduced by this stage's new wiring ----------
test('restoreDatabase.mjs imports validateTestBackupManifestForRestore from backupDatabase.mjs (pre-existing import direction) -- no new circular dependency', () => {
  assert.match(RESTORE_CODE_ONLY, /import\s*\{[^}]*\bvalidateTestBackupManifestForRestore\b[^}]*\}\s*from\s*'\.\/backupDatabase\.mjs'/);
  assert.ok(!RESTORE_CODE_ONLY.includes('function validateTestBackupManifestForRestore'), 'must not redeclare validateTestBackupManifestForRestore');
  assert.ok(!BACKUP_DATABASE_SOURCE.includes(`from './restoreDatabase.mjs'`), 'backupDatabase.mjs must still never import from restoreDatabase.mjs');
});

// =============================================================================
// QA Bug 19 — Stage 9.6E: targeted verification-parity fix for
// validateManifestForRecovery() (restore-check self-recovery), closing the
// gap Stage 9.6D found (unexpected-additional-file and prelude.json were
// never compared) without touching backup/finalization behavior.
// =============================================================================

test('validateManifestForRecovery: accepts a valid preservation backup with a complete inventory, including prelude.json evidence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-valid-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, true);
    assert.ok(result.manifest.structuralVerification.prelude, 'the manifest must have recorded prelude evidence');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects an unexpected ADDITIONAL dump file not recorded in the manifest (Stage 9.6E fix)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-extrafile-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    // Add a brand-new, genuinely valid collection file AFTER finalization --
    // structurally fine on its own, but never recorded in the manifest.
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'sneaky'] });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /lists 1 collection\(s\) but the backup directory currently contains 2/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a MISSING recorded file (collection removed after finalization)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-missingfile-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'beta'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    fs.rmSync(path.join(restorePath, 'beta.bson'));
    fs.rmSync(path.join(restorePath, 'beta.metadata.json'));
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /lists 2 collection\(s\) but the backup directory currently contains 1/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a modified prelude.json (SHA256/size mismatch) after finalization (Stage 9.6E fix)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-prelude-tamper-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    fs.writeFileSync(path.join(restorePath, 'prelude.json'), JSON.stringify({ ServerVersion: '9.9.9', ToolVersion: '999.99.99' }));
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /prelude\.json does not match the completion manifest/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects a prelude-presence mismatch (prelude.json removed after finalization) (Stage 9.6E fix)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-prelude-missing-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    fs.rmSync(path.join(restorePath, 'prelude.json'));
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /prelude\.json presence mismatch/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: rejects an incorrectly-typed mongodumpExitCode (string, not number) (Stage 9.6E fix)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-badtype-'));
  try {
    const restorePath = path.join(tmp, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    fs.writeFileSync(path.join(tmp, 'PRESERVATION_BACKUP_COMPLETE.json'), JSON.stringify(sampleManifestEvidence({ mongodumpExitCode: '0' })));
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, false);
    assert.match(result.reason, /missing one or more required fields, or a field has the wrong type/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('restoreCheckRecovery(): an invalid recovery backup (unexpected additional file) is refused before any commit/restore logic runs -- can never reach mongorestore', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-e2e-extrafile-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    buildValidDumpFixture(restorePath, { collections: ['alpha', 'sneaky'] }); // tamper after finalization
    await assert.rejects(
      () => restoreCheckRecovery({ uri: RESTORE_TARGET_URI, from: restorePath, commit: false }),
      /lists 1 collection\(s\) but the backup directory currently contains 2/
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
test('validateManifestForRecovery: existing normal-case acceptance (restoreVerification.performed: false still qualifies) is unaffected by the Stage 9.6E parity fix', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-parity-regression-'));
  try {
    const backupPath = tmp;
    const restorePath = path.join(backupPath, PRESERVATION_SOURCE_DB_NAME);
    buildValidDumpFixture(restorePath, { collections: ['alpha'] });
    finalizeVerifiedBackup({ backupPath, restorePath, dbName: PRESERVATION_SOURCE_DB_NAME });
    const result = validateManifestForRecovery(restorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.restoreVerification.performed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
