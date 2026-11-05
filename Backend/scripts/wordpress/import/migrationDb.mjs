// Task 7H.2 — shared database-safety helper for WordPress migration import
// scripts (write-capable: BlogPost/Content/Redirect/etc. creators under
// --commit) and the deploy-time redirect-manifest generator.
//
// These scripts are fundamentally different from the read-only inventory
// scripts under scripts/wordpress/inventory/ (see ./disposableDbTarget.mjs):
// a real migration importer must legitimately be able to target a real,
// ambiently-configured database (via the shared connectDb()/env.mongodbUri
// path the real server also uses) once an operator explicitly authorizes it
// with --commit. Requiring a dedicated disposable-only env var, or rejecting
// non-loopback hosts, would break that legitimate use -- per this task's own
// "keep legitimate production application database connections unaffected"
// requirement. What these scripts need instead is a guaranteed check against
// the one standing-rules-protected database name, applied consistently,
// from a single source of truth, before any query or write.
//
// Originally, this check (assertSafeDatabaseTarget, added in Task 7C) lived
// only inside batch1-import.mjs and was duplicated a second time inside
// panchatantra-redirect-migration.mjs. batch2-import.mjs (Task 7H.1) then
// imported it from batch1-import.mjs directly, which worked but made one
// arbitrarily-chosen importer script the de facto owner of a function 28
// other scripts depend on. Moving it here gives every migration script a
// single, shared, independently-owned source of truth.
//
// Never inspects or logs anything beyond the database name, consistent with
// connectDb()'s own never-log-the-connection-string convention.
import mongoose from 'mongoose';
import { connectDb } from '../../../src/config/db.js';
import { env } from '../../../src/config/env.js';

export const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);

// Aborts (throws) if the active mongoose connection's database name is on
// the protected list. Takes a mongoose connection object (not a URI string)
// so nothing resembling a credential is ever inspected, logged, or printed
// -- only the database name.
export function assertSafeDatabaseTarget(connection) {
  const dbName = connection?.name || connection?.db?.databaseName || null;
  if (dbName && PROTECTED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: the active database ("${dbName}") is on this script's protected list and must never be read, written, reset, or reseeded by this importer.`
    );
  }
  return dbName;
}

// Task 7H.2A: parses a MongoDB connection string's database name using the
// standard URL parser, the same technique scripts/wordpress/inventory/
// disposableDbTarget.mjs already uses -- pure string parsing, no network
// activity of any kind. Returns null (never throws) for a blank/missing
// value or one that isn't a parseable URL with a database path segment --
// that is connectDb()'s/the driver's own error to raise, not this
// function's. Exported so it can be unit-tested directly against synthetic
// URIs, with no dependency on this process's own ambient MONGODB_URI.
export function extractConfiguredDatabaseName(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return null;
  try {
    const parsed = new URL(uri);
    return parsed.pathname.replace(/^\//, '').split('?')[0] || null;
  } catch {
    return null;
  }
}

// Connects via the app's own connectDb() (unmodified -- this never changes
// connectDb() itself, only wraps it) and checks the target database name
// against the protected list. Callers should invoke this from inside their
// own try/finally (as every fixed script here does) so that disconnectDb()
// still runs if the post-connection guard below ever throws.
//
// Task 7H.2A fix: this now validates env.mongodbUri -- the exact string
// connectDb() is about to use -- BEFORE calling connectDb() at all, so a
// configured target that is already known to be the protected database is
// rejected without ever opening a connection to it. Previously this check
// ran only *after* connectDb() had already connected, meaning a protected
// configured target would be connected to (with no query or write ever
// issued against it, since every fixed caller's own guard sits before its
// first query) before being rejected -- a real gap: the standing rule is to
// never even connect to this database, not merely never query it. The
// post-connection assertSafeDatabaseTarget() call is kept as defense in
// depth (e.g. for a configured URI whose path-segment parsing differs from
// the driver's own database-name resolution, or a database selected via
// dbName option rather than the URI path).
//
// A null/unset env.mongodbUri (the local-development in-memory-fallback
// path in connectDb()) is never a protected target by construction, so the
// pre-check simply does nothing in that case.
//
// Returns the connected database's name (or null if unknown), exactly like
// assertSafeDatabaseTarget() -- never the URI, never credentials.
export async function connectToMigrationDb() {
  const configuredDbName = extractConfiguredDatabaseName(env.mongodbUri);
  if (configuredDbName && PROTECTED_DB_NAMES.has(configuredDbName)) {
    throw new Error(
      `Refusing to connect: the configured database ("${configuredDbName}") is on this script's protected list and must never be read, written, reset, or reseeded by this importer.`
    );
  }

  await connectDb();
  return assertSafeDatabaseTarget(mongoose.connection);
}
