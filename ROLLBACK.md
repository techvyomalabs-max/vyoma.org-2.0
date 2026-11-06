# Deployment rollback runbook

Task 7P, Part C. This is a documentation-only runbook — no deployment or
rollback has been executed to produce it. It describes the procedure to
follow when a future real deployment needs to be rolled back. It assumes
the hosting architecture proposed in `Frontend/HOSTING.md` (Vercel or a
Node-capable host) and the Backend hosting already implied by
`Backend/STAGING.md`.

## 1. Pre-deployment backup requirement

**No deployment may proceed without a fresh database backup taken
immediately before it.** Use `Backend/scripts/backup/backupDatabase.mjs`
(see `Backend/scripts/backup/README.md` for full usage) against the real
target database, in `--commit` mode, and confirm the backup completed
(correct `.bson` files present under the printed restorable path) before
continuing. Record the backup's path and timestamp alongside the release
being deployed (see §2). Without this, §5 (database recovery) has nothing
to roll back to.

This runbook's own backup tooling has only ever been exercised against
disposable `mongodb-memory-server` databases (Task 7P, Part B) — never
against `vyoma_migration_dryrun` or any other protected/real database.
Running it for real, for the first time, against a real staging/production
database is itself part of go-live readiness, not something this task
performs.

## 2. Release / version identification

Before deploying, record:

- The exact git commit SHA being deployed (`git rev-parse HEAD`).
- The previous commit SHA currently live in the target environment (the
  rollback target if something goes wrong).
- The database backup path/timestamp taken in §1.
- Whether this release includes a data migration (see §6) — if so, name
  the migration script and whether it has a documented reverse operation.

A simple convention: tag the deployed commit (e.g. `git tag
deploy-2026-11-06-1` ) so "what was live before" is always one `git
describe`/tag lookup away, not a guess from memory or chat history.

## 3. Frontend rollback

Depends on the hosting platform chosen (per `Frontend/HOSTING.md`,
proposed, not yet approved):

- **Vercel**: redeploy the previous known-good deployment via the Vercel
  dashboard's "Instant Rollback" / "Promote to Production" action on the
  prior deployment, or re-run `vercel --prod` against the previous commit
  SHA. No build step is required for Instant Rollback — Vercel keeps prior
  built deployments available.
