// Task 7H.2 — regression coverage for
// scripts/wordpress/import/migrationDb.mjs, the shared database-safety
// helper now used by every write-capable WordPress migration script
// (batch1-import.mjs, batch2-import.mjs, panchatantra-redirect-migration.mjs,
// and the 28 scripts fixed in this task -- see
// wordpressMigrationScriptsDbSafety.test.js for per-script wiring checks).
//
// This module wraps the app's own connectDb() (never modifies it) and adds
// exactly one check: the resulting connection's database name must not be
// on the protected list. It deliberately does NOT require a disposable-only
// target or reject non-loopback hosts -- unlike the read-only inventory
// scripts' guard (disposableDbTarget.mjs), a real migration importer must
// legitimately be able to target a real, ambiently-configured database
// under explicit operator action.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from '../../../src/config/env.js';
import { disconnectDb } from '../../../src/config/db.js';
import {
  PROTECTED_DB_NAMES,
  assertSafeDatabaseTarget,
  extractConfiguredDatabaseName,
  connectToMigrationDb,
} from '../../../scripts/wordpress/import/migrationDb.mjs';

const MIGRATION_DB_SOURCE = fs.readFileSync(
  new URL('../../../scripts/wordpress/import/migrationDb.mjs', import.meta.url),
  'utf8'
);

// Task 7H.2 Phase 1: the same env-override convention already established in
// src/config/db.test.js / db.connectionOptions.test.js / db.eventLogging.test.js
// -- `env` is a live, mutable object whose fields env.js computes once from
// process.env at import time, so setting process.env.MONGODB_URI from inside
// a test has no effect (env.js has already been imported). Overriding the
// object's own fields directly, and restoring them in `finally`, is this
// codebase's existing, already-reviewed way to force a specific, explicit
// target deterministically -- with zero dependency on, and zero risk of
// falling back to, this process's real ambient MONGODB_URI.
async function withEnv(overrides, fn) {
  const nodeEnvBackup = env.nodeEnv;
  const mongodbUriBackup = env.mongodbUri;
  env.nodeEnv = overrides.nodeEnv;
  env.mongodbUri = overrides.mongodbUri;
  try {
    await fn();
  } finally {
    env.nodeEnv = nodeEnvBackup;
    env.mongodbUri = mongodbUriBackup;
  }
}

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mem.stop();
});

test('PROTECTED_DB_NAMES contains exactly the one standing-rules-protected name', () => {
  assert.deepEqual([...PROTECTED_DB_NAMES], ['vyoma_migration_dryrun']);
});

test('assertSafeDatabaseTarget rejects a connection to the protected database name', async () => {
  await mongoose.connect(mem.getUri('vyoma_migration_dryrun'));
  try {
    assert.throws(() => assertSafeDatabaseTarget(mongoose.connection), /vyoma_migration_dryrun/);
  } finally {
    await mongoose.disconnect();
  }
});

test('assertSafeDatabaseTarget allows a connection to a non-protected database name', async () => {
  await mongoose.connect(mem.getUri('migration_db_helper_test'));
  try {
    assert.equal(assertSafeDatabaseTarget(mongoose.connection), 'migration_db_helper_test');
  } finally {
    await mongoose.disconnect();
  }
});

test('assertSafeDatabaseTarget does not itself open or close any connection', () => {
  // Passing a plain object (no real mongoose connection) proves this
  // function only ever inspects whatever connection it's handed -- it never
  // reaches for mongoose's global connection or opens one of its own.
  assert.doesNotThrow(() => assertSafeDatabaseTarget({ name: 'some_other_db' }));
  assert.throws(() => assertSafeDatabaseTarget({ name: 'vyoma_migration_dryrun' }), /protected list/);
});

// Task 7H.2A: extractConfiguredDatabaseName() is pure string parsing -- no
// network activity, no real or disposable database of any kind, and no
// dependency on this process's own ambient MONGODB_URI. These synthetic
// URIs are fabricated strings for this test only; none of them is this
// environment's real configured value, so nothing here can expose it.
test('extractConfiguredDatabaseName parses a MongoDB URI string without connecting to anything', () => {
  assert.equal(extractConfiguredDatabaseName('mongodb://127.0.0.1:27017/vyoma_migration_dryrun'), 'vyoma_migration_dryrun');
  assert.equal(extractConfiguredDatabaseName('mongodb://127.0.0.1:27017/some_other_db'), 'some_other_db');
  assert.equal(extractConfiguredDatabaseName('mongodb+srv://cluster.example.net/some_other_db?retryWrites=true'), 'some_other_db');
  assert.equal(extractConfiguredDatabaseName(null), null);
  assert.equal(extractConfiguredDatabaseName(undefined), null);
  assert.equal(extractConfiguredDatabaseName(''), null);
  assert.equal(extractConfiguredDatabaseName('not a uri'), null);
});

