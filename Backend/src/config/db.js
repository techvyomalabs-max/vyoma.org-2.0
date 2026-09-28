import mongoose from 'mongoose';
import { env } from './env.js';

// Real MongoDB (Atlas/mongod) when MONGODB_URI is set. Otherwise — the
// expected case for local dev on a machine with no MongoDB installed — boot
// an in-memory MongoDB so the server runs with zero external setup. Same
// mongoose models either way; only the connection source differs.
let memoryServer = null;

export async function connectDb() {
  let uri = env.mongodbUri;

  if (!uri) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
    console.warn(
      '[db] MONGODB_URI not set — using an in-memory MongoDB instance. Data will NOT persist across restarts. Set MONGODB_URI for staging/production.'
    );
  }

  await mongoose.connect(uri);
  console.log(`[db] connected (${memoryServer ? 'in-memory' : 'configured URI'})`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
