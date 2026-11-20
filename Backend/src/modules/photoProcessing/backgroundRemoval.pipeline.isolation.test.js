// QA Bug 7 Stage E — regression coverage for runPipelineIsolated()
// (backgroundRemoval.service.js): the child-process isolation layer that
// prevents a native crash inside the real background-removal pipeline from
// taking down the whole Express server. See backgroundRemoval.pipeline.
// child.js's own header comment, and QA Bug 7 Stage D's investigation
// report, for the confirmed root cause this exists to contain (two
// independently-built native sharp/libvips copies active in one process).
//
// Every test below forks backgroundRemoval.pipeline.child.testFixture.js --
// a tiny, deterministic stand-in -- never the real backgroundRemoval.
// pipeline.child.js, so no test here ever loads @imgly/background-removal-
// node, onnxruntime-node, or runs the real ONNX model, and no test
// deliberately crashes the test runner's own process (the fixture child
// runs in its own separate OS process regardless of what it does to
// itself). `timeoutMs` is always overridden to a small value in timeout
// tests, so this file never waits anywhere close to the real
// JOB_TIMEOUT_MS (90s).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import { runPipelineIsolated, processJob } from './backgroundRemoval.service.js';
import { PhotoProcessingJobModel } from './photoProcessingJob.model.js';

const FIXTURE_CHILD = path.join(path.dirname(fileURLToPath(import.meta.url)), 'backgroundRemoval.pipeline.child.testFixture.js');
const SHORT_TIMEOUT_MS = 300; // keeps the timeout tests fast; never the real 90s JOB_TIMEOUT_MS

function callFixture(scenario, overrides = {}) {
  // Per the fixture's own header comment: `mimeType` is repurposed as the
  // scenario selector in these tests only -- the real protocol's message
  // shape ({ sourceBuffer, mimeType }) is otherwise unchanged.
  return runPipelineIsolated(Buffer.from('fixture-source-bytes'), scenario, { childEntry: FIXTURE_CHILD, ...overrides });
}

// Mirrors backgroundRemoval.worker.test.js's own established pattern for
// proving no unhandled promise rejection escapes a given operation.
async function assertNoUnhandledRejection(fn) {
  let unhandled = null;
  const onUnhandledRejection = (err) => {
    unhandled = err;
  };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await fn();
    // One extra microtask/macrotask turn so a rejection that would surface
    // asynchronously (e.g. from an already-settled promise's late event)
    // has a chance to actually fire before this check runs.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(unhandled, null, 'expected no unhandled promise rejection');
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
}

// --- 1. Successful child-process execution ----------------------------------

test('successful execution: resolves with the real result buffer from a real forked child process', async () => {
  const result = await callFixture('ok');
  assert.ok(Buffer.isBuffer(result));
  assert.equal(result.toString(), 'fixture-source-bytes');
});

// --- 2. Child exits with a nonzero exit code ---------------------------------

test('child exits with a nonzero exit code: rejects with a safe, code-tagged error, never throws past this function', async () => {
  await assertNoUnhandledRejection(async () => {
    await assert.rejects(() => callFixture('exit-nonzero'), (err) => {
      assert.match(err.message, /crashed unexpectedly/i);
      assert.match(err.message, /code 7/);
      assert.equal(err.code, 'PIPELINE_CRASHED');
      return true;
    });
  });
});

// --- 3. Normal (non-crash) pipeline failure, round-tripped through real IPC --

test('child reports an ordinary pipeline failure via IPC: rejects with exactly that message, no PIPELINE_CRASHED tag', async () => {
  await assert.rejects(() => callFixture('pipeline-error'), (err) => {
    assert.equal(err.message, 'simulated pipeline failure');
    assert.notEqual(err.code, 'PIPELINE_CRASHED');
    return true;
  });
});

// --- 4. Malformed/incomplete IPC data ----------------------------------------

test('child sends malformed IPC data (not an object): rejects with a clear, safe error instead of hanging or crashing', async () => {
  await assertNoUnhandledRejection(async () => {
    await assert.rejects(() => callFixture('malformed'), (err) => {
      assert.match(err.message, /invalid response/i);
      assert.equal(err.code, 'PIPELINE_CRASHED');
      return true;
    });
  });
});

// --- 5. Child terminates unexpectedly (simulates the real native crash) -----

test('child is killed mid-flight (simulated native crash): rejects cleanly, and the parent (this test process) stays alive', async () => {
  let spawnedChild;
  await assertNoUnhandledRejection(async () => {
    await assert.rejects(
      () =>
        callFixture('hang', {
          timeoutMs: 10_000, // long enough that only the explicit kill below can resolve this, not the internal timeout
          onChildSpawned: (child) => {
            spawnedChild = child;
            setTimeout(() => child.kill('SIGKILL'), 50);
          },
        }),
      (err) => {
        assert.match(err.message, /crashed unexpectedly/i);
        assert.equal(err.code, 'PIPELINE_CRASHED');
        return true;
      }
    );
  });
  assert.ok(spawnedChild.exitCode !== null || spawnedChild.signalCode !== null, 'the killed child must actually be dead, not orphaned');

  // The parent (this very test process) is unmistakably still alive and
  // responsive here -- a real native crash in the old, non-isolated
  // architecture would have taken the whole process down with it instead.
  const followUp = await callFixture('ok');
  assert.equal(followUp.toString(), 'fixture-source-bytes', 'the parent must still be able to run further jobs normally afterward');
});

