// Task 7D.33 — Phase 2B database-isolation hardening for the Patrons/
// Leadership/Awards restoration migration scripts (patrons-migration.mjs,
// patron-categories-unify-migration.mjs, leadership-awards-images-migration.mjs).
//
// Phase 2A's finding: these scripts previously called migrationDb.mjs's
// connectToMigrationDb(), which deliberately reuses the app's own ambient
// env.mongodbUri (Backend/.env) -- the right design for a general-purpose
// importer, but not strict enough for this specific, one-time restoration
// against a single, explicitly-named Atlas testing database. This module is
// a SEPARATE, stricter guard, modeled on
// scripts/wordpress/inventory/disposableDbTarget.mjs's dedicated-env-var
// pattern, but using an exact database-NAME allowlist instead of a
// loopback-host check -- Atlas connection strings have no "loopback"
// concept, so the equivalent guarantee here is "resolves to exactly the one
// approved database name," checked twice: once from the URI text before any
// connection is attempted, and again from the MongoDB client's own actual
// connection after connecting (a URI's path segment is not guaranteed to be
// the only way a driver can resolve its target database).
//
// Never falls back to MONGODB_URI, Backend/.env, or any ambient value --
// this module never reads env.mongodbUri or calls connectDb() at all.
import mongoose from 'mongoose';
import { assertSafeMongoConnectionUri, PROTECTED_DB_NAMES } from '../../../src/config/protectedDbGuard.js';

export const MIGRATION_TARGET_ENV_VAR = 'MIGRATION_TARGET_MONGODB_URI';
export const MIGRATION_TARGET_CONFIRM_ENV_VAR = 'MIGRATION_TARGET_CONFIRM';

// Exactly one approved target for this restoration. Not configurable via
// environment variable on purpose -- an allowlist an operator can also set
// via an env var is not really an allowlist, it is just another ambient
// value to get wrong.
const ALLOWED_DB_NAMES = new Set(['vyoma_2_0_test']);

// Same conservative timeouts as src/config/db.js's own connectMongooseSafely()
// (see that file's comment for the full rationale) -- duplicated here rather
// than imported, since this module deliberately never imports anything from
// connectDb()'s own ambient-configuration code path.
const CONNECTION_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

function parseDbNameFromUri(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '').split('?')[0] || null;
  } catch {
    return null;
  }
}

// Step 1 (pre-connection, no network activity of any kind): validates
// MIGRATION_TARGET_MONGODB_URI's text alone. Throws on: missing/blank,
// unparseable, the one standing-rules-protected database name (defense in
// depth, even though it could never be on ALLOWED_DB_NAMES anyway), any name
// not exactly on the allowlist, or a missing/mismatched explicit operator
// confirmation.
//
// MIGRATION_TARGET_CONFIRM is the "require explicit operator confirmation of
// the expected Atlas cluster identity before any connection" requirement --
// modeled on this project's existing ALLOW_EXPLICIT_TEST_MONGODB_URI=true
// convention (scripts/testEnvDefaults.mjs), but stronger: instead of a
// boolean, the operator must type out the exact expected database name
// again, in a second, independent env var. A copy-pasted or
// mistakenly-reused MIGRATION_TARGET_MONGODB_URI still fails this check
// unless the operator also deliberately (re-)typed "vyoma_2_0_test" as
// MIGRATION_TARGET_CONFIRM for this specific invocation.
export function requireExplicitAtlasTestTarget(envObject = process.env) {
  const rawUri = envObject[MIGRATION_TARGET_ENV_VAR];
  if (!rawUri || !String(rawUri).trim()) {
    throw new Error(
      `${MIGRATION_TARGET_ENV_VAR} must be set to the exact, explicit Atlas testing connection string before running this migration. ` +
        'This never falls back to MONGODB_URI, Backend/.env, or any ambient value.'
    );
  }
  const uri = String(rawUri).trim();

  // Protected-name floor, applied first and unconditionally -- never
  // bypassable by anything below.
  assertSafeMongoConnectionUri(uri, { label: MIGRATION_TARGET_ENV_VAR });

  const dbName = parseDbNameFromUri(uri);
  if (!dbName || !ALLOWED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: ${MIGRATION_TARGET_ENV_VAR} resolves to database "${dbName || '(none)'}", which is not on the ` +
        `explicit allowlist (${[...ALLOWED_DB_NAMES].join(', ')}). This migration must target exactly the approved Atlas ` +
        'testing database, by name, with no exceptions.'
    );
  }

  const confirm = envObject[MIGRATION_TARGET_CONFIRM_ENV_VAR];
  if (confirm !== dbName) {
    throw new Error(
      `Refusing to proceed: set ${MIGRATION_TARGET_CONFIRM_ENV_VAR}="${dbName}" to explicitly confirm you intend to target ` +
        `exactly this database before any connection is attempted. (Expected "${dbName}", got ` +
        `${confirm === undefined ? 'unset' : JSON.stringify(confirm)}.)`
    );
  }

  return { uri, dbName };
}

// Step 2 (post-connection): validates the database the MongoDB client
// actually resolved to, not just the URI's own path segment -- a connection
// object (not a URI string), exactly like src/config/db.js's
// assertSafeDatabaseTarget(), so nothing resembling a credential is ever
// inspected or logged. Re-checks the protected-name floor against the real
// resolved name too, in case a URI's path segment ever disagreed with the
// driver's own database selection (e.g. a dbName connection option
// overriding the path).
export function assertConnectedToExpectedDatabase(connection, expectedDbName) {
  const actualName = connection?.name || connection?.db?.databaseName || null;
  if (PROTECTED_DB_NAMES.has(actualName)) {
    throw new Error(`Refusing to proceed: the connected database ("${actualName}") is on the protected list.`);
  }
  if (actualName !== expectedDbName) {
    throw new Error(
      `Refusing to proceed: the MongoDB client actually connected to database "${actualName}", not the expected ` +
        `"${expectedDbName}". Aborting before any read or write.`
    );
  }
  return actualName;
}

// Connects directly with mongoose, deliberately bypassing connectDb()/
// env.mongodbUri entirely (the opposite design choice from
// migrationDb.mjs's connectToMigrationDb(), which exists precisely to reuse
// that ambient path for a general-purpose importer). Returns the verified
// database name -- never the URI, never credentials.
export async function connectToExplicitMigrationTarget(envObject = process.env) {
  const { uri, dbName } = requireExplicitAtlasTestTarget(envObject);
  await mongoose.connect(uri, CONNECTION_OPTIONS);
  return assertConnectedToExpectedDatabase(mongoose.connection, dbName);
}
