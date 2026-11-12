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
//
// Task 7D.5 fix: `URL`'s own `.pathname` is never percent-decoded (per the
// WHATWG URL spec) -- confirmed directly, by connecting a disposable
// mongodb-memory-server instance with a percent-encoded database-name
// segment (e.g. "/%76yoma_migration_dryrun") and observing
// mongoose.connection.name resolve to the DECODED name. That means the real
// MongoDB driver decodes this segment before treating it as the database
// name, while this function previously compared the raw, still-encoded
// string -- so "mongodb://host/%76yoma_migration_dryrun" would have parsed
// to the literal string "%76yoma_migration_dryrun", NOT matched
// PROTECTED_DB_NAMES, and silently let a connection through to the real
// protected database. Decoding here (with the same fail-closed-to-null
// posture as every other ambiguous case in this function) closes that gap.
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
  const rawDbName = parsed.pathname.replace(/^\//, '').split('?')[0].replace(/\/+$/, '');
  if (!rawDbName) return null;
  try {
    return decodeURIComponent(rawDbName) || null;
  } catch {
    // A malformed percent-sequence (e.g. "%zz") means this function cannot
    // reliably determine the real database name -- treated the same as "no
    // path segment at all" (null), never as "safe to assume non-protected".
    return null;
  }
}

// Throws -- making no network connection and spawning no external process
// -- if `uri` resolves to the one standing-rules-protected database name.
// Returns the parsed database name (or null if the URI has none) so callers
// can log/report it without ever touching the URI itself.
//
// Task 7D.5 fix: compares case-insensitively. MongoDB itself disallows two
// databases on the same deployment whose names differ only by case
// (specifically to avoid case-insensitive-filesystem collisions), so a
// differently-cased target (e.g. "Vyoma_Migration_Dryrun") can resolve to
// the same protected database this guard exists to block -- an exact-case
// Set lookup alone would have missed that.
export function assertNotProtectedDbUri(uri, { label = 'target' } = {}) {
  const dbName = extractDatabaseName(uri);
  if (dbName && PROTECTED_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName}") is on this project's protected list and must never be read, written, reset, or reseeded by this tooling.`
    );
  }
  return dbName;
}
