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
- `backupDatabase.mjs` — wraps `mongodump`.
- `restoreDatabase.mjs` — wraps `mongorestore`.

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

## Credentials (Task 7P-SEC): avoid passing the URI as a literal CLI argument

`backupDatabase.mjs` accepts the connection string from the `MONGODB_URI`
environment variable instead of `--uri`, to avoid retyping a credential-
bearing literal directly on the command line. `restoreDatabase.mjs`
accepts the same env var the same way as of Task 7P-SEC16 — see "Task
7P-SEC16" under "Running a restore" above. **This narrows but does not
eliminate exposure** — see the PowerShell recipe and its caveat below.

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
  process (or, on `--commit`, the `mongodump` child process) is actually
  running — environment variables of a running process, like its command-
  line arguments, remain visible to anything with permission to inspect the
  local process table (e.g. Task Manager's command-line/environment
  columns, `Get-Process`, WMI) for that process's lifetime. This is a
  structural property of how every OS exposes a running process, not
  something fixable by this script.
- It does **not** retroactively scrub PowerShell's *persisted* history file
  (`(Get-PSReadLineOption).HistorySavePath`) if you typed the value there.
  `Clear-History` only clears the in-memory session history. If you want the
  persisted file scrubbed too, that line must be removed from that file
  directly, manually, afterward.
- Neither this script nor anything it logs ever prints the resolved URI
  itself, from either source — see "Never logs the connection string" under
  Safety guarantees below, which applies identically regardless of whether
  the value came from `--uri` or `MONGODB_URI`.

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
- **(Fixed, Task 7P-SEC3) `restoreDatabase.mjs` now independently rejects an
  INCOMPLETE backup** by checking for `backupDatabase.mjs`'s
  `INCOMPLETE_BACKUP.txt` marker before any shape check or `--commit` — see
  "Failed or interrupted backups" above.
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
- **No automated backup-integrity verification.** This tooling confirms a
  backup directory has the expected *shape* (real `.bson`/`.metadata.json`
  files, nested under the expected database name) — it does not checksum
  the backup, compare document counts against the live source, or otherwise
  prove the dump is complete and uncorrupted.
- **Restoration must still be tested separately, in isolation, before being
  trusted.** The disposable-database tests below prove the restore
  *mechanism* works; they do not substitute for actually restoring a real
  backup of `vyoma_2_0_test` into a separate, temporary database and
  comparing collection/document counts against the live source before
  relying on that backup for real.
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
