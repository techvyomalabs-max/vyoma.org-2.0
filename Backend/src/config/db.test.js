// Regression coverage for connectDb()'s MongoDB startup protection: the
// in-memory mongodb-memory-server fallback is permitted only in local
// development; staging/production require a real, non-blank MONGODB_URI and
// refuse to boot otherwise. No persistent/real MongoDB is ever touched here
// -- every "configured URI" test below uses a disposable in-memory
// MongoMemoryServer instance's own connection string as the stand-in for a
// real URI, exactly the same technique this codebase already uses
// elsewhere for disposable-only test infrastructure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.js';
import { connectDb, disconnectDb } from './db.js';

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

test('development without MONGODB_URI allows the in-memory fallback', async () => {
  // Exercises connectDb()'s own fallback logic given an already-resolved
  // env.nodeEnv === 'development' -- see env.test.js for resolveNodeEnv()'s
  // own dedicated coverage of how NODE_ENV=development vs. an unset NODE_ENV
  // (with the ALLOW_LOCAL_DEV_DEFAULTS opt-in) both arrive at this same
  // resolved value in the first place.
  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      assert.equal(mongoose.connection.readyState, 1, 'expected a live mongoose connection');
    } finally {
      await disconnectDb();
    }
  });
});

test('staging without MONGODB_URI rejects startup with a clear error, and establishes no connection', async () => {
  await withEnv({ nodeEnv: 'staging', mongodbUri: null }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    assert.equal(mongoose.connection.readyState, 0, 'no connection should have been established');
  });
});

test('production without MONGODB_URI rejects startup with a clear error, and establishes no connection', async () => {
  await withEnv({ nodeEnv: 'production', mongodbUri: null }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    assert.equal(mongoose.connection.readyState, 0);
  });
});

test('staging with a blank (empty string) URI rejects startup', async () => {
  await withEnv({ nodeEnv: 'staging', mongodbUri: '' }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    assert.equal(mongoose.connection.readyState, 0);
  });
});

test('production with a whitespace-only URI rejects startup', async () => {
  await withEnv({ nodeEnv: 'production', mongodbUri: '   ' }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    assert.equal(mongoose.connection.readyState, 0);
  });
});

test('rejected startup does not initialize an in-memory MongoDB instance (disconnectDb is a safe no-op afterward)', async () => {
  await withEnv({ nodeEnv: 'production', mongodbUri: null }, async () => {
    await assert.rejects(() => connectDb());
    assert.equal(mongoose.connection.readyState, 0, 'no in-memory server should have been created or connected to');
    // Must not throw -- confirms there is no in-memory server left dangling
    // for disconnectDb() to (correctly or incorrectly) try to stop.
    await disconnectDb();
  });
});

// Task 7T.1A — regression coverage added after the Task 7T-SAFE incident:
// connectDb() must refuse a configured URI resolving to the protected
// database, in every NODE_ENV (proving the guard cannot be bypassed by
// environment mode), and must do so WITHOUT ever calling mongoose.connect()
// -- mocked here (same technique already used by
// db.connectionOptions.test.js) specifically so this test is proof of "no
// connection attempt occurred", not just proof of "an error was thrown".
test('connectDb() rejects the protected database name before calling mongoose.connect(), regardless of NODE_ENV', async (t) => {
  const originalConnect = mongoose.connect.bind(mongoose);
  let connectCalls = 0;
  t.mock.method(mongoose, 'connect', (...args) => {
    connectCalls += 1;
    return originalConnect(...args);
  });

  for (const nodeEnv of ['development', 'staging', 'production']) {
    // eslint-disable-next-line no-await-in-loop
    await withEnv({ nodeEnv, mongodbUri: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun' }, async () => {
      await assert.rejects(() => connectDb(), /vyoma_migration_dryrun/, `expected rejection under NODE_ENV=${nodeEnv}`);
    });
  }

  assert.equal(connectCalls, 0, 'mongoose.connect() must never be called for a protected target, under any NODE_ENV');
  assert.equal(mongoose.connection.readyState, 0, 'no connection should exist afterward');
});

test('connectDb() rejects an ambiguous configured URI (no database name) rather than assuming it is safe', async () => {
  await withEnv({ nodeEnv: 'production', mongodbUri: 'mongodb://127.0.0.1:27017' }, async () => {
    await assert.rejects(() => connectDb(), /does not specify a database name/i);
    assert.equal(mongoose.connection.readyState, 0);
  });
});

test('a configured URI follows the existing connection path, even outside development (real connect, not the in-memory fallback)', async () => {
  const mem = await MongoMemoryServer.create();
  try {
    // Task 7T.1A: a real, named database -- `mem.getUri()` with no argument
    // deliberately produces an empty database-name segment (confirmed by
    // reading mongodb-memory-server-core's own generateDbName()), which the
    // new protected-database guard in db.js now correctly refuses as an
    // ambiguous target for any caller-supplied ("configured") URI. A real
    // production/staging MONGODB_URI always names a real database, so this
    // test's stand-in URI should too.
    await withEnv({ nodeEnv: 'production', mongodbUri: mem.getUri('db_test_configured_uri') }, async () => {
      await connectDb();
      try {
        assert.equal(mongoose.connection.readyState, 1, 'expected a live mongoose connection using the supplied URI');
      } finally {
        await mongoose.disconnect();
      }
    });
  } finally {
    await mem.stop();
  }
});
