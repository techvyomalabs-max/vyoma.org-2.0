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
import {
  assertNotProtectedDbUri,
  assertAllowedBackupDbUri,
  ALLOWED_BACKUP_DB_NAMES,
  assertExpectedRestoreClusterHost,
  APPROVED_RESTORE_CLUSTER_HOST,
  BACKUP_SOURCE_DB_NAME,
} from './protectedDbGuard.mjs';
// QA Bug 19 — Stage 9.6C: the same generic structural-verification and
// durable-manifest-write helpers restoreCheckPreservationBackup.mjs already
// uses, imported from the shared, dependency-free dumpIntegrity.mjs rather
// than duplicated here. This file cannot import FROM
// restoreCheckPreservationBackup.mjs directly -- that file already imports
// several things (resolveBackupUri, markBackupIncomplete,
// verifyEffectiveBackupTarget, buildChildEnvWithoutMongoUri) FROM this one,
// and a backupDatabase.mjs -> restoreCheckPreservationBackup.mjs import
// would close that into a circular dependency. dumpIntegrity.mjs has no
// dependency on either file, so both can safely import from it.
import { verifyDumpIntegrity, writeAndVerifyManifest } from './dumpIntegrity.mjs';

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

// QA Bug 19 — Stage 9.3C: builds a copy of `process.env` with the one
// credential-bearing variable this tooling itself reads (MONGODB_URI)
// removed, for passing to a spawned mongodump/mongorestore child process. A
// plain `spawn()`/`execFile()` call with no `env` option inherits the
// ENTIRE parent environment by default (confirmed during Stage 9.3B's
// review) — so without this, MONGODB_URI (if that's how the operator
// supplied the connection string) would remain visible in the CHILD
// process's own environment block for its lifetime too, not just the
// parent `node` process's. Neither mongodump nor mongorestore ever reads
// this variable themselves — mongodump receives its connection info via
// `--uri=`, mongorestore via `--config=`/`--username=` — so removing it
// from the child's environment cannot affect either tool's own behavior.
// Declared here (not in restoreDatabase.mjs, which would create a circular
// import back to this file) since this file already owns
// MONGODB_URI_ENV_VAR — restoreDatabase.mjs and
// restoreCheckPreservationBackup.mjs import this function from here rather
// than declaring their own, independent copies.
export function buildChildEnvWithoutMongoUri(env = process.env) {
  const copy = { ...env };
  delete copy[MONGODB_URI_ENV_VAR];
  return copy;
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
// The one marker filename this file has ever written (Stage 9.3A's dual-
// name INCOMPLETE/INCOMPLETE_BACKUP.txt detection lives in restoreDatabase.mjs
// and restoreCheckSelfRecovery.mjs, which must recognize a marker from
// either source; this file only ever WRITES this one name). Named once here
// so finalizeVerifiedTestBackup() below can locate and remove its own
// marker without needing a second, independent literal.
const OWN_MARKER_FILENAME = 'INCOMPLETE_BACKUP.txt';

// QA Bug 19 — Stage 9.6C: the one completion-manifest filename this tool
// writes, distinct from restoreCheckPreservationBackup.mjs's
// "PRESERVATION_BACKUP_COMPLETE.json" -- both now pass their own name
// explicitly to the shared writeAndVerifyManifest() (dumpIntegrity.mjs).
const BACKUP_COMPLETE_MANIFEST_FILENAME = 'BACKUP_COMPLETE.json';

export function markBackupIncomplete(backupPath, reason) {
  try {
    fs.writeFileSync(
      path.join(backupPath, OWN_MARKER_FILENAME),
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

// QA Bug 19 — Stage 9.6C: everything that happens AFTER mongodump itself
// has already exited 0, bringing TEST backups to the exact same fail-closed
// completion-evidence standard restoreCheckPreservationBackup.mjs's own
// finalizeVerifiedBackup() already established (Stage 9.3C/9.4B) --
// structural verification, then a durable write-fsync-read back-rename-
// read back manifest (reusing the SAME shared helpers, not a parallel
// reimplementation), and ONLY THEN removing the pre-emptive marker. See
// that file's own header comment for the full step-by-step rationale and
// the Windows-durability caveat, both unchanged here. Exported so this
// part of the lifecycle is directly testable against a hand-built fixture
// directory, without needing to mock or actually invoke mongodump.
export function finalizeVerifiedTestBackup({ backupPath, restorePath, dbName, mongodumpExitCode = 0 }) {
  if (mongodumpExitCode !== 0) {
    const detail = `Refusing to finalize: the recorded mongodump exit code was ${mongodumpExitCode}, not 0.`;
    markBackupIncomplete(backupPath, detail);
    throw new Error(detail);
  }

  try {
    verifyEffectiveBackupTarget(backupPath);
  } catch (err) {
    markBackupIncomplete(backupPath, err.message);
    throw err;
  }

  const integrity = verifyDumpIntegrity(restorePath);
  if (integrity.errors.length) {
    const detail = `Structural integrity verification FAILED:\n${integrity.errors.join('\n')}`;
    markBackupIncomplete(backupPath, detail);
    throw new Error(`${detail}\nMarked INCOMPLETE -- do not use for restoration.`);
  }

  // The INCOMPLETE marker is deliberately left untouched through this
  // entire step -- the backup only becomes trustworthy once the manifest
  // has been durably written, renamed into place, and read back and
  // validated twice. If ANY of that fails, this call throws with the
  // marker still present, exactly as if finalization had never been
  // attempted.
  const evidence = {
    sourceDatabase: dbName,
    clusterHost: APPROVED_RESTORE_CLUSTER_HOST,
    backupPath,
    restorePath,
    completedAt: new Date().toISOString(),
    mongodumpExitCode, // observed directly by THIS script, not merely operator-reported
    classification: 'completed-and-integrity-verified',
    restoreVerification: {
      performed: false,
      note: 'This classification does NOT require, and does not claim, an actual restore has been tested. See Backend/scripts/backup/README.md\'s backup-finalization lifecycle for the distinction between this tier and "restore-verified."',
    },
    structuralVerification: integrity,
  };
  writeAndVerifyManifest(backupPath, evidence, BACKUP_COMPLETE_MANIFEST_FILENAME);

  // Only now, with the completion manifest durably in place and verified,
  // remove the marker THIS exact invocation itself wrote earlier -- never
  // an existing/historical backup's marker (this function only ever
  // operates on the brand-new directory its own caller just created). If
  // marker removal itself fails, the manifest remains written (harmless),
  // but the marker's continued presence still correctly keeps this backup
  // from being mistaken for trustworthy until the removal failure is
  // resolved.
  const ownMarkerPath = path.join(backupPath, OWN_MARKER_FILENAME);
  if (fs.existsSync(ownMarkerPath)) {
    try {
      fs.rmSync(ownMarkerPath);
    } catch (err) {
      throw new Error(
        `Completion manifest was written and verified successfully, but removing the INCOMPLETE marker failed (${err.message}). ` +
          'The backup remains marked INCOMPLETE until this is resolved.'
      );
    }
  }

  return integrity;
}

// QA Bug 19 — Stage 9.6D: validates that a TEST backup's completion
// manifest genuinely supports an actual restore -- reused by
// restoreDatabase.mjs (the NORMAL TEST restore workflow), mirroring
// validateManifestForRecovery() (restoreCheckPreservationBackup.mjs,
// Stage 9.4B) exactly, for the opposite direction (restore-check vs. TEST
// source). Never throws itself -- returns { ok: false, reason } for every
// rejection case so the caller can both display the reason and decide when
// to throw, matching the existing convention of computing checks first,
// then throwing in a fixed order.
//
// Re-verifies live, on-disk file hashes/sizes/counts against the
// manifest's own recorded values (via the same verifyDumpIntegrity() used
// at finalization time) rather than trusting the manifest's own claims
// about itself -- a backup directory modified (accidentally or otherwise)
// after finalization is rejected, not silently accepted. Unlike Stage
// 9.4B's original validateManifestForRecovery(), this ALSO compares
// prelude.json (if either side has one) and checks for an unexpected
// EXTRA live file not recorded in the manifest at all -- a parity gap
// Stage 9.6C's review found in the earlier function (reported, not fixed
// there, to keep this stage's change minimal and scoped to the restore
// side it was asked to close).
//
// Deliberately does NOT check `restoreVerification.performed` -- an
// integrity-verified-but-never-restored backup is exactly what this tool
// is meant to qualify for its first restore attempt; requiring restore
// verification first would be circular. A manifest and matching hashes
// establish that the backup has not been modified SINCE finalization --
// they do NOT establish authenticity against an attacker capable of
// modifying both the backup and its manifest together (e.g. with
// filesystem write access at the time either was created); that is a
// different, stronger guarantee this check does not attempt to make.
export function validateTestBackupManifestForRestore(restorePath, { expectedSourceDbName = BACKUP_SOURCE_DB_NAME, expectedClusterHost = APPROVED_RESTORE_CLUSTER_HOST } = {}) {
  const backupPath = path.dirname(restorePath);
  const manifestPath = path.join(backupPath, BACKUP_COMPLETE_MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    const preservationManifestPath = path.join(backupPath, 'PRESERVATION_BACKUP_COMPLETE.json');
    if (fs.existsSync(preservationManifestPath)) {
      return {
        ok: false,
        reason:
          `Found a PRESERVATION_BACKUP_COMPLETE.json manifest instead of the expected ${BACKUP_COMPLETE_MANIFEST_FILENAME} -- this looks ` +
          'like a restore-check preservation backup, not a TEST source backup. Refusing to proceed.',
      };
    }
    return {
      ok: false,
      reason:
        `Completion manifest (${BACKUP_COMPLETE_MANIFEST_FILENAME}) not found at ${manifestPath}. A fresh TEST backup taken with the ` +
        'current backupDatabase.mjs (which writes this manifest as part of its fail-closed lifecycle) is required -- a legacy backup ' +
        'taken before this check existed cannot be restored by this tool.',
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { ok: false, reason: `Completion manifest is not valid JSON: ${e.message}` };
  }

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    typeof manifest.sourceDatabase !== 'string' ||
    typeof manifest.clusterHost !== 'string' ||
    typeof manifest.classification !== 'string' ||
    typeof manifest.mongodumpExitCode !== 'number' ||
    typeof manifest.structuralVerification !== 'object' ||
    manifest.structuralVerification === null ||
    !Array.isArray(manifest.structuralVerification.errors) ||
    !Array.isArray(manifest.structuralVerification.collections)
  ) {
    return { ok: false, reason: 'Completion manifest is missing one or more required fields, or a field has the wrong type.' };
  }

  if (manifest.sourceDatabase !== expectedSourceDbName) {
    return {
      ok: false,
      reason: `Completion manifest source database ("${manifest.sourceDatabase}") does not match the expected "${expectedSourceDbName}".`,
    };
  }
  if (manifest.clusterHost !== expectedClusterHost) {
    return { ok: false, reason: `Completion manifest cluster host ("${manifest.clusterHost}") does not match the expected "${expectedClusterHost}".` };
  }
  if (manifest.mongodumpExitCode !== 0) {
    return { ok: false, reason: `Completion manifest recorded a nonzero mongodump exit code (${manifest.mongodumpExitCode}).` };
  }
  if (manifest.classification !== 'completed-and-integrity-verified') {
    return { ok: false, reason: `Completion manifest classification ("${manifest.classification}") is not "completed-and-integrity-verified".` };
  }
  if (manifest.structuralVerification.errors.length > 0) {
    return { ok: false, reason: `Completion manifest records structural verification errors: ${manifest.structuralVerification.errors.join('; ')}` };
  }

  const liveIntegrity = verifyDumpIntegrity(restorePath);
  if (liveIntegrity.errors.length > 0) {
    return { ok: false, reason: `Live re-verification of the backup directory found structural errors: ${liveIntegrity.errors.join('; ')}` };
  }

  const manifestCollections = new Map(manifest.structuralVerification.collections.map((c) => [c.name, c]));
  const liveCollections = new Map(liveIntegrity.collections.map((c) => [c.name, c]));

  if (manifestCollections.size !== liveCollections.size) {
    return {
      ok: false,
      reason: `Completion manifest lists ${manifestCollections.size} collection(s) but the backup directory currently contains ${liveCollections.size}.`,
    };
  }
  for (const name of liveCollections.keys()) {
    if (!manifestCollections.has(name)) {
      return { ok: false, reason: `Collection "${name}" exists in the backup directory but is not recorded in the completion manifest -- unexpected additional file.` };
    }
  }
  for (const [name, manifestEntry] of manifestCollections) {
    const liveEntry = liveCollections.get(name);
    if (!liveEntry) {
      return { ok: false, reason: `Collection "${name}" is recorded in the completion manifest but is missing from the backup directory.` };
    }
    if (liveEntry.documentCount !== manifestEntry.documentCount) {
      return { ok: false, reason: `Collection "${name}" document count mismatch: manifest recorded ${manifestEntry.documentCount}, actual is ${liveEntry.documentCount}.` };
    }
    if (liveEntry.indexCount !== manifestEntry.indexCount) {
      return { ok: false, reason: `Collection "${name}" index count mismatch: manifest recorded ${manifestEntry.indexCount}, actual is ${liveEntry.indexCount}.` };
    }
    if (liveEntry.bsonSha256 !== manifestEntry.bsonSha256 || liveEntry.bsonSizeBytes !== manifestEntry.bsonSizeBytes) {
      return { ok: false, reason: `Collection "${name}"'s .bson file does not match the completion manifest (modified since finalization) -- SHA256/size mismatch.` };
    }
    if (liveEntry.metaSha256 !== manifestEntry.metaSha256 || liveEntry.metaSizeBytes !== manifestEntry.metaSizeBytes) {
      return { ok: false, reason: `Collection "${name}"'s .metadata.json file does not match the completion manifest (modified since finalization) -- SHA256/size mismatch.` };
    }
  }

  const manifestPrelude = manifest.structuralVerification.prelude || null;
  const livePrelude = liveIntegrity.prelude || null;
  if (Boolean(manifestPrelude) !== Boolean(livePrelude)) {
    return {
      ok: false,
      reason: `prelude.json presence mismatch: manifest recorded ${manifestPrelude ? 'present' : 'absent'}, actual is ${livePrelude ? 'present' : 'absent'}.`,
    };
  }
  if (manifestPrelude && livePrelude && (manifestPrelude.sha256 !== livePrelude.sha256 || manifestPrelude.sizeBytes !== livePrelude.sizeBytes)) {
    return { ok: false, reason: `prelude.json does not match the completion manifest (modified since finalization) -- SHA256/size mismatch.` };
  }

  return { ok: true, manifest };
}

export async function backupDatabase({ uri, outDir, toolsDir, commit }) {
  const resolvedUri = resolveBackupUri({ uri });
  if (!resolvedUri) throw new Error(`--uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
  const dbName = assertNotProtectedDbUri(resolvedUri, { label: 'backup source' });
  assertAllowedBackupDbUri(resolvedUri, { label: 'backup source' });
  // QA Bug 19 — Stage 9.6C: the same exact-match cluster-hostname check
  // already enforced for every restore/recovery target (protectedDbGuard.mjs),
  // reused unchanged here for the backup SOURCE too -- defense in depth, not
  // previously applied to this direction.
  assertExpectedRestoreClusterHost(resolvedUri, { label: 'backup source' });

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
  console.log(`Target cluster host (never the URI): confirmed exactly "${APPROVED_RESTORE_CLUSTER_HOST}"`);
  console.log(`Backup directory: ${backupPath}`);
  console.log(`Restorable directory (pass this as restoreDatabase.mjs's --from): ${restorePath}`);
  console.log('='.repeat(72));

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no backup was taken, no process was spawned. ---');
    console.log('Re-run with --commit to perform this backup for real.');
    return { backupPath, restorePath, dbName, ranForReal: false };
  }

  // QA Bug 19 — Stage 9.6C: fail-closed by design, exactly mirroring
  // restoreCheckPreservationBackup.mjs's own lifecycle -- the directory is
  // created and marked INCOMPLETE BEFORE mongodump is ever invoked, so an
  // abrupt crash that bypasses the catch block below still leaves a
  // correctly-marked, untrustworthy directory by default rather than a
  // silently absent one.
  fs.mkdirSync(backupPath, { recursive: true });
  markBackupIncomplete(backupPath, 'Backup in progress -- not yet verified complete (marker written before the dump attempt; fail-closed by design).');

  const mongodumpBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongodump.exe' : 'mongodump') : 'mongodump';
  let mongodumpExitCode = 0;
  try {
    const { stdout, stderr } = await execFileAsync(mongodumpBin, [`--uri=${resolvedUri}`, `--out=${backupPath}`], { env: buildChildEnvWithoutMongoUri() });
    if (stdout) console.log(redact(stdout, resolvedUri));
    if (stderr) console.log(redact(stderr, resolvedUri));
  } catch (err) {
    // Never rethrow the raw error -- child_process error objects include a
    // reconstructed `.cmd` containing the full argument list (and therefore
    // the URI). Only the exit code and a redacted stderr/stdout are ever
    // surfaced.
    mongodumpExitCode = err.code ?? 'unknown';
    const safeStderr = redact(err.stderr, resolvedUri);
    const safeStdout = redact(err.stdout, resolvedUri);
    const detail = `mongodump failed (exit code ${mongodumpExitCode}).${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`;
    // Task 7P-SEC2 — a failed or interrupted mongodump run may have already
    // written some partial files into backupPath before failing. Those
    // files are left exactly as-is (never deleted); this only adds a marker
    // so they can never be mistaken for a complete, trustworthy backup.
    markBackupIncomplete(backupPath, detail);
    throw new Error(`${detail}\nPartial files (if any) were preserved for investigation at: ${backupPath}\nMarked INCOMPLETE -- do not use for restoration.`);
  }

  // QA Bug 19 — Stage 9.6C: structural verification, durable manifest,
  // marker removal only after both succeed -- see finalizeVerifiedTestBackup()
  // above for the full lifecycle (shares its structural-verification and
  // manifest-write code with restoreCheckPreservationBackup.mjs via
  // dumpIntegrity.mjs).
  const integrity = finalizeVerifiedTestBackup({ backupPath, restorePath, dbName, mongodumpExitCode });

  console.log(`\n[done] Backup written to: ${backupPath}`);
  console.log(`[done] For a restore, pass --from "${restorePath}"`);
  console.log(`[done] Completion evidence: ${path.join(backupPath, BACKUP_COMPLETE_MANIFEST_FILENAME)}`);
  return { backupPath, restorePath, dbName, ranForReal: true, integrity };
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
