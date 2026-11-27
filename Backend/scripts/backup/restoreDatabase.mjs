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
// Task 7P-SEC16 — --uri may be omitted; the MONGODB_URI environment
// variable is then used instead (same env var, same precedence rule --
// explicit --uri wins -- as backupDatabase.mjs's own resolveBackupUri()).
// This lets the restore target be set the same safe way backupDatabase.mjs
// already documents (a session-only PowerShell variable), never retyped
// as a literal CLI argument. Whichever source is used, the raw value is
// never printed or logged anywhere -- only the parsed database name (see
// this file's existing "Never logs the full connection string" guarantee
// above), and this is unchanged by this task.
//
// --from        Required. The RESTORABLE directory -- i.e. backupDatabase.mjs's
//               own `restorePath` return value / final printed "pass this as
//               --from" line, NOT its outer, timestamped `backupPath`.
//               mongodump always nests its actual .bson files one level
//               deeper, under the source database's own name; this script
//               validates that `--from` points directly at a directory
//               containing real dump files, and refuses (clearly, in
//               dry-run too) a directory that doesn't.
//
// Task 7P-SEC3: also refuses (clearly, in dry-run too, before any shape
// check or connection) a backup directory marked INCOMPLETE by
// backupDatabase.mjs's own markBackupIncomplete() -- checked in both `--from`
// itself and its parent directory, since that marker is currently written
// one level above the directory `--from` is expected to point at. Never
// deletes, renames, or modifies the marker or any backup file.
//
// Task 7P-SEC4: --uri (the RESTORE TARGET, where mongorestore writes) is
// additionally restricted to an exact allowlist of ONE isolated, disposable
// verification database ("vyoma_2_0_test_restore_check") -- checked before
// anything else touches the filesystem or a connection, in dry-run too.
// "vyoma_2_0_test" (the live test database) and every other name are
// refused outright; this is independent of, and in addition to, the
// pre-existing protected-name blocklist.
//
// Task 7P-SEC11: on top of --uri's own allowlisted target, mongorestore is
// now ALSO given an explicit, independent namespace mapping
// (--nsInclude/--nsFrom/--nsTo: "vyoma_2_0_test.*" -> "<allowlisted
// target>.*") -- not relying solely on --uri's database-name segment for
// where collections land. `--from` is additionally required to be a
// directory literally named "vyoma_2_0_test" (mongodump's own nesting
// convention -- see looksLikeAMongodumpDirectory's comment), so a backup of
// any other database is refused before the namespace mapping is even built.
//
// Task 7P-SEC14 — credential handling replaced again, after SEC13's offline
// review found the SEC11/SEC12 stdin-prompt approach genuinely doubtful:
// MongoDB's own documentation and issue tracker describe the interactive
// password prompt as reading from a real terminal, and multiple sources
// note a script with piped stdin is unlikely to get one -- this script
// spawns mongorestore with piped (not TTY) stdio, so the prompt may simply
// never have been consumed. Credentials now flow through a TEMPORARY
// `--config=<file>` YAML file instead -- MongoDB Database Tools' own
// documented, TTY-independent mechanism for this (added in tools version
// 100.3.0; confirmed present in the installed 100.20.1 via its own
// `--help` text), added specifically because the stdin-prompt mechanism
// could not be confirmed. The file is created fresh for each restore
// attempt, outside the repository (the OS temp directory), with
// restrictive permissions applied best-effort, and is always removed
// afterward (success, failure, timeout, or a process-start error) -- see
// writeTempRestoreConfig()/cleanupTempRestoreConfig()'s own comments for
// exactly what this does and does not protect against. The password is
// never passed as a `--password=...` CLI argument, only through this
// file.
//
// Task 7P-SEC15 — a real restore attempt against the SEC14 version of this
// file failed immediately with `error parsing config file: [2:1] unknown
// field "username"`: the config file's actual, officially documented
// schema is only `password`, `uri`, and `sslPEMKeyPassword` -- `username`
// is not a field it supports at all. `username` is now passed as its own
// `--username=<value>` command-line argument instead (a username, unlike a
// password, is this project's established non-secret value -- see
// splitCredentialsFromUri()'s own comment). See
// buildRestoreConfigYaml()/buildMongorestoreArgs() for exactly where each
// value now goes.
//
// Task 7P-SEC14 also replaces SEC12's flat, whole-process timeout (which
// SEC13's review found could kill a legitimate long-running restore solely
// for taking longer than 15 seconds) with a startup timeout (no output or
// exit within a short window of starting) plus a separate, longer idle
// timeout that resets on every sign of life -- see runRestoreProcess()'s
// own comment.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertNotProtectedDbUri,
  assertAllowedRestoreTargetUri,
  assertExpectedRestoreClusterHost,
  APPROVED_RESTORE_CLUSTER_HOST,
  BACKUP_SOURCE_DB_NAME,
} from './protectedDbGuard.mjs';
import { MONGODB_URI_ENV_VAR, buildChildEnvWithoutMongoUri, validateTestBackupManifestForRestore } from './backupDatabase.mjs';

