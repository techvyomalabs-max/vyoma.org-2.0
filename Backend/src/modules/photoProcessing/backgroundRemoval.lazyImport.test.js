// QA Bug 7 Stage G — regression coverage for the lazy, child-only import of
// @imgly/background-removal-node inside runPipeline() (backgroundRemoval.
// service.js). See Stage F2's investigation report for the confirmed root
// cause this exists to fix: @imgly's own bundled dist/index.cjs does
// require("sharp") (its own separately-versioned, nested native build) and
// require("onnxruntime-node") at ITS OWN module top level, so a static
// top-level import of @imgly anywhere in backgroundRemoval.service.js would
// load that second native library pair into WHICHEVER process loads this
// file -- including the parent Express server, which loads this file
// unconditionally at startup for enqueueJob()/getJob()/persistProcessedImage().
//
// Every check below runs in a fresh, fully isolated `node` child process
// (never the test runner's own process) -- loading @imgly even once would
// permanently load its native deps for the rest of this process's lifetime,
// contaminating every other test that happens to run afterward. Detection
// uses process.report.getReport().sharedObjects -- the real, OS-level list
// of currently-loaded native shared libraries -- deliberately NOT
// require.cache (ESM-loads a CJS package like @imgly through its own
// interop path, which is not guaranteed to populate require.cache the same
// way across Node versions or future package changes).
//
// No real ONNX model is ever run here: triggering @imgly's own top-level
// requires only needs the bare `import('@imgly/background-removal-node')`
// expression to execute -- removeBackground() itself is never called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.join(HERE, 'backgroundRemoval.service.js');
// env.js's own `import 'dotenv/config'` looks for a .env file relative to
// process.cwd() -- running the probe with cwd set to this subdirectory
// would miss Backend/.env entirely (NODE_ENV would appear unset there even
// though it's configured for every other invocation in this project, which
// all run from the Backend root). The probe script's own module resolution
// for the bare '@imgly/...' specifier follows its file location on disk,
// not cwd, so this has no effect on what the probe is actually testing.
const BACKEND_ROOT = path.resolve(HERE, '..', '..', '..');

function runIsolatedProbe({ importImglyDirectly }) {
  const script = `
    const report1 = process.report.getReport();
    await import(${JSON.stringify(pathToFileURL(SERVICE_PATH).href)});
    ${importImglyDirectly ? "await import('@imgly/background-removal-node');" : ''}
    const paths = process.report.getReport().sharedObjects || [];
    const nestedSharpLoaded = paths.some((p) => p.includes('@imgly') && /sharp/i.test(p));
    const onnxLoaded = paths.some((p) => /onnxruntime/i.test(p));
    process.stdout.write(JSON.stringify({ nestedSharpLoaded, onnxLoaded }));
  `;
  // Written inside this module's own directory (not the OS temp dir) so
  // Node's normal node_modules resolution for the bare '@imgly/...'
  // specifier finds Backend/node_modules correctly; always removed
  // afterward regardless of outcome.
  const probePath = path.join(HERE, `.lazyImportProbe.${process.pid}.${Date.now()}.mjs`);
  fs.writeFileSync(probePath, script, 'utf8');
  try {
    const stdout = execFileSync(process.execPath, [probePath], { encoding: 'utf8', cwd: BACKEND_ROOT });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(probePath, { force: true });
  }
}

test('importing backgroundRemoval.service.js alone never loads @imgly/background-removal-node\'s nested sharp or onnxruntime-node', () => {
  const result = runIsolatedProbe({ importImglyDirectly: false });
  assert.equal(result.nestedSharpLoaded, false, 'the nested, separately-versioned sharp@0.32.x must never load just from importing the service file');
  assert.equal(result.onnxLoaded, false, 'onnxruntime-node must never load just from importing the service file');
});

test('sanity check: the detection mechanism itself is meaningful -- actually importing @imgly does load both native dependencies', () => {
  const result = runIsolatedProbe({ importImglyDirectly: true });
  assert.equal(result.nestedSharpLoaded, true, 'expected the probe to detect @imgly\'s nested sharp once @imgly is genuinely imported');
  assert.equal(result.onnxLoaded, true, 'expected the probe to detect onnxruntime-node once @imgly is genuinely imported');
});

test('backgroundRemoval.service.js has no static top-level import of @imgly/background-removal-node, and runPipeline() imports it dynamically', () => {
  const source = fs.readFileSync(SERVICE_PATH, 'utf8');
  assert.doesNotMatch(
    source,
    /^\s*import\s+.*@imgly\/background-removal-node/m,
    'a static top-level import of @imgly would defeat this fix regardless of the isolated-process checks above'
  );
  assert.match(
    source,
    /await import\(['"]@imgly\/background-removal-node['"]\)/,
    'runPipeline() must dynamically import @imgly immediately before using it'
  );
});
