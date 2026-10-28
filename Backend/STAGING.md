# Staging environment setup

This documents what's needed to point this Backend at a real staging
MongoDB, AWS S3 bucket, SMTP provider, and Razorpay account. It does not
create or contain any real credentials — every value below is a variable
name only.

## NODE_ENV — required, and the foundation for every other safeguard below

`NODE_ENV` must be set explicitly to exactly one of `development`, `staging`,
or `production`. **A staging or production deployment configuration must
explicitly set `NODE_ENV`** — there is no fallback default for a missing or
unrecognized value. This is validated at the very first line of
configuration loading, before anything else in the application runs
(`resolveNodeEnv()` in `src/config/env.js`), so a misconfigured `NODE_ENV`
fails loudly and immediately rather than letting the server boot in an
unintended mode.

This matters because every other safeguard documented below (the persistent
MongoDB requirement, the production JWT-secret requirement, and mock-content
seeding restrictions) is gated on `NODE_ENV`. Previously, an unset `NODE_ENV`
silently defaulted to `development`, meaning the single, ordinary mistake of
forgetting to set `NODE_ENV` in a staging/production deployment bypassed all
three of those protections at once. There is no longer any such default.

The only exception is a narrow, explicit, local-development-only opt-in:
setting `ALLOW_LOCAL_DEV_DEFAULTS=true` allows `NODE_ENV` to be left unset,
resolving it to `development`. This opt-in:
- Has no effect whatsoever once `NODE_ENV` is set to anything, valid or not
  — it can never override an explicit `staging`/`production` mode, and it
  never rescues an invalid `NODE_ENV` value.
- Must never be set in a staging or production environment — those must
  always declare `NODE_ENV` explicitly instead.

## Required environment variables, by service

### MongoDB
- `MONGODB_URI` — a real connection string (e.g. MongoDB Atlas). **Required**
  outside local development: staging and production both require a real,
  persistent MongoDB. Leaving this unset (or blank/whitespace-only) falls
  back to an ephemeral in-memory MongoDB in local development only — in any
  other environment (`NODE_ENV` anything other than `development`), this is
  a **fatal startup configuration error**: the server refuses to boot rather
  than silently running on in-memory storage that would lose all data on the
  next restart.
- `ALLOW_MOCK_CONTENT_SEED` — optional. See "First-boot checklist" below.
  **Mock-content seeding is always disabled in production**, regardless of
  this variable; staging seeding requires explicit opt-in.

### AWS S3 (media uploads)
- `AWS_REGION`
- `AWS_S3_BUCKET`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The bucket must additionally be configured (outside this codebase, via the
AWS console/CLI) to allow public `s3:GetObject` reads on the `media/*`
prefix — uploaded objects are served via their direct S3 URL, with no
signed URLs or CloudFront in front of them today.

### SMTP (email)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

All five must be set for the mailer to attempt a real send (see
`isSmtpConfigured()` in `src/config/env.js`); if any one is missing, every
email-sending feature (contact-form notifications, forgot-password,
donation receipts) logs the message instead of sending it; the underlying
request/payment still succeeds either way.

### Razorpay — Backend
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

### Razorpay — Frontend
- `NEXT_PUBLIC_RAZORPAY_KEY_ID` — the same key ID as `RAZORPAY_KEY_ID`
  above, exposed to the browser (this is Razorpay's public checkout key, not
  a secret). Easy to forget: without it, the donation checkout modal never
  opens, even with a fully configured Backend. Also requires
  `NEXT_PUBLIC_API_BASE_URL` to be set to the staging Backend's URL, or the
  Frontend falls back to its local mock-data mode for donations/content.

