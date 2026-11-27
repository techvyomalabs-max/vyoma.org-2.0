// QA Bug 19 — Stage 9.3A: a dedicated, deliberately NARROW recovery tool for
// exactly one scenario — restoring the PRESERVED backup of the
// `vyoma_2_0_test_restore_check` database back into that SAME database,
// after it has been reused (and potentially left in an unexpected state) by
// a testimonial-migration restore drill. This is NOT a generic restore
// tool: both the permitted source directory name and the permitted target
// database are hardcoded to this one value, never a CLI-supplied override.
//
// Why this exists (Stage 9.2C finding): restoreDatabase.mjs's own
// `assertExpectedSourceNamespace(from)` call is hardcoded (no override
// exposed) to require `--from` be named exactly "vyoma_2_0_test"
// (BACKUP_SOURCE_DB_NAME) — the one legitimate TEST-backup source. The
// preserved recovery backup's dump directory is instead named
// "vyoma_2_0_test_restore_check", so restoreDatabase.mjs itself can never
// be pointed at it. Rather than loosening that check (which exists
// specifically to stop a backup of the WRONG database ever being
// restored), this script reuses every lower-level helper
// restoreDatabase.mjs already exports — `assertExpectedSourceNamespace()`,
// `buildMongorestoreArgs()`, and `looksLikeAMongodumpDirectory()` ALREADY
// accept/default an overridable `sourceDbName`/`expectedSourceDbName`
// parameter — and supplies the ONE additional literal this scenario needs,
// hardcoded, not configurable:
//   RECOVERY_DB_NAME = 'vyoma_2_0_test_restore_check'  (both source AND target)
//
// Target allowlisting is completely UNCHANGED: assertAllowedRestoreTargetUri()
// (protectedDbGuard.mjs) still only accepts 'vyoma_2_0_test_restore_check',
// exactly as it does for restoreDatabase.mjs — this script does not expand,
// bypass, or duplicate that allowlist with a looser one.
//
// Modes (identical convention to restoreDatabase.mjs):
//   node restoreCheckSelfRecovery.mjs            -> dry-run (default)
//   node restoreCheckSelfRecovery.mjs --commit --confirm-restore
//                                                  -> performs the real
//                                                     recovery restore
//
// Importing this module (or restoreDatabase.mjs, which it imports from)
// never executes anything or opens a connection — every side-effecting
// call lives inside restoreCheckRecovery()/main(), guarded by the same
// `isDirectCliInvocation` check restoreDatabase.mjs itself uses.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import {
  resolveRestoreUri,
  findIncompleteBackupMarker,
  assertExpectedSourceNamespace,
  looksLikeAMongodumpDirectory,
  splitCredentialsFromUri,
  buildRestoreConfigYaml,
  writeTempRestoreConfig,
  cleanupTempRestoreConfig,
  buildMongorestoreArgs,
  runRestoreProcess,
} from './restoreDatabase.mjs';
import { assertNotProtectedDbUri, assertAllowedRestoreTargetUri, assertExpectedRestoreClusterHost } from './protectedDbGuard.mjs';
import { buildChildEnvWithoutMongoUri } from './backupDatabase.mjs';
import { validateManifestForRecovery } from './restoreCheckPreservationBackup.mjs';

// Both ends of this recovery are the SAME one disposable database — this is
// a self-restore, not a migration between two different namespaces. Never
// read from a CLI flag or env var; changing this value means writing a
// different, separately-reviewed tool, not reconfiguring this one.
export const RECOVERY_DB_NAME = 'vyoma_2_0_test_restore_check';

function parseArgs(argv) {
  const args = { commit: false, confirmRestore: false, drop: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--from') args.from = argv[++i];
    else if (a === '--tools-dir') args.toolsDir = argv[++i];
    else if (a === '--commit') args.commit = true;
    else if (a === '--confirm-restore') args.confirmRestore = true;
    else if (a === '--drop') args.drop = true;
  }
  return args;
}