// Task 7H.2A: static source-order check proving connectToMigrationDb()
// validates the configured target BEFORE calling connectDb() -- the actual
// correction this task asked for (previously the check ran only after
// connectDb() had already opened a real connection). A static check is used
// here, rather than a dynamic one, because env.mongodbUri is captured by
// env.js exactly once at first import (see the comment on the end-to-end
// test below) -- there is no way for this test file to make the live
// process's configured value be the protected name, on demand, without
// either mutating this process's real environment or modifying connectDb()
// itself, both out of scope for this task.
//
// Task 7D.3: updated to look for assertSafeMongoConnectionUri(...) instead
// of the file's old, independent extractConfiguredDatabaseName(env.mongodbUri)
// + PROTECTED_DB_NAMES.has() pair -- the pre-check now delegates to the
// shared, central guard (src/config/protectedDbGuard.js) instead of
// re-implementing its own, independently-maintained copy of the same check.
test('connectToMigrationDb() checks the configured target for the protected name BEFORE calling connectDb()', () => {
  const precheckIdx = MIGRATION_DB_SOURCE.indexOf('assertSafeMongoConnectionUri(configuredUri');
  const connectIdx = MIGRATION_DB_SOURCE.indexOf('await connectDb();', precheckIdx);
  assert.ok(precheckIdx !== -1, 'expected the pre-check to call assertSafeMongoConnectionUri(configuredUri, ...)');
  assert.ok(connectIdx !== -1, 'expected a connectDb() call after the pre-check');
  assert.ok(precheckIdx < connectIdx, 'the configured-target check must run before connectDb() is ever called');
});

// Task 7H.2 Phase 1: these two tests replace a prior version that called
// connectToMigrationDb() against whatever this process's real, ambient
// MONGODB_URI happened to be -- which meant this test's own behavior (and,
// transiently, whether a real connection to the protected database was
// briefly opened before the Task 7H.2A pre-check rejected it) depended on
// the host machine's .env. Using withEnv() to set env.mongodbUri explicitly,
// for the duration of each test only, makes both the protected-rejection
// path and the successful-connection path fully deterministic and provable
// with zero dependency on, or risk from, ambient configuration.
test('connectToMigrationDb() rejects an explicitly-configured protected target before connecting, and opens no connection at all', async () => {
  await withEnv(
    { nodeEnv: 'development', mongodbUri: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun' },
    async () => {
      await assert.rejects(() => connectToMigrationDb(), /protected list/);
      assert.equal(
        mongoose.connection.readyState,
        0,
        'the pre-check must reject before connectDb() is ever called -- no connection of any kind should exist'
      );
    }
  );
});

// Task 7D.3 — the exact bug found and fixed by reusing the central guard:
// this file's own previous, independent extractConfiguredDatabaseName()
// never stripped a trailing slash, so this exact variant would have
// silently passed the pre-check through to connectDb() as "not the
// protected name". Confirmed directly (by calling the unfixed function)
// before this fix was applied.
test('connectToMigrationDb() rejects a trailing-slash variant of the protected database name (the exact bypass this task found and fixed), and opens no connection at all', async () => {
  await withEnv(
    { nodeEnv: 'development', mongodbUri: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun/' },
    async () => {
      await assert.rejects(() => connectToMigrationDb(), /vyoma_migration_dryrun.*protected list/s);
      assert.equal(
        mongoose.connection.readyState,
        0,
        'the pre-check must reject before connectDb() is ever called -- no connection of any kind should exist'
      );
    }
  );
});

// Task 7D.5 — the central guard now decodes percent-encoding before this
// check runs; re-verified at this call site too, since connectToMigrationDb()
// delegates entirely to it.
test('connectToMigrationDb() rejects a percent-encoded variant of the protected database (the exact bypass Task 7D.5 found and fixed)', async () => {
  await withEnv(
    { nodeEnv: 'development', mongodbUri: 'mongodb://127.0.0.1:27017/%76yoma_migration_dryrun' },
    async () => {
      await assert.rejects(() => connectToMigrationDb(), /vyoma_migration_dryrun.*protected list/s);
      assert.equal(mongoose.connection.readyState, 0, 'the pre-check must reject before connectDb() is ever called');
    }
  );
});

test('connectToMigrationDb() succeeds against an explicit, disposable mongodb-memory-server target', async () => {
  await withEnv({ nodeEnv: 'development', mongodbUri: mem.getUri('migration_db_helper_integration_test') }, async () => {
    try {
      const dbName = await connectToMigrationDb();
      assert.equal(dbName, 'migration_db_helper_integration_test');
      assert.ok(!PROTECTED_DB_NAMES.has(dbName));
      assert.equal(mongoose.connection.readyState, 1, 'expected a live connection to the explicit disposable target');
    } finally {
      // disconnectDb() (not a raw mongoose.disconnect()) -- also safe here,
      // since connectDb() took the configured-URI path, not its own
      // internal in-memory-server path; disconnectDb() handles both.
      await disconnectDb();
    }
  });
});
