// Regression coverage for GET /api/v1/ready (app.js) -- a database-aware
// readiness probe, deliberately separate from the unconditional GET
// /api/v1/health liveness check. Covers both states (connected/disconnected)
// using only a disposable mongodb-memory-server instance -- never MongoDB
// Atlas, never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun.
//
// Order matters in this file: the "disconnected" case is exercised FIRST,
// before mongoose ever connects to anything in this process (mongoose's
// default readyState is 0/disconnected), then the "connected" case connects
// a real disposable in-memory MongoDB, then a final test disconnects again
// to confirm /ready correctly reports a MID-LIFE disconnect too, not just
// the initial unconnected state. node:test runs top-level tests in one file
// sequentially by default, so this ordering is reliable.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from './app.js';

let server;
let baseUrl;
let mem;

test.before(async () => {
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mem) await mem.stop();
});

async function getReady() {
  const res = await fetch(`${baseUrl}/api/v1/ready`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getHealth() {
  const res = await fetch(`${baseUrl}/api/v1/health`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

test('GET /api/v1/ready returns 503 NOT_READY when MongoDB has never connected in this process', async () => {
  assert.equal(mongoose.connection.readyState, 0, 'precondition: mongoose must not be connected yet');
  const { res, body } = await getReady();
  assert.equal(res.status, 503);
  assert.deepEqual(body, { success: false, code: 'NOT_READY', message: 'Database connection is not ready.' });
});

test('GET /api/v1/ready does not expose a connection string, hostname, or credential in its response', async () => {
  const { body } = await getReady();
  const serialized = JSON.stringify(body);
  assert.doesNotMatch(serialized, /mongodb(\+srv)?:\/\//i);
  assert.doesNotMatch(serialized, /127\.0\.0\.1|localhost/i);
});

test('GET /api/v1/health is unaffected by MongoDB being disconnected (unconditional liveness check, unchanged)', async () => {
  const { res, body } = await getHealth();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { success: true, data: { status: 'ok' } });
});

test('GET /api/v1/ready returns 200 once connected to a real (disposable) MongoDB', async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  assert.equal(mongoose.connection.readyState, 1, 'precondition: mongoose must be connected now');

  const { res, body } = await getReady();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { success: true, data: { status: 'ready' } });
});

test('GET /api/v1/health still returns its original response while connected (unchanged either way)', async () => {
  const { res, body } = await getHealth();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { success: true, data: { status: 'ok' } });
});

test('GET /api/v1/ready returns 503 again after a mid-life disconnect (not just the initial unconnected state)', async () => {
  await mongoose.disconnect();
  assert.equal(mongoose.connection.readyState, 0, 'precondition: mongoose must be disconnected again');

  const { res, body } = await getReady();
  assert.equal(res.status, 503);
  assert.deepEqual(body, { success: false, code: 'NOT_READY', message: 'Database connection is not ready.' });

  await mem.stop();
  mem = null;
});
