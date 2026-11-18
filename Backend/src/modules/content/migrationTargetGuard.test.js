// Task 7D.33 — regression coverage for the Phase 2B database-isolation
// guard (scripts/wordpress/import/migrationTargetGuard.mjs). Every pure
// validation test below passes its own plain env object -- real process.env
// and Backend/.env are never read or touched. The one test that actually
// connects uses a disposable mongodb-memory-server instance only -- never
// any real or remote database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  requireExplicitAtlasTestTarget,
  assertConnectedToExpectedDatabase,
  connectToExplicitMigrationTarget,
  MIGRATION_TARGET_ENV_VAR,
  MIGRATION_TARGET_CONFIRM_ENV_VAR,
} from '../../../scripts/wordpress/import/migrationTargetGuard.mjs';

test('throws when MIGRATION_TARGET_MONGODB_URI is missing entirely', () => {
  assert.throws(() => requireExplicitAtlasTestTarget({}), /must be set to the exact, explicit Atlas testing connection string/);
});

test('throws when MIGRATION_TARGET_MONGODB_URI is blank', () => {
  assert.throws(() => requireExplicitAtlasTestTarget({ [MIGRATION_TARGET_ENV_VAR]: '   ' }), /must be set/);
});

test('never falls back to MONGODB_URI or any ambient value, even when present alongside a missing MIGRATION_TARGET_MONGODB_URI', () => {
  assert.throws(
    () => requireExplicitAtlasTestTarget({ MONGODB_URI: 'mongodb://real-looking-host/vyoma_2_0_test' }),
    /must be set to the exact, explicit Atlas testing connection string/
  );
});

test('rejects the one standing-rules-protected database name, even with a matching confirmation', () => {
  assert.throws(
    () =>
      requireExplicitAtlasTestTarget({
        [MIGRATION_TARGET_ENV_VAR]: 'mongodb://127.0.0.1:1/vyoma_migration_dryrun',
        [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'vyoma_migration_dryrun',
      }),
    /protected/i
  );
});

test('rejects any database name not exactly on the allowlist', () => {
  assert.throws(
    () =>
      requireExplicitAtlasTestTarget({
        [MIGRATION_TARGET_ENV_VAR]: 'mongodb://127.0.0.1:1/some_other_database',
        [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'some_other_database',
      }),
    /not on the.*explicit allowlist/
  );
});

test('rejects a missing MIGRATION_TARGET_CONFIRM even when the URI itself is exactly correct', () => {
  assert.throws(
    () => requireExplicitAtlasTestTarget({ [MIGRATION_TARGET_ENV_VAR]: 'mongodb://127.0.0.1:1/vyoma_2_0_test' }),
    /explicitly confirm you intend to target exactly this database/
  );
});

test('rejects a MIGRATION_TARGET_CONFIRM that does not exactly match the resolved database name', () => {
  assert.throws(
    () =>
      requireExplicitAtlasTestTarget({
        [MIGRATION_TARGET_ENV_VAR]: 'mongodb://127.0.0.1:1/vyoma_2_0_test',
        [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'vyoma_2_0_tes', // typo
      }),
    /explicitly confirm/
  );
});

test('rejects an unparseable connection string', () => {
  assert.throws(
    () => requireExplicitAtlasTestTarget({ [MIGRATION_TARGET_ENV_VAR]: 'not a url at all', [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'vyoma_2_0_test' }),
    /not on the.*explicit allowlist|could not be parsed/i
  );
});

test('accepts the exact, correctly-confirmed target URI (pre-connection validation only)', () => {
  const result = requireExplicitAtlasTestTarget({
    [MIGRATION_TARGET_ENV_VAR]: 'mongodb+srv://fixture-user:fixture-password@cluster0.example.mongodb.net/vyoma_2_0_test?retryWrites=true',
    [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'vyoma_2_0_test',
  });
  assert.equal(result.dbName, 'vyoma_2_0_test');
});

test('assertConnectedToExpectedDatabase rejects a connection whose actual resolved name differs from expected, without needing a real connection', () => {
  assert.throws(
    () => assertConnectedToExpectedDatabase({ name: 'something_else' }, 'vyoma_2_0_test'),
    /actually connected to database "something_else"/
  );
});

test('assertConnectedToExpectedDatabase rejects the protected name even if it somehow matched "expected"', () => {
  assert.throws(
    () => assertConnectedToExpectedDatabase({ name: 'vyoma_migration_dryrun' }, 'vyoma_migration_dryrun'),
    /protected/i
  );
});

test('assertConnectedToExpectedDatabase accepts a matching connection object', () => {
  assert.equal(assertConnectedToExpectedDatabase({ name: 'vyoma_2_0_test' }, 'vyoma_2_0_test'), 'vyoma_2_0_test');
});

test('assertConnectedToExpectedDatabase falls back to connection.db.databaseName when .name is absent', () => {
  assert.equal(assertConnectedToExpectedDatabase({ db: { databaseName: 'vyoma_2_0_test' } }, 'vyoma_2_0_test'), 'vyoma_2_0_test');
});

// --- The one test that actually connects: a disposable mongodb-memory-server instance only ---

let mem;
after(async () => {
  await mongoose.disconnect().catch(() => {});
  if (mem) await mem.stop();
});

test('connectToExplicitMigrationTarget validates the EFFECTIVE connected database, not just the URI text, against a real (disposable, in-memory) connection', async () => {
  mem = await MongoMemoryServer.create();
  const uri = mem.getUri('vyoma_2_0_test');

  const dbName = await connectToExplicitMigrationTarget({
    [MIGRATION_TARGET_ENV_VAR]: uri,
    [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'vyoma_2_0_test',
  });

  assert.equal(dbName, 'vyoma_2_0_test');
  assert.equal(mongoose.connection.name, 'vyoma_2_0_test');
});

test('connectToExplicitMigrationTarget refuses to proceed if the memory server actually resolves to a different name than confirmed', async () => {
  if (!mem) mem = await MongoMemoryServer.create();
  const uri = mem.getUri('a_completely_different_name');

  await assert.rejects(
    () =>
      connectToExplicitMigrationTarget({
        [MIGRATION_TARGET_ENV_VAR]: uri,
        [MIGRATION_TARGET_CONFIRM_ENV_VAR]: 'a_completely_different_name',
      }),
    /not on the.*explicit allowlist/
  );
});
