// Task 7P-SEC6 — offline/static-only coverage for the temporary Atlas
// read-only connection-verification script. Deliberately run standalone
// (node --test on this one file), NOT wired into Backend's permanent
// `npm test` glob (src/**/*.test.js) -- the script itself is temporary and
// meant to be deleted once the real verification has succeeded, so it gets
// no permanent place in the regular suite.
//
// No real or dummy network connection is ever opened here: main() itself
// is never called. Only the pure, non-connecting helper
// (assertExpectedClusterHost) is exercised directly, plus several static
// source-text checks that prove the script's safety properties without
// executing its connection-attempting code paths at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertExpectedClusterHost, EXPECTED_CLUSTER_HOST } from './atlasReadOnlyConnectionCheck.mjs';

const SOURCE = fs.readFileSync(new URL('./atlasReadOnlyConnectionCheck.mjs', import.meta.url), 'utf8');
const CODE_ONLY = SOURCE.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');

// --- assertExpectedClusterHost: pure string parsing, no network at all ---

test('EXPECTED_CLUSTER_HOST is exactly the cluster host given for this task', () => {
  assert.equal(EXPECTED_CLUSTER_HOST, 'vyoma-test-cluster.ctnt2ww.mongodb.net');
});

test('assertExpectedClusterHost passes for a dummy URI with the exact expected host (pure parsing only -- new URL() never opens a connection)', () => {
  const dummyUri = 'mongodb+srv://fixture01:testpass@vyoma-test-cluster.ctnt2ww.mongodb.net/vyoma_2_0_test?retryWrites=true';
  assert.equal(assertExpectedClusterHost(dummyUri), 'vyoma-test-cluster.ctnt2ww.mongodb.net');
});

test('assertExpectedClusterHost is case-insensitive', () => {
  const dummyUri = 'mongodb+srv://fixture01:testpass@VYOMA-TEST-CLUSTER.CTNT2WW.MONGODB.NET/vyoma_2_0_test';
  assert.equal(assertExpectedClusterHost(dummyUri), 'vyoma-test-cluster.ctnt2ww.mongodb.net');
});

test('assertExpectedClusterHost rejects a different host, and the error never contains the raw URI or any credential', () => {
  const dummyUri = 'mongodb+srv://fixture01:testpass@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test';
  assert.throws(() => assertExpectedClusterHost(dummyUri), (err) => {
    assert.match(err.message, /some-other-cluster\.abc123\.mongodb\.net.*does not match/s);
    assert.ok(!err.message.includes(dummyUri), 'error must never contain the raw URI');
    assert.ok(!err.message.includes('fixture01'), 'error must never contain the username');
    assert.ok(!err.message.includes('testpass'), 'error must never contain the password');
    return true;
  });
});

test('assertExpectedClusterHost rejects a malformed URI clearly, without throwing an unrelated error', () => {
  assert.throws(() => assertExpectedClusterHost('not a uri at all'), /could not be parsed/);
});

test('assertExpectedClusterHost rejects a missing/blank URI, naming the expected environment variable', () => {
  assert.throws(() => assertExpectedClusterHost(undefined), /MIGRATION_TARGET_MONGODB_URI must be set/);
  assert.throws(() => assertExpectedClusterHost('   '), /MIGRATION_TARGET_MONGODB_URI must be set/);
});

test('assertExpectedClusterHost rejects the real expected host\'s own URI if the db-name segment differs -- this function only validates the host, by design (db name is migrationTargetGuard.mjs\'s separate job)', () => {
  // Not a rejection test -- documents the deliberate scope boundary: this
  // function returns the host regardless of db name, because db-name
  // validation is reused from migrationTargetGuard.mjs, not duplicated here.
  const dummyUri = 'mongodb+srv://fixture01:testpass@vyoma-test-cluster.ctnt2ww.mongodb.net/some_other_db';
  assert.equal(assertExpectedClusterHost(dummyUri), 'vyoma-test-cluster.ctnt2ww.mongodb.net');
});

// --- Static source checks: safety properties proven without ever running main() ---

test('source never imports or instantiates any Mongoose Model (ContentModel, ContentRevisionModel, or any .model.js)', () => {
  assert.ok(!CODE_ONLY.includes('.model.js'), 'must never import a Mongoose Model file');
  assert.ok(!CODE_ONLY.includes('ContentModel'), 'must never reference ContentModel');
  assert.ok(!CODE_ONLY.includes('ContentRevisionModel'), 'must never reference ContentRevisionModel');
  assert.ok(!/mongoose\.model\(/.test(CODE_ONLY), 'must never define or compile a Mongoose Model');
});

test('source contains no write-capable MongoDB operations anywhere in its actual code (comments aside)', () => {
  const writeOps = [
    '.insertOne(', '.insertMany(', '.updateOne(', '.updateMany(', '.deleteOne(', '.deleteMany(',
    '.findOneAndUpdate(', '.findOneAndDelete(', '.replaceOne(', '.createIndex(', '.createIndexes(',
    '.drop(', '.dropDatabase(', '.save(', '$set', '$unset',
  ];
  for (const op of writeOps) {
    assert.ok(!CODE_ONLY.includes(op), `source must not contain "${op}" outside comments -- this script must be strictly read-only`);
  }
});

test('source reuses connectToExplicitMigrationTarget from migrationTargetGuard.mjs rather than reimplementing the db-name guard', () => {
  assert.match(SOURCE, /import\s*\{[^}]*connectToExplicitMigrationTarget[^}]*\}\s*from\s*'\.\.\/wordpress\/import\/migrationTargetGuard\.mjs'/);
});

test('source never prints a raw driver-level error message: exactly one safe err.message use (the pre-connection host check) and no bare err.message anywhere else', () => {
  const messageUses = (CODE_ONLY.match(/\berr\.message\b/g) || []).length;
  assert.equal(messageUses, 1, `expected exactly 1 use of err.message (the pre-connection host-check catch), found ${messageUses}`);
  const nameUses = (CODE_ONLY.match(/err\?\.name/g) || []).length;
  assert.equal(nameUses, 2, `expected exactly 2 uses of err?.name (connection-step and read-operation catches), found ${nameUses}`);
});

test('source never contains a literal credential placeholder-shaped assignment (sanity check: no hardcoded URI/password)', () => {
  assert.ok(!/mongodb(\+srv)?:\/\/\w+:\w+@/.test(CODE_ONLY), 'must never hardcode a connection string with embedded credentials');
});

test('source only runs main() on direct CLI invocation, not merely on import (safe for this test file to import it)', () => {
  assert.match(SOURCE, /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/);
  assert.match(SOURCE, /if \(isDirectCliInvocation\) \{\s*main\(\);\s*\}/);
});

test('source always disconnects in a finally block around the read-operation step', () => {
  assert.match(CODE_ONLY, /finally\s*\{\s*await mongoose\.disconnect\(\)\.catch/);
});
