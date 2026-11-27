// Regression coverage for shutdown.js's createGracefulShutdown() (Phase 1
// Task 4C). Most tests use hand-built mock server/disconnectDb objects
// (dependency injection, no real HTTP server or database needed) -- a few
// use a real Express app + real sockets specifically to prove the HTTP-drain
// and idle-connection behavior end to end. Signal delivery itself (SIGINT/
// SIGTERM) is NOT exercised via real OS signals: Node's own documentation
// notes SIGTERM delivery on Windows (this project's dev machine) is
// unreliable, so this file instead calls the returned shutdown() function
// directly with each signal name, and a separate source-assertion test pins
// that server.js wires both signals to the same function. No MongoDB Atlas,
// no persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun -- the two tests that use
// a real HTTP server never touch any database at all (disconnectDb is always
// a plain injected mock in this file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { createGracefulShutdown } from './shutdown.js';
import { main } from './server.js';
import { env } from './config/env.js';
import { RoleModel } from './modules/auth/role.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function silentLog() {
  return { log() {}, warn() {}, error() {} };
}

function mockServer({ closeError = null } = {}) {
  let closeCalled = 0;
  let closeIdleCalled = 0;
  return {
    close(cb) {
      closeCalled += 1;
      // Mirrors the real http.Server contract: the callback fires
      // asynchronously, not synchronously.
      process.nextTick(() => cb(closeError));
    },
    closeIdleConnections() {
      closeIdleCalled += 1;
    },
    get closeCallCount() {
      return closeCalled;
    },
    get closeIdleCallCount() {
      return closeIdleCalled;
    },
  };
}

test('a successful shutdown closes the server and disconnects MongoDB, preferring natural termination over a forced exit', async () => {
  const server = mockServer();
  let disconnectCalls = 0;
  const disconnectDb = async () => {
    disconnectCalls += 1;
  };
  const exitCalls = [];
  const shutdown = createGracefulShutdown({ server, disconnectDb, exit: (code) => exitCalls.push(code), log: silentLog() });

  await shutdown('SIGTERM');

  assert.equal(server.closeCallCount, 1);
  assert.equal(server.closeIdleCallCount, 1, 'closeIdleConnections must be called to avoid hanging on idle keep-alive sockets');
  assert.equal(disconnectCalls, 1);
  assert.deepEqual(exitCalls, [], 'a clean shutdown must not force an exit -- it prefers natural termination');
});

test('SIGINT and SIGTERM both run the identical shutdown sequence (same function, signal name only affects logging)', async () => {
  const runs = {};
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const server = mockServer();
    let disconnectCalls = 0;
    const exitCalls = [];
    const shutdown = createGracefulShutdown({
      server,
      disconnectDb: async () => {
        disconnectCalls += 1;
      },
      exit: (code) => exitCalls.push(code),
      log: silentLog(),
    });
    await shutdown(signal);
    runs[signal] = { closeCallCount: server.closeCallCount, disconnectCalls, exitCalls };
  }
  assert.deepEqual(runs.SIGINT, runs.SIGTERM);
});

test('server.js registers SIGINT and SIGTERM against the same shutdown function', () => {
  const source = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  assert.match(source, /const shutdown = createGracefulShutdown\(/);
  assert.match(source, /process\.on\('SIGINT', \(\) => shutdown\('SIGINT'\)\)/);
  assert.match(source, /process\.on\('SIGTERM', \(\) => shutdown\('SIGTERM'\)\)/);
});

test('a duplicate shutdown call while one is already in progress does not run cleanup twice', async () => {
  const server = mockServer();
  let disconnectCalls = 0;
  const exitCalls = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: async () => {
      disconnectCalls += 1;
    },
    exit: (code) => exitCalls.push(code),
    log: silentLog(),
  });

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT'); // arrives while the first is still in flight
  await Promise.all([first, second]);

  assert.equal(server.closeCallCount, 1, 'server.close() must only be called once, not once per signal received');
  assert.equal(disconnectCalls, 1, 'disconnectDb() must only be called once');
  assert.deepEqual(exitCalls, [], 'a clean shutdown never forces exit, duplicate signal or not');
});