// --- 6. Child hangs and reaches timeout --------------------------------------

test('child hangs indefinitely: the internal timeout fires, rejects with the preserved timeout message, and the hung child is killed (no orphan)', async () => {
  let spawnedChild;
  const start = Date.now();
  await assertNoUnhandledRejection(async () => {
    await assert.rejects(
      () =>
        callFixture('hang', {
          timeoutMs: SHORT_TIMEOUT_MS,
          onChildSpawned: (child) => {
            spawnedChild = child;
          },
        }),
      (err) => {
        assert.equal(err.message, 'Background removal took too long and was stopped.', 'must be the exact same message the pre-existing outer withTimeout() already used for this boundary');
        assert.equal(err.code, 'PROCESSING_TIMEOUT');
        assert.equal(err.status, 504);
        return true;
      }
    );
  });
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < SHORT_TIMEOUT_MS + 2000, `expected the timeout to fire close to timeoutMs, took ${elapsedMs}ms`);

  // Give the OS a brief moment to finish reporting the kill(), then confirm
  // the hung child is genuinely gone -- never left running in the background.
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(spawnedChild.exitCode !== null || spawnedChild.signalCode !== null, 'the timed-out, hung child must be killed, never left orphaned');
});

// --- 7. No duplicate completion ----------------------------------------------

test('a successful response racing a near-simultaneous exit never settles the promise twice', async () => {
  // The 'ok' scenario's own child calls process.send() then process.exit(0)
  // in that send's own completion callback -- 'message' and 'exit' both
  // fire for every normal run of this scenario already; this test exists to
  // pin that double-firing explicitly, rather than leave it only implicit
  // in test 1 above. A broken settleOnce() guard would surface here as an
  // unhandled rejection (a second, later reject() call on an
  // already-resolved promise is silently ignored by the Promise spec
  // itself, but settleOnce()'s own `if (settled) return` is what prevents
  // cleanup() -- and therefore child.kill() -- from ever running twice).
  await assertNoUnhandledRejection(async () => {
    const result = await callFixture('ok');
    assert.equal(result.toString(), 'fixture-source-bytes');
  });
});

// --- 8. End-to-end through processJob(), via a real forked child process ----
// (still never the real ONNX model -- the fixture stands in for it)

let mem;
before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});

after(async () => {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(mem.getUri());
  await mongoose.disconnect();
  await mem.stop();
});

async function createJob() {
  return PhotoProcessingJobModel.create({
    sourceUrl: 'https://vyoma.org/leadership/fixture.jpg',
    status: 'queued',
    createdBy: new mongoose.Types.ObjectId(),
    createdByEmail: 'pipeline-isolation-test@vyoma.org',
  });
}

// processJob() itself (not just the pipeline step) reads the source
// buffer's real image metadata before ever calling `pipeline` -- a
// genuinely valid tiny PNG is needed here so that step succeeds and
// processJob() actually reaches the injected pipeline below.
async function tinyPngBuffer() {
  return sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
    .png()
    .toBuffer();
}

test('processJob() success path through a real forked child process: job ends "done" with the real resultUrl', async () => {
  const job = await createJob();
  await processJob(job._id, {
    fetchImage: async () => tinyPngBuffer(),
    pipeline: (buffer) => runPipelineIsolated(buffer, 'ok', { childEntry: FIXTURE_CHILD }),
    persist: async () => ({ url: 'https://fake-test-bucket.s3.ap-south-1.amazonaws.com/media/fixture-result.png' }),
  });
  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(reloaded.status, 'done');
  assert.equal(reloaded.resultUrl, 'https://fake-test-bucket.s3.ap-south-1.amazonaws.com/media/fixture-result.png');
});

test('processJob() containment: a crashing child process still ends the job "failed", never an uncaught exception, never a fake success', async () => {
  const job = await createJob();
  await assertNoUnhandledRejection(async () => {
    await assert.doesNotReject(() =>
      processJob(job._id, {
        fetchImage: async () => tinyPngBuffer(),
        pipeline: (buffer) => runPipelineIsolated(buffer, 'exit-nonzero', { childEntry: FIXTURE_CHILD }),
        persist: async () => ({ url: 'should-not-be-used' }),
      })
    );
  });
  const reloaded = await PhotoProcessingJobModel.findById(job._id);
  assert.equal(reloaded.status, 'failed');
  assert.match(reloaded.errorMessage, /crashed unexpectedly/i);
  assert.equal(reloaded.resultUrl, null, 'a crashed job must never report a resultUrl');
});
