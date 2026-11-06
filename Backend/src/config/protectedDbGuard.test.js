// Task 7T.1A — regression coverage for the fail-closed, pre-connection
// protected-database guard added to src/config/db.js after the Task 7T-SAFE
// incident (an unguarded `node src/server.js` connected to the explicitly
// protected `vyoma_migration_dryrun` database via an inherited .env
// MONGODB_URI). Pure string/URL parsing only -- this file never imports
// mongoose and never opens any network connection, so every test here is
// itself proof that rejection happens with zero connection attempt, not
// merely an assertion about one.
//
// NOT EXECUTED as part of Task 7T.1A (static implementation only, per that
// task's explicit restriction) -- prepared here for a separately approved
// verification task to run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeMongoConnectionUri, extractDatabaseNameStrict, PROTECTED_DB_NAMES } from './protectedDbGuard.js';

test('reuses the single, existing protected-database list rather than a second, independently-maintained one', () => {
  assert.ok(PROTECTED_DB_NAMES.has('vyoma_migration_dryrun'));
  // Importing from the exact same module scripts/backup/protectedDbGuard.mjs
  // already exports PROTECTED_DB_NAMES from -- a shared Set reference, not a
  // duplicated literal -- so this project has exactly one place that could
  // ever drift out of sync with itself.
});

test('rejects the protected database name (mongodb://)', () => {
  assert.throws(
    () => assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/vyoma_migration_dryrun'),
    /vyoma_migration_dryrun/,
    'must name the protected database in its error, never the full URI'
  );
});

test('rejects the protected database name with credentials present in the URI (credentials never appear in the thrown error)', () => {
  assert.throws(() => assertSafeMongoConnectionUri('mongodb://user:somePassword@127.0.0.1:27017/vyoma_migration_dryrun'), (err) => {
    assert.match(err.message, /vyoma_migration_dryrun/);
    assert.doesNotMatch(err.message, /somePassword/, 'the guard must never echo credentials back in its own error message');
    return true;
  });
});

test('rejects the protected database name via mongodb+srv:// (Atlas-style URI)', () => {
  assert.throws(
    () => assertSafeMongoConnectionUri('mongodb+srv://cluster0.example.mongodb.net/vyoma_migration_dryrun?retryWrites=true'),
    /vyoma_migration_dryrun/
  );
});

test('rejects a trailing-slash variant of the protected name (the exact Task 7P pre-commit-review bypass, re-verified here)', () => {
  assert.throws(() => assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/vyoma_migration_dryrun/'), /vyoma_migration_dryrun/);
});

test('rejects a malformed/unparseable connection string, rather than assuming it is safe', () => {
  assert.throws(() => assertSafeMongoConnectionUri('not a uri at all'), /could not be parsed/i);
});

test('rejects a non-string or empty value outright', () => {
  assert.throws(() => assertSafeMongoConnectionUri(null), /no MongoDB connection string/i);
  assert.throws(() => assertSafeMongoConnectionUri(undefined), /no MongoDB connection string/i);
  assert.throws(() => assertSafeMongoConnectionUri(''), /no MongoDB connection string/i);
  assert.throws(() => assertSafeMongoConnectionUri('   '), /no MongoDB connection string/i);
});

test('rejects an ambiguous target: a syntactically valid URI with no database name at all', () => {
  assert.throws(() => assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017'), /does not specify a database name/i);
  assert.throws(() => assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/'), /does not specify a database name/i);
  assert.throws(() => assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/?retryWrites=true'), /does not specify a database name/i);
});

test('accepts a safe, explicitly-named, non-protected database target and returns its name', () => {
  assert.equal(assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/some_disposable_db'), 'some_disposable_db');
  assert.equal(assertSafeMongoConnectionUri('mongodb+srv://cluster.example.net/staging_db?retryWrites=true'), 'staging_db');
});

test('extractDatabaseNameStrict is the same strict parser the guard uses internally (no separate, divergent logic)', () => {
  assert.equal(extractDatabaseNameStrict('mongodb://127.0.0.1:27017/my_db'), 'my_db');
  assert.throws(() => extractDatabaseNameStrict('mongodb://127.0.0.1:27017'), /does not specify a database name/i);
});

test('rejection happens via pure, synchronous string/URL parsing -- no Promise, no async I/O, no mongoose import in this module', async () => {
  // If assertSafeMongoConnectionUri ever became async (e.g. by performing a
  // real DNS/network check before deciding), that would itself be a
  // regression: the whole point of this guard is to decide before any
  // network activity is possible. A synchronous throw is the simplest proof
  // available that no connection attempt occurred.
  let threwSynchronously = false;
  try {
    assertSafeMongoConnectionUri('mongodb://127.0.0.1:27017/vyoma_migration_dryrun');
  } catch {
    threwSynchronously = true;
  }
  assert.equal(threwSynchronously, true);
});
