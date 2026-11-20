// QA Bug 7 Stage E: test-only fixture child-entry script for
// runPipelineIsolated()'s own regression tests
// (backgroundRemoval.pipeline.isolation.test.js). Deliberately never
// imports runPipeline(), @imgly/background-removal-node, or sharp -- every
// scenario below is a fast, deterministic stand-in, so these tests never
// load the real ONNX model or risk a real native crash in the test
// runner's own process. Not a *.test.js file, so `node --test` never picks
// it up as a suite on its own (same convention as authTestHelpers.js).
//
// runPipelineIsolated()'s real IPC message shape is fixed at
// { sourceBuffer, mimeType } -- this fixture repurposes `mimeType` (which a
// real child.js never gives special meaning to beyond passing it to
// runPipeline()) as the test's scenario selector, rather than inventing a
// third message field the real protocol doesn't have.
process.on('message', (msg) => {
  const { mimeType: scenario, sourceBuffer } = msg || {};

  if (scenario === 'ok') {
    process.send({ ok: true, resultBuffer: sourceBuffer }, () => process.exit(0));
    return;
  }
  if (scenario === 'pipeline-error') {
    process.send({ ok: false, message: 'simulated pipeline failure' }, () => process.exit(0));
    return;
  }
  if (scenario === 'exit-nonzero') {
    process.exit(7);
    return;
  }
  if (scenario === 'malformed') {
    process.send('not-a-valid-response-object', () => process.exit(0));
    return;
  }
  if (scenario === 'hang') {
    // Deliberately never sends a response or exits on its own -- the test
    // using this scenario asserts runPipelineIsolated()'s own timeout kills
    // this process. setInterval keeps the event loop alive so the process
    // does not exit on its own, which would otherwise make this scenario
    // indistinguishable from 'exit-nonzero'.
    setInterval(() => {}, 1000);
    return;
  }
  process.send({ ok: false, message: `unknown test scenario "${scenario}"` }, () => process.exit(1));
});