### JWT authentication
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL` (optional, defaults to `15m`)
- `JWT_REFRESH_TTL_DAYS` (optional, defaults to `30`)
- `JWT_MFA_TTL` (optional, defaults to `5m`)
- `MFA_ISSUER` (optional, defaults to `Vyoma.org Admin`)

`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` **must** be set in any environment
where `NODE_ENV=production` — the server refuses to boot otherwise, to
avoid ever signing tokens with the dev-insecure default secrets.

### CMS preview
- `PREVIEW_SECRET` — must match the Frontend's `DRAFT_MODE_SECRET` exactly
  (same value, two names). Gates the "Preview draft" links in the admin CMS.
  Internal to this project, not a third-party credential.

### Initial administrator bootstrap
- `BOOTSTRAP_ADMIN_NAME`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Only needed for the very first boot against a database with zero existing
Super Admin accounts (`scripts/bootstrapAuth.js`, also run automatically by
`src/server.js` on every boot — it no-ops once a Super Admin already
exists). Unset these again once the first Super Admin account is confirmed
working; there is deliberately no other way to create the first account.

## Staging vs. production credentials

Every credential above should be **provisioned separately per environment**
— staging must never share real Razorpay live-mode keys, a production SMTP
sender identity, or the production MongoDB/S3 bucket with any other
environment:

- **Razorpay**: use **test-mode** keys for staging (`rzp_test_...`), never
  live-mode keys. Test-mode payments never move real money and use
  Razorpay's documented test card/UPI numbers.
- **MongoDB**: a separate staging Atlas cluster (or separate database within
  a shared cluster), never the production database.
- **AWS S3**: a separate staging bucket, so staging uploads/deletes can
  never affect production media.
- **SMTP**: either a separate sending identity/domain for staging, or a
  provider's sandbox mode, so staging emails are clearly distinguishable
  from production ones (and ideally can't reach real donors/contacts by
  accident).

## First-boot checklist for a new staging database

1. Confirm `NODE_ENV` is explicitly set to `staging` (or `production`, for a
   production deployment) in the deployment's own configuration — not left
   unset, and never paired with `ALLOW_LOCAL_DEV_DEFAULTS`. If this is
   wrong, every check below behaves differently than intended.
3. Confirm `MONGODB_URI` is set to a real, non-blank connection string
   pointing at the intended staging cluster/database — double-check the
   hostname and database name, not just that a value is set. If it's
   missing, empty, or whitespace-only, the server will refuse to boot with
   a clear startup error rather than silently falling back to in-memory
   storage — this is expected, intentional behavior outside local
   development, not a bug to work around.
4. Decide the mock-content question **before** the server's first boot
   against that database:
   - If staging should start from the Frontend's existing placeholder
     mock content (fastest path to a working demo), explicitly set
     `ALLOW_MOCK_CONTENT_SEED=true`. This only works when `NODE_ENV` is
     **not** `production` — production never auto-seeds mock content,
     with no override, regardless of this variable.
   - If staging should start from hand-curated content instead, leave
     `ALLOW_MOCK_CONTENT_SEED` unset (or explicitly `false`) — the server
     will boot against the empty database without auto-seeding, and
     content can then be entered through the admin CMS or a separate,
     reviewed import.
   - Either way, `scripts/runSeed.js` is idempotent and safe to run by hand
     later if the mock dataset is wanted after the fact.
5. Set `BOOTSTRAP_ADMIN_NAME`/`EMAIL`/`PASSWORD`, boot the server once, log
   in as that Super Admin, then unset those three variables again.
6. Confirm the auth role seed ran (`super_admin`/`admin` roles present) —
   this happens automatically and independently of the content-seed
   decision above.
7. Verify AWS S3, SMTP, and Razorpay are each either fully configured or
   cleanly reporting "not configured" (503/clear error) rather than
   crashing — all three adapters are designed to fail this way by default.

## Summary of guarantees

- `NODE_ENV` must be explicitly `development`, `staging`, or `production` —
  an unset or unrecognized value is a **fatal startup configuration error**,
  validated before anything else in the application runs. The only
  exception is the local-only `ALLOW_LOCAL_DEV_DEFAULTS=true` opt-in, which
  has no effect once `NODE_ENV` is set to anything at all.
- Staging and production both **require** a real, persistent `MONGODB_URI`.
- A missing, empty, or whitespace-only `MONGODB_URI` outside local
  development is a **fatal startup configuration error** — the server
  refuses to boot, and never starts an in-memory MongoDB instance in that
  case.
- The in-memory MongoDB fallback exists **only** for local development
  (`NODE_ENV=development`).
- `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` **must** be set whenever
  `NODE_ENV=production` — the server refuses to boot otherwise, to avoid
  ever signing tokens with the dev-insecure default secrets. Because
  `NODE_ENV` can no longer be silently unset, this check can no longer be
  bypassed by forgetting to set `NODE_ENV` in a production deployment.
- Mock-content seeding is **always disabled in production**
  (`NODE_ENV=production`), with no override — `ALLOW_MOCK_CONTENT_SEED=true`
  has no effect there.
- Staging mock-content seeding requires **explicit opt-in**
  (`ALLOW_MOCK_CONTENT_SEED=true`) — it is disabled by default there too.

## WordPress migration scripts — staging safety

`scripts/wordpress/import/` contains one-off WordPress→MongoDB content
migration scripts (`batch1-import.mjs` and others). Several of these
perform real, unconditional `deleteMany()` calls once run with `--commit`,
scoped by slug/name lists but still destructive against whatever database
`MONGODB_URI` happens to point at when they run.

**These scripts must never be run against a staging (or production)
database without all of the following:**
- Explicit, separate approval for that specific run (not implied by an
  earlier approval of a different script or a different environment).
- Verified confirmation of exactly which database `MONGODB_URI` currently
  points at, immediately before running — not assumed from memory.
- A fresh, verified-restorable backup of that database taken immediately
  beforehand (see below).

## MongoDB backup/restore (documented only — not run as part of this task)

No backup/restore tooling currently exists in this repository. Until a
scripted/automated solution exists, the standard MongoDB tools apply:

- **Backup**: `mongodump --uri="<MONGODB_URI>" --out=<backup-directory>`
  — run against the target staging/production URI, writing a timestamped
  backup directory. For MongoDB Atlas specifically, Atlas's own built-in
  continuous/scheduled backup feature is the recommended alternative to a
  manual `mongodump`, where available on the cluster tier in use.
- **Restore**: `mongorestore --uri="<MONGODB_URI>" <backup-directory>`
  — restores into the target URI. Always restore into a *new or explicitly
  confirmed-empty* database/cluster first to verify the backup is valid,
  rather than restoring directly on top of a live database.
- Before any restore, confirm the target `MONGODB_URI` as carefully as
  before any destructive script run (see above) — a restore can overwrite
  existing data in the target database.

This procedure is documented for reference only; no backup or restore was
executed as part of producing this document.
