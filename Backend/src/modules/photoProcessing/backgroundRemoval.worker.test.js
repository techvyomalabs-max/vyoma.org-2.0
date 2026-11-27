// Task 7D.7 — regression coverage for the in-process photo-processing
// worker's failure-handling reliability (processJob()/workLoop()/
// enqueueJob() in backgroundRemoval.service.js).
//
// Confirmed root cause (Task 7D.5's audit, re-verified directly here before
// writing this fix): processJob()'s own catch block persisted a job's
// FAILED status via `await job.save()` with no handling of ITS OWN
// rejection. If that save also failed (e.g. a transient DB hiccup right
// after the real processing failure), the exception escaped processJob()
// entirely uncaught, which escaped workLoop()'s while-loop uncaught, which
// -- since enqueueJob() calls workLoop() fire-and-forget, with no .catch()
// -- became an UNHANDLED PROMISE REJECTION: able to crash the whole Node
// process (Node's default behavior), and at minimum permanently stalling
// every other already-queued job until a new one happened to trigger a
// fresh workLoop().
//
// Uses only a disposable mongodb-memory-server instance -- never the
// protected database, never port 27017's real instance, never Backend/.env
// (this file is run with DOTENV_CONFIG_PATH redirected to a nonexistent
// fixture, same as every other test in this task). Every heavy/network/ML
// step (fetchSourceImage, runPipeline, persistProcessedImage) is replaced
// via processJob()'s own injectable overrides -- the identical pattern
// persistProcessedImage() itself already established for testability
// (`node:test`'s mock.method() cannot redefine a plain ES module's named
// exports) -- so no real network, no real @imgly/background-removal-node
// model load, and no real S3/AWS call happens anywhere in this file.
// PhotoProcessingJobModel.prototype.save (an ordinary object method, not a
// module export) IS mockable with mock.method(), confirmed directly, and is
// used to simulate the exact double-save-failure scenario.
import { test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import { env } from '../../config/env.js';
import { processJob, workLoop, pending } from './backgroundRemoval.service.js';
import { PhotoProcessingJobModel } from './photoProcessingJob.model.js';

let mem;
const ORIGINAL_SAVE = PhotoProcessingJobModel.prototype.save;
const ACTOR = { email: 'worker-test@vyoma.org', get _id() { return new mongoose.Types.ObjectId(); } };

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(mem.getUri());
  await mongoose.disconnect();
  await mem.stop();
});

afterEach(() => {
  mock.restoreAll();
  pending.length = 0; // never let one test's leftover queue bleed into the next
});

async function tinyPngBuffer() {
  return sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
    .png()
    .toBuffer();
}

// Passes assertSafeSourceUrl's existing "local dev host" allowlist branch
// with zero DNS lookup and zero real network reachability requirement --
// this is the same bypass real local-development jobs already use.
function localDevSourceUrl(name) {
  return `http://localhost:${env.port}/local-media/${name}.png`;
}

async function createJob(overrides = {}) {
  return PhotoProcessingJobModel.create({
    sourceUrl: localDevSourceUrl('source'),
    status: 'queued',
    createdBy: new mongoose.Types.ObjectId(),
    createdByEmail: ACTOR.email,
    ...overrides,
  });
}

function fastOkOptions(overrides = {}) {
  return {
    fetchImage: async () => tinyPngBuffer(),
    pipeline: async () => tinyPngBuffer(),
    persist: async () => ({ url: 'https://fake-test-bucket.s3.ap-south-1.amazonaws.com/media/fake-result.png' }),
    ...overrides,
  };
}

// --- 1. Successful processing -----------------------------------------------

test('successful processing: job ends "done" with the real resultUrl, via the real success code path', async () => {
  const job = await createJob();
  await processJob(job._id, fastOkOptions());
  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(reloaded.status, 'done');
  assert.equal(reloaded.resultUrl, 'https://fake-test-bucket.s3.ap-south-1.amazonaws.com/media/fake-result.png');
  assert.equal(reloaded.errorMessage, null);
});

