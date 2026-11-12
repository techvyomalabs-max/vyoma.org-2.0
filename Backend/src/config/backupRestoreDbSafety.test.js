// Task 7D.3 — regression coverage for scripts/backup/protectedDbGuard.mjs,
// backupDatabase.mjs, and restoreDatabase.mjs (Task 7P), none of which had
// any dedicated test file before this task. These three were audited
// alongside every other Backend script capable of connecting to MongoDB, to
// confirm none of them can be used to read, write, back up from, or restore
// into the standing-rules-protected database ("vyoma_migration_dryrun").
//
// Unlike scripts/wordpress/import/migrationDb.mjs and
// scripts/wordpress/inventory/disposableDbTarget.mjs (both covered
// elsewhere), this tooling takes its target as an explicit --uri CLI
// argument rather than an env var or a live mongoose connection -- these
// tests exercise that exact path.
//
// No real mongodump/mongorestore process is ever spawned here: every
// protected-target test below asserts rejection happens BEFORE backupDatabase()/
// restoreDatabase() would reach execFile() at all (the guard check is each
// function's first statement), and every non-protected-target test below
// uses commit: false (the default, dry-run-only mode), which the scripts
// themselves document as never spawning a process or touching disk beyond
// validation. No MongoDB connection of any kind is opened by this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTECTED_DB_NAMES, extractDatabaseName, assertNotProtectedDbUri } from '../../scripts/backup/protectedDbGuard.mjs';
import { backupDatabase } from '../../scripts/backup/backupDatabase.mjs';
import { restoreDatabase } from '../../scripts/backup/restoreDatabase.mjs';

const PROTECTED_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';
const PROTECTED_URI_TRAILING_SLASH = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun/';

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

test('backupDatabase() dry-run (commit: false, the default) against a non-protected target validates and reports without spawning any process', async () => {
  const result = await backupDatabase({ uri: 'mongodb://127.0.0.1:27017/some_disposable_db', commit: false });
  assert.equal(result.ranForReal, false);
  assert.equal(result.dbName, 'some_disposable_db');
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

test('restoreDatabase() against a non-protected target still fails closed on a missing --from directory (proves the protected-name check runs first, not that a missing directory is ever silently accepted)', async () => {
  await assert.rejects(
    () =>
      restoreDatabase({
        uri: 'mongodb://127.0.0.1:27017/some_disposable_db',
        from: '/this/path/does/not/exist/and/is/never/checked',
        commit: false,
      }),
    /Backup directory does not exist/
  );
});
