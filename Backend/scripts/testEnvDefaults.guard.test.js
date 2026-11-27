// Task 7T.1A — regression coverage for testEnvDefaults.mjs's new
// MONGODB_URI-inheritance refusal (added after the Task 7T-SAFE incident:
// `node --import ./scripts/testEnvDefaults.mjs src/server.js` previously
// never examined MONGODB_URI at all, silently inheriting whatever a
// committed/local .env provided).
//
// Spawned as a real, separate `node --import` subprocess for each case,
// deliberately NOT imported directly into this test's own process: the
// module under test has top-level, environment-dependent side effects
// (including a top-level `await import('dotenv/config')` and a possible
// top-level `throw`), which would pollute this test runner's own
// process.env and module cache if imported in-process. A subprocess gives a
// clean, realistic reproduction of exactly how this module is actually used
// (as a `--import` preload ahead of a real entry module) and proves
// rejection happens before that entry module -- a trivial placeholder
// script here -- ever runs.
//
// NOT EXECUTED as part of Task 7T.1A (static implementation only, per that
// task's explicit restriction) -- prepared here for a separately approved
// verification task to run. No disposable or real MongoDB is ever actually
// connected to by any case below -- every protected/unsafe case is expected
// to throw before any connection code runs, and the "safe" cases never
// import src/server.js (which would attempt a real connection); they import
// a trivial placeholder entry module instead, confirming only that
// testEnvDefaults.mjs itself permits execution to continue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
// A trivial, side-effect-free entry module -- NOT src/server.js, so a "this
// should be allowed to proceed" case never attempts any real network
// connection. It is sufficient for the entry module to be reached at all;
// what it logs is just evidence of that.
const PLACEHOLDER_ENTRY = path.join(__dirname, 'testEnvDefaults.guard.placeholderEntry.mjs');

function run(envOverrides) {
  return execFileAsync(
    process.execPath,
    ['--import', './scripts/testEnvDefaults.mjs', PLACEHOLDER_ENTRY],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, ...envOverrides },
    }
  );
}

test('refuses to proceed when MONGODB_URI resolves to the protected database, even with the explicit-URI opt-in set', async () => {
  await assert.rejects(
    () =>
      run({
        MONGODB_URI: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun',
        ALLOW_EXPLICIT_TEST_MONGODB_URI: 'true',
      }),
    (err) => {
      assert.match(err.stderr ?? '', /vyoma_migration_dryrun/);
      return true;
    }
  );
});

test('refuses to proceed when MONGODB_URI resolves to the protected database, under NODE_ENV=staging', async () => {
  await assert.rejects(
    () =>
      run({
        NODE_ENV: 'staging',
        MONGODB_URI: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun',
      }),
    (err) => {
      assert.match(err.stderr ?? '', /vyoma_migration_dryrun/);
      return true;
    }
  );
});

test('refuses to proceed when a non-protected MONGODB_URI is inherited without the explicit opt-in flag', async () => {
  await assert.rejects(
    () =>
      run({
        MONGODB_URI: 'mongodb://127.0.0.1:27017/some_real_looking_db',
      }),
    (err) => {
      assert.match(err.stderr ?? '', /never silently trusts an inherited connection string/i);
      return true;
    }
  );
});

test('proceeds when a non-protected MONGODB_URI is inherited WITH the explicit opt-in flag set', async () => {
  const { stdout } = await run({
    MONGODB_URI: 'mongodb://127.0.0.1:27017/some_real_looking_db',
    ALLOW_EXPLICIT_TEST_MONGODB_URI: 'true',
  });
  assert.match(stdout, /placeholder entry reached/);
});

test('proceeds normally when MONGODB_URI is not set at all (the ordinary, zero-setup local case)', async () => {
  const env = { ...process.env };
  delete env.MONGODB_URI;
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', './scripts/testEnvDefaults.mjs', PLACEHOLDER_ENTRY],
    { cwd: BACKEND_ROOT, env }
  );
  assert.match(stdout, /placeholder entry reached/);
});
