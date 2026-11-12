// Task 7T.1A — a fail-closed, pre-connection guard for the APPLICATION's own
// MongoDB connection path (src/config/db.js's connectDb()), added after an
// incident (Task 7T-SAFE) in which `node src/server.js` connected to the
// explicitly protected database `vyoma_migration_dryrun` because
// connectDb() had no awareness of the protected-database concept at all --
// only the separate, narrower Task 7P backup/restore tooling
// (scripts/backup/protectedDbGuard.mjs) and the WordPress migration import
// tooling (scripts/wordpress/import/migrationDb.mjs,
// scripts/wordpress/inventory/disposableDbTarget.mjs) had any such guard,
// and neither of those is ever imported by the running application.
//
// Reuses scripts/backup/protectedDbGuard.mjs's PROTECTED_DB_NAMES list (the
// single source of truth for this project's protected-database policy)
// rather than redeclaring it -- a second, independent list would be exactly
// the kind of silent drift that makes a guard like this untrustworthy over
// time.
//
// Deliberately STRICTER than scripts/backup/protectedDbGuard.mjs's own
// extractDatabaseName(): that version returns null for an unparseable or
// path-less URI and leaves the ambiguity for mongodump/mongorestore's own
// error to raise, which is an acceptable choice for a CLI tool whose next
// step is an external process the operator is directly watching. This
// module is reached automatically on every server boot, non-interactively,
// so an ambiguous target is refused outright rather than assumed safe --
// per Task 7T.1A's explicit requirement.
//
// Pure string/URL parsing only. Never opens a network connection, never
// touches mongoose, never logs or returns anything beyond a database name --
// so a protected or ambiguous target is refused before mongoose.connect()
// is ever reached, regardless of NODE_ENV or how the URI reached
// process.env (an explicit shell export, a CI secret, or dotenv loading a
// committed/local .env file -- this function has no awareness of any of
// those and cannot be bypassed by any of them, since it validates the
// resulting string value, not how it got there).
import { PROTECTED_DB_NAMES } from '../../scripts/backup/protectedDbGuard.mjs';

export { PROTECTED_DB_NAMES };

// Throws a clear, specific error -- naming exactly what is wrong, never the
// URI itself -- for any URI this project cannot confidently treat as safe:
//   - not a non-empty string
//   - not parseable as a URL at all (mongodb:// and mongodb+srv:// are both
//     valid URL schemes, so a genuinely malformed string is a real red flag,
//     not a parser limitation)
//   - parses, but carries no database name in its path (an ambiguous
//     target -- e.g. a bare host with no "/dbname" segment -- is refused
//     rather than assumed to be some other, unnamed, implicitly-safe
//     database)
// Trailing slash(es) are stripped before comparison (Task 7P's own
// pre-commit fix for this exact same class of guard) so "<protected>/"
// cannot slip past the check.
//
// Task 7D.5 fix: the raw path segment is also percent-decoded before being
// returned. `URL`'s own `.pathname` is never percent-decoded (WHATWG URL
// spec), but the real MongoDB driver DOES decode this segment before using
// it as the actual database name -- confirmed directly by connecting a
// disposable mongodb-memory-server instance with a percent-encoded
// database-name segment and observing mongoose.connection.name resolve to
// the decoded value. Without this, "mongodb://host/%76yoma_migration_dryrun"
// would have returned the literal, still-encoded string
// "%76yoma_migration_dryrun" -- which assertSafeMongoConnectionUri() below
// would not have matched against PROTECTED_DB_NAMES, silently letting a
// connection through to the real protected database. A malformed
// percent-sequence (e.g. "%zz") is treated the same as "no database name at
// all" -- fail closed, never assumed safe.
export function extractDatabaseNameStrict(uri) {
  if (typeof uri !== 'string' || uri.trim() === '') {
    throw new Error('Refusing to connect: no MongoDB connection string was provided.');
  }

  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Refusing to connect: the configured MongoDB connection string could not be parsed as a valid URI.');
  }

  const rawDbName = parsed.pathname.replace(/^\//, '').split('?')[0].replace(/\/+$/, '');
  let dbName;
  try {
    dbName = rawDbName ? decodeURIComponent(rawDbName) : '';
  } catch {
    throw new Error(
      'Refusing to connect: the configured MongoDB connection string has a malformed percent-encoded database name segment. ' +
        'An ambiguous connection target is treated as unsafe, not assumed to be harmless.'
    );
  }
  if (!dbName) {
    throw new Error(
      'Refusing to connect: the configured MongoDB connection string does not specify a database name. ' +
        'An ambiguous connection target is treated as unsafe, not assumed to be harmless.'
    );
  }
  return dbName;
}

// The guard itself. Returns the validated database name on success (for
// callers that want to log/report it, never the URI). Throws -- making no
// network connection -- for a malformed/ambiguous URI (see above) or one
// resolving to a protected database name. Cannot be bypassed by NODE_ENV:
// it takes no environment-mode input at all, only the URI string itself.
export function assertSafeMongoConnectionUri(uri, { label = 'target' } = {}) {
  const dbName = extractDatabaseNameStrict(uri);
  // Task 7D.5 fix: case-insensitive comparison. MongoDB itself disallows two
  // databases on one deployment whose names differ only by case (to avoid
  // case-insensitive-filesystem collisions), so a differently-cased target
  // (e.g. "Vyoma_Migration_Dryrun") can resolve to the same protected
  // database this guard exists to block -- an exact-case Set lookup alone
  // would have missed that.
  if (PROTECTED_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to connect: the ${label} database ("${dbName}") is on this project's protected list and must never be accessed -- including for reads -- by this application.`
    );
  }
  return dbName;
}
