// Regression coverage for connectDb()'s explicit connection/server-selection
// timeouts (Phase 1 Task 4D). Confirms both the configured-URI path and the
// development in-memory-fallback path pass the same intended options to
// mongoose.connect(), and that no operation-wide socketTimeoutMS (or any
// other option) was introduced alongside them. mongoose.connect() is wrapped
// (not replaced) -- the real implementation still runs underneath, so the
// connection this test makes is genuine and behaves exactly as in
// production, just with its call arguments captured. Every connection here
// is disposable (a MongoMemoryServer instance) -- never MongoDB Atlas, never
// any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { env } from './env.js';
import { connectDb, disconnectDb } from './db.js';

const EXPECTED_OPTIONS = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };

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

test('connectDb() passes the intended connection/server-selection timeouts for a configured URI', async (t) => {
  const mem = await MongoMemoryServer.create();
  try {
    const originalConnect = mongoose.connect.bind(mongoose);
    const calls = [];
    t.mock.method(mongoose, 'connect', (uri, options) => {
      calls.push({ uri, options });
      return originalConnect(uri, options);
    });

    await withEnv({ nodeEnv: 'production', mongodbUri: mem.getUri() }, async () => {
      await connectDb();
      try {
        assert.equal(calls.length, 1);
        assert.equal(calls[0].uri, mem.getUri());
        assert.deepEqual(calls[0].options, EXPECTED_OPTIONS);
        assert.equal(
          calls[0].options.socketTimeoutMS,
          undefined,
          'no operation-wide socketTimeoutMS should be introduced -- long-running operations/migrations must stay unbounded'
        );
      } finally {
        await mongoose.disconnect();
      }
    });
  } finally {
    await mem.stop();
  }
});

test('connectDb() passes the intended connection/server-selection timeouts for the development in-memory fallback', async (t) => {
  const originalConnect = mongoose.connect.bind(mongoose);
  const calls = [];
  t.mock.method(mongoose, 'connect', (uri, options) => {
    calls.push({ uri, options });
    return originalConnect(uri, options);
  });

  await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
    await connectDb();
    try {
      assert.equal(calls.length, 1);
      assert.match(calls[0].uri, /^mongodb:\/\/127\.0\.0\.1:\d+\//, 'expected the disposable in-memory server\'s own URI');
      assert.deepEqual(calls[0].options, EXPECTED_OPTIONS);
      assert.equal(calls[0].options.socketTimeoutMS, undefined);
    } finally {
      await disconnectDb();
    }
  });
});

test('both connection paths use identical timeout values (no accidental divergence between them)', async (t) => {
  const mem = await MongoMemoryServer.create();
  try {
    const originalConnect = mongoose.connect.bind(mongoose);
    const calls = [];
    t.mock.method(mongoose, 'connect', (uri, options) => {
      calls.push(options);
      return originalConnect(uri, options);
    });

    await withEnv({ nodeEnv: 'production', mongodbUri: mem.getUri() }, async () => {
      await connectDb();
      await mongoose.disconnect();
    });
    await withEnv({ nodeEnv: 'development', mongodbUri: null }, async () => {
      await connectDb();
      await disconnectDb();
    });

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
  } finally {
    await mem.stop();
  }
});