// Task 7P-SEC16 — the restore-side counterpart to backupDatabase.mjs's own
// resolveBackupUri(): explicit --uri wins when given; otherwise MONGODB_URI
// is used. Reuses that file's MONGODB_URI_ENV_VAR constant (imported above)
// rather than a second, independent literal, so the two scripts can never
// silently drift on which env var name they read. Pure string selection,
// no network, no logging of either value -- directly testable with dummy
// values alone.
export function resolveRestoreUri({ uri, env = process.env } = {}) {
  if (uri) return uri;
  const fromEnv = env[MONGODB_URI_ENV_VAR];
  return fromEnv && fromEnv.trim() ? fromEnv : null;
}

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
export function looksLikeAMongodumpDirectory(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some((e) => e.isFile() && (e.name.endsWith('.bson') || e.name.endsWith('.metadata.json')));
}

// Task 7P-SEC3 — looks for backupDatabase.mjs's INCOMPLETE_BACKUP.txt marker
// (see that script's markBackupIncomplete()) in BOTH directories a `--from`
// could plausibly resolve to:
//   - `dir` itself -- in case a marker is ever written directly into the
//     nested, database-named directory this script expects `--from` to
//     point at (today, backupDatabase.mjs always writes it one level up, in
//     its outer `backupPath`, not here -- but checking here too costs
//     nothing and stays correct if that ever changes).
//   - `path.dirname(dir)` -- the actual location backupDatabase.mjs writes
//     the marker to today (its outer, timestamped `backupPath`), covering
//     the documented, expected case where `--from` is pointed at the
//     nested `<backupPath>/<dbName>` directory one level below it.
// Pure filesystem read, no network, no mutation of anything it finds.
// QA Bug 19 — Stage 9.3A: a second marker filename, `INCOMPLETE` (a plain,
// typically zero-byte flag file), was found in practice alongside
// `INCOMPLETE_BACKUP.txt` -- backups produced by directly invoking
// mongodump (not through backupDatabase.mjs's own markBackupIncomplete())
// use this bare name instead. Both are now checked, in both locations,
// additively: this can only ever cause MORE backups to be correctly
// refused, never fewer -- no existing fail-closed behavior is weakened, and
// there is no bypass/ignore-marker option of any kind.
export const INCOMPLETE_MARKER_FILENAMES = ['INCOMPLETE_BACKUP.txt', 'INCOMPLETE'];

export function findIncompleteBackupMarker(dir) {
  const candidates = [dir, path.dirname(dir)];
  for (const candidate of candidates) {
    for (const filename of INCOMPLETE_MARKER_FILENAMES) {
      const markerPath = path.join(candidate, filename);
      if (fs.existsSync(markerPath) && fs.statSync(markerPath).isFile()) return markerPath;
    }
  }
  return null;
}

