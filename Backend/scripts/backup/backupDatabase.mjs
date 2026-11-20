// Task 7P — a safe, reusable wrapper around the real `mongodump` CLI tool.
// Defaults to dry-run (validates everything, spawns nothing) -- the same
// "never writes/acts for real without an explicit --commit" convention this
// project's WordPress migration scripts already use. Never logs the full
// connection string anywhere, under any flag or failure path -- only the
// parsed database name and the local backup directory path.
//
// Usage:
//   node scripts/backup/backupDatabase.mjs [--uri "<mongodb-uri>"] [--out-dir <dir>] [--tools-dir <dir>] [--commit]
//
// --uri         The MongoDB connection string to back up. Optional ONLY if
//               the MONGODB_URI environment variable is set instead (Task
//               7P-SEC) -- see "Credentials" below. If both are given,
//               --uri wins (an explicit flag is never silently overridden
//               by an ambient variable). Refused outright (before any
//               connection is attempted) if it resolves to this project's
//               one protected database name, OR if it does not resolve to
//               this tool's explicit allowlisted target database -- see
//               protectedDbGuard.mjs's ALLOWED_BACKUP_DB_NAMES.
// --out-dir     Optional. Parent directory for backups (default:
//               Backend/.backups/). The actual backup lands in a
//               timestamped subdirectory under this, named
//               "<dbName>-<ISO-timestamp>", so repeated runs never collide
//               with or overwrite an earlier backup of the same database.
//               mongodump itself then nests one level deeper under the
//               source database's own name -- the resolved() result's
//               `restorePath` (also printed at the end of a successful run)
//               is that inner directory, and is what restoreDatabase.mjs's
//               --from expects, not the outer timestamped directory.
// --tools-dir   Optional. Directory containing the real mongodump
//               executable, for an environment where it isn't already on
//               PATH. Defaults to invoking the bare "mongodump" command.
// --commit      Required to actually run mongodump. Without it, this
//               script only validates the target and reports the backup
//               directory it WOULD create -- a true dry-run/validation-only
//               mode, spawning no external process at all.
//
// Credentials (Task 7P-SEC): prefer setting MONGODB_URI as an environment
// variable over passing --uri on the command line -- a CLI argument is
// visible (for the brief duration this process runs) to anything inspecting
// the local process list, and persists in shell history files unless
// manually cleared, whereas a session-scoped environment variable at least
// avoids re-typing the literal value and can be unset immediately after.
// Neither this script nor anything it logs ever prints the resolved URI
// itself, regardless of which source it came from -- see redact() below.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNotProtectedDbUri, assertAllowedBackupDbUri, ALLOWED_BACKUP_DB_NAMES } from './protectedDbGuard.mjs';

const execFileAsync = promisify(execFile);

// Task 7P-SEC — the one environment variable this script will read a
// connection string from when --uri isn't passed. Named MONGODB_URI (not a
// dedicated backup-only name) to match the variable name every other part of
// this project already uses for a real MongoDB connection string
// (Backend/src/config/env.js), so an operator doesn't need to learn a new
// name -- the variable's VALUE still only needs to resolve to this tool's
// own allowlisted target (vyoma_2_0_test), checked identically regardless of
// source.
export const MONGODB_URI_ENV_VAR = 'MONGODB_URI';

// Exported so the precedence rule (explicit --uri wins) can be tested
// directly, with dummy values, without exercising the rest of
// backupDatabase() at all.
export function resolveBackupUri({ uri, env = process.env } = {}) {
  if (uri) return uri;
  const fromEnv = env[MONGODB_URI_ENV_VAR];
  return fromEnv && fromEnv.trim() ? fromEnv : null;
}

function parseArgs(argv) {
  const args = { commit: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--tools-dir') args.toolsDir = argv[++i];
    else if (a === '--commit') args.commit = true;
    else if (a === '--dry-run') args.dryRun = true; // explicit synonym for the default
  }
  return args;
}