- **Node-capable host + reverse proxy**: re-deploy the previous commit SHA
  (`git checkout <previous-sha>`, rebuild with `npm run build`, restart the
  process manager). This path requires a working build step to exist
  (not yet built in this repo — see `Frontend/HOSTING.md`'s "Deployment
  configuration needed" row) and is therefore slower than Vercel's
  instant rollback.

In both cases: rolling back the Frontend alone does **not** roll back the
Backend or the database — check whether the Frontend's previous version is
still API-compatible with whatever Backend version is currently live
before rolling back only one side.

## 4. Backend rollback

- Re-deploy the previous commit SHA to the Backend's hosting target
  (exact mechanism depends on infrastructure not yet provisioned — e.g. a
  process manager restart, a container redeploy, or a PaaS rollback
  action).
- Restart the process/service and re-check `/api/v1/health` (liveness) and
  `/api/v1/ready` (DB-aware readiness) immediately after restart — both
  already exist in `Backend/src/app.js` and require no new code.
- If the previous Backend version expects a database schema/shape that the
  current (rolled-forward) database no longer has — e.g. a field removed
  by a migration that ran as part of the bad release — Backend rollback
  alone is insufficient; see §5.

## 5. Database recovery decision points

Database state is the highest-risk part of any rollback — unlike
code, it cannot simply be "re-deployed." Decide explicitly, in this order:

1. **Did the bad release include a data migration?** If no, a code-only
   rollback (§3/§4) is sufficient; skip to §7.
2. **If yes, does the migration have a documented, tested reverse
   operation?** (Per §6, this project's migration tooling is a one-way,
   WordPress-source `--commit`-gated import; it does not currently define
   reverse/down migrations.) If a reverse operation exists and has been
   tested, run it before declaring the rollback complete.
3. **If no reverse operation exists**, the decision is between:
   - **Restore the pre-deployment backup** (§1) via
     `Backend/scripts/backup/restoreDatabase.mjs`, accepting the loss of
     any legitimate writes (e.g. new donations, new form submissions, new
     CMS edits) made between the backup and the rollback decision, or
   - **Roll forward with a hand-written fix** instead of rolling back the
     database, if the volume of legitimate interim writes makes data loss
     unacceptable.
   This is a judgment call requiring sign-off from whoever owns the
   incident (see §9) — it is not something to decide unilaterally under
   pressure.
4. **If a restore is chosen**: it is a destructive, production action and
   must follow every one of `restoreDatabase.mjs`'s required
   confirmations (`--commit`, `--confirm-restore`, and
   `--i-understand-this-is-production` since this is, by definition, a
   production target) — these three flags exist specifically to prevent a
   rollback-under-pressure from becoming a second incident. Restore into
   the real target only after the specific restorable directory (inner,
   not outer — see the backup README's "Known pitfall" section) has been
   confirmed.

## 6. Migration rollback limitations

This project's WordPress→MERN migration scripts (referenced in
`Backend/STAGING.md`) are one-directional importers, gated by
`--commit`, with no corresponding "undo" operation built or tested. This
means:

- A migration cannot be "rolled back" in the way a reversible schema
  migration framework (e.g. one with `up`/`down` pairs) can.
- The only reliable undo for a migration-related incident is a full
  database restore from the pre-migration backup (§5, option 3), not a
  partial/targeted fix — accept the resulting loss of any writes made
  since that backup, or roll forward with a manual, incident-specific fix
  instead.
- This is a real limitation of the current tooling, not an oversight in
  this runbook — closing it (e.g. building reverse migrations) would be a
  separate, larger engineering task and is out of scope for Task 7P.

## 7. Health-check verification (after any rollback)

- Backend: `GET /api/v1/health` returns success (liveness — process is up)
  and `GET /api/v1/ready` returns success (readiness — `mongoose.connection.readyState`
  indicates a live DB connection). Both already exist; no new tooling
  needed.
- Frontend: confirm the homepage and at least one CMS-backed page
  (e.g. About) render with live data, not an error state or stale cached
  content.
- Confirm `NEXT_PUBLIC_API_BASE_URL` (Frontend) and `NODE_ENV`/`MONGODB_URI`/
  CORS origin (Backend) are all still correctly set after rollback — a
  rollback that silently reverts an environment variable change is a
  common cause of a "successful" rollback that is still broken.

## 8. Post-rollback smoke testing

At minimum, manually verify (per Task 7O's deployment checklist):

- Public page load (any CMS-backed page) with correct, live content.
- Admin login (and MFA for a `super_admin` account, per the mandatory-MFA
  design already in place).
- One CMS read/write round-trip (e.g. view the content list in
  `/admin`).
- One form submission (Contact or similar) — confirm it is stored, not
  silently dropped.
- Donation flow up to (but not including, unless a disposable/test
  Razorpay key is configured) real payment submission — confirm no
  fabricated "success" state is ever shown (per Task 7L's mock-data-safety
  work: this is specifically guarded against in production regardless of
  rollback).
- `/api/v1/health` and `/api/v1/ready` both green.

## 9. Incident escalation and approval

- Any production rollback is an incident-response action, not a routine
  deployment step — it should be visible to whoever owns the
  production environment, not performed silently.
- The database-recovery decision in §5 (restore vs. roll-forward) requires
  explicit sign-off before executing a restore, given the unrecoverable
  data loss a restore can cause.
- After a rollback, record: what triggered it, which of §3/§4/§5 were
  used, what data (if any) was lost per §5's decision, and the corrected
  forward plan — this project does not yet have a formal incident log
  location; until one exists, record this in whatever the team's existing
  issue tracker or written record is.

## Status

This is a planning document only. No deployment, rollback, or database
restore was executed against any real or staging environment to produce
it. The backup/restore tooling it references has been tested only against
disposable databases (Task 7P, Part B).
