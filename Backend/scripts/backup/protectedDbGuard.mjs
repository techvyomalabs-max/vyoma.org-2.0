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

// Task 7P-SEC — exact-name allowlist for backupDatabase.mjs, mirroring
// scripts/wordpress/import/migrationTargetGuard.mjs's ALLOWED_DB_NAMES
// pattern (Set, case-insensitive, exact match only) rather than importing
// that module directly -- this backup tooling is deliberately independent of
// the WordPress-migration script family (see this file's own header comment
// on why PROTECTED_DB_NAMES isn't shared that way either), so the pattern is
// reused, not the object itself. Only the Atlas test database this project's
// current restoration work targets is on this list; a different project or
// a later backup target would need its own explicit addition here, never a
// silent broadening.
// Task 7P-SEC11 — named as its own constant (not just a literal inside the
// Set below) so restoreDatabase.mjs's new explicit namespace-mapping check
// can reuse the exact same value as the one legitimate backup source,
// rather than declaring a second, independent literal that could silently
// drift from this one.
export const BACKUP_SOURCE_DB_NAME = 'vyoma_2_0_test';
export const ALLOWED_BACKUP_DB_NAMES = new Set([BACKUP_SOURCE_DB_NAME]);

// Task 7P-SEC4 — exact-name allowlist for restoreDatabase.mjs's TARGET
// (where mongorestore WRITES), deliberately a SEPARATE set from
// ALLOWED_BACKUP_DB_NAMES above (backupDatabase.mjs's SOURCE, read from,
// which legitimately must be "vyoma_2_0_test" itself). Conflating these two
// would be exactly backwards: restoring is the destructive direction, and
// it must never be allowed to target the same live database a backup is
// read from. Deliberately NOT "vyoma_migration_dryrun" either -- that name
// is independently, categorically protected (PROTECTED_DB_NAMES above) and
// must never become a legitimate target for ANY tool, including this one.
// "vyoma_2_0_test_restore_check" is a brand-new name, never used elsewhere
// in this project, reserved solely for verifying a restore actually works
// by restoring into it and querying the result -- never written to by
// anything else.
export const ALLOWED_RESTORE_TARGET_DB_NAMES = new Set(['vyoma_2_0_test_restore_check']);

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

// Task 7P-SEC — the allowlist counterpart to assertNotProtectedDbUri() above:
// that function refuses one specific known-dangerous name; this one refuses
// everything EXCEPT the one name this backup tool is currently meant to
// target. Both checks are independent and both must pass -- neither
// supersedes the other. Never throws with the raw URI in its message, only
// the parsed (and in the "none" case, explicitly absent) database name, same
// convention as every other guard in this project.
export function assertAllowedBackupDbUri(uri, { label = 'target' } = {}) {
  const dbName = extractDatabaseName(uri);
  if (!dbName || !ALLOWED_BACKUP_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName || '(none -- URI has no database-name segment)'}") is not on this ` +
        `backup tool's explicit allowlist (${[...ALLOWED_BACKUP_DB_NAMES].join(', ')}). This tool must target exactly the ` +
        `approved backup source, never an unconfirmed or unrelated database.`
    );
  }
  return dbName;
}

// Task 7P-SEC4 — the restore-target counterpart to assertAllowedBackupDbUri()
// above, independent of it (restore and backup validate different URIs for
// different reasons -- see ALLOWED_RESTORE_TARGET_DB_NAMES's own comment).
// "vyoma_2_0_test" gets its own, more specific error branch: it is the one
// target an operator is most likely to reach for by habit (it is the live
// database every other tool in this project legitimately targets), so a
// generic "not on the allowlist" message would under-explain exactly why
// that specific, very plausible mistake is dangerous. Never throws with the
// raw URI in its message, only the parsed database name, same convention as
// every other guard in this file.
export function assertAllowedRestoreTargetUri(uri, { label = 'target' } = {}) {
  const dbName = extractDatabaseName(uri);
  if (dbName && dbName.toLowerCase() === 'vyoma_2_0_test') {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName}") is the LIVE test database this project is actively ` +
        `validating -- restoring into it would overwrite or corrupt the very data a restore drill exists to verify, not ` +
        `prove anything about it. Restore is only ever allowed into an explicitly isolated, disposable verification ` +
        `database (${[...ALLOWED_RESTORE_TARGET_DB_NAMES].join(', ')}), never the live database itself.`
    );
  }
  if (!dbName || !ALLOWED_RESTORE_TARGET_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName || '(none -- URI has no database-name segment)'}") is not on this ` +
        `restore tool's explicit target allowlist (${[...ALLOWED_RESTORE_TARGET_DB_NAMES].join(', ')}). Restore must target ` +
        `exactly an isolated, disposable verification database -- never a live, staging, or production database.`
    );
  }
  return dbName;
}

// QA Bug 19 — Stage 9.3A: the one additional Atlas identity check restore/
// recovery tooling needs beyond database-name allowlisting alone (a gap
// confirmed during the Stage 9.2C review: neither assertAllowedRestoreTargetUri
// above nor anything else in this file ever inspected the URI's HOSTNAME).
// Shared by both restoreDatabase.mjs (normal restore) and
// restoreCheckSelfRecovery.mjs (self-recovery) -- same constant, same
// function, never duplicated, so the two tools can never silently drift on
// which cluster they consider "the approved TEST cluster".
//
// EXACT hostname equality only -- deliberately not .includes()/.endsWith(),
// which a deceptive hostname like
// "vyoma-test-cluster.ctnt2ww.mongodb.net.attacker.example" or
// "evil-vyoma-test-cluster.ctnt2ww.mongodb.net" could otherwise satisfy.
// Pure string/URL parsing, no network -- fails closed (throws) on a
// malformed/unparseable URI or unsupported scheme the same way
// extractDatabaseName() fails closed to null, rather than assuming safety.
// Never logs the raw URI -- only the parsed hostname, which (like a parsed
// database name elsewhere in this file) is not itself a credential.
export const APPROVED_RESTORE_CLUSTER_HOST = 'vyoma-test-cluster.ctnt2ww.mongodb.net';

export function assertExpectedRestoreClusterHost(uri, { label = 'target', expectedHost = APPROVED_RESTORE_CLUSTER_HOST } = {}) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error(`Refusing to proceed: the ${label} connection string could not be parsed as a valid URI -- its cluster host cannot be verified.`);
  }
  const host = parsed.hostname;
  if (!host || host !== expectedHost) {
    throw new Error(
      `Refusing to proceed: the ${label} resolves to cluster host "${host || '(none)'}", not the expected "${expectedHost}" ` +
        '(exact match required, not a substring/suffix match). Aborting before any connection.'
    );
  }
  return host;
}