// Replaces every occurrence of the real connection string with a fixed
// placeholder, as a last line of defense against the URI leaking through
// anything a child process (or Node's own child_process error object)
// might otherwise print -- applied to every string this script logs,
// regardless of which code path produced it.
function redact(text, uri) {
  if (!text) return text;
  return uri ? text.split(uri).join('<REDACTED_URI>') : text;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Task 7P-SEC — pure filesystem check (no network, no credential involved):
// confirms mongodump's REAL output actually landed under a directory named
// for the allowlisted database, rather than trusting the pre-connection URI
// parse alone. mongodump always nests its dump one level under the database
// name it actually connected to (see the nesting comment on restorePath
// below) -- so if the live connection ever resolved to a different
// effective database than the URI text appeared to specify, this would
// manifest as the expected subdirectory being absent, and this check catches
// that after the fact, mirroring migrationTargetGuard.mjs's pre+post pattern
// for a tool that has no mongoose connection object to inspect directly.
// Task 7P-SEC2 — writes a plain-text marker directly into the (already-
// created) backup directory so a failed or interrupted backup is
// unmistakable to anyone who looks at that folder later, not only to
// whatever caught this function's thrown Error at the time. Partial files
// mongodump may have already written are intentionally left in place (never
// deleted) so they remain available for investigation -- only an explicit
// marker is added, nothing is removed. Best-effort only: if even writing
// this marker fails (e.g. the same disk-full condition that may have caused
// the backup itself to fail), that is swallowed here so it can never mask
// or replace the real error this is called alongside -- the caller's own
// thrown Error (which includes the real failure reason) is still the
// primary signal either way. Never includes the URI -- only the caller-
// supplied `reason` text, which by construction (see both call sites below)
// is always the already-redacted error detail, never the raw credential.
export function markBackupIncomplete(backupPath, reason) {
  try {
    fs.writeFileSync(
      path.join(backupPath, 'INCOMPLETE_BACKUP.txt'),
      `THIS BACKUP IS INCOMPLETE -- DO NOT USE FOR RESTORATION.\n` +
        `Marked at: ${new Date().toISOString()}\n` +
        `Any files in this directory may be partial. Preserved for investigation only.\n\n` +
        `Reason:\n${reason || '(no further detail available)'}\n`
    );
  } catch {
    // Swallow -- see comment above. The caller still throws its own error.
  }
}

export function verifyEffectiveBackupTarget(backupPath, allowedNames = ALLOWED_BACKUP_DB_NAMES) {
  const entries = fs.readdirSync(backupPath, { withFileTypes: true }).filter((e) => e.isDirectory());
  const match = entries.find((e) => allowedNames.has(e.name.toLowerCase()));
  if (!match) {
    throw new Error(
      `Refusing to report success: mongodump's actual output directory does not contain a subdirectory matching this tool's ` +
        `allowlist (${[...allowedNames].join(', ')}). Found: ${entries.map((e) => e.name).join(', ') || '(none)'}. ` +
        `The backup may have targeted an unexpected effective database -- investigate before trusting it.`
    );
  }
  return match.name;
}

export async function backupDatabase({ uri, outDir, toolsDir, commit }) {
  const resolvedUri = resolveBackupUri({ uri });
  if (!resolvedUri) throw new Error(`--uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
  const dbName = assertNotProtectedDbUri(resolvedUri, { label: 'backup source' });
  assertAllowedBackupDbUri(resolvedUri, { label: 'backup source' });

  const baseOutDir = outDir || path.resolve(process.cwd(), '.backups');
  const backupDirName = `${dbName || 'unnamed-db'}-${timestampForPath()}`;
  const backupPath = path.join(baseOutDir, backupDirName);

  if (fs.existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite an existing backup directory: ${backupPath}`);
  }

  // mongodump always nests its output one level deeper, under the source
  // database's own name (<backupPath>/<dbName>/<collection>.bson) --
  // confirmed empirically, and standard, well-known mongodump/mongorestore
  // behavior, not something this wrapper changes. `restorePath` is the
  // exact directory restoreDatabase.mjs's --from expects: pointing
  // mongorestore at that inner, database-specific directory (rather than
  // this outer, timestamped wrapper) is what makes restoring into a
  // DIFFERENT target database name work correctly -- otherwise mongorestore
  // sees a subdirectory named after the source db and doesn't know what to
  // do with it ("don't know what to do with subdirectory ..., skipping").
  const restorePath = dbName ? path.join(backupPath, dbName) : backupPath;

  console.log('='.repeat(72));
  console.log(`Database backup — mode: ${commit ? 'COMMIT (will run mongodump)' : 'DRY-RUN (validation only)'}`);
  console.log(`Database name (never the URI): ${dbName || '(unknown — URI has no path segment)'}`);
  console.log(`Backup directory: ${backupPath}`);
  console.log(`Restorable directory (pass this as restoreDatabase.mjs's --from): ${restorePath}`);
  console.log('='.repeat(72));

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no backup was taken, no process was spawned. ---');
    console.log('Re-run with --commit to perform this backup for real.');
    return { backupPath, restorePath, dbName, ranForReal: false };
  }

  fs.mkdirSync(baseOutDir, { recursive: true });
  const mongodumpBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongodump.exe' : 'mongodump') : 'mongodump';

  try {
    const { stdout, stderr } = await execFileAsync(mongodumpBin, [`--uri=${resolvedUri}`, `--out=${backupPath}`]);
    if (stdout) console.log(redact(stdout, resolvedUri));
    if (stderr) console.log(redact(stderr, resolvedUri));
  } catch (err) {
    // Never rethrow the raw error -- child_process error objects include a
    // reconstructed `.cmd` containing the full argument list (and therefore
    // the URI). Only the exit code and a redacted stderr/stdout are ever
    // surfaced.
    const safeStderr = redact(err.stderr, resolvedUri);
    const safeStdout = redact(err.stdout, resolvedUri);
    const detail = `mongodump failed (exit code ${err.code ?? 'unknown'}).${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`;
    // Task 7P-SEC2 — a failed or interrupted mongodump run may have already
    // written some partial files into backupPath before failing. Those
    // files are left exactly as-is (never deleted); this only adds a marker
    // so they can never be mistaken for a complete, trustworthy backup.
    markBackupIncomplete(backupPath, detail);
    throw new Error(`${detail}\nPartial files (if any) were preserved for investigation at: ${backupPath}\nMarked INCOMPLETE -- do not use for restoration.`);
  }

  // Task 7P-SEC — post-run effective-target confirmation (see
  // verifyEffectiveBackupTarget's own comment above): only reached after
  // mongodump itself already reported success.
  try {
    verifyEffectiveBackupTarget(backupPath);
  } catch (err) {
    // Task 7P-SEC2 — mongodump itself exited successfully here, but its
    // output didn't match the expected effective target -- still not a
    // backup to trust, so it gets the same INCOMPLETE marker as an outright
    // mongodump failure, for the same reason: never leave an unlabeled,
    // ambiguous directory behind.
    markBackupIncomplete(backupPath, err.message);
    throw err;
  }

  console.log(`\n[done] Backup written to: ${backupPath}`);
  console.log(`[done] For a restore, pass --from "${restorePath}"`);
  return { backupPath, restorePath, dbName, ranForReal: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await backupDatabase(args);
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
