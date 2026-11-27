// Task 7P-SEC6 — a minimal, standalone, TEMPORARY script to verify that the
// new read-only Atlas user (vyoma_backup_readonly) can actually connect and
// read from vyoma_2_0_test, before it is trusted for a real
// backupDatabase.mjs run. Not part of any permanent workflow -- intended to
// be deleted once the real verification has succeeded.
//
// Deliberately does NOT import or instantiate any Mongoose Model
// (ContentModel, ContentRevisionModel, etc.): Mongoose automatically
// attempts to sync/create indexes the first time a Model is used (autoIndex
// is not disabled anywhere in this project -- confirmed by reviewing
// src/config/db.js and migrationTargetGuard.mjs, Task 7P-SEC5's finding),
// which is a write-class operation a strict read-only Atlas role may not be
// authorized for. Every database operation below goes through
// mongoose.connection.db directly (the native MongoDB driver handle), never
// through a compiled Model, so this script cannot trigger that regardless
// of role.
//
// Usage:
//   $env:MIGRATION_TARGET_MONGODB_URI = "<vyoma_backup_readonly connection string>"
//   $env:MIGRATION_TARGET_CONFIRM = "vyoma_2_0_test"
//   node scripts/verify/atlasReadOnlyConnectionCheck.mjs
//   Remove-Item Env:\MIGRATION_TARGET_MONGODB_URI, Env:\MIGRATION_TARGET_CONFIRM
//
// Reuses migrationTargetGuard.mjs's existing database-name guard as-is (no
// duplicate db-name-checking logic): it already validates
// MIGRATION_TARGET_MONGODB_URI's database name against the vyoma_2_0_test
// allowlist before connecting, connects, then independently re-verifies the
// ACTUAL connected database name afterward -- and never touches a Mongoose
// Model itself.
//
// Never prints the URI, username, password, or a raw driver error (which
// can embed connection details in its own .message) -- see the two
// dedicated catch blocks below for exactly why they differ.
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { MIGRATION_TARGET_ENV_VAR, connectToExplicitMigrationTarget } from '../wordpress/import/migrationTargetGuard.mjs';

export const EXPECTED_CLUSTER_HOST = 'vyoma-test-cluster.ctnt2ww.mongodb.net';

// Pure string/URL parsing only -- no network activity of any kind, same
// convention as every other guard in this project (protectedDbGuard.mjs,
// migrationTargetGuard.mjs). migrationTargetGuard.mjs's own guard validates
// the database NAME but not the cluster HOST; this fills that specific gap
// for this script only, without modifying that shared module.
export function assertExpectedClusterHost(uri, expectedHost = EXPECTED_CLUSTER_HOST) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error(`${MIGRATION_TARGET_ENV_VAR} must be set before the cluster host can be verified.`);
  }
  let parsed;
  try {
    parsed = new URL(uri.trim());
  } catch {
    throw new Error('Refusing to proceed: the configured connection string could not be parsed as a valid URI.');
  }
  const actualHost = parsed.hostname.toLowerCase();
  const expected = expectedHost.toLowerCase();
  if (actualHost !== expected) {
    throw new Error(
      `Refusing to proceed: the configured connection string's host ("${actualHost}") does not match the expected ` +
        `cluster host ("${expected}"). Aborting before any connection is attempted.`
    );
  }
  return actualHost;
}

export async function main() {
  console.log('='.repeat(72));
  console.log('Atlas read-only connection verification -- Task 7P-SEC6 (temporary script)');
  console.log('Read-only checks only: ping, listCollections, one findOne. No writes of any kind.');
  console.log('='.repeat(72));

  const rawUri = process.env[MIGRATION_TARGET_ENV_VAR];

  // --- Step 1: cluster host, pure text parsing, before anything else ----
  // This function's own thrown messages never include the URI (confirmed
  // by reading it above), so printing them in full here is safe.
  try {
    const host = assertExpectedClusterHost(rawUri);
    console.log(`[OK] Cluster host matches expected: ${host}`);
  } catch (err) {
    console.error('\n--- VERIFICATION FAILED (pre-connection host check) ---');
    console.error(err.message);
    process.exitCode = 1;
    return;
  }

  // --- Step 2: connect, reusing the existing db-name guard as-is --------
  let dbName;
  try {
    dbName = await connectToExplicitMigrationTarget();
  } catch (err) {
    // requireExplicitAtlasTestTarget()'s OWN pre-connection validation
    // errors (missing/blank URI, wrong db name, missing confirmation) are
    // also pre-vetted-safe to print in full -- but a genuine
    // mongoose.connect() failure (bad password, network/auth error,
    // timeout) is NOT: the MongoDB driver's own error objects can embed
    // connection details (host:port, etc.) in `.message`. There is no
    // reliable way to tell which case this is from here, so -- fail closed
    // -- only `.name` is ever printed for this specific catch site, never
    // `.message`.
    console.error('\n--- VERIFICATION FAILED (connection step) ---');
    console.error(`Reason category: ${err?.name || 'Unknown error'}`);
    console.error('No further detail is printed here by design -- re-check cluster host, database name, Network Access, and credentials.');
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
    return;
  }

  try {
    console.log(`[OK] Connected. Verified database name (never the URI): ${dbName}`);

    // --- Native MongoDB driver calls only -- no Mongoose Model is ever
    // imported or instantiated anywhere in this file, so Mongoose's
    // automatic index-sync (autoIndex) can never be triggered here,
    // regardless of role. Every call below is read-only by its own
    // definition: ping (server status), listCollections (metadata read),
    // findOne with a field-limited projection (a query). ---
    const ping = await mongoose.connection.db.admin().ping();
    console.log(`[OK] Ping: ${JSON.stringify(ping)}`);

    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`[OK] Collections found: ${collections.length} (${collections.map((c) => c.name).join(', ') || '(none)'})`);

    const sample = await mongoose.connection.db.collection('contents').findOne({}, { projection: { _id: 1, type: 1 } });
    console.log(`[OK] Sample findOne (type/_id only): ${sample ? JSON.stringify(sample) : '(no documents found)'}`);

    console.log('\n--- VERIFICATION SUCCEEDED: read-only connection confirmed. ---');
  } catch (err) {
    console.error('\n--- VERIFICATION FAILED (read operation) ---');
    console.error(`Reason category: ${err?.name || 'Unknown error'}`);
    console.error('No further detail is printed here by design.');
    process.exitCode = 1;
  } finally {
    // Always disconnect, success or failure, so a failed verification
    // never leaves an open handle.
    await mongoose.disconnect().catch(() => {});
  }
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main();
}
