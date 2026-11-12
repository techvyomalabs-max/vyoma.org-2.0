// Task 7P — a safe, reusable wrapper around the real `mongodump` CLI tool.
// Defaults to dry-run (validates everything, spawns nothing) -- the same
// "never writes/acts for real without an explicit --commit" convention this
// project's WordPress migration scripts already use. Never logs the full
// connection string anywhere, under any flag or failure path -- only the
// parsed database name and the local backup directory path.
//
// Usage:
//   node scripts/backup/backupDatabase.mjs --uri "<mongodb-uri>" [--out-dir <dir>] [--tools-dir <dir>] [--commit]
//
// --uri         Required. The MongoDB connection string to back up. Refused
//               outright (before any connection is attempted) if it
//               resolves to this project's one protected database name.
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
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNotProtectedDbUri } from './protectedDbGuard.mjs';

const execFileAsync = promisify(execFile);

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

export async function backupDatabase({ uri, outDir, toolsDir, commit }) {
  if (!uri) throw new Error('--uri is required.');
  const dbName = assertNotProtectedDbUri(uri, { label: 'backup source' });

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
    const { stdout, stderr } = await execFileAsync(mongodumpBin, [`--uri=${uri}`, `--out=${backupPath}`]);
    if (stdout) console.log(redact(stdout, uri));
    if (stderr) console.log(redact(stderr, uri));
  } catch (err) {
    // Never rethrow the raw error -- child_process error objects include a
    // reconstructed `.cmd` containing the full argument list (and therefore
    // the URI). Only the exit code and a redacted stderr/stdout are ever
    // surfaced.
    const safeStderr = redact(err.stderr, uri);
    const safeStdout = redact(err.stdout, uri);
    throw new Error(`mongodump failed (exit code ${err.code ?? 'unknown'}).${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`);
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