export async function restoreCheckRecovery({ uri, from, toolsDir, drop, commit, confirmRestore }) {
  const resolvedUri = resolveRestoreUri({ uri });
  if (!resolvedUri) throw new Error(`--uri is required, or set the MONGODB_URI environment variable.`);
  uri = resolvedUri;
  if (!from) throw new Error('--from <preserved-backup-directory> is required.');

  // Identical database-name + cluster-host guards as restoreDatabase.mjs,
  // UNCHANGED, checked before any filesystem access or connection.
  assertNotProtectedDbUri(uri, { label: 'recovery target' });
  assertAllowedRestoreTargetUri(uri, { label: 'recovery target' });
  assertExpectedRestoreClusterHost(uri, { label: 'recovery target' });

  if (!fs.existsSync(from)) {
    throw new Error(`Backup directory does not exist: ${from}`);
  }
  const validBackupShape = looksLikeAMongodumpDirectory(from);
  const incompleteMarker = findIncompleteBackupMarker(from);
  let sourceNamespaceOk = true;
  try {
    assertExpectedSourceNamespace(from, RECOVERY_DB_NAME);
  } catch {
    sourceNamespaceOk = false;
  }
  // Stage 9.4B: a preservation backup is only recovery-eligible once its
  // completion manifest exists, is valid, identifies the approved cluster
  // and source database, recorded a clean (exit-0, error-free) finalization,
  // and its file hashes/sizes still match what the manifest recorded --
  // never trusted without being recomputed live. This is deliberately
  // applied HERE (restore-check self-recovery only), not to
  // restoreDatabase.mjs's own ordinary TEST restore workflow.
  let manifestCheck;
  try {
    manifestCheck = validateManifestForRecovery(from, { expectedSourceDbName: RECOVERY_DB_NAME });
  } catch (e) {
    manifestCheck = { ok: false, reason: `Manifest validation threw an unexpected error: ${e.message}` };
  }

  console.log('='.repeat(72));
  console.log(`Restore-check SELF-RECOVERY — mode: ${commit ? 'COMMIT (will run mongorestore)' : 'DRY-RUN (validation only)'}`);
  console.log(`Source AND target are the SAME database: ${RECOVERY_DB_NAME}`);
  console.log(`Target cluster host (never the URI): confirmed exactly the approved TEST cluster`);
  console.log(`Backup source directory: ${from}`);
  console.log(`Backup directory looks like a real mongodump output: ${validBackupShape ? 'yes' : 'NO -- this does not look like a valid backup'}`);
  console.log(`Marked INCOMPLETE by a prior failed/unfinished backup: ${incompleteMarker ? `YES -- ${incompleteMarker}` : 'no'}`);
  console.log(`Source namespace ("${RECOVERY_DB_NAME}") confirmed from --from's directory name: ${sourceNamespaceOk ? 'yes' : 'NO'}`);
  console.log(`Completion manifest valid and recovery-eligible: ${manifestCheck.ok ? 'yes' : `NO -- ${manifestCheck.reason}`}`);
  console.log(`--drop (replace existing collections): ${drop ? 'yes' : 'no (mongorestore\'s own safe default: merge into existing data)'}`);
  console.log('='.repeat(72));

  // Identical ordering/rationale to restoreDatabase.mjs: marker check first
  // (an incomplete backup may still contain a real dump file), then shape,
  // then namespace — all before --commit is even consulted, so a dry-run
  // reports the exact same refusal a commit attempt would hit. Never
  // deletes, renames, or otherwise touches the marker or any backup file.
  if (incompleteMarker) {
    throw new Error(
      `Refusing to proceed: "${incompleteMarker}" marks this backup as INCOMPLETE. This backup must never be used for ` +
        'recovery. No file has been modified or deleted by this check.'
    );
  }
  if (!validBackupShape) {
    throw new Error(`Refusing to proceed: "${from}" does not look like a valid mongodump backup directory.`);
  }
  assertExpectedSourceNamespace(from, RECOVERY_DB_NAME);
  if (!manifestCheck.ok) {
    throw new Error(`Refusing to proceed: completion manifest validation failed -- ${manifestCheck.reason}`);
  }

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no recovery restore was performed, no process was spawned. ---');
    console.log('Re-run with --commit --confirm-restore to perform this recovery for real.');
    return { dbName: RECOVERY_DB_NAME, ranForReal: false };
  }
  if (!confirmRestore) {
    throw new Error('Refusing to restore: --commit was given but --confirm-restore was not. Both are required.');
  }

  const mongorestoreBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore') : 'mongorestore';
  const { username, password, uriWithoutCredentials } = splitCredentialsFromUri(uri);
  const configYaml = buildRestoreConfigYaml({ uriWithoutCredentials, password });
  const { configDir, configPath } = writeTempRestoreConfig(configYaml);
  // Identity namespace mapping: source and target are the same database --
  // sourceDbName override is the one thing this tool changes relative to
  // restoreDatabase.mjs's own default, reusing buildMongorestoreArgs's
  // already-existing parameter rather than a second, duplicated builder.
  const execArgs = buildMongorestoreArgs({ configPath, from, dbName: RECOVERY_DB_NAME, drop, username, sourceDbName: RECOVERY_DB_NAME });

  try {
    const { stdout, stderr } = await runRestoreProcess(mongorestoreBin, execArgs, { env: buildChildEnvWithoutMongoUri() });
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
  } catch (err) {
    throw new Error(
      `RECOVERY INCOMPLETE -- mongorestore failed (exit code ${err.code ?? 'unknown'}). The target database ` +
        `("${RECOVERY_DB_NAME}") may contain partial data; do not treat this as a successful recovery.` +
        `${err.stderr ? `\n${err.stderr}` : ''}${err.stdout ? `\n${err.stdout}` : ''}`
    );
  } finally {
    cleanupTempRestoreConfig(configDir);
  }

  console.log(`\n[done] Recovery-restored from: ${from}`);
  return { dbName: RECOVERY_DB_NAME, ranForReal: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await restoreCheckRecovery(args);
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
