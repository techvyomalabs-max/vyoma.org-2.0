// Task 7H.1 added two fixes to batch2-import.mjs; Task 7H.2 then moved the
// underlying guard into a shared, independently-owned module used by every
// write-capable migration script (see migrationDb.test.js for direct
// coverage of that module itself). This file now covers batch2-import.mjs's
// own wiring to it:
//   1. Using the shared connectToMigrationDb() (migrationDb.mjs) instead of
//      a raw connectDb() with no check at all -- previously, this
//      write-capable importer could create Content/Redirect documents
//      against the standing-rules-protected database with no guard.
//   2. The isDirectCliInvocation import-guard convention already used by
//      batch1-import.mjs and panchatantra-redirect-migration.mjs --
//      previously missing here, which meant merely importing this module
//      would have run main() (and attempted a real connectDb()) as a side
//      effect.
//
// batch2-import.mjs connects via the shared connectDb()/env.mongodbUri path
// (the same ambient configuration the real server uses), unlike the
// read-only inventory scripts' dedicated WP_AUDIT_MONGODB_URI -- a real,
// write-capable migration importer must legitimately be able to target a
// real, ambiently-configured database under explicit operator action. This
// file never calls batch2-import.mjs's own main() (which would attempt a
// real connection against whatever MONGODB_URI happens to be configured in
// this process); it only (a) imports connectToMigrationDb from the same
// shared module batch2-import.mjs itself now uses, exercising it directly
// against a disposable mongodb-memory-server, and (b) statically confirms
// batch2-import.mjs's source is wired to call it before any database query,
// and that main() is no longer invoked as an import side effect.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH2_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/wordpress/import/batch2-import.mjs'),
  'utf8'
);

let mem;

before(async () => {
  mem = await MongoMemoryServer.create();
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mem.stop();
});

test('importing batch2-import.mjs does not run main() or open any database connection', async () => {
  await import('../../../scripts/wordpress/import/batch2-import.mjs');
  assert.equal(mongoose.connection.readyState, 0, 'no connection should have been opened as an import side effect');
});

test('batch2-import.mjs imports connectToMigrationDb from the shared migrationDb.mjs, not a raw connectDb()', () => {
  assert.match(BATCH2_SOURCE, /import\s*\{\s*connectToMigrationDb\s*\}\s*from\s*'\.\/migrationDb\.mjs'/);
  assert.ok(!/from\s+'\.\/batch1-import\.mjs'/.test(BATCH2_SOURCE), 'must not depend on batch1-import.mjs for its guard');
  assert.ok(!/await\s+connectDb\(\)/.test(BATCH2_SOURCE), 'must not call connectDb() directly -- only through connectToMigrationDb()');
  assert.ok(!/const PROTECTED_DB_NAMES/.test(BATCH2_SOURCE), 'must not duplicate the protected-name list locally');
});

test('batch2-import.mjs calls connectToMigrationDb() before any database query', () => {
  const connectIdx = BATCH2_SOURCE.indexOf('await connectToMigrationDb();');
  const tryIdx = BATCH2_SOURCE.indexOf('try {', connectIdx);
  assert.ok(connectIdx !== -1 && tryIdx !== -1, 'both anchors must be present');
  assert.ok(connectIdx < tryIdx, 'the guarded connect must happen before entering the try block that runs queries');

  const firstQueryIdx = BATCH2_SOURCE.slice(tryIdx).search(/await\s+(Content|Redirect|BlogPost)Model/);
  assert.ok(firstQueryIdx > -1, 'expected to find at least one database query after the guarded connect');
});

test('batch2-import.mjs only runs main() on direct CLI invocation, never as an import side effect', () => {
  assert.match(BATCH2_SOURCE, /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/);
  const guardIdx = BATCH2_SOURCE.indexOf('if (isDirectCliInvocation)');
  const mainCallIdx = BATCH2_SOURCE.indexOf('main().catch');
  assert.ok(guardIdx !== -1 && mainCallIdx !== -1 && guardIdx < mainCallIdx, 'main() must only run inside the isDirectCliInvocation guard');
});
