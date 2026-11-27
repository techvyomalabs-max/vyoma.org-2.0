# Database backup and restore — runbook

Reusable wrappers around the real `mongodump`/`mongorestore` CLI tools, with
safety rails this project's other migration tooling already establishes:
fail-closed validation before any real action, a protected-database
blocklist, and a dry-run default that only ever becomes real with an
explicit, hard-to-trigger-by-accident flag.

**These scripts make real, destructive changes to a real database when run
with `--commit` (restore) — treat them with the same care as any WordPress
migration script's `--commit` mode.**

## Files

- `protectedDbGuard.mjs` — shared, pure string/URL-parsing guard. Refuses a
  URI resolving to this project's protected database name
  (`vyoma_migration_dryrun`) before any connection or external process is
  ever attempted. Never opens a network connection itself.
- `dumpIntegrity.mjs` (QA Bug 19 Stage 9.6C) — shared, dependency-free
  mongodump-output integrity helpers (`parseBsonFileDocCount`,
  `verifyDumpIntegrity`, `writeAndVerifyManifest`), used by both
  `backupDatabase.mjs` and `restoreCheckPreservationBackup.mjs` so the
  fail-closed structural-verification-and-manifest logic exists in exactly
  one place. Imports nothing from any other file in this directory, so it
  can never itself be part of a circular-import chain.
- `backupDatabase.mjs` — wraps `mongodump`.
- `restoreDatabase.mjs` — wraps `mongorestore`.
- `restoreCheckSelfRecovery.mjs` — narrow self-recovery tool for the restore-check database (see its own usage section below).
- `restoreCheckPreservationBackup.mjs` — narrow preservation-backup tool for the restore-check database (see its own usage section below).

## Prerequisites

