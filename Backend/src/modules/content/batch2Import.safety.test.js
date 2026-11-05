// Task 7H.1 — regression coverage for batch2-import.mjs's two fixes:
//   1. Reusing batch1-import.mjs's own assertSafeDatabaseTarget() (rather
//      than duplicating the protected-name list a third time) so this
//      write-capable importer can no longer create Content/Redirect
//      documents against the standing-rules-protected database with no
//      check at all.
//   2. Adding the same isDirectCliInvocation import-guard convention
//      already used by batch1-import.mjs and
//      panchatantra-redirect-migration.mjs -- previously missing here,
//      which meant merely importing this module would have run main() (and
//      attempted a real connectDb()) as a side effect.
//
// batch2-import.mjs connects via the shared connectDb()/env.mongodbUri path
// (the same ambient configuration the real server uses), unlike the
// read-only inventory scripts' dedicated WP_AUDIT_MONGODB_URI -- a real,
// write-capable migration importer must legitimately be able to target a
// real, ambiently-configured database under explicit operator action, the
// same design batch1-import.mjs already established. This file never calls
// batch2-import.mjs's own main() (which would attempt a real connection
// against whatever MONGODB_URI happens to be configured in this process);
// it only (a) imports the exact, reused assertSafeDatabaseTarget and
// exercises it directly against a disposable mongodb-memory-server, and
// (b) statically confirms batch2-import.mjs's source is wired to call it
// immediately after connectDb(), before any database query, and that
// main() is no longer invoked as an import side effect.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { assertSafeDatabaseTarget } from '../../../scripts/wordpress/import/batch1-import.mjs';

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

test('the reused assertSafeDatabaseTarget rejects the protected database name', async () => {
  await mongoose.connect(mem.getUri('vyoma_migration_dryrun'));
  try {
    assert.throws(() => assertSafeDatabaseTarget(mongoose.connection), /vyoma_migration_dryrun/);
  } finally {
    await mongoose.disconnect();
  }
});

test('the reused assertSafeDatabaseTarget allows a disposable, non-protected database', async () => {
  await mongoose.connect(mem.getUri('batch2_disposable_test'));
  try {
    assert.doesNotThrow(() => assertSafeDatabaseTarget(mongoose.connection));
  } finally {
    await mongoose.disconnect();
  }
});

test('batch2-import.mjs imports assertSafeDatabaseTarget from batch1-import.mjs instead of duplicating it', () => {
  assert.match(BATCH2_SOURCE, /import\s*\{\s*assertSafeDatabaseTarget\s*\}\s*from\s*'\.\/batch1-import\.mjs'/);
  assert.ok(!/const PROTECTED_DB_NAMES/.test(BATCH2_SOURCE), 'must not duplicate the protected-name list locally');
});

test('batch2-import.mjs calls the guard immediately after connectDb(), before any database query', () => {
  const connectIdx = BATCH2_SOURCE.indexOf('await connectDb();');
  const tryIdx = BATCH2_SOURCE.indexOf('try {', connectIdx);
  const guardIdx = BATCH2_SOURCE.indexOf('assertSafeDatabaseTarget(mongoose.connection)', connectIdx);
  assert.ok(connectIdx !== -1 && tryIdx !== -1 && guardIdx !== -1, 'all three anchors must be present');
  assert.ok(connectIdx < tryIdx && tryIdx < guardIdx, 'guard must run inside the try block, immediately after connectDb()');

  const between = BATCH2_SOURCE.slice(tryIdx, guardIdx);
  assert.ok(!/await\s+(Content|Redirect|BlogPost)Model/.test(between), 'no database query may run before the guard');
});

test('batch2-import.mjs only runs main() on direct CLI invocation, never as an import side effect', () => {
  assert.match(BATCH2_SOURCE, /const isDirectCliInvocation = process\.argv\[1\] && import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href;/);
  const guardIdx = BATCH2_SOURCE.indexOf('if (isDirectCliInvocation)');
  const mainCallIdx = BATCH2_SOURCE.indexOf('main().catch');
  assert.ok(guardIdx !== -1 && mainCallIdx !== -1 && guardIdx < mainCallIdx, 'main() must only run inside the isDirectCliInvocation guard');
});