// --- 2. Normal processing failure --------------------------------------------

test('normal processing failure: job ends "failed" with the real error message, and resolves without throwing', async () => {
  const job = await createJob();
  await assert.doesNotReject(() =>
    processJob(job._id, fastOkOptions({ pipeline: async () => { throw new Error('simulated background-removal failure'); } }))
  );
  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(reloaded.status, 'failed');
  assert.equal(reloaded.errorMessage, 'simulated background-removal failure');
  assert.equal(reloaded.resultUrl, null, 'a failed job must never report a resultUrl');
});

// --- 3. Failure while persisting the failed job status (the confirmed bug) --

test('FIXED: a failure while persisting the FAILED status does not throw out of processJob(), and never fakes a success', async () => {
  const job = await createJob();
  let saveCallCount = 0;
  mock.method(PhotoProcessingJobModel.prototype, 'save', async function mockedSave(...args) {
    saveCallCount += 1;
    if (saveCallCount === 1) return ORIGINAL_SAVE.apply(this, args); // the real "mark processing" save succeeds
    throw new Error('simulated DB hiccup persisting the failed status');
  });

  await assert.doesNotReject(() =>
    processJob(job._id, fastOkOptions({ pipeline: async () => { throw new Error('simulated background-removal failure'); } }))
  );

  mock.restoreAll(); // read back with the real save() restored
  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(
    reloaded.status,
    'processing',
    'the job must remain at its last successfully-persisted status, never silently advanced to "failed" or "done" when that save itself failed'
  );
});

// --- 4. Unexpected processJob() rejection, handled at the worker boundary ---

test('FIXED: workLoop() swallows an unexpected processJob() rejection (e.g. the very first save, marking "processing", itself failing) instead of propagating it', async () => {
  const job = await createJob();
  pending.push(job._id.toString());
  mock.method(PhotoProcessingJobModel.prototype, 'save', async () => {
    throw new Error('simulated total DB outage -- even the first save fails');
  });

  await assert.doesNotReject(() => workLoop(fastOkOptions()));
  assert.equal(pending.length, 0, 'the job was still shifted off the queue (it was attempted, not silently skipped)');
});

// --- 5. Multiple queued jobs, first one failing ------------------------------

test('a later job in the queue still processes successfully after an earlier one fails', async () => {
  const jobA = await createJob({ sourceUrl: localDevSourceUrl('source-a') });
  const jobB = await createJob({ sourceUrl: localDevSourceUrl('source-b') });
  pending.push(jobA._id.toString(), jobB._id.toString());

  let pipelineCalls = 0;
  await workLoop(
    fastOkOptions({
      pipeline: async () => {
        pipelineCalls += 1;
        if (pipelineCalls === 1) throw new Error('simulated failure for the first job');
        return tinyPngBuffer();
      },
    })
  );

  const reloadedA = await PhotoProcessingJobModel.findById(jobA._id);
  const reloadedB = await PhotoProcessingJobModel.findById(jobB._id);
  assert.equal(reloadedA.status, 'failed');
  assert.equal(reloadedA.errorMessage, 'simulated failure for the first job');
  assert.equal(reloadedB.status, 'done', 'the second job must still be processed, not stalled by the first job\'s failure');
  assert.ok(reloadedB.resultUrl);
});

// --- 6. Worker state recovery after an exception -----------------------------

test('FIXED: after an exception during one workLoop() run, a later workLoop() call still drains newly-queued jobs (the worker is not left stuck)', async () => {
  const brokenJob = await createJob({ sourceUrl: localDevSourceUrl('source-broken') });
  pending.push(brokenJob._id.toString());
  mock.method(PhotoProcessingJobModel.prototype, 'save', async () => {
    throw new Error('simulated total DB outage');
  });
  await workLoop(fastOkOptions()); // the exact scenario from test 4 above

  mock.restoreAll(); // DB "recovers"
  const healthyJob = await createJob({ sourceUrl: localDevSourceUrl('source-healthy') });
  pending.push(healthyJob._id.toString());
  await workLoop(fastOkOptions());

  const reloaded = await PhotoProcessingJobModel.findById(healthyJob._id);
  assert.equal(reloaded.status, 'done', 'a job queued after a prior failure must still be processed normally');
});

