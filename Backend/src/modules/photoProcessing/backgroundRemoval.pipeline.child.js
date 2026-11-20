// QA Bug 7 Stage E: the entry point forked by runPipelineIsolated()
// (backgroundRemoval.service.js) to run the real, native-dependency-heavy
// background-removal pipeline (runPipeline()) in an isolated child process.
// If @imgly/background-removal-node's native ONNX Runtime addon, or its own
// bundled (separately-versioned) sharp/libvips build, crashes the process --
// the confirmed Render QA failure mode -- only this child process dies; the
// parent Express server, and every other in-flight request, is unaffected.
// See runPipelineIsolated()'s own header comment for the full protocol this
// script implements and why.
import { runPipeline } from './backgroundRemoval.service.js';

process.on('message', async (msg) => {
  let response;
  try {
    const { sourceBuffer, mimeType } = msg || {};
    const resultBuffer = await runPipeline(sourceBuffer, mimeType);
    response = { ok: true, resultBuffer };
  } catch (err) {
    // Never forwards a raw stack trace or internal path -- only the plain
    // message text, exactly mirroring what processJob()'s own catch block
    // already does with any other pipeline failure (job.errorMessage =
    // err.message), so this crash-isolation layer changes nothing about
    // what ends up visible to the admin UI for an ordinary (non-crash)
    // pipeline failure.
    response = { ok: false, message: err?.message || 'Background removal failed.' };
  }
  // Only exits once the parent has actually received this message --
  // exiting immediately after process.send() (which is asynchronous) could
  // otherwise truncate the outgoing IPC write, the exact "malformed or
  // incomplete IPC data" failure mode runPipelineIsolated() must also
  // tolerate on the receiving end regardless.
  process.send(response, () => {
    process.exit(response.ok ? 0 : 1);
  });
});
