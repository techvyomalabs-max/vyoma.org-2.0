// Task 7P — shared, independently-owned protected-database guard for the
// backup/restore tooling in this directory. Pure string/URL parsing only —
// never opens a network connection, never uses mongoose, never logs
// anything beyond a database name — so a protected target is refused
// before mongodump/mongorestore (a real external process) is ever spawned.
//
// Deliberately a SEPARATE, small module from
// scripts/wordpress/import/migrationDb.mjs and
// scripts/wordpress/inventory/disposableDbTarget.mjs, even though all three
// check the exact same PROTECTED_DB_NAMES value: those two guard a live
// mongoose connection or a dedicated-env-var inventory URI respectively,
// neither of which backup/restore tooling has -- this one validates a raw
// `--uri`/`--from-uri` CLI argument string, before anything else runs.
export const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);

// Parses a MongoDB connection string's database name using the standard URL
// parser (mongodb:// and mongodb+srv:// are both valid URLs) -- the same
// technique disposableDbTarget.mjs already uses. Returns null (never
// throws) for a URI with no path segment, rather than treating that as an
// error here; an actually-malformed URI is mongodump's/mongorestore's own
// error to raise, not this guard's.
export function extractDatabaseName(uri) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  // Trailing slash(es) are stripped so "<db>/" cannot slip past a check for
  // the exact protected name -- found during Task 7P's pre-commit review:
  // without this, "mongodb://host/vyoma_migration_dryrun/" parsed to
  // "vyoma_migration_dryrun/" and was NOT recognized as the protected db.
  const dbName = parsed.pathname.replace(/^\//, '').split('?')[0].replace(/\/+$/, '');
  return dbName || null;
}

// Throws -- making no network connection and spawning no external process
// -- if `uri` resolves to the one standing-rules-protected database name.
// Returns the parsed database name (or null if the URI has none) so callers
// can log/report it without ever touching the URI itself.
export function assertNotProtectedDbUri(uri, { label = 'target' } = {}) {
  const dbName = extractDatabaseName(uri);
  if (dbName && PROTECTED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName}") is on this project's protected list and must never be read, written, reset, or reseeded by this tooling.`
    );
  }
  return dbName;
}