// Task 7P-SEC11 — the explicit-namespace-mapping counterpart to the
// existing allowlist checks: `--from` must be a directory literally named
// after the one legitimate backup source ("vyoma_2_0_test", mongodump's own
// nesting convention -- the dump's actual collections live directly inside
// a directory named for the source database). Pure path-string check, no
// filesystem access beyond what looksLikeAMongodumpDirectory() already
// does. Returns the matched name (never throws on `from` itself not
// existing -- the earlier fs.existsSync(from) check in restoreDatabase()
// already handles that case first).
export function assertExpectedSourceNamespace(from, expectedSourceDbName = BACKUP_SOURCE_DB_NAME) {
  const actual = path.basename(from);
  if (actual !== expectedSourceDbName) {
    throw new Error(
      `Refusing to proceed: "--from" ("${from}") is not a directory named "${expectedSourceDbName}" -- this restore tool only ` +
        `knows how to safely namespace-map backups of the one approved source database. A backup of a different database ` +
        `must not be restored by this tool.`
    );
  }
  return actual;
}

// Pure string/URL parsing only, no network -- splits a MongoDB connection
// string into its (non-secret) username, its (secret) password, and a
// credential-free copy of the same URI (host, path, and every query
// parameter -- including authSource, if present -- left exactly as given,
// only the userinfo segment cleared). Returns { username: null, password:
// null, uriWithoutCredentials: uri } unchanged if the URI has no embedded
// credentials at all, so a caller can always safely build on the returned
// uriWithoutCredentials regardless.
export function splitCredentialsFromUri(uri) {
  const parsed = new URL(uri);
  if (!parsed.username) {
    return { username: null, password: null, uriWithoutCredentials: uri };
  }
  const username = decodeURIComponent(parsed.username);
  const password = parsed.password ? decodeURIComponent(parsed.password) : null;
  parsed.username = '';
  parsed.password = '';
  return { username, password, uriWithoutCredentials: parsed.toString() };
}

// Task 7P-SEC14 — escapes a value for use as a YAML double-quoted scalar
// (the one, narrow case this file ever needs to write: a flat key/value
// pair, never a nested structure) -- backslash and double-quote are
// escaped, and any literal line break becomes the `\n` escape sequence
// rather than a raw newline, which double-quoted YAML scalars support
// without needing a block-scalar form. Deliberately hand-written rather
// than pulling in a YAML library dependency for one narrow, well-specified
// case.
function yamlDoubleQuotedScalar(value) {
  const escaped = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, '\\n');
  return `"${escaped}"`;
}

// Task 7P-SEC14 — builds the YAML content for mongorestore's own
// documented `--config=<file>` mechanism (MongoDB Database Tools, added in
// tools version 100.3.0). `uri` here is always the CREDENTIAL-FREE uri (see
// splitCredentialsFromUri()) -- `password` is supplied as its own separate
// key, which avoids the documented conflict of a `password:` key
// disagreeing with a password embedded in `uri:`. Pure string building, no
// filesystem access -- directly testable without writing anything.
//
// Task 7P-SEC15 fix — a REAL restore attempt against this file's previous
// version failed immediately with `error parsing config file: [2:1]
// unknown field "username"`, before any connection was attempted. Re-
// checked directly against MongoDB's official `--config` documentation
// (the mongorestore and mongodump reference pages, both current for the
// installed 100.20.1): the config file's documented schema is exactly
// three keys -- `password`, `uri`, `sslPEMKeyPassword` -- and `username` is
// NOT one of them; the docs instead say the username belongs on the
// command line ("you can specify the other components of the connection
// string by using mongorestore command line options, such as --username
// and --host"). `username` is therefore never written into this file at
// all -- it is passed to mongorestore as a `--username=<value>` command-
// line argument instead (see buildMongorestoreArgs()), consistent with
// this project's existing convention that a username, unlike a password,
// is a non-secret value safe to appear in argv/logs (see
// splitCredentialsFromUri()'s own comment).
export function buildRestoreConfigYaml({ uriWithoutCredentials, password }) {
  const lines = [`uri: ${yamlDoubleQuotedScalar(uriWithoutCredentials)}`];
  if (password) lines.push(`password: ${yamlDoubleQuotedScalar(password)}`);
  return `${lines.join('\n')}\n`;
}

