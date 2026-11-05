// Task 7H — regression coverage for
// scripts/wordpress/inventory/disposableDbTarget.mjs, the shared safety
// guard added for blog-parity-audit.mjs and blog-redirect-manifest.mjs.
// Those two scripts previously hardcoded
// 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun' -- the standing-rules-
// protected database -- with no guard at all.
//
// This file only imports the guard module itself (a pure, side-effect-free
// export with no top-level await, no file reads, no database connection).
// It deliberately never imports blog-parity-audit.mjs or
// blog-redirect-manifest.mjs directly: both scripts run their real work at
// module top level (WXR parsing, then `await mongoose.connect(...)`), so
// merely importing either for a test would attempt a real connection as a
// side effect. The source-text checks below confirm those two scripts are
// wired to the guard without ever executing them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  requireDisposableDbTarget,
  extractDatabaseName,
  WP_AUDIT_ENV_VAR,
} from '../../../scripts/wordpress/inventory/disposableDbTarget.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PARITY_AUDIT_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/wordpress/inventory/blog-parity-audit.mjs'),
  'utf8'
);
const REDIRECT_MANIFEST_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/wordpress/inventory/blog-redirect-manifest.mjs'),
  'utf8'
);
// Task 7H.1: the same guard was extended to these two scripts, which had the
// identical hardcoded-protected-URI-with-no-guard pattern.
const MEDIA_INVENTORY_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/wordpress/inventory/blog-media-inventory.mjs'),
  'utf8'
);
const VERIFY_MEDIA_SYNC_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/wordpress/inventory/verify-media-sync.mjs'),
  'utf8'
);

test('WP_AUDIT_ENV_VAR is the expected, dedicated variable name', () => {
  assert.equal(WP_AUDIT_ENV_VAR, 'WP_AUDIT_MONGODB_URI');
});

test('rejects when the env var is missing entirely', () => {
  assert.throws(() => requireDisposableDbTarget({}), /must be set to an explicit, disposable MongoDB connection string/);
});

test('rejects when the env var is set but blank', () => {
  assert.throws(
    () => requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: '   ' }),
    /must be set to an explicit, disposable MongoDB connection string/
  );
});

test('rejects the exact protected database name', () => {
  assert.throws(
    () => requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun' }),
    /Refusing to proceed.*vyoma_migration_dryrun.*protected list/s
  );
});

test('rejects the protected database name even with extra host/query noise', () => {
  assert.throws(
    () =>
      requireDisposableDbTarget({
        WP_AUDIT_MONGODB_URI: 'mongodb://user:pass@some-host.example.com:27017/vyoma_migration_dryrun?retryWrites=true',
      }),
    /protected list/
  );
});

test('rejects a malformed connection string before attempting to connect', () => {
  assert.throws(() => requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'not a valid uri' }), /not a valid MongoDB connection string/);
});

test('accepts a syntactically valid, non-protected database target', () => {
  const result = requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'mongodb://127.0.0.1:27017/some_other_db' });
  assert.equal(result, 'mongodb://127.0.0.1:27017/some_other_db');
});

// Task 7H.1: the guard cannot verify a target is genuinely disposable, so it
// additionally requires a loopback host, closing the gap where a
// non-protected-NAMED but real, remote, persistent cluster would otherwise
// have been accepted.
test('rejects a non-protected database name on a non-loopback (remote) host', () => {
  assert.throws(
    () => requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'mongodb://some-real-cluster.example.com:27017/some_other_db' }),
    /not a recognized loopback address/
  );
});

test('accepts localhost and ::1 as loopback hosts, in addition to 127.0.0.1', () => {
  assert.equal(
    requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'mongodb://localhost:27017/some_other_db' }),
    'mongodb://localhost:27017/some_other_db'
  );
  assert.equal(
    requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: 'mongodb://[::1]:27017/some_other_db' }),
    'mongodb://[::1]:27017/some_other_db'
  );
});

