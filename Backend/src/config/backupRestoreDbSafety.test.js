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
import {
  PROTECTED_DB_NAMES,
  ALLOWED_BACKUP_DB_NAMES,
  ALLOWED_RESTORE_TARGET_DB_NAMES,
  BACKUP_SOURCE_DB_NAME,
  extractDatabaseName,
  assertNotProtectedDbUri,
  assertAllowedBackupDbUri,
  assertAllowedRestoreTargetUri,
} from '../../scripts/backup/protectedDbGuard.mjs';
import {
  backupDatabase,
  resolveBackupUri,
  MONGODB_URI_ENV_VAR,
  verifyEffectiveBackupTarget,
  markBackupIncomplete,
} from '../../scripts/backup/backupDatabase.mjs';
import {
  restoreDatabase,
  resolveRestoreUri,
  findIncompleteBackupMarker,
  assertExpectedSourceNamespace,
  splitCredentialsFromUri,
  buildRestoreConfigYaml,
  writeTempRestoreConfig,
  cleanupTempRestoreConfig,
  buildMongorestoreArgs,
  runRestoreProcess,
  DEFAULT_STARTUP_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
} from '../../scripts/backup/restoreDatabase.mjs';

const RESTORE_DATABASE_SOURCE = fs.readFileSync(new URL('../../scripts/backup/restoreDatabase.mjs', import.meta.url), 'utf8');
const RESTORE_CODE_ONLY = RESTORE_DATABASE_SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

const BACKUP_DATABASE_SOURCE = fs.readFileSync(new URL('../../scripts/backup/backupDatabase.mjs', import.meta.url), 'utf8');

const PROTECTED_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';
const PROTECTED_URI_TRAILING_SLASH = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun/';
const ALLOWED_URI = 'mongodb://127.0.0.1:27017/vyoma_2_0_test';
const NOT_ALLOWLISTED_URI = 'mongodb://127.0.0.1:27017/some_disposable_db';
// The only allowed restore TARGET (Task 7P-SEC4) -- deliberately different
// from ALLOWED_URI (vyoma_2_0_test) above, since restore must never be
// allowed to target the same database backupDatabase.mjs reads from.
const RESTORE_TARGET_URI = 'mongodb://127.0.0.1:27017/vyoma_2_0_test_restore_check';
const LIVE_TEST_DB_AS_RESTORE_TARGET_URI = 'mongodb://127.0.0.1:27017/vyoma_2_0_test';

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

test('backupDatabase.mjs source: both the mongodump-failure path and the effective-target-mismatch path call markBackupIncomplete() before rethrowing', () => {
  const codeOnly = BACKUP_DATABASE_SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const occurrences = codeOnly.match(/markBackupIncomplete\(/g) || [];
  // One occurrence is the function's own definition
  // (`export function markBackupIncomplete(...)`), which also matches this
  // pattern; the other two must be its call sites: the mongodump catch
  // block, and the verifyEffectiveBackupTarget catch block.
  assert.equal(occurrences.length, 3, `expected 1 definition + 2 call sites, found ${occurrences.length} total occurrences`);
});

test('backupDatabase() dry-run never creates a backup directory, so there is nothing to mark incomplete or otherwise', async () => {
  const result = await backupDatabase({ uri: ALLOWED_URI, commit: false });
  assert.equal(fs.existsSync(result.backupPath), false);
  assert.equal(fs.existsSync(path.join(result.backupPath, 'INCOMPLETE_BACKUP.txt')), false);
});

// --- Task 7P-SEC3: restoreDatabase() independently rejects an INCOMPLETE backup ---

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

test('restoreDatabase() dry-run succeeds against a clean, complete backup tree (regression: the new check must not affect a good backup)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-good-'));
  try {
    const { nestedDir } = makeDummyBackupTree(tmp);
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
    const { nestedDir } = makeDummyBackupTree(tmp);
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
  const credentialedEnvUri = 'mongodb://envuser:env-secret-password@127.0.0.1:27017/vyoma_2_0_test_restore_check';
  const originalEnv = process.env.MONGODB_URI;
  const originalLog = console.log;
  const logged = [];
  console.log = (...args) => logged.push(args.join(' '));
  try {
    process.env.MONGODB_URI = credentialedEnvUri;
    const { nestedDir } = makeDummyBackupTree(tmp);
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

test('restoreDatabase.mjs imports MONGODB_URI_ENV_VAR from backupDatabase.mjs rather than declaring a second, independent env-var-name literal', () => {
  assert.match(RESTORE_CODE_ONLY, /import\s*\{\s*MONGODB_URI_ENV_VAR\s*\}\s*from\s*'\.\/backupDatabase\.mjs'/);
});
