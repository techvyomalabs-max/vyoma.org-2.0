// Regression coverage for db.js's connection-event logging (Phase 1 Task
// 4B): every connection event type ends up with exactly one registered
// listener no matter how many times connectDb() is called in this process,
// logging uses the existing console.log/warn/error convention, and error
// logging never exposes the connection string, credentials, or hostname --
// only the error's name. No MongoDB Atlas, no persistent database, and
// never mongodb://127.0.0.1:27017/vyoma_migration_dryrun -- every
// "connected" scenario below uses a disposable mongodb-memory-server
// instance via connectDb()'s own existing development fallback, exactly
// like db.test.js already does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
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

test('connectDb() logs a "connected" event via console.log when a connection succeeds', async (t) => {
  const logCalls = [];
  t.mock.method(console, 'log', (...args) => {
    logCalls.push(args.join(' '));
  });

  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      const connectedLogs = logCalls.filter((line) => line.includes('[db] connection event: connected'));
      assert.equal(connectedLogs.length, 1, 'expected exactly one "connected" event log for this one connection');
    } finally {
      await disconnectDb();
    }
  });
});

test('disconnecting logs a "disconnected" event via console.warn', async (t) => {
  const warnCalls = [];
  t.mock.method(console, 'warn', (...args) => {
    warnCalls.push(args.join(' '));
  });

  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    await disconnectDb();
    const disconnectedLogs = warnCalls.filter((line) => line.includes('[db] connection event: disconnected'));
    assert.equal(disconnectedLogs.length, 1, 'expected exactly one "disconnected" event log for this one disconnect');
  });
});

test('repeated connectDb() calls in the same process do not accumulate duplicate "connected" listeners', async () => {
  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    const countAfterFirst = mongoose.connection.listenerCount('connected');
    await disconnectDb();

    await connectDb();
    const countAfterSecond = mongoose.connection.listenerCount('connected');
    await disconnectDb();

    await connectDb();
    const countAfterThird = mongoose.connection.listenerCount('connected');
    await disconnectDb();

    assert.equal(countAfterFirst, 1, 'exactly one "connected" listener should ever be registered');
    assert.equal(countAfterSecond, countAfterFirst, 'listener count must not grow after a second connectDb() call');
    assert.equal(countAfterThird, countAfterFirst, 'listener count must not grow after a third connectDb() call');
  });
});

test('every connection event type has exactly one registered listener, even after multiple connectDb()/disconnectDb() cycles', async () => {
  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    await disconnectDb();
    await connectDb();
    try {
      assert.equal(mongoose.connection.listenerCount('connected'), 1);
      assert.equal(mongoose.connection.listenerCount('disconnected'), 1);
      assert.equal(mongoose.connection.listenerCount('reconnected'), 1);
      assert.equal(mongoose.connection.listenerCount('error'), 1);
    } finally {
      await disconnectDb();
    }
  });
});

test('connectDb() registers listeners even on a rejected staging/production startup (no MONGODB_URI), harmlessly', async () => {
  await withEnv({ nodeEnv: 'staging', mongodbUri: null }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    // Listener registration happens before the URI check, so it must have
    // run even though this attempt never actually connected -- and must
    // still be exactly one, not accumulated by this additional call.
    assert.equal(mongoose.connection.listenerCount('connected'), 1);
  });
});

test('the error-event listener logs only the error\'s name, never the raw message, connection string, or credentials', async (t) => {
  const errorCalls = [];
  t.mock.method(console, 'error', (...args) => {
    errorCalls.push(args.join(' '));
  });

  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      const sensitiveMessage =
        'failed to authenticate: mongodb://adminUser:SuperSecret123@internal-db-host.example:27017/prod-database';
      const simulatedDriverError = Object.assign(new Error(sensitiveMessage), { name: 'MongoServerSelectionError' });

      // Directly emitting the event (rather than engineering a real network
      // failure) deterministically exercises the registered listener itself,
      // with full control over what a worst-case driver error might contain.
      mongoose.connection.emit('error', simulatedDriverError);

      const logged = errorCalls.join('\n');
      assert.match(logged, /\[db\] connection event: error \(MongoServerSelectionError\)/);
      assert.doesNotMatch(logged, /SuperSecret123/);
      assert.doesNotMatch(logged, /adminUser/);
      assert.doesNotMatch(logged, /mongodb:\/\//);
      assert.doesNotMatch(logged, /internal-db-host/);
      assert.doesNotMatch(logged, /prod-database/);
    } finally {
      await disconnectDb();
    }
  });
});

test('the error-event listener never throws and falls back to "Unknown" for malformed/unexpected error-like values', async (t) => {
  const errorCalls = [];
  t.mock.method(console, 'error', (...args) => {
    errorCalls.push(args.join(' '));
  });

  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      const hostileError = {
        get name() {
          throw new Error('a hostile getter must never crash the listener');
        },
      };

      // None of these emissions may throw out of the listener, and every one
      // must fall back to 'Unknown' rather than crash or log anything else.
      assert.doesNotThrow(() => mongoose.connection.emit('error', hostileError));
      assert.doesNotThrow(() => mongoose.connection.emit('error', null));
      assert.doesNotThrow(() => mongoose.connection.emit('error', undefined));
      assert.doesNotThrow(() => mongoose.connection.emit('error', 'a plain string, not an Error instance'));
      assert.doesNotThrow(() => mongoose.connection.emit('error', { message: 'no name field at all' }));
      assert.doesNotThrow(() => mongoose.connection.emit('error', { name: 42 })); // non-string name

      assert.equal(errorCalls.length, 6);
      for (const line of errorCalls) {
        assert.equal(line, '[db] connection event: error (Unknown)');
      }
    } finally {
      await disconnectDb();
    }
  });
});

// --- Confirms this change didn't alter connectDb()'s existing behavior ---

test('the development in-memory fallback still works exactly as before (unchanged by the new logging)', async () => {
  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      assert.equal(mongoose.connection.readyState, 1, 'expected a live mongoose connection');
    } finally {
      await disconnectDb();
    }
  });
});

test('staging without MONGODB_URI still rejects startup with the existing clear error (unchanged by the new logging)', async () => {
  await withEnv({ nodeEnv: 'staging', mongodbUri: null }, async () => {
    await assert.rejects(() => connectDb(), /MONGODB_URI must be set/);
    assert.equal(mongoose.connection.readyState, 0, 'no connection should have been established');
  });
});
