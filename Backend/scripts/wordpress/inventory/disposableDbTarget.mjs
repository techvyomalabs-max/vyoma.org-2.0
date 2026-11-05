// Shared safety guard for read-only WordPress-migration inventory scripts
// (blog-parity-audit.mjs, blog-redirect-manifest.mjs, blog-media-inventory.mjs,
// verify-media-sync.mjs) that connect to MongoDB directly, outside the app's
// own connectDb()/env.js configuration.
//
// Task 7H: these scripts previously hardcoded
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
//   3. (Task 7H.1) Requiring the target host to be a loopback address. This
//      does NOT prove the target is genuinely disposable -- a persistent
//      database can run on localhost too, and this guard cannot inspect
//      what's actually inside a database before connecting to it. What it
//      closes is the more dangerous gap left by step 2 alone: nothing
//      stopped WP_AUDIT_MONGODB_URI from being pointed at a real, remote,
//      persistent cluster (e.g. a MongoDB Atlas SRV string) that simply
//      isn't named the one protected name. Every legitimate use of these
//      scripts to date has targeted a local MongoDB instance
//      (127.0.0.1:27017) or a local mongodb-memory-server instance (also
//      loopback) -- this makes that the enforced floor, not just the
//      convention. See requireDisposableDbTarget()'s own comment for the
//      honest limit of what this can and cannot guarantee.
//
// Never inspects or logs anything beyond the database name and host,
// consistent with this project's existing never-log-the-connection-string
// convention (see batch1-import.mjs's assertSafeDatabaseTarget()).
const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);
// Node's URL parser reports an IPv6 literal's hostname WITH its brackets
// (e.g. "[::1]", not "::1") -- both forms are listed so a URI written either
// way is still recognized correctly.
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
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
// connection of any kind -- if the variable is missing/blank, if it resolves
// to a protected database name, or if its host is not a loopback address.
//
// Honest limit (Task 7H.1 review): this function can reliably reject the one
// specific protected database NAME, and can reliably reject a non-loopback
// host. It CANNOT reliably confirm a target is genuinely disposable --
// nothing about a connection string proves whether the database behind it
// is an ephemeral throwaway or a real, persistent local database an
// operator cares about. A stronger, allow-list-style check exists
// (batch1-import.mjs's assertDisposableTestDatabase()) but only works by
// verifying the connection resolves to a specific, already-running
// MongoMemoryServer instance supplied by the caller -- appropriate for an
// automated test harness, not for a real CLI invocation against a real
// local MongoDB an operator stood up by hand. Genuine disposability for a
// real run is therefore still a human/process guarantee (use a database you
// are prepared to discard), not something this function can verify by
// itself.
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

  const { hostname } = new URL(uri);
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to proceed: ${WP_AUDIT_ENV_VAR} targets host "${hostname}", which is not a recognized loopback address ` +
        '(127.0.0.1, localhost, or ::1). This guard cannot verify a database is genuinely disposable, so it requires a ' +
        'local MongoDB instance and refuses any remote/persistent-cluster-looking target.'
    );
  }

  return uri;
}