// Task 7P-SEC14 — writes `yamlContent` to a freshly-created, uniquely-named
// temporary directory under the OS temp root (never inside this
// repository, never a fixed/predictable name). Best-effort restrictive
// permissions (0o600, owner-read/write only) are applied via the file's
// own creation mode and an explicit chmod afterward -- "best-effort"
// because Windows does not fully honor POSIX mode bits through chmod; on
// that platform, the unique, unguessable temp-directory name and prompt
// deletion (cleanupTempRestoreConfig(), always called from a finally block
// in restoreDatabase()) remain the primary protections. Residual risk,
// stated plainly: for the brief window this file exists, it holds the
// password in PLAINTEXT on local disk -- something no CLI-argument or
// stdin-based approach ever does, traded deliberately for a mechanism that
// is actually documented to work regardless of whether a real terminal is
// attached (see this file's top-of-file comment for why that mattered).
export function writeTempRestoreConfig(yamlContent) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vyoma-restore-config-'));
  const configPath = path.join(configDir, 'mongorestore-config.yaml');
  fs.writeFileSync(configPath, yamlContent, { mode: 0o600 });
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // Best-effort only -- see this function's own comment above.
  }
  return { configDir, configPath };
}

// Task 7P-SEC14 — always called from restoreDatabase()'s own finally block,
// so the temporary config file and its containing directory are removed
// on success, on failure, on a timeout, and on a process-start error
// alike. Never throws -- a failure to clean up (e.g. the directory was
// already removed by something else) must never mask or replace whatever
// real error restoreDatabase() is already in the middle of reporting.
export function cleanupTempRestoreConfig(configDir) {
  if (!configDir) return;
  try {
    fs.rmSync(configDir, { recursive: true, force: true });
  } catch {
    // Best-effort only -- see this function's own comment above.
  }
}

// Task 7P-SEC14 — builds mongorestore's exact argument list as a pure,
// directly-testable function, separate from actually spawning anything.
// `--config=<path>` (never a raw URI or password -- those two stay
// exclusively in the config file; see buildRestoreConfigYaml()) plus the
// non-secret namespace-mapping and `--drop`/`<from>` arguments.
//
// Task 7P-SEC15 fix — `username` is now an explicit `--username=<value>`
// argument here, not a config-file key (the config file's documented
// schema does not have a `username` field at all -- see
// buildRestoreConfigYaml()'s own comment for exactly why). A username is
// never a secret in this project's established convention (unlike a
// password, it is safe in argv/logs -- see splitCredentialsFromUri()'s own
// comment), so this is not a new exposure, only a relocation to where
// mongorestore actually accepts it.
export function buildMongorestoreArgs({ configPath, from, dbName, drop, username, sourceDbName = BACKUP_SOURCE_DB_NAME }) {
  const args = [`--config=${configPath}`];
  if (username) args.push(`--username=${username}`);
  // Explicit namespace mapping (Task 7P-SEC11, unchanged): every namespace
  // in the dump is remapped from "<sourceDbName>.*" to "<dbName>.*" --
  // independent of, and in addition to, --config's own uri database-name
  // segment. dbName here is always the value already validated by
  // assertAllowedRestoreTargetUri() in restoreDatabase() below, never a
  // separately-declared literal.
  args.push(`--nsInclude=${sourceDbName}.*`, `--nsFrom=${sourceDbName}.*`, `--nsTo=${dbName}.*`);
  if (drop) args.push('--drop');
  args.push(from);
  return args;
}

