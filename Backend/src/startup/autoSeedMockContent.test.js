// Regression coverage for maybeAutoSeedMockContent() -- the extracted,
// testable form of server.js's "auto-seed mock content when the database is
// empty" startup logic. Uses a disposable in-memory MongoDB
// (mongodb-memory-server) only; no persistent database is ever touched, and
// runSeed() itself is replaced with a small fake so these tests exercise the
// GATING decision (empty/non-empty x allowed/not-allowed), not runSeed()'s
// own seed-data content.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { ContentModel } from '../modules/content/content.model.js';
import { maybeAutoSeedMockContent } from './autoSeedMockContent.js';
import { env } from '../config/env.js';

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});

beforeEach(async () => {
  await ContentModel.deleteMany({});
});

function fakeRunSeed(calls) {
  return async () => {
    calls.push(true);
    await ContentModel.create({ type: 'home', data: { title: 'Mock Home' } });
    return { contentTypes: 1, donationSchemes: 0, blogPosts: 0 };
  };
}

function silentLog() {}

test('an empty collection, with seeding allowed, is seeded', async () => {
  const calls = [];
  const result = await maybeAutoSeedMockContent({
    ContentModel,
    runSeed: fakeRunSeed(calls),
    isAllowed: () => true,
    log: silentLog,
  });
  assert.equal(result.seeded, true);
  assert.equal(calls.length, 1);
  assert.equal(await ContentModel.countDocuments(), 1);
});

test('an empty collection, with seeding NOT allowed, is left empty', async () => {
  const calls = [];
  const result = await maybeAutoSeedMockContent({
    ContentModel,
    runSeed: fakeRunSeed(calls),
    isAllowed: () => false,
    log: silentLog,
  });
  assert.equal(result.seeded, false);
  assert.equal(result.reason, 'not_allowed');
  assert.equal(calls.length, 0, 'runSeed must never be called when not allowed');
  assert.equal(await ContentModel.countDocuments(), 0);
});

test('a non-empty collection is never seeded, regardless of whether seeding is allowed', async () => {
  await ContentModel.create({ type: 'pre-existing', data: { note: 'already here' } });
  const calls = [];
  const result = await maybeAutoSeedMockContent({
    ContentModel,
    runSeed: fakeRunSeed(calls),
    isAllowed: () => true,
    log: silentLog,
  });
  assert.equal(result.seeded, false);
  assert.equal(result.reason, 'not_empty');
  assert.equal(calls.length, 0, 'runSeed must never be called against a non-empty collection');
  assert.equal(await ContentModel.countDocuments(), 1, 'the pre-existing document must be untouched');
});

// --- Full-stack checks using the REAL isMockContentSeedAllowed() (env-driven) ---

function withEnv(overrides, fn) {
  const nodeEnvBackup = env.nodeEnv;
  const allowMockBackup = env.allowMockContentSeed;
  env.nodeEnv = overrides.nodeEnv;
  env.allowMockContentSeed = overrides.allowMockContentSeed;
  return fn().finally(() => {
    env.nodeEnv = nodeEnvBackup;
    env.allowMockContentSeed = allowMockBackup;
  });
}

test('local development behavior: an empty database is auto-seeded by default (no explicit override)', async () => {
  await withEnv({ nodeEnv: 'development', allowMockContentSeed: null }, async () => {
    const calls = [];
    const result = await maybeAutoSeedMockContent({ ContentModel, runSeed: fakeRunSeed(calls), log: silentLog }); // real isMockContentSeedAllowed
    assert.equal(result.seeded, true);
    assert.equal(calls.length, 1);
  });
});

test('staging behavior: an empty database is NOT auto-seeded by default (no explicit override)', async () => {
  await withEnv({ nodeEnv: 'staging', allowMockContentSeed: null }, async () => {
    const calls = [];
    const result = await maybeAutoSeedMockContent({ ContentModel, runSeed: fakeRunSeed(calls), log: silentLog });
    assert.equal(result.seeded, false);
    assert.equal(result.reason, 'not_allowed');
    assert.equal(calls.length, 0);
  });
});

test('production behavior: an empty database is NOT auto-seeded by default (no explicit override)', async () => {
  await withEnv({ nodeEnv: 'production', allowMockContentSeed: null }, async () => {
    const calls = [];
    const result = await maybeAutoSeedMockContent({ ContentModel, runSeed: fakeRunSeed(calls), log: silentLog });
    assert.equal(result.seeded, false);
    assert.equal(result.reason, 'not_allowed');
    assert.equal(calls.length, 0);
  });
});

test('explicit opt-in: ALLOW_MOCK_CONTENT_SEED=true seeds an empty staging database', async () => {
  await withEnv({ nodeEnv: 'staging', allowMockContentSeed: 'true' }, async () => {
    const calls = [];
    const result = await maybeAutoSeedMockContent({ ContentModel, runSeed: fakeRunSeed(calls), log: silentLog });
    assert.equal(result.seeded, true);
    assert.equal(calls.length, 1);
  });
});

// Production is an ABSOLUTE floor: confirmed end-to-end (real
// isMockContentSeedAllowed(), real empty in-memory collection) that
// ALLOW_MOCK_CONTENT_SEED=true cannot override it -- this is the exact
// scenario flagged as a material risk during staging-readiness review.
test('production + ALLOW_MOCK_CONTENT_SEED=true: an empty database is still NOT auto-seeded (no override possible)', async () => {
  await withEnv({ nodeEnv: 'production', allowMockContentSeed: 'true' }, async () => {
    const calls = [];
    const result = await maybeAutoSeedMockContent({ ContentModel, runSeed: fakeRunSeed(calls), log: silentLog });
    assert.equal(result.seeded, false);
    assert.equal(result.reason, 'not_allowed');
    assert.equal(calls.length, 0, 'runSeed must never be called in production, even with the override set');
    assert.equal(await ContentModel.countDocuments(), 0);
  });
});
