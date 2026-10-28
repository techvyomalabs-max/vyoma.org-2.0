import mongoose from 'mongoose';
import { env } from './env.js';

// Real MongoDB (Atlas/mongod) when MONGODB_URI is set. Otherwise — in local
// development only — boot an in-memory MongoDB so the server runs with zero
// external setup. Same mongoose models either way; only the connection
// source differs.
//
// Outside development, a missing/blank MONGODB_URI is a fatal configuration
// error, not a silent fallback: an ephemeral in-memory database in
// staging/production would boot successfully and appear to work, while
// every write (users, content, donations, audit logs) exists only in that
// one process's memory and is lost on the next restart -- confirmed as a
// real risk during staging-readiness review, since nothing else in this
// codebase would otherwise catch a missing MONGODB_URI before data loss.
// This check lives here (not only in server.js) specifically so it also
// protects scripts/bootstrapAuth.js and scripts/seed.js, both of which call
// connectDb() directly.
let memoryServer = null;

// Connection-lifecycle logging -- observability only, no change to
// connection/reconnection behavior itself (the MongoDB driver already
// handles reconnection on its own; this only logs the state transitions it
// was already going to make). Registered exactly ONCE per process, guarded
// by `listenersRegistered`: mongoose.connection is a module-level singleton
// shared across every call to connectDb() in this process (e.g.
// db.test.js's several tests each call connectDb() against the same
// connection object) -- attaching these unconditionally inside connectDb()'s
// own body would re-attach a fresh set of listeners on every call, so a
// single real event would log once per accumulated listener instead of
// once, and would eventually trip Node's MaxListenersExceededWarning.
//
// Never logs the connection string, credentials, or the raw driver error
// message -- a driver error's `.message` can itself echo back connection
// details (hostname, port, or the URI it failed to reach) -- only the event
// name and, for errors, the error's `name` (e.g. "MongoServerSelectionError").
let listenersRegistered = false;

function registerConnectionEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on('connected', () => {
    console.log('[db] connection event: connected');
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[db] connection event: disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[db] connection event: reconnected');
  });
  mongoose.connection.on('error', (err) => {
    // Defensive even against a hostile/malformed error-like value (not just
    // a normal Error instance) -- e.g. a getter on `.name` that throws must
    // never crash this listener (and, by extension, the process) while it's
    // already in the middle of handling a connection error. Falls back to
    // 'Unknown' for anything that isn't a plain string `.name`.
    let name = 'Unknown';
    try {
      if (err && typeof err.name === 'string' && err.name) name = err.name;
    } catch {
      // Swallow -- `name` stays 'Unknown'.
    }
    console.error(`[db] connection event: error (${name})`);
  });
}

export async function connectDb() {
  registerConnectionEventListeners();

  const uri = env.mongodbUri;
  const hasRealUri = typeof uri === 'string' && uri.trim().length > 0;

  if (hasRealUri) {
    await mongoose.connect(uri);
    console.log('[db] connected (configured URI)');
    return;
  }

  if (env.nodeEnv !== 'development') {
    throw new Error(
      `MONGODB_URI must be set to a real connection string outside local development (NODE_ENV=${env.nodeEnv}) -- refusing to start an ephemeral in-memory database for staging/production.`
    );
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  memoryServer = await MongoMemoryServer.create();
  const memoryUri = memoryServer.getUri();
  console.warn(
    '[db] MONGODB_URI not set — using an in-memory MongoDB instance. Data will NOT persist across restarts. Set MONGODB_URI for staging/production.'
  );
  await mongoose.connect(memoryUri);
  console.log('[db] connected (in-memory)');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
