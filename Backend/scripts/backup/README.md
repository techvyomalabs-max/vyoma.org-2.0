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
node scripts/backup/backupDatabase.mjs --uri "<mongodb-uri>" [--out-dir <dir>] [--tools-dir <dir>] [--commit]
```

- Without `--commit`: validates the target (refuses a protected name,
  resolves the backup path) and reports what *would* happen. Spawns no
  external process at all. This is the default — always run this first.
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
- Neither script ever includes the real connection string in anything it
  prints, including on a `mongodump`/`mongorestore` failure (which would
  otherwise leak it via Node's own child-process error object) — every
  logged string is redacted first.
- Backups are never overwritten (timestamped directory names).
- Restore requires three independent, explicit confirmations together for a
  production target; none is implied by any of the others.

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