// --- 7. No unhandled promise rejection ---------------------------------------

test('FIXED: no unhandled promise rejection occurs even in the exact old crash scenario (fire-and-forget workLoop(), every save failing)', async () => {
  const job = await createJob();
  pending.push(job._id.toString());
  mock.method(PhotoProcessingJobModel.prototype, 'save', async () => {
    throw new Error('simulated total DB outage');
  });

  let unhandled = null;
  const onUnhandledRejection = (err) => {
    unhandled = err;
  };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    // Deliberately NOT awaited/caught here -- mirrors enqueueJob()'s own
    // fire-and-forget call exactly. If workLoop() ever actually rejected
    // (the pre-fix bug), this line alone would be enough to surface a real
    // unhandledRejection event for the listener above to catch.
    workLoop(fastOkOptions());
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(unhandled, null, 'workLoop() must never produce an unhandled promise rejection');
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});

// --- 8. No infinite retry loop when the database is unavailable -------------

test('FIXED: when MongoDB is disconnected, workLoop() pauses immediately instead of looping through every queued job', async () => {
  const jobA = await createJob({ sourceUrl: localDevSourceUrl('source-a') });
  const jobB = await createJob({ sourceUrl: localDevSourceUrl('source-b') });
  const jobC = await createJob({ sourceUrl: localDevSourceUrl('source-c') });
  pending.push(jobA._id.toString(), jobB._id.toString(), jobC._id.toString());

  await mongoose.disconnect();
  try {
    const start = Date.now();
    await workLoop(fastOkOptions());
    const elapsedMs = Date.now() - start;
    assert.ok(elapsedMs < 2000, `expected an immediate pause, not a loop attempting every queued job (took ${elapsedMs}ms)`);
    assert.equal(pending.length, 3, 'no job should be shifted off the queue while the database is unreachable -- all three remain for later');
  } finally {
    await mongoose.connect(mem.getUri());
  }
});

// --- 9. No duplicate processing of the same job ------------------------------

test('a job already drained from the queue is never reprocessed by a later workLoop() call', async () => {
  const job = await createJob();
  pending.push(job._id.toString());
  let pipelineCalls = 0;
  const options = fastOkOptions({
    pipeline: async () => {
      pipelineCalls += 1;
      return tinyPngBuffer();
    },
  });

  await workLoop(options); // drains and completes the one queued job
  assert.equal(pipelineCalls, 1);

  await workLoop(options); // nothing left in `pending` -- must be a no-op
  assert.equal(pipelineCalls, 1, 'the already-completed job must not be processed a second time just because workLoop() runs again');

  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(reloaded.status, 'done');
});

// --- Sanity: enqueueJob()'s own fire-and-forget call is defended too --------
//
// Deliberately a static source check, not a live execution: exercising
// enqueueJob() for real would require either a real network call (it never
// accepts injectable overrides -- by design, it's the production entrypoint
// that must always use the real implementations) or mocking .save() so
// early that PhotoProcessingJobModel.create() itself fails before
// workLoop() is ever reached, which wouldn't actually exercise this line.
// This pins the one-line defense-in-depth addition directly instead.
test('enqueueJob() attaches a .catch() to its fire-and-forget workLoop() call (defense in depth against an unhandled rejection)', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'backgroundRemoval.service.js'), 'utf8');
  assert.match(source, /workLoop\(\)\.catch\(/, 'enqueueJob() must never call workLoop() in a way that can produce an unhandled promise rejection');
});