test('an HTTP server close failure is handled: shutdown still disconnects MongoDB and exits with a non-zero code', async () => {
  const server = mockServer({ closeError: new Error('already closed') });
  let disconnectCalls = 0;
  const exitCalls = [];
  const errors = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: async () => {
      disconnectCalls += 1;
    },
    exit: (code) => exitCalls.push(code),
    log: { log() {}, warn() {}, error: (msg) => errors.push(msg) },
  });

  await shutdown('SIGTERM');

  assert.equal(disconnectCalls, 1, 'MongoDB must still be disconnected even though closing the HTTP server failed');
  assert.deepEqual(exitCalls, [1], 'a handled HTTP-close failure must exit with a non-zero code, not silently report success');
  assert.ok(errors.some((line) => line.includes('error while closing the HTTP server')));
});

test('a MongoDB disconnect failure is handled: shutdown still exits (non-zero code), without hanging', async () => {
  const server = mockServer();
  const exitCalls = [];
  const errors = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: async () => {
      throw new Error('mongodb://adminUser:SuperSecret@internal-host:27017/prod-db replica set has no primary');
    },
    exit: (code) => exitCalls.push(code),
    log: { log() {}, warn() {}, error: (msg) => errors.push(msg) },
  });

  await shutdown('SIGTERM');

  assert.deepEqual(exitCalls, [1], 'a handled MongoDB disconnect failure must exit with a non-zero code');
  const logged = errors.join('\n');
  assert.ok(logged.includes('error while disconnecting MongoDB'));
  assert.doesNotMatch(logged, /SuperSecret/);
  assert.doesNotMatch(logged, /adminUser/);
  assert.doesNotMatch(logged, /mongodb:\/\//);
  assert.doesNotMatch(logged, /internal-host/);
});

test('shutdown exits via the bounded timeout when the HTTP server never finishes closing (e.g. a request that never ends)', async () => {
  const neverClosingServer = {
    close() {
      /* never calls the callback -- simulates an in-flight request that never completes */
    },
    closeIdleConnections() {},
  };
  let disconnectCalls = 0;
  const exitCalls = [];
  const shutdown = createGracefulShutdown({
    server: neverClosingServer,
    disconnectDb: async () => {
      disconnectCalls += 1;
    },
    exit: (code) => exitCalls.push(code),
    log: silentLog(),
    timeoutMs: 50, // short, test-only bound -- the real default is 10000ms
  });

  const start = Date.now();
  await shutdown('SIGTERM');
  const elapsed = Date.now() - start;

  assert.deepEqual(exitCalls, [1], 'a timed-out shutdown must exit with a non-zero code');
  assert.ok(elapsed < 2000, `expected the bounded timeout (50ms) to fire quickly, took ${elapsed}ms`);
  assert.equal(disconnectCalls, 0, 'MongoDB disconnect was never reached because the HTTP close step never settled');
});

test('shutdown exits via the bounded timeout when MongoDB disconnection hangs, even though the HTTP server closed fine', async () => {
  const server = mockServer();
  let releaseDisconnect;
  let disconnectCalls = 0;
  const exitCalls = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: () => {
      disconnectCalls += 1;
      return new Promise((resolve) => { releaseDisconnect = resolve; });
    },
    exit: (code) => exitCalls.push(code),
    log: silentLog(),
    timeoutMs: 50,
  });

  const start = Date.now();
  await shutdown('SIGTERM');
  const elapsed = Date.now() - start;

  assert.deepEqual(exitCalls, [1]);
  assert.equal(disconnectCalls, 1);
  assert.ok(elapsed < 2000, `expected the bounded timeout (50ms) to fire quickly, took ${elapsed}ms`);

  // The abandoned disconnectDb() call now resolves LATE, well after the
  // timeout already forced an exit. This must never: call disconnectDb()
  // again, call exit() again, or surface as an unhandled rejection.
  const originalUnhandledListeners = process.listeners('unhandledRejection');
  let sawUnhandledRejection = false;
  const captureUnhandled = () => { sawUnhandledRejection = true; };
  process.on('unhandledRejection', captureUnhandled);
  try {
    releaseDisconnect();
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    process.removeListener('unhandledRejection', captureUnhandled);
    assert.deepEqual(process.listeners('unhandledRejection'), originalUnhandledListeners);
  }

  assert.equal(disconnectCalls, 1, 'disconnectDb() must not be called a second time once it finally resolves');
  assert.deepEqual(exitCalls, [1], 'exit() must not be called a second time once the late disconnect resolves');
  assert.equal(sawUnhandledRejection, false, 'the late-resolving disconnectDb() must never surface as an unhandled rejection');
});

// --- Real HTTP server behavior: in-flight requests and idle connections ---

