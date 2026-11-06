// Task 7P — a safe, reusable wrapper around the real `mongorestore` CLI
// tool. Restore is inherently more dangerous than backup (it writes into a
// real database), so this requires MORE than the usual "--commit to make it
// real" convention:
//   1. --commit            — the usual "not a dry run" gate, same as
//                            backupDatabase.mjs and every WordPress
//                            migration script in this project.
//   2. --confirm-restore   — a SECOND, restore-specific confirmation. Never
//                            implied by --commit alone -- a restore is
//                            exactly the kind of action a single flag/typo
//                            should not be enough to trigger.
//   3. --i-understand-this-is-production — a THIRD, deliberately
//                            hard-to-type-by-accident flag, required
//                            whenever NODE_ENV=production, on top of the
//                            two above. Never implied by anything else.
// All three are required together to actually run mongorestore against a
// production environment; (1) and (2) are required everywhere else.
// Never logs the full connection string anywhere, under any flag or
// failure path -- only the parsed database name and the backup directory
// path.
//
// Usage:
//   node scripts/backup/restoreDatabase.mjs --uri "<mongodb-uri>" --from <backup-dir> [--tools-dir <dir>] [--drop] [--commit] [--confirm-restore] [--i-understand-this-is-production]
//
// --from        Required. The RESTORABLE directory -- i.e. backupDatabase.mjs's
//               own `restorePath` return value / final printed "pass this as
//               --from" line, NOT its outer, timestamped `backupPath`.
//               mongodump always nests its actual .bson files one level
//               deeper, under the source database's own name; this script
//               validates that `--from` points directly at a directory
//               containing real dump files, and refuses (clearly, in
//               dry-run too) a directory that doesn't.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertNotProtectedDbUri } from './protectedDbGuard.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = { commit: false, confirmRestore: false, understandsProduction: false, drop: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--tools-dir') args.toolsDir = argv[++i];
    else if (a === '--commit') args.commit = true;
    else if (a === '--confirm-restore') args.confirmRestore = true;
    else if (a === '--i-understand-this-is-production') args.understandsProduction = true;
    else if (a === '--drop') args.drop = true;
    else if (a === '--dry-run') args.dryRun = true; // explicit synonym for the default
  }
  return args;
}

function redact(text, uri) {
  if (!text) return text;
  return uri ? text.split(uri).join('<REDACTED_URI>') : text;
}

// A real, directly-restorable mongodump directory contains real dump files
// (.bson / .metadata.json) DIRECTLY inside it -- deliberately NOT satisfied
// by a directory that merely contains a subdirectory (e.g. backupDatabase.mjs's
// own outer, timestamped `backupPath`, one level above the actual dump
// files): passing that outer directory to mongorestore does not fail
// loudly, it silently restores 0 documents ("don't know what to do with
// subdirectory ..., skipping") -- discovered and fixed during this task's
// own disposable-database testing (see the test for the exact symptom).
// Checking for real dump files specifically, not just "any subdirectory",
// is what catches that mistake here instead of downstream in mongorestore's
// own silent-no-op.
function looksLikeAMongodumpDirectory(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some((e) => e.isFile() && (e.name.endsWith('.bson') || e.name.endsWith('.metadata.json')));
}

export async function restoreDatabase({ uri, from, toolsDir, drop, commit, confirmRestore, understandsProduction }) {
  if (!uri) throw new Error('--uri is required.');
  if (!from) throw new Error('--from <backup-directory> is required.');
  const dbName = assertNotProtectedDbUri(uri, { label: 'restore target' });

  if (!fs.existsSync(from)) {
    throw new Error(`Backup directory does not exist: ${from}`);
  }
  const validBackupShape = looksLikeAMongodumpDirectory(from);

  const isProduction = process.env.NODE_ENV === 'production';

  console.log('='.repeat(72));
  console.log(`Database restore — mode: ${commit ? 'COMMIT (will run mongorestore)' : 'DRY-RUN (validation only)'}`);
  console.log(`Target database name (never the URI): ${dbName || '(unknown — URI has no path segment)'}`);
  console.log(`Backup source directory: ${from}`);
  console.log(`Backup directory looks like a real mongodump output: ${validBackupShape ? 'yes' : 'NO -- this does not look like a valid backup'}`);
  console.log(`Target environment: ${process.env.NODE_ENV || '(unset)'}${isProduction ? ' — PRODUCTION' : ''}`);
  console.log(`--drop (replace existing collections): ${drop ? 'yes' : 'no (mongorestore\'s own safe default: merge into existing data)'}`);
  console.log('='.repeat(72));

  if (!validBackupShape) {
    throw new Error(`Refusing to proceed: "${from}" does not look like a valid mongodump backup directory.`);
  }

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no restore was performed, no process was spawned. ---');
    console.log('Re-run with --commit --confirm-restore (and --i-understand-this-is-production if the target is production) to perform this restore for real.');
    return { dbName, ranForReal: false };
  }

  if (!confirmRestore) {
    throw new Error('Refusing to restore: --commit was given but --confirm-restore was not. Both are required to actually run mongorestore.');
  }
  if (isProduction && !understandsProduction) {
    throw new Error(
      'Refusing to restore: NODE_ENV=production but --i-understand-this-is-production was not given. ' +
        'A production restore requires --commit, --confirm-restore, AND this third flag, all together.'
    );
  }

  const mongorestoreBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore') : 'mongorestore';
  const execArgs = [`--uri=${uri}`, from];
  if (drop) execArgs.push('--drop');

  try {
    const { stdout, stderr } = await execFileAsync(mongorestoreBin, execArgs);
    if (stdout) console.log(redact(stdout, uri));
    if (stderr) console.log(redact(stderr, uri));
  } catch (err) {
    const safeStderr = redact(err.stderr, uri);
    const safeStdout = redact(err.stdout, uri);
    throw new Error(`mongorestore failed (exit code ${err.code ?? 'unknown'}).${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`);
  }

  console.log(`\n[done] Restored from: ${from}`);
  return { dbName, ranForReal: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await restoreDatabase(args);
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