// Task 7P-SEC14 — generic, reusable helper: spawns `bin` with `args` and
// collects stdout/stderr for the caller to report, with NO stdin pipe at
// all (`stdio: ['ignore', 'pipe', 'pipe']`) -- now that credentials flow
// through --config instead, nothing ever needs to be written to this
// process's stdin, and explicitly ignoring it removes any residual risk of
// hanging on an unexpected stdin read (the exact class of risk SEC12's
// stdin-write approach introduced).
//
// Replaces SEC12's single, flat, whole-process timeout (which SEC13's
// review found could kill a legitimate long-running restore solely for
// taking longer than a fixed duration) with two separate timeouts:
//   - startupTimeoutMs: armed immediately on spawn. If the process
//     produces NO output and has not closed within this window, it is
//     killed and rejected with `err.code === 'TIMEOUT_STARTUP'` -- the
//     strongest available signal that something is wrong before any real
//     work has visibly begun (e.g. an auth failure the tool doesn't log
//     promptly, or a config file it can't read).
//   - idleTimeoutMs: armed the moment the FIRST output arrives, and reset
//     on every subsequent chunk of output. A legitimate restore that keeps
//     producing periodic progress output never hits this, no matter how
//     long it runs in total; only a genuine stall (no output at all for
//     this entire window) kills it, with `err.code === 'TIMEOUT_IDLE'`.
// Neither timeout, nor anything else in this function, ever touches a
// credential -- this function receives none; see buildMongorestoreArgs().
export const DEFAULT_STARTUP_TIMEOUT_MS = 15000;
export const DEFAULT_IDLE_TIMEOUT_MS = 120000;

// QA Bug 19 — Stage 9.3C: `env` is injectable (defaults to `process.env`,
// unchanged behavior for any caller that doesn't pass one) so a caller can
// supply a SCRUBBED copy instead of the raw environment — see
// restoreDatabase()/restoreCheckSelfRecovery.mjs's own call sites below,
// which delete MONGODB_URI from the copy they build before passing it
// here. mongorestore itself never reads MONGODB_URI (it receives its
// connection info exclusively via `--config`/`--username`, built by
// buildMongorestoreArgs/buildRestoreConfigYaml above) — this env var only
// ever existed in the child's environment by accident, as Node's default
// "inherit everything" spawn behavior when no `env` option is given at
// all, confirmed during Stage 9.3B's review.
export function runRestoreProcess(bin, args, { startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimer();
      fn();
    };
    const killAndReject = (code, message) => {
      child.kill();
      const err = new Error(message);
      err.code = code;
      // Whatever output was already captured before the timeout fired --
      // empty for TIMEOUT_STARTUP by construction (that timer is only ever
      // reached when nothing has arrived yet), but TIMEOUT_IDLE may well
      // have real, partial output worth surfacing to the caller.
      err.stdout = stdout;
      err.stderr = stderr;
      reject(err);
    };

    const armIdleTimer = () => {
      clearTimer();
      timer = setTimeout(() => {
        finish(() => killAndReject('TIMEOUT_IDLE', `process produced no further output for ${idleTimeoutMs}ms -- likely stalled, killed`));
      }, idleTimeoutMs);
      timer.unref();
    };

    timer = setTimeout(() => {
      finish(() => killAndReject('TIMEOUT_STARTUP', `process produced no output and did not exit within ${startupTimeoutMs}ms of starting -- killed`));
    }, startupTimeoutMs);
    timer.unref();

    child.stdout.on('data', (d) => {
      stdout += d.toString();
      if (!settled) armIdleTimer();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (!settled) armIdleTimer();
    });
    child.on('error', (err) => finish(() => reject(err)));
    child.on('close', (code) => {
      finish(() => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const err = new Error(`process exited with code ${code}`);
          err.code = code;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        }
      });
    });
  });
}