function startRealServer() {
  const app = express();
  let releaseHeldRequest;
  const heldRequestArrived = new Promise((resolve) => {
    app.get('/held', (req, res) => {
      resolve();
      new Promise((r) => { releaseHeldRequest = r; }).then(() => res.status(200).json({ done: true }));
    });
  });
  app.get('/quick', (req, res) => res.status(200).json({ ok: true }));

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}`, heldRequestArrived, release: () => releaseHeldRequest() });
    });
  });
}

test('an in-flight HTTP request completes successfully before shutdown finishes', async () => {
  const { server, baseUrl, heldRequestArrived, release } = await startRealServer();
  const exitCalls = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: async () => {},
    exit: (code) => exitCalls.push(code),
    log: silentLog(),
  });

  const heldRequest = fetch(`${baseUrl}/held`);
  await heldRequestArrived; // the handler has started and genuinely holds the connection open

  const shutdownPromise = shutdown('SIGTERM');
  // shutdown() must not resolve while the held request is still pending.
  let shutdownSettled = false;
  shutdownPromise.then(() => { shutdownSettled = true; });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(shutdownSettled, false, 'shutdown must wait for the in-flight request to finish, not cut it off');

  release();
  const heldResponse = await heldRequest;
  assert.equal(heldResponse.status, 200);
  assert.deepEqual(await heldResponse.json(), { done: true });

  await shutdownPromise;
  assert.deepEqual(exitCalls, [], 'a clean shutdown must not force an exit -- it prefers natural termination');
});

test('an idle keep-alive connection does not block shutdown from completing quickly', async () => {
  const { server, baseUrl } = await startRealServer();

  // Node's global fetch (undici) pools and reuses keep-alive connections by
  // default -- a completed request's underlying socket is left open and
  // idle for potential reuse, exactly the scenario closeIdleConnections()
  // exists to handle.
  const quick = await fetch(`${baseUrl}/quick`);
  assert.equal(quick.status, 200);
  await quick.json();

  const exitCalls = [];
  const shutdown = createGracefulShutdown({
    server,
    disconnectDb: async () => {},
    exit: (code) => exitCalls.push(code),
    log: silentLog(),
    timeoutMs: 5000,
  });

  const start = Date.now();
  await shutdown('SIGTERM');
  const elapsed = Date.now() - start;

  assert.deepEqual(exitCalls, [], 'a clean shutdown must not force an exit -- it prefers natural termination');
  assert.ok(elapsed < 2000, `expected shutdown to complete quickly despite the idle keep-alive connection, took ${elapsed}ms`);
});

// --- server.js's own startup-failure cleanup (item 9/14): a failure AFTER
// connectDb() has already succeeded must still disconnect MongoDB before
// main() rejects, rather than leaving the connection (and, here, the
// disposable in-memory MongoDB it spun up) dangling. Uses connectDb()'s own
// existing development in-memory fallback -- never MongoDB Atlas, never any
// persistent database. main() is only safely callable directly here because
// server.js's own auto-run is guarded to fire only when the file is executed
// directly (see server.js's own comment on that guard). ---

test('server.js main() disconnects MongoDB before rejecting, when startup fails after a successful database connection', async (t) => {
  const nodeEnvBackup = env.nodeEnv;
  const mongodbUriBackup = env.mongodbUri;
  const allowMockContentSeedBackup = env.allowMockContentSeed;
  env.nodeEnv = 'development';
  env.mongodbUri = null;
  // Skip real mock-content auto-seeding entirely (it would otherwise run a
  // real, heavier seed script against the fresh in-memory database) -- this
  // test only cares about the failure/cleanup path, not seeding itself.
  env.allowMockContentSeed = 'false';

  t.mock.method(RoleModel, 'countDocuments', async () => {
    throw new Error('simulated startup failure after a successful database connection');
  });

  try {
    await assert.rejects(() => main(), /simulated startup failure after a successful database connection/);
    assert.equal(
      mongoose.connection.readyState,
      0,
      'the database connection established by connectDb() must be disconnected before main() rejects'
    );
  } finally {
    env.nodeEnv = nodeEnvBackup;
    env.mongodbUri = mongodbUriBackup;
    env.allowMockContentSeed = allowMockContentSeedBackup;
    // Safe no-op if already disconnected (mirrors db.test.js's own
    // established pattern for this exact situation).
    await mongoose.disconnect().catch(() => {});
  }
});
