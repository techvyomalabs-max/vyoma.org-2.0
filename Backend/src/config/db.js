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

export async function connectDb() {
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