The real MongoDB Database Tools (`mongodump`/`mongorestore`) must be
installed and either on `PATH`, or their directory passed via `--tools-dir`
on every invocation. These are a separate download from MongoDB itself
(<https://www.mongodb.com/try/download/database-tools>) — not an npm
package, and not installed by this project's own `npm install`.

## Usage — backup

```
node scripts/backup/backupDatabase.mjs [--uri "<mongodb-uri>"] [--out-dir <dir>] [--tools-dir <dir>] [--commit]
```

- `--uri` is optional if the `MONGODB_URI` environment variable is set
  instead (Task 7P-SEC) — see "Credentials" below. If both are given,
  `--uri` wins.
- Without `--commit`: validates the target (refuses a protected name,
  refuses anything not on this tool's own exact-allowlist — see "Database
  allowlist" below — resolves the backup path) and reports what *would*
  happen. Spawns no external process at all, and creates no directory.
  This is the default — always run this first.
- With `--commit`: actually runs `mongodump`.
- Output lands in `<out-dir>/<dbName>-<ISO-timestamp>/` (default `out-dir`:
  `Backend/.backups/`). The timestamp means a later backup of the same
  database never overwrites an earlier one.
- `mongodump` itself then nests one level deeper, under the source
  database's own name. The script computes and prints this inner,
  **restorable** path for you — look for the "Restorable directory" /
  "For a restore, pass --from" lines in its output, or use the returned
  `restorePath` value if calling `backupDatabase()` programmatically. Do
  **not** pass the outer, timestamped directory to a restore — see "Known
  pitfall" below.
- Never logs the real connection string — only the parsed database name and
  local file paths, in every mode and on every failure path.
- Also validates the exact approved cluster hostname (QA Bug 19 Stage
  9.6C — see "TEST backup fail-closed completion-evidence lifecycle"
  below), the same check every restore/recovery target already enforced,
  now applied to the backup *source* too.

## TEST backup fail-closed completion-evidence lifecycle (QA Bug 19 Stage 9.6C)

`backupDatabase.mjs` now reaches the exact same "completed and
integrity-verified" standard `restoreCheckPreservationBackup.mjs` already
established (Stage 9.3C/9.4B), sharing its structural-verification and
durable-manifest-write code via `dumpIntegrity.mjs` rather than
duplicating it:

1. The backup directory is created and marked `INCOMPLETE_BACKUP.txt`
   **before** `mongodump` is ever invoked — fail-closed by default against
   an abrupt crash, not only against a caught exception.
2. If `mongodump` fails, or its output doesn't match the expected
   effective database (see "Database allowlist" below), the marker is
   updated with the specific reason and left in place.
3. Only after `mongodump` succeeds AND deep structural verification
   (`verifyDumpIntegrity()` — every `.bson` parses completely, every
   `.metadata.json` parses, SHA256 + size recorded for every file) also
   passes does finalization proceed: the completion manifest
   (`BACKUP_COMPLETE.json` — note the different filename from the
   preservation tool's `PRESERVATION_BACKUP_COMPLETE.json`, since both
   tools now share `dumpIntegrity.mjs`'s `writeAndVerifyManifest()`, which
   requires an explicit filename rather than favoring either caller) is
   written via the same durable temp-file → fsync → read-back → atomic
   rename → read-back sequence, and the marker is removed only after all
   of that succeeds.
4. `BACKUP_COMPLETE.json` records `sourceDatabase`, `clusterHost`,
   `mongodumpExitCode`, `classification: "completed-and-integrity-verified"`,
   `restoreVerification: { performed: false, ... }`, and the full
   structural-verification results — identical schema to the preservation
   tool's manifest, just a different source database and filename.

**This does not apply retroactively to any existing TEST backup** — see
"Remaining limitations" below. **This also does not prove successful
restoration or point-in-time consistency with the live database** —
structural self-consistency of the files on disk is all it establishes;
see "Backup finalization" below for the same tier distinction already
documented for the preservation tool.

## Usage — restore

```
node scripts/backup/restoreDatabase.mjs --uri "<mongodb-uri>" --from <restorable-dir> [--tools-dir <dir>] [--drop] [--commit] [--confirm-restore] [--i-understand-this-is-production]
```

`--from` must be the **restorable** directory a backup run printed/returned
(see above) — the one directly containing `.bson`/`.metadata.json` files,
not the outer timestamped wrapper. The script validates this and refuses a
directory that doesn't look right, in dry-run too.

**`--uri` (the restore TARGET) is restricted to an exact allowlist of one
isolated, disposable verification database: `vyoma_2_0_test_restore_check`
(Task 7P-SEC4).** `vyoma_2_0_test` itself — and every other database — is
refused outright, before any filesystem check, connection, or
`mongorestore` execution, in dry-run too. This is deliberately a *different*
allowlist from `backupDatabase.mjs`'s `ALLOWED_BACKUP_DB_NAMES`
(`vyoma_2_0_test`, the legitimate backup *source*): restoring is the
destructive direction, so it must never be allowed to target the same live
database a backup is read from. `mongorestore`'s own namespace behavior —
collections from `--from` are always written into whichever database
`--uri` names, independent of what the dump's own source database was
called — is what makes this allowlist sufficient to guarantee a restore can
never write back into the live source, rather than merely discouraging it.

**On top of that, Task 7P-SEC11 adds an explicit, independent namespace
mapping** passed directly to `mongorestore` itself
(`--nsInclude="vyoma_2_0_test.*" --nsFrom="vyoma_2_0_test.*"
--nsTo="<allowlisted target>.*"`) — this script no longer relies *solely*
on `--uri`'s database-name segment for where collections land. `--from` is
additionally required to be a directory literally named `vyoma_2_0_test`
(mongodump's own nesting convention); a backup of any other database is
refused before any namespace mapping is even built.

**Task 7P-SEC14 — credentials now flow through a temporary `--config=<file>`
YAML file** (replacing SEC11/SEC12's stdin-prompt approach entirely, after
SEC13's offline review found it genuinely doubtful — see below). This is
MongoDB Database Tools' own documented mechanism, added in tools version
100.3.0, confirmed present in the installed 100.20.1 via its own `--help`
text and via official MongoDB documentation. A fresh YAML file is written
to a uniquely-named directory under the OS temp root (never inside this
repository), with best-effort restrictive permissions, immediately before
each real restore attempt, and is **always removed afterward** — success,
failure, timeout, or a process-start error alike — via a `finally` block.
The password is never a `--password=...` CLI argument, and nothing is ever
written to `mongorestore`'s stdin (which is now explicitly ignored, not
piped at all).

**Task 7P-SEC15 fix — `username` is not in the config file; it never was
supported there.** The first real, isolated restore attempt against the
SEC14 version of this mechanism failed immediately, before any connection,
with `error parsing config file: [2:1] unknown field "username"`.
Re-checked directly against MongoDB's official `mongorestore`/`mongodump`
reference documentation (both current for the installed 100.20.1): the
`--config` file's documented schema is exactly three keys —
**`password`, `uri`, `sslPEMKeyPassword`** — and `username` is not one of
them; the docs instead point the username to the command line ("you can
specify the other components of the connection string by using
`mongorestore` command line options, such as `--username` and `--host`").
The config file now contains only `uri:` (credential-free) and
`password:`; `username` is passed as its own `--username=<value>`
command-line argument instead — consistent with this project's existing
convention that a username, unlike a password, is a non-secret value (see
`splitCredentialsFromUri`'s own comment). Verified directly: after this
fix, running the real `mongorestore` binary against a config file built
with only dummy values and an unreachable loopback URI (no real
credentials, no real database, no real restore) produced a normal
connection-refused error — no parse error — confirming the schema fix
without ever connecting to anything real.

**Why the change:** SEC13's offline review found MongoDB's own
documentation and issue tracker describe the interactive password prompt
as reading from a real terminal, with multiple sources noting a script
with piped stdin is unlikely to get one — this script spawns `mongorestore`
with piped (not TTY) stdio, so the stdin-write approach may simply never
have been consumed. The `--config` file is TTY-independent and was already
noted in SEC12 as a documented alternative; it is now the primary
mechanism rather than a rejected option.

**Residual risk, stated plainly:** for the brief window the config file
exists, it holds the password in **plaintext on local disk** — something
neither the original CLI-argument approach nor the SEC11/SEC12 stdin
approach ever did. This is a deliberate trade for a mechanism that is
actually documented to work regardless of terminal attachment. The
unique, unguessable temp-directory name plus prompt deletion are the
primary mitigations; this has not yet been exercised against the real
`mongorestore` binary (forbidden by the tasks that introduced and reviewed
it) — only against a harmless Node stand-in process in this script's own
offline tests.

**Timeout handling (Task 7P-SEC14, replacing SEC12's flat timeout):**
SEC13's review found SEC12's single, whole-process timeout (`DEFAULT_TIMEOUT_MS`,
15s) could kill a *legitimate* long-running restore solely for taking
longer than 15 seconds in total. This is now two separate timeouts:
`DEFAULT_STARTUP_TIMEOUT_MS` (15s — killed if the process produces no
output and hasn't exited within this window of starting) and
`DEFAULT_IDLE_TIMEOUT_MS` (120s — armed only once output begins, and reset
on every subsequent chunk of output, so a restore that keeps logging
progress is never killed no matter how long it runs in total; only genuine
silence for the full idle window is treated as a stall). Either timeout
killing the process, or a non-zero exit, is reported with explicit
**"RESTORE INCOMPLETE"** wording — the target database may contain partial
data and this must never be mistaken for a successful restore.

Restore requires more than the usual dry-run/`--commit` gate, on purpose:

| Flag | Required when |
|---|---|
| `--commit` | Always, to do anything for real (same convention as every other script in this project). |
| `--confirm-restore` | Always, together with `--commit` — a separate, restore-specific confirmation. |
| `--i-understand-this-is-production` | Only when `NODE_ENV=production`, in addition to both flags above. |

Without `--drop`, `mongorestore`'s own safe default applies: existing
documents are merged with, not replaced by, the restored data. Pass
`--drop` explicitly to replace existing collections instead — do this
deliberately, never as a default habit.

**Task 7P-SEC16 — `--uri` may now be omitted; `MONGODB_URI` is used
instead.** `resolveRestoreUri()` mirrors `backupDatabase.mjs`'s own
`resolveBackupUri()` exactly (same env var, same precedence: an explicit
`--uri` always wins when given) — and imports that file's
`MONGODB_URI_ENV_VAR` constant rather than declaring a second,
independent literal, so the two scripts can never silently drift on which
env var name they read. This lets the restore target be set the same safe
way the "Credentials" section above already documents for the backup
side (a session-only PowerShell variable), never retyped as a literal CLI
argument. Whichever source is used, the resolved value is never printed
or logged anywhere — only the parsed database name, same guarantee as
before this change.

## Usage — restore-check self-recovery (QA Bug 19 Stage 9.3A)

**This is a different tool from `restoreDatabase.mjs` above, for a
different, narrower scenario.** Use `restoreDatabase.mjs` for the normal
case — restoring a `vyoma_2_0_test` backup into `vyoma_2_0_test_restore_check`
to verify that backup is restorable. Use `restoreCheckSelfRecovery.mjs`
only to put `vyoma_2_0_test_restore_check` itself back the way it was,
using a backup of *that* database, after a restore drill has reused it —
`restoreDatabase.mjs` cannot be pointed at that preserved backup (its
source-name check is hardcoded to `vyoma_2_0_test`, correctly, since
loosening it would let a backup of the wrong database be restored by it).

```powershell
$env:MONGODB_URI = "<your vyoma_2_0_test_restore_check Atlas connection string>"

# Dry-run first (default mode -- no --commit):
node scripts/backup/restoreCheckSelfRecovery.mjs --from "<preserved-backup>\vyoma_2_0_test_restore_check" --tools-dir "C:\Program Files\MongoDB\Tools\100\bin"

# Only after reviewing the dry-run output:
node scripts/backup/restoreCheckSelfRecovery.mjs --from "<preserved-backup>\vyoma_2_0_test_restore_check" --tools-dir "C:\Program Files\MongoDB\Tools\100\bin" --drop --commit --confirm-restore

Remove-Item Env:\MONGODB_URI
```

Both the permitted source directory name and the permitted target database
are hardcoded to `vyoma_2_0_test_restore_check` — there is no flag to point
this tool at any other source or target. It enforces the exact same
(unchanged) target allowlist and cluster-host check as `restoreDatabase.mjs`,
and the exact same marker/shape/dry-run/`--commit`+`--confirm-restore`
conventions.

## Usage — restore-check preservation backup (QA Bug 19 Stage 9.3C)

**Run this BEFORE any destructive restore drill reuses
`vyoma_2_0_test_restore_check`** — see "Preservation-before-restore
sequence" above. This is a separate, narrow tool: it only ever backs up
`vyoma_2_0_test_restore_check` (never a CLI-configurable source), never
`vyoma_2_0_test` or any other database.

```powershell
$env:MONGODB_URI = "<your vyoma_2_0_test_restore_check Atlas connection string>"

# Dry-run first (default mode -- no --commit):
node scripts/backup/restoreCheckPreservationBackup.mjs --tools-dir "C:\Program Files\MongoDB\Tools\100\bin"

# Only after reviewing the dry-run output:
node scripts/backup/restoreCheckPreservationBackup.mjs --tools-dir "C:\Program Files\MongoDB\Tools\100\bin" --commit

Remove-Item Env:\MONGODB_URI
```

A unique, timestamped output directory is created for every real run
(`--out-dir`'s default: `Backend/.preservation-backups/` — now listed in
`Backend/.gitignore` as of Stage 9.4B, so a normal `git add`/`git add -A`
cannot accidentally stage a local dump containing real document data) —
an existing backup directory is never overwritten. On success, the
printed `restorePath` is what `restoreCheckSelfRecovery.mjs`'s own
`--from` expects, and `PRESERVATION_BACKUP_COMPLETE.json` (written inside
the outer backup directory) records the completion evidence —
collection/document/index counts, every file's SHA256, and the
`mongodumpExitCode` this script itself observed directly (not merely
operator-reported). See "Backup finalization" above for exactly what this
evidence does and does not prove.

**Durable output location (Stage 9.4B):** `--out-dir` is already the
exact, supported way to write directly to this project's existing durable
backup location instead of the gitignored repo-local default, matching
the convention the two existing preservation/TEST backups already use:

```powershell
node scripts/backup/restoreCheckPreservationBackup.mjs --out-dir "E:\vyoma-migration-backups" --tools-dir "C:\Program Files\MongoDB\Tools\100\bin" --commit
```

This creates its own uniquely-named, timestamped subdirectory directly
under `E:\vyoma-migration-backups\` — it never overwrites either of the
two existing backups already there. No new flag or code change was needed
for this; `--out-dir` has accepted an arbitrary path since Stage 9.3C.

## Credentials (Task 7P-SEC): avoid passing the URI as a literal CLI argument

`backupDatabase.mjs` accepts the connection string from the `MONGODB_URI`
environment variable instead of `--uri`, to avoid retyping a credential-
bearing literal directly on the command line. `restoreDatabase.mjs`
accepts the same env var the same way as of Task 7P-SEC16 — see "Task
7P-SEC16" under "Running a restore" above. **`restoreCheckSelfRecovery.mjs`
(QA Bug 19 Stage 9.3A) resolves its `uri` through the exact same
`resolveRestoreUri()` function `restoreDatabase.mjs` uses — not a second,
divergent implementation — so it supports `MONGODB_URI` identically.**
**This narrows but does not eliminate exposure** — see the PowerShell
recipe and its caveat below. The *recommended* invocation for every tool in
this directory is always the environment-variable form below, never a
literal `--uri "..."` argument typed on the command line — passing the URI
directly as a CLI argument puts the embedded credentials in both shell
history and the OS process argument list for the process's lifetime, which
the environment-variable form (see the next bullet's own caveat) only
partially avoids.

**Safe PowerShell usage** (Windows), avoiding the literal value in reusable
command history:

```powershell
# 1. Open a dedicated PowerShell window for this operation.
# 2. Set the URI into a session-only environment variable (typed once).
$env:MONGODB_URI = "<your vyoma_2_0_test Atlas connection string>"

# 3. Run the dry-run first (default mode -- no --commit):
node scripts/backup/backupDatabase.mjs --tools-dir "C:\Program Files\MongoDB\Tools\100\bin"

# 4. Confirm the printed "Database name (never the URI):" line reads
#    exactly "vyoma_2_0_test" before ever adding --commit.

# 5. Clear the variable from this session immediately after use:
Remove-Item Env:\MONGODB_URI
```

**What this does and does not protect against:**
- It avoids typing the literal URI twice (once to set, once to use) and lets
  you clear it from the current session afterward.
- It does **not** hide the value from the OS process list while the `node`
  process itself is actually running — environment variables of a running
  process, like its command-line arguments, remain visible to anything
  with permission to inspect the local process table (e.g. Task Manager's
  command-line/environment columns, `Get-Process`, WMI) for that process's
  lifetime. This is a structural property of how every OS exposes a
  running process, not something fixable by this script.
- **(Fixed, QA Bug 19 Stage 9.3C)** The spawned `mongodump`/`mongorestore`
  **child** process no longer inherits `MONGODB_URI` — every tool in this
  directory now passes an explicit, scrubbed copy of the environment
  (`buildChildEnvWithoutMongoUri()`, `backupDatabase.mjs`) to its child
  process, rather than relying on `spawn`/`execFile`'s default of inheriting
  the entire parent environment. Neither `mongodump` nor `mongorestore`
  ever reads this variable themselves, so this cannot affect either tool's
  behavior. This closes the child-process half of the exposure the bullet
  above still describes for the parent `node` process itself, which remains
  unavoidable by design (see that bullet).
- It does **not** retroactively scrub PowerShell's *persisted* history file
  (`(Get-PSReadLineOption).HistorySavePath`) if you typed the value there.
  `Clear-History` only clears the in-memory session history. If you want the
  persisted file scrubbed too, that line must be removed from that file
  directly, manually, afterward.
- Neither this script nor anything it logs ever prints the resolved URI
  itself, from either source — see "Never logs the connection string" under
  Safety guarantees below, which applies identically regardless of whether
  the value came from `--uri` or `MONGODB_URI`.

### Verifying least-privilege Atlas credentials (no connection required)

None of this tooling creates or manages Atlas database users — whether the
credentials actually used are scoped to only `vyoma_2_0_test_restore_check`
is an Atlas project **configuration** question, not something this code can
answer from a connection string alone. To check this **without connecting
to MongoDB**, in the Atlas web console:

1. **Database Access** (left sidebar) → find the user whose credentials you
   intend to use for a restore/recovery.
2. Open it and look at **Database User Privileges**. For least-privilege:
   - Prefer a **custom role** scoped to exactly one database
     (`vyoma_2_0_test_restore_check`) with `readWrite` on that database only
     — not a built-in role like `atlasAdmin`, `readWriteAnyDatabase`, or
     any role granted "All Databases."
   - If the user's privileges list a database, confirm it reads **exactly**
     `vyoma_2_0_test_restore_check` — not a wildcard, not `vyoma_2_0_test`,
     not "all databases."
3. **Network Access** (left sidebar) — confirm the IP/CIDR allowlist entry
   you'll be connecting from is no broader than necessary (this doesn't
   scope *which database* the user can touch, but narrows *who* can even
   attempt to authenticate).
4. If the existing user is broader than this, the safe fix is to create a
   **new**, narrowly-scoped database user for this restore/recovery work
   specifically, rather than attempting to narrow a shared user's
   privileges that other tooling may depend on.

This is a one-time (or periodic) manual review step, independent of — and
not a substitute for — the code-level database-name and cluster-host
checks this tooling already enforces.

## Database allowlist (Task 7P-SEC): `backupDatabase.mjs` only targets `vyoma_2_0_test`

`backupDatabase.mjs` now enforces an exact-name allowlist
(`protectedDbGuard.mjs`'s `ALLOWED_BACKUP_DB_NAMES`, currently just
`vyoma_2_0_test`) **in addition to**, not instead of, the pre-existing
protected-name blocklist (`PROTECTED_DB_NAMES`, `vyoma_migration_dryrun`).
Both checks run before any connection or external process, and both must
pass independently.

This is checked twice:
- **Before connecting** — the configured URI's own database-name segment
  must be exactly `vyoma_2_0_test` (case-insensitive), or the script refuses
  outright, in dry-run too.
- **After a real `--commit` run** — `mongodump` always nests its dump one
  level under the database it actually connected to; this script verifies
  that nested directory is in fact named `vyoma_2_0_test` before reporting
  success, as an effective-target confirmation independent of the pre-
  connection text parse (this tool has no live mongoose connection object
  to inspect directly, unlike `migrationTargetGuard.mjs`'s equivalent
  post-connection check for the WordPress migration scripts).

**Known gap, not fixed here:** `restoreDatabase.mjs` does **not** have this
same allowlist — see "Remaining limitations and known gaps" below.

## Known pitfall: outer vs. inner directory

`mongodump --out=<X>` writes to `<X>/<dbName>/*.bson`, not `<X>/*.bson`
directly. Pointing `restoreDatabase.mjs --from` at the **outer** `<X>`
instead of `<X>/<dbName>` doesn't fail loudly — `mongorestore` just prints
`don't know what to do with subdirectory ..., skipping` and silently
restores **zero documents**. This script's own validation
(`looksLikeAMongodumpDirectory`) specifically checks for real dump files
directly inside `--from`, so pointing it at the wrong (outer) directory is
now caught and refused immediately, in dry-run too — this was found and
fixed while writing the disposable-database test below, not something
inherited silently from the raw tools.

## Safety guarantees

- Both scripts refuse a protected database name via pure string/URL
  parsing, before any network connection or external process — confirmed by
  the disposable-database test (next section): the guard fires even for a
  deliberately unreachable host. The guard also normalizes a trailing
  slash after the database name (e.g. `.../vyoma_migration_dryrun/`) before
  comparing, so that variant cannot slip past the check — found and fixed
  during Task 7P's pre-commit review, re-verified against the disposable
  databases below.
- `backupDatabase.mjs` additionally refuses any database name that isn't on
  its own explicit allowlist (`vyoma_2_0_test`), checked both before
  connecting and, on a real `--commit` run, against mongodump's actual
  output directory afterward (Task 7P-SEC — see "Database allowlist"
  above).
- Neither script ever includes the real connection string in anything it
  prints, including on a `mongodump`/`mongorestore` failure (which would
  otherwise leak it via Node's own child-process error object) — every
  logged string is redacted first. This applies identically whether the URI
  came from `--uri` or (`backupDatabase.mjs` only) the `MONGODB_URI`
  environment variable.
- Backups are never overwritten (timestamped directory names).
- Restore requires three independent, explicit confirmations together for a
  production target; none is implied by any of the others.

## Failed or interrupted backups (Task 7P-SEC2)

If `mongodump` fails or is interrupted partway through, or if its output
doesn't match the expected effective database (see "Database allowlist"
above), `backupDatabase.mjs` **never reports success** (it always throws)
and additionally writes an `INCOMPLETE_BACKUP.txt` marker directly into that
run's backup directory, naming the failure reason (never the URI). **Any
partial files mongodump already wrote are left exactly as they were —
nothing is deleted** — the marker exists only to make an incomplete backup
unmistakable to a human (or script) that finds that directory later, rather
than letting it be mistaken for a complete one. **`restoreDatabase.mjs`
now also checks for this marker (Task 7P-SEC3)** — before any shape check
and before `--commit`, in dry-run too — in both the `--from` directory and
its parent, and refuses outright if found. Nothing is ever deleted,
renamed, or modified by either script as a result of this check.

`.backups/` (this tool's default output directory, under `Backend/`) is now
in `Backend/.gitignore`, so a normal `git add`/`git add -A` cannot
accidentally stage a local backup. Passing `--out-dir` to point entirely
outside the repository (as this project's other migration backups already
do, under `C:\Users\Dell\vyoma-migration-backups\`) remains the stronger,
structural alternative if preferred.

## Preservation-before-restore sequence (QA Bug 19 Stage 9.3C)

**A preservation backup of `vyoma_2_0_test_restore_check` must be created,
completed, and verified BEFORE any destructive restore drill ever reuses
that database — never assembled afterward from whatever a failed or
partial restore happened to leave behind.** A backup taken after a
destructive operation could capture partially-restored or damaged data
instead of the original state, which defeats the entire point of having a
preservation copy. The required sequence is:

1. **Create the preservation backup BEFORE the destructive restore** —
   `restoreCheckPreservationBackup.mjs --commit` (see "Usage — restore-check
   preservation backup" below). This must complete and be verified before
   step 2 ever happens, not after.
2. **Verify backup completion and integrity** — confirm
   `PRESERVATION_BACKUP_COMPLETE.json` was written (see "Backup
   finalization" below) and its `structuralVerification` reports zero
   errors.
3. **Preserve an independent copy** — see "Windows backup protection"
   below; copy the completed backup to separate physical media before
   proceeding.
4. **Confirm recovery-tool compatibility** — a dry-run of
   `restoreCheckSelfRecovery.mjs --from <preservation-backup>` against the
   newly-created backup must succeed (see that tool's own usage section).
5. **Verify Atlas permissions and target identity** — see "Verifying
   least-privilege Atlas credentials" above; confirm the target cluster
   and database one more time.
6. **Run the final dry-run** of the actual destructive restore tool
   (`restoreDatabase.mjs`) against the real credentials, and review its
   output.
7. **Request separate approval** for the actual (`--commit
   --confirm-restore`) destructive restore — a distinct approval from
   every step above.

Only once this full sequence has completed does a destructive restore
drill proceed. There is no recommended path that creates or relies on a
preservation backup made *after* a restore has already started or failed —
if a preservation backup was not completed beforehand, the correct
response is to stop and create one (or restore from the preserved copy's
own backup media) before attempting the drill again, never to back up the
post-failure state and treat that as equivalent to the original.

## Backup finalization — when may an INCOMPLETE marker be removed? (QA Bug 19 Stage 9.3A; tiers clarified Stage 9.3C)

An `INCOMPLETE`/`INCOMPLETE_BACKUP.txt` marker must **never** be removed
casually. There are three distinct tiers of evidence, and which marker
removal is appropriate for which depends on which tier the backup has
reached:

1. **Successful dump creation** — `mongodump` reported exit code 0. This is
   necessary but not sufficient: a clean exit code says the process didn't
   crash, nothing more. On its own, this NEVER justifies removing a marker.
2. **Completed and integrity-verified** — every expected collection has
   both a `.bson` and `.metadata.json` file; every `.bson` file parses as a
   complete, uncorrupted sequence of BSON documents with no truncation;
   document counts match what `mongodump`'s own output reported; every
   `.metadata.json` parses as valid JSON with sane `options`/`indexes`;
   every file's SHA256 is recorded. This proves the files on disk are
   internally self-consistent — it still does **not** prove the data they
   contain is actually restorable. **`restoreCheckPreservationBackup.mjs`
   (Stage 9.3C) reaches exactly this tier, and its own code removes its own
   pre-emptive marker automatically ONLY after reaching it** — see that
   file's own header comment for the full fail-closed lifecycle (marker
   written before the dump attempt; left in place on any failure at any
   step; removed only after mongodump succeeds AND structural verification
   passes AND the completion manifest has been durably written and
   verified — see "Finalization ordering" immediately below). This is a
   legitimate, code-level marker removal for a backup that tool itself just
   created and verified in the same run — it is categorically different
   from removing a marker on an existing, historical backup whose
   provenance is uncertain (never done automatically, by this tooling or
   otherwise).

### Finalization ordering and manifest durability (QA Bug 19 Stage 9.4B)

An earlier version of `finalizeVerifiedBackup()` removed the INCOMPLETE
marker *before* writing `PRESERVATION_BACKUP_COMPLETE.json`. A Stage 9.4B
review found this genuinely unsafe: if the manifest write failed partway
through (disk full, permission error, process killed at exactly the wrong
moment), the backup directory would be left with **no marker and no
manifest** — not clearly incomplete, yet not provably complete either —
and `restoreCheckSelfRecovery.mjs` at the time only checked for the
marker's *absence*, so it would have silently accepted such a backup as
recovery-eligible. This has been corrected. The sequence is now:

1. Confirm `mongodump` exited 0 and structural verification passed.
2. **Keep the INCOMPLETE marker in place** — it is not touched yet.
3. Write the completion manifest to a uniquely-named temp file **in the
   same directory** (so the later rename stays on one volume).
4. `fsync` the temp file's file descriptor and close it.
5. Read the temp file back and validate its JSON content matches what was
   just written.
6. Atomically rename the temp file to `PRESERVATION_BACKUP_COMPLETE.json`
   (same-directory rename — atomic on both POSIX and NTFS). Refuses to
   overwrite an existing completion manifest at that path.
7. Read the **final** file back and validate it too.
8. Only now, with steps 3–7 all having succeeded, remove the INCOMPLETE
   marker.

A failure at any of steps 3–7 leaves the marker in place (any abandoned
temp file is best-effort cleaned up) — the backup remains correctly
non-recovery-eligible, exactly as if finalization had never been
attempted. If marker removal itself fails at step 8 (e.g. a permissions
problem), the manifest remains written, but the marker's continued
presence still correctly blocks recovery until that failure is resolved
manually.

**Windows durability limitation, stated plainly:** `fsync` and a
same-volume atomic rename both close the window in which an ordinary
process crash or exception could leave a half-written or inconsistent
manifest — they do **not** guarantee the data has reached physical,
non-volatile storage ahead of an actual power loss (a drive's own write
cache sits below what the OS or NTFS controls). The durability claim here
is "no ordinary crash or interrupted write leaves an apparently-complete
backup that was never actually verified," not "survives a power failure
mid-write."

**`restoreCheckSelfRecovery.mjs` now also requires a valid completion
manifest** (not just the marker's absence) before accepting a preservation
backup — see "Recovery manifest validation" below.

### Recovery manifest validation (QA Bug 19 Stage 9.4B)

`restoreCheckSelfRecovery.mjs` calls
`validateManifestForRecovery()` (`restoreCheckPreservationBackup.mjs`) —
applied **only** to restore-check self-recovery, never to
`restoreDatabase.mjs`'s own ordinary TEST restore workflow. A preservation
backup is accepted only when, in addition to the pre-existing
marker/shape/namespace checks:

- `PRESERVATION_BACKUP_COMPLETE.json` exists in the backup's outer
  directory.
- It parses as JSON and has every required field, correctly typed
  (`mongodumpExitCode` must be a `number` — QA Bug 19 Stage 9.6E; a
  previous version only checked the field was present, not its type).
- Its recorded source database and cluster host match the approved values
  exactly.
- Its recorded `mongodumpExitCode` is exactly `0`.
- Its recorded `structuralVerification.errors` is empty.
- A **fresh, live** re-run of `verifyDumpIntegrity()` against the actual
  files on disk right now also reports zero errors, the exact same set of
  collections (**an unexpected ADDITIONAL live file is now also rejected,
  not just a missing one** — Stage 9.6E), and matching SHA256/size for
  every `.bson` and `.metadata.json` file, **and now also `prelude.json`**
  (Stage 9.6E — previously computed by `verifyDumpIntegrity()` and
  recorded in the manifest, but never actually compared) — the manifest's
  own claims about itself are never trusted without being independently
  recomputed, so a backup modified (accidentally or otherwise) after
  finalization is rejected, not silently accepted.

**Stage 9.6E — verification parity with `validateTestBackupManifestForRestore()`:**
Stage 9.6D's review found this function (the original, Stage 9.4B
version) silently never compared `prelude.json` and only checked for a
*missing* collection, not an unexpected *additional* one — both fixed
here, mirroring the equivalent TEST-restore check exactly. This closes the
parity gap without changing backup/finalization behavior, marker
handling, database/cluster/namespace restrictions, or the explicit
`restoreVerification.performed: false` acceptance.

As with the TEST-restore equivalent: **matching hashes and a matching
manifest prove the backup has not changed since finalization — they do
not establish authenticity against an attacker capable of modifying both
the backup and its manifest together.**

It deliberately does **not** require `restoreVerification.performed` to be
`true` — an integrity-verified-but-never-restored backup is exactly what
qualifies for its *first* restore attempt; requiring restore-verification
first would be circular. There is no flag to bypass this check.
3. **Restore-verified** — an actual `mongorestore` of this exact backup
   into a disposable database, followed by independently re-verifying the
   restored data (document counts, spot-checked content) against what the
   backup's own inventory claims. This is the only tier that tests the
   data can actually come back, not merely that it was written down or is
   internally self-consistent. **No marker removal on an existing,
   already-created historical backup (as opposed to a brand-new one a tool
   just produced and verified in the same run) should ever be treated as
   justified by anything less than this tier, decided explicitly by a
   human operator** — never automatically, and never for a backup whose
   own tooling didn't just verify it moments earlier.

Mongodump's exit code (tier 1) is frequently only operator-reported, not
independently observed by whoever is evaluating the backup afterward —
exit code 0 by itself establishes *nothing* about tiers 2 or 3. Tier 2
raises confidence further but still only proves the files are
self-consistent, not restorable — a syntactically perfect BSON file can
still fail to restore (e.g. a duplicate-key conflict, an index that can't
be rebuilt, incompatible server versions). Neither `backupDatabase.mjs` nor
`restoreDatabase.mjs` nor `restoreCheckSelfRecovery.mjs` contains any
marker-removal code path for an EXISTING backup; `restoreCheckPreservationBackup.mjs`
only ever removes the specific marker it itself wrote moments earlier, for
the specific directory it itself just created, after reaching tier 2 — see
that file's own code and tests.

## Windows backup protection (QA Bug 19 Stage 9.3A)

A single Read-only file attribute is a weak, easily-bypassed protection —
it stops accidental overwrite by an ordinary `>` redirect or a naive script,
but not a deliberate `Remove-Item -Force`, not an administrator, and not
drive failure. A more practical layered approach:

1. **NTFS permissions**, not just the Read-only attribute: deny `Delete`
   and `Modify` (keep `Read & Execute`) for the backup folder to the
   accounts that don't need write access, via `icacls` or Explorer's
   Security tab. This resists accidental deletion by a normal user far
   better than Read-only alone, though an administrator can still remove
   or reset the ACL.
2. **An independently preserved second copy**, on different physical
   media or a different logical location (e.g. a separate external drive,
   or a cloud storage copy) — the only protection in this list that
   survives the *original* drive failing, being formatted, or being
   deleted outright. A single copy, however permissioned, is still a
   single point of failure for the drive it lives on.
3. **Read-only attribute** (`Set-ItemProperty -Path <dir> -Name IsReadOnly
   -Value $true`, recursively) as a cheap, easily-reversible *additional*
   layer on top of (1) and (2), not a replacement for either.

None of these three were applied by this stage — they require your
approval, since they'd modify filesystem state on the existing backups.

## Remaining limitations and known gaps (Task 7P-SEC)

- **(Replaced, Task 7P-SEC14) The SEC11/SEC12 stdin-password mechanism is
  gone**, after SEC13's offline review found it genuinely doubtful
  (MongoDB's own docs describe the prompt as terminal-dependent, and this
  script's piped, non-TTY stdio may never have triggered it). Replaced with
  the `--config=<file>` mechanism — see "Credentials" above.
- **(Fixed, Task 7P-SEC15) The SEC14 config file's `username:` field did
  not exist.** The first real, isolated restore attempt failed immediately
  with `error parsing config file: [2:1] unknown field "username"`,
  because mongorestore's documented `--config` schema is only `password`,
  `uri`, and `sslPEMKeyPassword`. Fixed by moving `username` to its own
  `--username=<value>` command-line argument — see "Task 7P-SEC15 fix"
  under "Credentials" above. Verified against the real `mongorestore`
  binary using only dummy values and an unreachable loopback URI (no real
  credentials, database, or restore).
- **(Task 7P-SEC14/SEC15, still not verified end-to-end against a real
  restore) The startup/idle timeouts have only been tested against
  harmless Node stand-in processes, never a real, completing
  `mongorestore` run.** The config-parsing fix above is now confirmed
  against the real binary up to the connection attempt; a real run should
  still be watched closely the first time to confirm the timeout
  thresholds are well-calibrated for a real restore's actual duration and
  logging cadence, and that authentication actually succeeds end-to-end
  with real credentials.
- **(Fixed, Task 7P-SEC3; marker names expanded QA Bug 19 Stage 9.3A)
  `restoreDatabase.mjs` now independently rejects an INCOMPLETE backup** by
  checking, in both `--from` and its parent directory, for **either**
  marker name a backup might carry (`INCOMPLETE_MARKER_FILENAMES`):
  - `INCOMPLETE_BACKUP.txt` — written by `backupDatabase.mjs`'s own
    `markBackupIncomplete()`, with a reason inside.
  - `INCOMPLETE` — a plain, typically zero-byte flag file some backups
    produced by invoking `mongodump` directly (not through
    `backupDatabase.mjs`) carry instead.

  Both are checked additively (either one present is enough to refuse); no
  bypass or ignore-marker option exists for either name — see "Failed or
  interrupted backups" above.
- **(Added, QA Bug 19 Stage 9.3A) Exact cluster-host validation.**
  `assertExpectedRestoreClusterHost()` (`protectedDbGuard.mjs`) requires the
  restore/recovery target URI's hostname to be **exactly**
  `vyoma-test-cluster.ctnt2ww.mongodb.net` — not a substring/suffix match,
  so a deceptive host like `evil-vyoma-test-cluster.ctnt2ww.mongodb.net` or
  `vyoma-test-cluster.ctnt2ww.mongodb.net.attacker.example` is refused.
  Checked by both `restoreDatabase.mjs` and `restoreCheckSelfRecovery.mjs`,
  alongside (never instead of) the existing database-name allowlist.
- **(Added, QA Bug 19 Stage 9.3A) `restoreCheckSelfRecovery.mjs` — a
  separate, deliberately narrow tool** for exactly one scenario: restoring
  the *preserved* backup of `vyoma_2_0_test_restore_check` back into that
  same database, after it has been reused by a restore drill.
  `restoreDatabase.mjs` itself can never be pointed at that preserved
  backup (its own source-name check is hardcoded to `vyoma_2_0_test`, the
  TEST backup source — correctly so, since loosening it would let a backup
  of the wrong database be restored). This tool hardcodes BOTH the
  permitted source directory name and the permitted target database to
  `vyoma_2_0_test_restore_check` (never a CLI-configurable value), reuses
  every lower-level helper from `restoreDatabase.mjs` unchanged
  (`buildMongorestoreArgs`, `splitCredentialsFromUri`,
  `buildRestoreConfigYaml`, `writeTempRestoreConfig`,
  `cleanupTempRestoreConfig`, `runRestoreProcess`,
  `findIncompleteBackupMarker`, `looksLikeAMongodumpDirectory`,
  `assertExpectedSourceNamespace`), and reuses the exact same (unchanged,
  not widened) target allowlist and cluster-host check as
  `restoreDatabase.mjs`. Same `--commit`/`--confirm-restore`
  dry-run-by-default convention. It does **not** introduce a generic
  restore capability — it is only ever usable for this one self-recovery
  scenario.
- **(Fixed, Task 7P-SEC4) `restoreDatabase.mjs` now has its own exact
  target allowlist** (`ALLOWED_RESTORE_TARGET_DB_NAMES`,
  `vyoma_2_0_test_restore_check` only) — deliberately *not* the same
  allowlist as `backupDatabase.mjs`'s, since restore's target must never be
  the live database a backup is read from. `vyoma_2_0_test` is explicitly,
  specifically refused with its own clear error message, not merely
  "not on the allowlist."
- **(Resolved, Task 7P-SEC16) `restoreDatabase.mjs` now also accepts
  `MONGODB_URI`**, via `resolveRestoreUri()` — the restore-side mirror of
  `backupDatabase.mjs`'s own `resolveBackupUri()`, importing that file's
  `MONGODB_URI_ENV_VAR` constant rather than a second, independent
  literal. An explicit `--uri` still always wins when given.
- **The new restore-target allowlist is a single, hard-coded name
  (`vyoma_2_0_test_restore_check`).** If a different disposable verification
  database is ever needed, that requires an explicit code change to this
  allowlist — by design, never a silent broadening via an environment
  variable or CLI flag (an operator who could set that value could just as
  easily set it to `vyoma_2_0_test` itself, defeating the point).
- **(Resolved for NEW backups, QA Bug 19 Stage 9.6C) `backupDatabase.mjs` now has the same automated structural-integrity verification as the restore-check preservation tool.** See "TEST backup fail-closed completion-evidence lifecycle" below. **This does not apply retroactively** — none of this project's existing TEST backups (taken before Stage 9.6C) have a `BACKUP_COMPLETE.json`; only a backup taken with this stage's updated `backupDatabase.mjs` does.
- **(Resolved, QA Bug 19 Stage 9.6D) `restoreDatabase.mjs` now mandatorily validates `BACKUP_COMPLETE.json` and independently re-verifies hashes before an actual restore.** See "Mandatory TEST restore completion-manifest enforcement" below. Fixed the gap Stage 9.6C found and reported (this bullet previously described it as unfixed). **Operational consequence, as anticipated:** none of this project's 7 historical TEST backups (taken before Stage 9.6C) have a `BACKUP_COMPLETE.json`, so all of them are now rejected by `restoreDatabase.mjs` until a fresh backup is taken with the current `backupDatabase.mjs` — intentional, not a bug (see "Legacy backup rejection" below).

## Mandatory TEST restore completion-manifest enforcement (QA Bug 19 Stage 9.6D)

`restoreDatabase.mjs` now calls `validateTestBackupManifestForRestore()`
(`backupDatabase.mjs`) — the restore-side mirror of
`validateManifestForRecovery()` (Stage 9.4B) — applied **only** to the
normal TEST restore workflow, never widened into a general policy change
elsewhere. A backup is restore-eligible only when, in addition to the
pre-existing marker/shape/namespace checks:

- `BACKUP_COMPLETE.json` exists in the backup's outer directory (a
  `PRESERVATION_BACKUP_COMPLETE.json` found instead gets its own specific
  diagnostic, naming the mismatch, rather than a generic "not found").
- It parses as JSON and has every required field, correctly typed
  (`mongodumpExitCode` must be a `number`, not merely present).
- Its recorded source database and cluster host match exactly.
- Its recorded `mongodumpExitCode` is exactly `0`.
- Its recorded `classification` is exactly `"completed-and-integrity-verified"`.
- Its recorded `structuralVerification.errors` is empty.
- A **fresh, live** re-run of `verifyDumpIntegrity()` against the actual
  files on disk right now also reports zero errors, the exact same set of
  collections (an extra, unrecorded file is rejected, not just a missing
  one), and matching document/index counts and SHA256/size for every
  `.bson`, `.metadata.json`, and `prelude.json` file.

Enforced twice: once in the existing preflight block (so a dry-run reports
the identical refusal a commit attempt would hit), and again **immediately
before mongorestore is spawned** — narrowing, though not eliminating, the
time-of-check-to-time-of-use window between the two. A failure at either
point prevents mongorestore from ever being spawned. There is no bypass
flag, force option, or legacy exception of any kind. As with the
restore-check equivalent, this deliberately does **not** require
`restoreVerification.performed: true` — an integrity-verified-but-never-
restored backup is exactly what qualifies for its first restore attempt.

**Legacy backup rejection is intentional.** Every TEST backup taken before
Stage 9.6C lacks `BACKUP_COMPLETE.json` and is therefore now rejected by
`restoreDatabase.mjs` with a clear diagnostic naming the missing file and
stating that a fresh backup taken with the current `backupDatabase.mjs` is
required. No manifest is ever retroactively generated for an existing
backup, and no existing marker is touched, by this check or any other.

**Stated limitations, plainly:**
- **Time-of-check/time-of-use:** re-validating immediately before spawn
  substantially narrows, but cannot fully eliminate, the window in which
  the backup files could change between the check returning and
  `mongorestore` itself reading them — no filesystem check can guarantee
  that.
- **Not an authenticity guarantee against a capable attacker.** A matching
  manifest and matching hashes prove the backup has not changed *since
  finalization* — they do not prove authenticity against someone capable
  of modifying both the backup files and its manifest together (e.g. with
  write access at creation time). This check defends against accidental
  or after-the-fact tampering/corruption, not against a compromised
  backup pipeline.
- **Still not "restore-verified."** Passing this check means the backup is
  self-consistent and unmodified since finalization — it does not mean an
  actual restore has ever been tested, and does not prove point-in-time
  consistency with whatever the live database looks like now.

## Live restore-check target comparison (QA Bug 19 Stage 9.8B.1)

`scripts/verify/liveRestoreCheckComparison.mjs` is a separate, read-only
tool that compares the **live** `vyoma_2_0_test_restore_check` database
against its verified preservation backup, before any destructive restore
drill is permitted to reuse that database — closing the gap this file's
own manifest checks cannot: a backup matching its own manifest says
nothing about whether the *live* database has since diverged from it.

- **Offline by default.** Without `--execute-live-readonly` **and**
  `--confirm-no-concurrent-writes` together, it never resolves a URI and
  never calls `mongoose.connect()` — only the two backups' existing
  manifests are validated (reusing `validateManifestForRecovery()` and
  `validateTestBackupManifestForRestore()` unchanged).
- **Read-only by construction, not by Atlas enforcement.** Every database
  operation goes through the native driver handle
  (`mongoose.connection.db`), never a compiled Mongoose Model (which would
  risk triggering `autoIndex`/`autoCreate`). The approved credential
  (`vyoma_restore_check`) has scoped Atlas `readWrite` permissions — this
  tool simply never issues a write call; it is not an IAM-enforced
  read-only connection.
- **BSON-type-aware comparison.** Both the backup's `.bson` files and the
  live driver reads use the same `{ promoteValues: false, promoteLongs:
  false, promoteBuffers: false }` options, so `Int32`/`Double`/`Long`/
  `Decimal128`/`ObjectId`/`Binary` are never silently collapsed into
  native JS types before comparison. Document field order and array
  element order are both treated as significant and never sorted away. A
  BSON type or representation this tool does not explicitly know how to
  compare is reported as **incomplete**, never guessed at.
- **Complete, independent document-identity enumeration**, both
  directions — missing, additional, and modified documents are all
  detected, not just a backup-side `_id` lookup against the live side
  (which could never discover an unexpected live-only document).
- **`.metadata.json` is parsed as canonical Extended JSON, not plain
  JSON** (`parseBackupMetadata()`) — confirmed, by direct inspection of
  this project's real preservation backup, that mongodump writes every
  numeric metadata value (`v`, index key directions, etc.) EJSON-wrapped
  (e.g. `{"$numberInt":"2"}`), which plain `JSON.parse()` would leave as
  an inert, un-comparable object rather than a number. Canonical parsing
  produces the same `Int32`-wrapped representation the live side already
  uses under `BSON_PRESERVING_OPTIONS`, so both sides are genuinely
  comparable.
- **Index and collection-metadata comparison — UUID and index version are
  compared explicitly, never silently discarded (corrected, Stage
  9.8B.2A).** An earlier version of this tool normalized away a
  collection's `uuid` and an index's `v` (version) entirely. For THIS
  tool's actual use — comparing the SAME live database against its own
  preservation snapshot, not two independently created backups — that was
  a genuine defect: a collection's `uuid` changes if it is dropped and
  recreated, even with identical name/data, so silently ignoring it could
  conceal exactly that. Both are now compared explicitly
  (`compareCollectionUuids()`, and the `versionDifferences` field of
  `compareIndexDefinitions()`), and **any difference in either is a
  blocking discrepancy** for this pre-restore comparison — there is no
  bypass flag. Missing or unsupported UUID evidence on either side is
  treated as **incomplete**, never silently skipped (UUID comparison is
  required here). A hypothetical *future* tool comparing a freshly
  *restored* collection against its original source would have different,
  looser UUID requirements (`mongorestore` always assigns a brand-new
  UUID) — that is a separate use case, not implemented here. Every other
  index option, including compound index **key order**, is compared as-is;
  an unrecognized option key is reported, never silently discarded.
- **`background` is a recognized, non-blocking legacy field (fixed, Stage
  9.8B.4A).** A real Stage 9.8B.3 live run reported index mismatches on
  14 of 17 collections. Investigation found the cause: every secondary
  index in this project's real preservation backup carries a `background`
  field (a pre-MongoDB-4.2 index-build option, confirmed present on every
  non-`_id_` index and absent from every `_id_`-only index) — which a
  modern server's `listIndexes()` simply never reports, and which this
  tool's comparator did not recognize, so it was flagged as an
  "unrecognized option" and failed the WHOLE index comparison for every
  collection that had one. `background` is now excluded from the
  blocking equality check (like `v`/`ns`), but — unlike those — its
  difference is purely informational: it is still reported
  (`backgroundDifferences`), even on an overall MATCH, but never blocks
  one. An invalid representation (anything other than a plain boolean) on
  either side still fails closed (`unsupportedBackground` → incomplete).
  **This is a single, narrowly-scoped, documented exception — not a
  general "ignore unknown options" mechanism; every other unrecognized
  index option still blocks exactly as before.**
- **Index-comparison diagnostics (Stage 9.8B.4A).** `compareIndexDefinitions()`
  already computed detailed discrepancy data that earlier versions of
  this tool never printed — only the boolean "indexes match: true/false".
  The orchestrator now also prints, on a mismatch: missing/additional
  index names, index names with key/option differences, index names with
  version differences, and unrecognized option field names (per affected
  index) — and, regardless of match/mismatch, any non-blocking
  `background` differences. Only collection/index/field **names** and
  counts are ever printed — never an actual option value, partial-filter
  expression, collation detail, or document data.
- **Fail-closed verdicts only** — `RESULT: LIVE TARGET MATCHES
  PRESERVATION BACKUP`, `RESULT: LIVE TARGET DIFFERS FROM PRESERVATION
  BACKUP`, or `RESULT: INCOMPLETE -- NOT VERIFIED` (any partial failure,
  unsupported type, or connection error) — each paired with its own
  `ACTUAL RESTORE AUTHORIZATION` line. **A `MATCHES` result never, by
  itself, authorizes an actual restore** — that remains a separate,
  explicit decision.
- **Stated limitations:** cannot detect concurrent writes or background
  jobs during its own run (operator attestation only); a time-of-check/
  time-of-use gap remains between this comparison and the eventual
  restore; a matching comparison proves no change since this check ran,
  not authenticity against an attacker capable of modifying both the live
  data and a backup's manifest together.

**Running its regression tests** (standalone, same convention as
`atlasReadOnlyConnectionCheck.test.mjs` — not part of `npm test`):
```
node --test scripts/verify/liveRestoreCheckComparison.test.js
```

### Post-restore verification (`--post-restore`, QA Bug 19 Stage 9.9A)

The same tool, with `--post-restore` and `--fresh-test-backup` (not
`--preservation-backup`), compares the live restore-check target against
the **fresh TEST backup** *after* an actual restore — to confirm it
brought over the expected data, not to decide whether to restore in the
first place. It reuses every lower-level helper unchanged
(`fetchLiveCollectionsMetadata`, `fetchLiveIndexes`,
`fetchAllDocumentsViaCursor`, `compareCollectionOptions`,
`compareIndexDefinitions`, `compareDocumentInventories`,
`parseBsonFileDocuments`, `parseBackupMetadata`,
`assertApprovedLiveTargetConfiguration`) via a separate, additive entry
point (`runPostRestoreVerification()`), so the existing, already-approved
pre-restore comparison (`runLiveRestoreCheckComparison()`) is completely
untouched.

**Collection UUID is reported as an observation only here, never a
blocking check — this is a deliberate, correct difference from the
pre-restore comparison, not a weaker version of it.** `mongorestore` (as
this project's `restoreDatabase.mjs` invokes it — no `--preserveUUID`,
and the source/destination namespaces differ: `vyoma_2_0_test` →
`vyoma_2_0_test_restore_check`) assigns the destination collection a
brand-new UUID; expecting it to match the TEST backup's own recorded
source UUID would be factually wrong, not merely lenient. Per
collection, the tool reports whether the UUID **changed** (expected),
is **unchanged** (unusual — flagged, but still not a failure by itself),
or is **not comparable** (missing/unsupported evidence) — none of these
affect the match/mismatch/incomplete verdict. Document, index (including
the corrected `background` legacy-field handling), and collection-option
comparison are otherwise identical to the pre-restore path.

Same offline-by-default, dual-flag-gated, fail-closed design; same
credential and connection-safety guarantees; same verdict structure,
under its own result strings:
```
RESULT: LIVE TARGET MATCHES FRESH TEST BACKUP (POST-RESTORE)
POST-RESTORE DATA INTEGRITY: CONFIRMED
```
(or `DIFFERS FROM` / `FAILED`, or `INCOMPLETE -- NOT VERIFIED` both lines).

**If post-restore verification fails:** do not retry the restore
automatically. The recovery procedure is to run `restoreCheckSelfRecovery.mjs`
against the existing preservation backup (see "Usage — restore-check
self-recovery" above), then verify the recovery itself with **`--post-recovery`**
(see immediately below) — **not** the default pre-restore mode, which would
incorrectly reject a successful recovery (see that section's own correction
note).

### Post-recovery verification (`--post-recovery`, QA Bug 19 Stage 9.9A.1 — corrects a defect found before any live use)

**Finding:** `restoreCheckSelfRecovery.mjs` reuses the same
`buildMongorestoreArgs()` as the normal restore path — confirmed by direct
source inspection to never pass `--preserveUUID`, even though recovery's
source and destination are the *same* database name
(`vyoma_2_0_test_restore_check`). A recovery restore therefore still
assigns the recovered collection a **brand-new UUID**, exactly like a
normal restore does. Verifying a successful recovery with the **strict,
UUID-blocking pre-restore comparator** (the default mode above) would
therefore have incorrectly reported a successful recovery as a mismatch —
found and corrected before this mode was ever used live.

`--post-recovery` (with `--preservation-backup`, not `--fresh-test-backup`)
compares the live target against the **preservation backup** instead,
with the identical non-blocking UUID policy `--post-restore` already
uses (both are thin wrappers around one shared implementation,
`runNonBlockingUuidVerification()`, so there is no separate UUID policy to
drift out of sync, and no generic UUID bypass exists anywhere). Expects
whatever the preservation backup actually records (17 collections, 95
documents, 39 indexes, as of the last verified backup) — never hardcoded,
always derived from the real backup files. Manifest validation reuses
`validateManifestForRecovery()` unchanged — the same strengthened
validator the pre-restore path already relies on.

```
RESULT: LIVE TARGET MATCHES PRESERVATION BACKUP (POST-RECOVERY)
POST-RECOVERY DATA INTEGRITY: CONFIRMED
```
(or `DIFFERS FROM` / `FAILED`, or `INCOMPLETE -- NOT VERIFIED` both lines).

**The existing, already-approved strict pre-restore comparison
(`runLiveRestoreCheckComparison`, default mode) is completely unmodified**
by either new mode — confirmed by a dedicated regression test asserting
its own `collectionMatches` calculation still requires `uuidResult.equal`.
- **Restoration must still be tested separately, in isolation, before being
  trusted.** The disposable-database tests below prove the restore
  *mechanism* works; they do not substitute for actually restoring a real
  backup of `vyoma_2_0_test` into a separate, temporary database and
  comparing collection/document counts against the live source before
  relying on that backup for real.
- **(Fixed, QA Bug 19 Stage 9.4B) Finalization marker/manifest ordering.**
  `finalizeVerifiedBackup()` previously removed the INCOMPLETE marker
  *before* durably writing and verifying the completion manifest — a
  manifest-write failure at the wrong moment could have left a backup with
  neither marker nor manifest, which `restoreCheckSelfRecovery.mjs` would
  then have silently accepted. See "Finalization ordering and manifest
  durability" above for the corrected sequence, and "Recovery manifest
  validation" above for the new, mandatory manifest check
  `restoreCheckSelfRecovery.mjs` now performs.
- **Environment-variable exposure is narrowed, not eliminated** — see the
  "Credentials" section above for exactly what `MONGODB_URI` does and does
  not protect against (OS-level process-list visibility during the running
  process's lifetime is unavoidable for any tool that takes a credential as
  a CLI argument or environment variable, not something fixable in this
  script).

## Disposable-database test results (Task 7P)

Verified end-to-end against two separate `mongodb-memory-server` instances
(never `vyoma_migration_dryrun` or any other real/persistent database) — 18
checks, all passing:

- Protected database name refused for both backup and restore (pure string
  check, no real connection attempted).
- Dry-run mode for both scripts spawns no external process.
- A real backup runs, produces a real `.bson` file, and reports the correct
  restorable path.
- Backup directory naming is timestamped (collision-avoidant by
  construction).
- Restore dry-run performs no action.
- Restore refuses `--commit` without `--confirm-restore`.
- Restore refuses a production target (`NODE_ENV=production`) without
  `--i-understand-this-is-production`.
- Restore refuses a directory that doesn't look like a real backup.
- Restore refuses the **outer** backup wrapper directory specifically (the
  pitfall above) — confirmed this is now caught, not silently a 0-document
  no-op.
- A real restore into a **separate, disposable target database** (a
  different database name than the source) correctly restores all
  documents, verified by directly querying the restored data afterward —
  not just checking the exit code.
- A real `mongodump` connection failure (deliberately unreachable host) is
  surfaced without the raw connection string appearing anywhere in the
  resulting error.

No backup or restore was ever run against `vyoma_migration_dryrun` or any
other real/persistent/protected database while producing this tooling.