export async function restoreDatabase({ uri, from, toolsDir, drop, commit, confirmRestore, understandsProduction }) {
  // Task 7P-SEC16 — --uri wins when given; otherwise MONGODB_URI is used.
  // `uri` itself, from here on, is always this resolved value, never the
  // raw argument -- so every existing guard below (and the --config/
  // --username handling further down) is exercised identically regardless
  // of which source it came from.
  const resolvedUri = resolveRestoreUri({ uri });
  if (!resolvedUri) throw new Error(`--uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
  uri = resolvedUri;
  if (!from) throw new Error('--from <backup-directory> is required.');
  const dbName = assertNotProtectedDbUri(uri, { label: 'restore target' });
  // QA Bug 19 — Stage 9.3A: validated alongside the existing database-name
  // checks, before any filesystem check on `from` or any connection --
  // exact hostname equality, see assertExpectedRestoreClusterHost's own
  // comment for why this is not a substring/suffix check.
  assertExpectedRestoreClusterHost(uri, { label: 'restore target' });
  // Task 7P-SEC4 — validated before any filesystem check on `from`, any
  // connection, or any mongorestore execution: the two checks are
  // independent (neither supersedes the other), and both must pass.
  assertAllowedRestoreTargetUri(uri, { label: 'restore target' });

  if (!fs.existsSync(from)) {
    throw new Error(`Backup directory does not exist: ${from}`);
  }
  const validBackupShape = looksLikeAMongodumpDirectory(from);
  const incompleteMarker = findIncompleteBackupMarker(from);
  // Task 7P-SEC11 — computed (never throws here) alongside the other
  // from-related checks above, reported in the same block, and enforced
  // right after them below -- same pattern as validBackupShape.
  let sourceNamespaceOk = true;
  try {
    assertExpectedSourceNamespace(from);
  } catch {
    sourceNamespaceOk = false;
  }
  // QA Bug 19 — Stage 9.6D: a TEST backup is only restore-eligible once its
  // completion manifest exists, is valid, identifies the approved cluster
  // and source database, recorded a clean (exit-0, error-free,
  // "completed-and-integrity-verified") finalization, and its file
  // hashes/sizes/counts still match what the manifest recorded -- never
  // trusted without being recomputed live. Computed here (never throws)
  // alongside the other from-related checks above, reported in the same
  // block, and enforced right after them below.
  let manifestCheck;
  try {
    manifestCheck = validateTestBackupManifestForRestore(from);
  } catch (e) {
    manifestCheck = { ok: false, reason: `Manifest validation threw an unexpected error: ${e.message}` };
  }

  const isProduction = process.env.NODE_ENV === 'production';

  console.log('='.repeat(72));
  console.log(`Database restore — mode: ${commit ? 'COMMIT (will run mongorestore)' : 'DRY-RUN (validation only)'}`);
  console.log(`Target database name (never the URI): ${dbName || '(unknown — URI has no path segment)'}`);
  console.log(`Target cluster host (never the URI): confirmed exactly "${APPROVED_RESTORE_CLUSTER_HOST}"`);
  console.log(`Backup source directory: ${from}`);
  console.log(`Backup directory looks like a real mongodump output: ${validBackupShape ? 'yes' : 'NO -- this does not look like a valid backup'}`);
  console.log(`Marked INCOMPLETE by a prior failed backup: ${incompleteMarker ? `YES -- ${incompleteMarker}` : 'no'}`);
  console.log(`Source namespace ("${BACKUP_SOURCE_DB_NAME}") confirmed from --from's directory name: ${sourceNamespaceOk ? 'yes' : 'NO'}`);
  console.log(`Completion manifest valid and restore-eligible: ${manifestCheck.ok ? 'yes' : `NO -- ${manifestCheck.reason}`}`);
  console.log(`Target environment: ${process.env.NODE_ENV || '(unset)'}${isProduction ? ' — PRODUCTION' : ''}`);
  console.log(`--drop (replace existing collections): ${drop ? 'yes' : 'no (mongorestore\'s own safe default: merge into existing data)'}`);
  console.log('='.repeat(72));

  // Task 7P-SEC3 — checked before the shape check and before --commit, in
  // dry-run too: an incomplete backup may still happen to contain at least
  // one real dump file (and so would otherwise pass looksLikeAMongodumpDirectory),
  // so this must not rely on that check catching it. Never deletes, renames,
  // or otherwise touches the marker or any backup file -- read-only.
  if (incompleteMarker) {
    throw new Error(
      `Refusing to proceed: "${incompleteMarker}" marks this backup as INCOMPLETE (from a prior failed or interrupted ` +
        `backup run). This backup must never be used for restoration. Investigate and obtain a complete, trustworthy ` +
        `backup instead -- no file has been modified or deleted by this check.`
    );
  }

  if (!validBackupShape) {
    throw new Error(`Refusing to proceed: "${from}" does not look like a valid mongodump backup directory.`);
  }

  // Task 7P-SEC11 — re-run (not just the earlier try/catch) so its real
  // error message, naming exactly what was expected vs. found, is what
  // propagates to the caller.
  assertExpectedSourceNamespace(from);
  // QA Bug 19 — Stage 9.6D: enforced here too (same ordering convention as
  // every other refusal above) so a dry-run reports the exact same
  // refusal a commit attempt would hit, and no mongorestore spawn is ever
  // reachable when this fails.
  if (!manifestCheck.ok) {
    throw new Error(`Refusing to proceed: completion manifest validation failed -- ${manifestCheck.reason}`);
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

  // QA Bug 19 — Stage 9.6D: re-validated a SECOND time, immediately before
  // mongorestore is spawned, narrowing (not eliminating -- see this
  // project's README for the stated limitation) the time-of-check-to-
  // time-of-use window between the earlier validation above and the
  // backup files actually being read by mongorestore. Any failure here
  // prevents mongorestore from ever being spawned, exactly like the
  // earlier check.
  const finalManifestCheck = validateTestBackupManifestForRestore(from);
  if (!finalManifestCheck.ok) {
    throw new Error(`Refusing to proceed: completion manifest re-validation (immediately before restore) failed -- ${finalManifestCheck.reason}`);
  }

  const mongorestoreBin = toolsDir ? path.join(toolsDir, process.platform === 'win32' ? 'mongorestore.exe' : 'mongorestore') : 'mongorestore';
  // Task 7P-SEC14 — credentials now flow through a temporary --config YAML
  // file, never a CLI argument, never mongorestore's stdin. configDir is
  // always removed in the finally block below, regardless of outcome.
  const { username, password, uriWithoutCredentials } = splitCredentialsFromUri(uri);
  const configYaml = buildRestoreConfigYaml({ uriWithoutCredentials, password });
  const { configDir, configPath } = writeTempRestoreConfig(configYaml);
  const execArgs = buildMongorestoreArgs({ configPath, from, dbName, drop, username });

  try {
    const { stdout, stderr } = await runRestoreProcess(mongorestoreBin, execArgs, { env: buildChildEnvWithoutMongoUri() });
    // Redaction kept as defense in depth even though the password is never
    // a CLI argument or in the --config file's own path/name: if
    // mongorestore's own output ever echoed back anything password-shaped
    // (not expected, but not something to assume either), this still
    // strips it before logging.
    if (stdout) console.log(redact(stdout, password));
    if (stderr) console.log(redact(stderr, password));
  } catch (err) {
    const safeStderr = redact(err.stderr, password);
    const safeStdout = redact(err.stdout, password);
    // Task 7P-SEC14 — explicit, unmistakable wording: once mongorestore has
    // actually started, ANY failure here (non-zero exit, or either the
    // startup or the idle timeout killing it) means the target database
    // may already contain partial data. This must never be mistaken for a
    // successful restore, and the thrown message says so directly rather
    // than leaving the caller to infer it from a bare exit code alone.
    throw new Error(
      `RESTORE INCOMPLETE -- mongorestore failed (exit code ${err.code ?? 'unknown'}). The target database ("${dbName}") ` +
        `may contain partial data; do not treat this as a successful restore.${safeStderr ? `\n${safeStderr}` : ''}${safeStdout ? `\n${safeStdout}` : ''}`
    );
  } finally {
    cleanupTempRestoreConfig(configDir);
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
