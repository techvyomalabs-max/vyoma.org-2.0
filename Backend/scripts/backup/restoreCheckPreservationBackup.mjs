// QA Bug 19 — Stage 9.3C: a dedicated, deliberately NARROW backup tool for
// exactly one scenario — creating a preservation backup of
// `vyoma_2_0_test_restore_check` BEFORE it is reused by a destructive
// restore drill, so a trustworthy "put it back the way it was" copy exists
// in advance, not assembled afterward from whatever state a failed/partial
// restore happened to leave behind (which could capture damaged data
// instead of the original state — the exact risk this stage exists to
// avoid).
//
// This is NOT a generic backup tool: the permitted source database is
// hardcoded to `vyoma_2_0_test_restore_check` (PRESERVATION_SOURCE_DB_NAME),
// never a CLI-configurable override — mirroring how
// restoreCheckSelfRecovery.mjs hardcodes its own narrow scope rather than
// exposing a generic database-name override on the shared restore tooling.
// backupDatabase.mjs's own allowlist (ALLOWED_BACKUP_DB_NAMES, 'vyoma_2_0_test'
// only) is deliberately left untouched — this is a SEPARATE tool for a
// SEPARATE, narrower purpose, reusing backupDatabase.mjs's own exported
// pieces (`resolveBackupUri`, `markBackupIncomplete`,
// `verifyEffectiveBackupTarget`, `MONGODB_URI_ENV_VAR`) rather than
// duplicating them, and reusing the EXISTING `ALLOWED_RESTORE_TARGET_DB_NAMES`
// Set (protectedDbGuard.mjs) as its own source allowlist — the one approved
// database name is declared exactly once, in one place.
//
// Fail-closed completion lifecycle (Stage 9.3C requirement — stronger than
// backupDatabase.mjs's own, which only marks INCOMPLETE reactively, after
// catching a failure; ordering corrected in Stage 9.4B — see
// writeAndVerifyManifest()'s own comments for the full rationale):
//   1. An INCOMPLETE_BACKUP.txt marker is written BEFORE mongodump is ever
//      invoked — so an abrupt process kill, a crash that bypasses the
//      catch block, or any other circumstance this script cannot predict
//      still leaves the backup directory correctly marked untrustworthy by
//      default, rather than relying solely on reaching a specific line of
//      code after the fact.
//   2. If mongodump fails, or its output doesn't match the expected
//      effective database shape, the marker is updated with the specific
//      reason and LEFT IN PLACE — exactly like backupDatabase.mjs's own
//      behavior for an ordinary backup.
//   3. Only after mongodump succeeds AND this tool's own structural
//      integrity verification (every expected collection's .bson parses
//      completely and validly, every .metadata.json parses, SHA256 is
//      recorded for every file) ALSO passes does finalization proceed.
//      The marker is kept in place through the ENTIRE remainder of
//      finalization — it is written to a unique temp file in the same
//      directory, fsync'd, read back and validated, atomically renamed
//      into place as `PRESERVATION_BACKUP_COMPLETE.json`, and read back
//      and validated AGAIN after the rename. Only once all of that has
//      succeeded is the marker finally removed. A failure at any one of
//      those steps leaves the marker in place and the manifest absent (or
//      only present as an abandoned temp file) — the backup is therefore
//      NOT recovery-eligible. This is "completed and integrity-verified,"
//      explicitly NOT "restore-verified" (see the manifest's own
//      `restoreVerification` field) — no actual restore is attempted or
//      claimed by this tool.
// Never touches any OTHER backup's marker — only ever the one this exact
// invocation itself just created, in the brand-new directory it itself
// just made.
//
// Windows filesystem durability note (Stage 9.4B): `fs.fsyncSync` and an
// atomic same-volume `fs.renameSync` both reduce the window in which a
// crash could leave a half-written or inconsistent manifest, but neither
// one -- on Windows (NTFS) or any other filesystem -- guarantees the data
// has reached physical, non-volatile storage ahead of an actual power
// loss (write caching below the OS, e.g. a drive's own cache, is outside
// Node's or NTFS's control). This tooling's durability claim is therefore
// limited to: "no ordinary process crash, exception, or interrupted write
// can leave an apparently-complete backup that was never actually
// verified" -- not "survives a power failure mid-write."
//
// Usage:
//   node restoreCheckPreservationBackup.mjs [--uri "<uri>"] [--out-dir <dir>] [--tools-dir <dir>] [--commit]
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  assertNotProtectedDbUri,
  extractDatabaseName,
  ALLOWED_RESTORE_TARGET_DB_NAMES,
  assertExpectedRestoreClusterHost,
  APPROVED_RESTORE_CLUSTER_HOST,
} from './protectedDbGuard.mjs';
import { resolveBackupUri, MONGODB_URI_ENV_VAR, markBackupIncomplete, verifyEffectiveBackupTarget, buildChildEnvWithoutMongoUri } from './backupDatabase.mjs';
import { findIncompleteBackupMarker } from './restoreDatabase.mjs';
// QA Bug 19 — Stage 9.6C: parseBsonFileDocCount/verifyDumpIntegrity/
// writeAndVerifyManifest now live in the shared, dependency-free
// dumpIntegrity.mjs (so backupDatabase.mjs can reuse them too without a
// circular import) -- re-exported below so every EXISTING external import
// of these three names from THIS file keeps working unchanged.
import { parseBsonFileDocCount, verifyDumpIntegrity, writeAndVerifyManifest } from './dumpIntegrity.mjs';
export { parseBsonFileDocCount, verifyDumpIntegrity, writeAndVerifyManifest } from './dumpIntegrity.mjs';