test('accepts and returns a real disposable mongodb-memory-server URI unchanged', async () => {
  const mem = await MongoMemoryServer.create();
  try {
    const uri = mem.getUri('wp_audit_disposable_test');
    const result = requireDisposableDbTarget({ WP_AUDIT_MONGODB_URI: uri });
    assert.equal(result, uri);
    assert.equal(extractDatabaseName(uri), 'wp_audit_disposable_test');
  } finally {
    await mem.stop();
  }
});

test('extractDatabaseName returns null for a URI with no database segment', () => {
  assert.equal(extractDatabaseName('mongodb://127.0.0.1:27017'), null);
});

// Note: both scripts' own header comments now legitimately mention
// "vyoma_migration_dryrun" in prose, to explain why this guard exists --
// what must never reappear is a literal hardcoded connection-string
// assignment to MONGO_URI. That is checked precisely below, rather than by
// banning the database name from appearing anywhere in the file at all.
const HARDCODED_PROTECTED_URI_ASSIGNMENT = /const MONGO_URI = ['"]mongodb:\/\/[^'"]*vyoma_migration_dryrun[^'"]*['"]/;

test('blog-parity-audit.mjs no longer hardcodes the protected connection string', () => {
  assert.ok(
    !HARDCODED_PROTECTED_URI_ASSIGNMENT.test(PARITY_AUDIT_SOURCE),
    'MONGO_URI must not be assigned a literal, hardcoded connection string'
  );
  assert.match(PARITY_AUDIT_SOURCE, /import\s*\{\s*requireDisposableDbTarget\s*\}\s*from\s*'\.\/disposableDbTarget\.mjs'/);
  assert.match(PARITY_AUDIT_SOURCE, /const MONGO_URI = requireDisposableDbTarget\(\);/);
});

test('blog-redirect-manifest.mjs no longer hardcodes the protected connection string', () => {
  assert.ok(
    !HARDCODED_PROTECTED_URI_ASSIGNMENT.test(REDIRECT_MANIFEST_SOURCE),
    'MONGO_URI must not be assigned a literal, hardcoded connection string'
  );
  assert.match(REDIRECT_MANIFEST_SOURCE, /import\s*\{\s*requireDisposableDbTarget\s*\}\s*from\s*'\.\/disposableDbTarget\.mjs'/);
  assert.match(REDIRECT_MANIFEST_SOURCE, /const MONGO_URI = requireDisposableDbTarget\(\);/);
});

// Task 7H.1 — the same two scripts flagged as "additional migration scripts
// with similar risk" in Task 7H's final report, now fixed with the same
// shared guard.
test('blog-media-inventory.mjs no longer hardcodes the protected connection string', () => {
  assert.ok(
    !HARDCODED_PROTECTED_URI_ASSIGNMENT.test(MEDIA_INVENTORY_SOURCE),
    'MONGO_URI must not be assigned a literal, hardcoded connection string'
  );
  assert.match(MEDIA_INVENTORY_SOURCE, /import\s*\{\s*requireDisposableDbTarget\s*\}\s*from\s*'\.\/disposableDbTarget\.mjs'/);
  assert.match(MEDIA_INVENTORY_SOURCE, /const MONGO_URI = requireDisposableDbTarget\(\);/);
});

test('verify-media-sync.mjs no longer hardcodes the protected connection string', () => {
  assert.ok(
    !HARDCODED_PROTECTED_URI_ASSIGNMENT.test(VERIFY_MEDIA_SYNC_SOURCE),
    'MONGO_URI must not be assigned a literal, hardcoded connection string'
  );
  assert.match(VERIFY_MEDIA_SYNC_SOURCE, /import\s*\{\s*requireDisposableDbTarget\s*\}\s*from\s*'\.\/disposableDbTarget\.mjs'/);
  assert.match(VERIFY_MEDIA_SYNC_SOURCE, /const MONGO_URI = requireDisposableDbTarget\(\);/);
});
