// Shared safety guard for read-only WordPress-migration inventory scripts
// (blog-parity-audit.mjs, blog-redirect-manifest.mjs) that connect to
// MongoDB directly, outside the app's own connectDb()/env.js configuration.
//
// Task 7H: both scripts previously hardcoded
// 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun' -- the exact,
// standing-rules-protected database -- with no guard at all, unlike
// scripts/wordpress/import/batch1-import.mjs and
// panchatantra-redirect-migration.mjs, which both refuse to proceed against
// it. This module closes that gap by:
//   1. Requiring an explicit, dedicated WP_AUDIT_MONGODB_URI environment
//      variable -- never falling back to a hardcoded default, and never
//      reading the app's own ambient MONGODB_URI -- so running one of these
//      scripts is always a deliberate, separate act, never an accidental
//      side effect of however the Backend's own .env happens to be
//      configured for the server or test suite.
//   2. Parsing the configured URI's database name and refusing to proceed
//      if it matches the protected list -- entirely from the URI string,
//      BEFORE any connection is attempted. mongoose.connect() is never
//      called with an unvalidated URI.
//
// Never inspects or logs anything beyond the database name, consistent with
// this project's existing never-log-the-connection-string convention (see
// batch1-import.mjs's assertSafeDatabaseTarget()).
const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);
export const WP_AUDIT_ENV_VAR = 'WP_AUDIT_MONGODB_URI';

// Extracts the database name from a MongoDB connection string using the
// standard URL parser (mongodb:// and mongodb+srv:// are both valid URLs).
// Returns null for a URI with no path segment (e.g. a bare host with no
// database name) rather than throwing -- that is a legitimately unprotected
// configuration, just an unusual one.
export function extractDatabaseName(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(
      `${WP_AUDIT_ENV_VAR} is not a valid MongoDB connection string (could not be parsed as a URL).`
    );
  }
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0];
  return dbName || null;
}

// Reads WP_AUDIT_MONGODB_URI from the given environment object (defaults to
// process.env) and returns it once validated. Throws -- making no network
// connection of any kind -- if the variable is missing/blank, or if it
// resolves to a protected database name.
export function requireDisposableDbTarget(envObject = process.env) {
  const rawUri = envObject[WP_AUDIT_ENV_VAR];
  if (!rawUri || !String(rawUri).trim()) {
    throw new Error(
      `${WP_AUDIT_ENV_VAR} must be set to an explicit, disposable MongoDB connection string before running this script. ` +
        'Refusing to default to any hardcoded or ambient database target.'
    );
  }

  const uri = String(rawUri).trim();
  const dbName = extractDatabaseName(uri);
  if (dbName && PROTECTED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: ${WP_AUDIT_ENV_VAR} resolves to the database "${dbName}", which is on this project's protected list and must never be read, written, reset, or reseeded by this script.`
    );
  }

  return uri;
}