const execFileAsync = promisify(execFile);

// The one and only approved source for this tool — never read from a CLI
// flag or env var. Reuses the EXISTING restore-target allowlist Set as the
// single source of truth for "the one approved disposable verification
// database," rather than declaring a second, independent literal.
export const PRESERVATION_SOURCE_DB_NAME = 'vyoma_2_0_test_restore_check';

// The one manifest filename this tool has ever used -- named explicitly at
// every writeAndVerifyManifest() call site (Stage 9.6C) since that function
// now lives in a module shared with backupDatabase.mjs's own, differently-
// named manifest.
const COMPLETION_MANIFEST_FILENAME = 'PRESERVATION_BACKUP_COMPLETE.json';

function parseArgs(argv) {
  const args = { commit: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--tools-dir') args.toolsDir = argv[++i];
    else if (a === '--commit') args.commit = true;
  }
  return args;
}

function redact(text, uri) {
  if (!text) return text;
  return uri ? text.split(uri).join('<REDACTED_URI>') : text;
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Narrow allowlist check for THIS tool's one approved source — reuses the
// EXISTING ALLOWED_RESTORE_TARGET_DB_NAMES Set (protectedDbGuard.mjs),
// never a second, independently-declared literal, and never widens that
// Set. Deliberately a local function here (not added to
// protectedDbGuard.mjs) — per this stage's explicit "prefer a narrowly
// scoped entry point rather than a generic database-name override."
export function assertApprovedPreservationBackupSourceUri(uri, { label = 'preservation backup source' } = {}) {
  const dbName = extractDatabaseName(uri);
  if (!dbName || !ALLOWED_RESTORE_TARGET_DB_NAMES.has(dbName.toLowerCase())) {
    throw new Error(
      `Refusing to proceed: the ${label} database ("${dbName || '(none -- URI has no database-name segment)'}") is not the ` +
        `one approved preservation-backup source (${[...ALLOWED_RESTORE_TARGET_DB_NAMES].join(', ')}).`
    );
  }
  return dbName;
}

// Everything that happens AFTER mongodump itself has already exited 0:
// reused, unchanged `verifyEffectiveBackupTarget` (given THIS tool's own
// allowlist), then the new deep structural verification, then -- only if
// both pass -- the durable manifest write/verify sequence above, and only
// once THAT has fully succeeded, removing the pre-emptive marker.
// Extracted into its own exported function (rather than inlined in
// restoreCheckPreservationBackup() below) specifically so this part of
// the lifecycle -- "a dump that already succeeded, now being verified and
// finalized" -- is directly testable against a hand-built fixture
// directory, without needing to mock or actually invoke mongodump itself.
// Throws (after marking INCOMPLETE, or leaving it in place -- see below)
// on any verification or finalization failure; returns the integrity
// summary on success.
export function finalizeVerifiedBackup({ backupPath, restorePath, dbName, mongodumpExitCode = 0 }) {
  if (mongodumpExitCode !== 0) {
    const detail = `Refusing to finalize: the recorded mongodump exit code was ${mongodumpExitCode}, not 0.`;
    markBackupIncomplete(backupPath, detail);
    throw new Error(detail);
  }

  try {
    verifyEffectiveBackupTarget(backupPath, ALLOWED_RESTORE_TARGET_DB_NAMES);
  } catch (err) {
    markBackupIncomplete(backupPath, err.message);
    throw err;
  }

  // New: deep structural verification (BSON validity, metadata, hashes) --
  // nothing in the existing tooling covers this depth; see this file's own
  // header comment on why this is genuinely new, not duplicated, logic.
  const integrity = verifyDumpIntegrity(restorePath);
  if (integrity.errors.length) {
    const detail = `Structural integrity verification FAILED:\n${integrity.errors.join('\n')}`;
    markBackupIncomplete(backupPath, detail);
    throw new Error(`${detail}\nMarked INCOMPLETE -- do not use for restoration.`);
  }

  // The INCOMPLETE marker is deliberately left untouched through this
  // entire step. The backup only becomes recovery-eligible once the
  // manifest has been durably written, renamed into place, and read back
  // and validated twice -- if ANY of that fails, this call throws with the
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
  writeAndVerifyManifest(backupPath, evidence, COMPLETION_MANIFEST_FILENAME);

  // Only now, with the completion manifest durably in place and verified,
  // remove the marker this exact invocation itself wrote earlier -- never
  // an existing/historical backup's marker. If marker removal itself
  // fails, the manifest remains written (harmless) but the marker's
  // continued presence still correctly keeps this backup non-recovery-
  // eligible until the removal failure is resolved.
  const ownMarkerPath = findIncompleteBackupMarker(restorePath);
  if (ownMarkerPath) {
    try {
      fs.rmSync(ownMarkerPath);
    } catch (err) {
      throw new Error(
        `Completion manifest was written and verified successfully, but removing the INCOMPLETE marker failed (${err.message}). ` +
          'The backup remains marked INCOMPLETE and therefore NOT eligible for recovery until this is resolved.'
      );
    }
  }

  return integrity;
}

// Stage 9.4B: validates that a preservation backup's completion manifest
// genuinely supports recovery -- reused by restoreCheckSelfRecovery.mjs
// (never by restoreDatabase.mjs's own ordinary TEST restore workflow,
// which this manifest requirement is deliberately NOT applied to). Never
// throws itself -- returns { ok: false, reason } for every rejection case
// so the caller can both display the reason and decide when to throw,
// matching this file's and restoreCheckSelfRecovery.mjs's existing
// convention of computing checks first, then throwing in a fixed order.
//
// Re-verifies live, on-disk file hashes/sizes against the manifest's own
// recorded values (via the same verifyDumpIntegrity() used at finalization
// time) rather than trusting the manifest's own claims about itself -- a
// backup directory modified (accidentally or otherwise) after
// finalization is rejected, not silently accepted.
//
// Deliberately does NOT check `restoreVerification.performed` -- an
// integrity-verified-but-never-restored backup is exactly what this tool
// is meant to qualify for its first restore attempt; requiring restore
// verification first would be circular.
export function validateManifestForRecovery(restorePath, { expectedSourceDbName = PRESERVATION_SOURCE_DB_NAME, expectedClusterHost = APPROVED_RESTORE_CLUSTER_HOST } = {}) {
  const backupPath = path.dirname(restorePath);
  const manifestPath = path.join(backupPath, COMPLETION_MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    return { ok: false, reason: `Completion manifest not found at ${manifestPath}.` };
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
    return { ok: false, reason: `Completion manifest source database ("${manifest.sourceDatabase}") does not match the expected "${expectedSourceDbName}".` };
  }
  if (manifest.clusterHost !== expectedClusterHost) {
    return { ok: false, reason: `Completion manifest cluster host ("${manifest.clusterHost}") does not match the expected "${expectedClusterHost}".` };
  }
  if (manifest.mongodumpExitCode !== 0) {
    return { ok: false, reason: `Completion manifest recorded a nonzero mongodump exit code (${manifest.mongodumpExitCode}).` };
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
  // QA Bug 19 — Stage 9.6E: explicitly reject an unexpected ADDITIONAL
  // restorable file too (not just a missing one) -- the size check above
  // already implies this mathematically once combined with the "every
  // manifest name found live" loop below (equal cardinalities + a verified
  // subset relation means the sets are equal), but this makes that
  // guarantee explicit and gives a specific, distinct diagnostic instead of
  // relying on the reader to infer it from a bare count mismatch.
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
    if (liveEntry.bsonSha256 !== manifestEntry.bsonSha256 || liveEntry.bsonSizeBytes !== manifestEntry.bsonSizeBytes) {
      return { ok: false, reason: `Collection "${name}"'s .bson file does not match the completion manifest (modified since finalization) -- SHA256/size mismatch.` };
    }
    if (liveEntry.metaSha256 !== manifestEntry.metaSha256 || liveEntry.metaSizeBytes !== manifestEntry.metaSizeBytes) {
      return { ok: false, reason: `Collection "${name}"'s .metadata.json file does not match the completion manifest (modified since finalization) -- SHA256/size mismatch.` };
    }
  }

  // QA Bug 19 — Stage 9.6E: prelude.json was previously never compared at
  // all, even though verifyDumpIntegrity() already computes its hash --
  // the parity gap Stage 9.6D's review found and reported. Fixed here,
  // mirroring validateTestBackupManifestForRestore()'s equivalent check.
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

export async function restoreCheckPreservationBackup({ uri, outDir, toolsDir, commit }) {
  const resolvedUri = resolveBackupUri({ uri });
  if (!resolvedUri) throw new Error(`--uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
  const dbName = assertNotProtectedDbUri(resolvedUri, { label: 'preservation backup source' });
  assertApprovedPreservationBackupSourceUri(resolvedUri, { label: 'preservation backup source' });
  assertExpectedRestoreClusterHost(resolvedUri, { label: 'preservation backup source' });

  const baseOutDir = outDir || path.resolve(process.cwd(), '.preservation-backups');
  const backupDirName = `${dbName}-${timestampForPath()}`;
  const backupPath = path.join(baseOutDir, backupDirName);
  if (fs.existsSync(backupPath)) {
    throw new Error(`Refusing to overwrite an existing backup directory: ${backupPath}`);
  }
  const restorePath = path.join(backupPath, dbName);

  console.log('='.repeat(72));
  console.log(`Restore-check PRESERVATION backup — mode: ${commit ? 'COMMIT (will run mongodump)' : 'DRY-RUN (validation only)'}`);
  console.log(`Source database (never the URI): ${dbName}`);
  console.log(`Target cluster host (never the URI): confirmed exactly "${APPROVED_RESTORE_CLUSTER_HOST}"`);
  console.log(`Backup directory: ${backupPath}`);
  console.log(`Restorable directory (pass this as restoreCheckSelfRecovery.mjs's --from): ${restorePath}`);
  console.log('='.repeat(72));

  if (!commit) {
    console.log('\n--- DRY-RUN complete: no backup was taken, no process was spawned. ---');
    console.log('Re-run with --commit to perform this preservation backup for real.');
    return { backupPath, restorePath, dbName, ranForReal: false };
  }

  fs.mkdirSync(backupPath, { recursive: true });
  // Fail-closed: marked INCOMPLETE before mongodump is ever invoked.
  markBackupIncomplete(backupPath, 'Preservation backup in progress -- not yet verified complete (marker written before the dump attempt; fail-closed by design).');

  const mongodumpBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongodump.exe' : 'mongodump') : 'mongodump';
  let mongodumpExitCode = 0;
  try {
    const { stdout, stderr } = await execFileAsync(mongodumpBin, [`--uri=${resolvedUri}`, `--out=${backupPath}`], { env: buildChildEnvWithoutMongoUri() });
    if (stdout) console.log(redact(stdout, resolvedUri));
    if (stderr) console.log(redact(stderr, resolvedUri));
  } catch (err) {
    mongodumpExitCode = err.code ?? 'unknown';
    const safeStderr = redact(err.stderr, resolvedUri);
    const safeStdout = redact(err.stdout, resolvedUri);
    const detail = `mongodump failed (exit code ${mongodumpExitCode}).${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`;
    markBackupIncomplete(backupPath, detail);
    throw new Error(`${detail}\nPartial files (if any) were preserved for investigation at: ${backupPath}\nMarked INCOMPLETE -- do not use for restoration.`);
  }

  const integrity = finalizeVerifiedBackup({ backupPath, restorePath, dbName, mongodumpExitCode });

  console.log(`\n[done] Preservation backup written to: ${backupPath}`);
  console.log(`[done] For recovery, pass --from "${restorePath}" to restoreCheckSelfRecovery.mjs`);
  console.log(`[done] Completion evidence: ${path.join(backupPath, COMPLETION_MANIFEST_FILENAME)}`);
  return { backupPath, restorePath, dbName, ranForReal: true, integrity };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await restoreCheckPreservationBackup(args);
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
