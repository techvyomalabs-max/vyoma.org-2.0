# Staging infrastructure handoff guide

Task 7Q. This is a documentation-only deliverable for the infrastructure
administrator — it does not provision anything, connect to any real
service, or modify any `.env` file. It tells the administrator exactly
what to set up and how to verify each piece, building on
`Frontend/HOSTING.md` (Vercel proposed, not yet approved),
`Backend/STAGING.md`, `ROLLBACK.md`, and `SECURITY_OPERATIONS.md`.

**`Backend/.env.example` is the authoritative, already-complete reference
for every Backend environment variable**, with explanatory comments. This
guide points to it rather than re-transcribing it, except where a variable
needs staging-specific guidance beyond what the comment already says.

---

## Phase 1 — Hosting configuration

### Frontend (proposed: Vercel — see `Frontend/HOSTING.md`, not yet approved)

1. **Deployment requirements**: `next build` / `next start` (`Frontend/package.json`).
   No Node version is pinned in `package.json` — the administrator should
   set one explicitly in the hosting platform's project settings (match
   whatever Node version the Backend host uses, for consistency). No
   `output: 'export'` is set — this must stay that way under Vercel/Node
   hosting (see `Frontend/HOSTING.md` for why static export is
   incompatible with this app).
2. **Backend Node.js hosting requirements**: `node src/server.js`
   (`Backend/package.json`). No Node version pinned — same note as above.
   Defaults to port `4000` (`PORT` env var, optional). Requires outbound
   network access to MongoDB Atlas, Razorpay, AWS S3, and the chosen SMTP
   provider — confirm the hosting platform's firewall/security-group rules
   allow all four.
3. **Environment variables — Frontend** (exact names, confirmed by code
   inspection, not guessed):
   - `NEXT_PUBLIC_API_BASE_URL` — the real Backend API base URL for this
     staging environment (e.g. `https://staging-api.vyoma.org/api/v1`).
     **Required** — the app throws a clear build/runtime error in
     production if this is unset; it never silently falls back to mock
     data (Task 7L).
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID` — Razorpay checkout widget key
     (public key only — never the secret).
   - `DRAFT_MODE_SECRET` — server-side only (never exposed to the
     browser). Must match the Backend's `PREVIEW_SECRET` exactly (see
     Draft Mode note below) — this is a shared-secret **pair**, not a
     single independent value.
4. **Environment variables — Backend**: see `Backend/.env.example` for the
   full list with explanations. The staging-relevant ones, grouped:
   - Core: `PORT` (optional, default 4000), `NODE_ENV=staging`,
     `CORS_ORIGIN` (must exactly match the staging Frontend's origin),
     `MONGODB_URI` (required outside development — see Phase 2).
   - Auth: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — **boot fails without
     real values once `NODE_ENV` is not `development`** (no insecure
     default is used outside dev). Generate strong random values; never
     reuse a development value in staging.
   - First-boot bootstrap: `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`,
     `BOOTSTRAP_ADMIN_PASSWORD` — only needed once, against a fresh,
     empty staging database, to create the first Super Admin account.
   - Donations, S3, SMTP, preview secret: see Phases 3, 4, 5 and the
     Draft Mode note below respectively.
5. **CORS and API URL configuration**: Backend: `cors({ origin:
   env.corsOrigin, credentials: true })` (`Backend/src/app.js`) — a single
   exact origin, not a wildcard, with credentialed cookies enabled only
   for that origin. `CORS_ORIGIN` must be set to the exact staging
   Frontend URL (scheme + host, no trailing slash). Frontend:
   `NEXT_PUBLIC_API_BASE_URL` must point at the exact staging Backend URL.
   A mismatch on either side breaks cookie-based auth silently (the
   browser drops the cookie) rather than with an obvious error — verify
   both values carefully together, not independently.
6. **Draft Mode preview requirements** — this has two **separate**
   secrets/mechanisms, not one, and documentation elsewhere in this repo
   should not conflate them:
   - **Enabling preview** (`Frontend/app/api/draft/route.js`): does **not**
     use a static shared secret. It forwards the admin's own live session
     token (`Authorization: Bearer <token>`) to the Backend's
     `GET /auth/me` to confirm it's a valid admin session before calling
     `draftMode().enable()`. No separate configuration is needed for this
     part — it works automatically once Frontend↔Backend auth is wired up
     correctly per item 5 above.
   - **Fetching draft content once preview is enabled**
     (`Frontend/services/contentService.js`,
     `Frontend/services/blogService.js`): uses the `DRAFT_MODE_SECRET`
     (Frontend) / `PREVIEW_SECRET` (Backend) shared-secret pair as a query
     parameter. These two values **must be set to the identical string**
     on both sides — generate one random value and set it in both
     places.
   - **Disabling preview** (`Frontend/app/api/draft-disable/route.js`): no
     secret/auth check at all today — this is a pre-existing design
     choice, not something introduced by this task, and is noted here
     only so the administrator isn't surprised by it.
7. **Staging domain and HTTPS**: a dedicated staging subdomain (e.g.
   `staging.vyoma.org` / `staging-api.vyoma.org`) with a valid TLS
   certificate is required before any cookie-based auth can be tested
   realistically (`Secure` cookie flags need HTTPS). Vercel provisions
   TLS automatically for domains attached to it; a Node-host fallback
   would need its own certificate (e.g. via the reverse proxy / Let's
   Encrypt).
8. **Health and readiness endpoints** (already implemented, no new code
   needed): `GET /api/v1/health` — unconditional liveness ping. `GET
   /api/v1/ready` — returns 503 if `mongoose.connection.readyState !== 1`
   (not connected to MongoDB), else success. Wire both into whatever
   uptime/health-check feature the chosen hosting platform offers.

---

## Phase 2 — MongoDB Atlas setup guide

**No connection to any real database has been made to produce this
checklist.**

1. **Staging project and cluster**: create a dedicated Atlas *project*
   for staging, separate from any future production project (not just a
   separate cluster within the same project) — this keeps billing,
   access lists, and team permissions cleanly separated.
2. **Database users and least-privilege access**: create a staging-only
   database user scoped to `readWrite` on the staging database name only
   (not `atlasAdmin` or a project-wide role). Never reuse this user's
   credentials for any other environment.
3. **Network access restrictions**: restrict Atlas's IP access list to
   the staging Backend host's outbound IP (or IP range, for
   autoscaling/serverless hosts) — never leave it open to `0.0.0.0/0`
   except temporarily during initial connectivity testing, and close it
   immediately after.
4. **Connection string configuration**: set the resulting
   `mongodb+srv://...` URI as the staging Backend's `MONGODB_URI`. Confirm
   the database name in the URI's path is the intended staging database
   name — **not** `vyoma_migration_dryrun`, and not any name already on
   this project's protected list (see `Backend/scripts/backup/protectedDbGuard.mjs`).
5. **Backup settings**: enable Atlas's own built-in continuous/scheduled
   backup on the staging cluster if the tier supports it — this is the
   recommended primary backup mechanism; this project's own
   `Backend/scripts/backup/` tooling (Task 7P) is the documented
   fallback/on-demand path, not a replacement.
6. **Restore verification**: before relying on either Atlas backups or
   this project's own restore tooling for a real incident, perform one
   real test restore into a **separate, newly-created** staging-adjacent
   database (never into the live staging database) and verify document
   counts/spot-check data — exactly as already verified against disposable
   `mongodb-memory-server` instances in Task 7P, but this time against the
   real Atlas cluster, which this task has not done and should not do
   without separate approval.
7. **Separation from protected migration databases**: confirm the staging
   `MONGODB_URI`'s database name is never `vyoma_migration_dryrun` and is
   not reachable via the same connection the WordPress migration tooling
   uses — these must remain two entirely separate databases, on separate
   clusters if possible, so a staging operation can never accidentally
   touch migration data.

---

## Phase 3 — AWS S3 setup guide

**No AWS resources have been provisioned to produce this checklist.**
Real S3 integration already exists in the codebase
(`Backend/src/modules/media/s3.adapter.js`, using `@aws-sdk/client-s3`) —
it is lazily activated only once all four `AWS_*` env vars are set;
without them, media upload returns a clear "not configured" error rather
than a fake success.

1. **Bucket and region requirements**: create one S3 bucket dedicated to
   staging media (separate from any future production bucket). Record the
   exact bucket name and region for `AWS_S3_BUCKET`/`AWS_REGION`.
2. **IAM least-privilege permissions**: create an IAM user/role scoped to
   `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on this one bucket's
   ARN only (not account-wide S3 access, not other buckets). Generate a
   dedicated access key pair for `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
   — never reuse a personal or production AWS credential.
3. **Media upload/read permissions**: confirm the IAM policy allows both
   the upload path (`PutObject`) the admin CMS media uploader uses and the
   public read path the Frontend's `next.config.mjs` already allow-lists
   (`*.s3.*.amazonaws.com` under `images.remotePatterns`).
4. **Public media delivery configuration**: decide whether objects are
   served via direct public bucket URLs (bucket policy allowing public
   `GetObject`) or via signed URLs/CloudFront — the current adapter
   constructs direct `https://${bucket}.s3.${region}.amazonaws.com/${key}`
   URLs, so public-read bucket policy is the path that requires no
   additional code change; a signed-URL or CloudFront approach would need
   adapter code changes, out of scope for this document.
5. **CORS requirements**: configure the bucket's CORS policy to allow
   `GET` from the staging Frontend's origin (needed for any
   browser-side image loading/cross-origin checks, depending on final
   delivery choice in item 4).
6. **File validation and upload limits**: confirm (by reading the media
   upload controller, not re-done here) what file type/size validation
   already exists server-side before relying on S3/bucket policy alone —
   this task did not re-audit that controller's validation logic in
   detail; a dedicated review is recommended before go-live if not already
   covered by Task 7M's regression suite.
7. **Access logging and security review**: enable S3 server access
   logging (or CloudTrail data events) on the staging bucket so any
   unexpected access pattern is visible before production is provisioned
   similarly.
8. **Test upload and retrieval checklist**: once provisioned, the
   administrator should (a) upload one real test image via the admin CMS
   media uploader, (b) confirm it appears at the expected S3 URL, (c)
   confirm it renders correctly on a public page via `next/image`, (d)
   delete it via the admin CMS and confirm it's removed from the bucket.
   This task does not perform this test — it requires real AWS
   credentials, which this task is restricted from using.

---

## Phase 4 — Razorpay test-mode setup

**No Razorpay transaction or API call has been made to produce this
checklist.**

1. **Test-mode API credentials**: generate a Razorpay **test-mode** key
   pair (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`) from the Razorpay
   dashboard — never use live-mode keys in staging.
2. **Webhook registration**: register a webhook endpoint pointing at the
   staging Backend's `POST /api/v1/webhooks/razorpay` in the Razorpay
   dashboard (test mode), and record the webhook secret it generates as
   `RAZORPAY_WEBHOOK_SECRET`.
3. **Webhook signature verification**: already implemented
   (`Backend/src/modules/donations/razorpay.adapter.js`) —
   HMAC-SHA256 of the raw request body against `RAZORPAY_WEBHOOK_SECRET`,
   timing-safe compared against the `X-Razorpay-Signature` header. No code
   change needed; the administrator only needs to supply the matching
   secret from item 2.
4. **Successful payment test**: using a Razorpay test card, complete one
   donation end-to-end (order creation via `POST
   /api/v1/donations/orders`, checkout, `POST /api/v1/donations/verify`)
   and confirm the donation record in the staging database reflects a
   successful, verified payment.
5. **Failed payment test**: using a Razorpay test-mode failure card,
   confirm a failed payment does **not** produce a fabricated "success"
   state anywhere in the Frontend (this is the exact guarantee Task 7L's
   mock-data-safety work was built to protect — this test is the real
   end-to-end confirmation of that guarantee, not yet performed since it
   requires live test-mode Razorpay access).
6. **Duplicate webhook / idempotency test**: manually re-send the same
   webhook event (Razorpay's dashboard supports this) and confirm the
   donation is not double-recorded/double-counted.
7. **Donation database reconciliation**: after the above tests, confirm
   the staging database's donation records match exactly what the
   Razorpay test-mode dashboard shows for the same test transactions (no
   extras, no missing records).
8. **Refund/dispute scope decision**: confirmed out of scope by existing
   product decision — `donations.admin.controller.js`'s own code comment
   states "Week 3 Decision W3-4: no refund action, no CSV export here."
   This remains a deliberate scope boundary, not a gap to close as part of
   staging setup.

---

## Phase 5 — SMTP setup

**No email has been sent to produce this checklist.** All three flows
below are already implemented in code (`Backend/src/services/mailer.js`
logs instead of sending if any SMTP var is unset — never a silent fake
success).

1. **Provider selection criteria**: choose an SMTP provider that supports
   a dedicated staging sender identity separate from production (e.g. a
   subdomain like `staging-mail.vyoma.org` or a provider's own
   sandbox/test mode, if available) so staging test emails are visibly
   distinguishable from real production email in the provider's own
   dashboard.
2. **SMTP credentials and secure transport**: set `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — all five are
   required together (the mailer falls back to logging, not sending, if
   any one is missing). Confirm the provider's port/transport uses
   TLS (typically port 587 with STARTTLS, or 465 with implicit TLS) —
   never plaintext SMTP.
3. **Sender domain authentication**: configure SPF and DKIM records for
   the `SMTP_FROM` sending domain so staging test emails aren't flagged
   as spam by receiving providers, which would make test results
   misleading.
4. **Password reset email test**: trigger a real password-reset request
   against a staging admin account
   (`Backend/src/modules/auth/auth.controller.js`) and confirm the email
   is received with a working reset link pointing at the staging
   Frontend.
5. **Contact form notification test**: submit a real test entry via the
   staging Frontend's contact form
   (`Backend/src/modules/forms/forms.controller.js`) and confirm the
   notification email is received.
6. **Donation receipt email test**: complete one successful test donation
   (Phase 4, item 4) and confirm the receipt email
   (`Backend/src/modules/donations/receipt.service.js`, which generates a
   `receiptNo`) is received with correct details.
7. **Delivery failure handling**: confirm what currently happens if SMTP
   sending fails after credentials ARE configured (e.g. a transient
   provider outage) — specifically, whether the triggering action (reset
   request, form submission, donation) still succeeds for the user even
   if the email fails, or whether it's silently swallowed. This task did
   not re-verify that specific failure-path behavior in code; recommend a
   quick code check before go-live if not already covered by existing
   tests.

---

## Phase 6 — Staging acceptance checklist

| Activity | Required access/credential | Responsible role | Verification method | Completion evidence | Status |
|---|---|---|---|---|---|
| Frontend hosting platform decision approved | None (decision only) | Product/infra owner | Written sign-off on `Frontend/HOSTING.md`'s recommendation | Approval recorded (e.g. in this doc or a tracked issue) | Pending |
| Frontend deployed to staging | Hosting platform account | Infra administrator | Staging URL loads the homepage | Staging URL reachable over HTTPS | Pending |
| Backend deployed to staging | Hosting platform account | Infra administrator | `GET /api/v1/health` and `/api/v1/ready` both succeed | Both endpoints return success | Pending |
| MongoDB Atlas staging cluster provisioned | Atlas account/org access | Infra administrator | Phase 2 checklist complete | Connection string set, `/ready` green | Pending |
| First Super Admin bootstrapped | `BOOTSTRAP_ADMIN_*` vars, DB access | Infra administrator | Log into `/admin` with bootstrap credentials, then rotate password | Successful admin login + MFA enrollment | Pending |
| AWS S3 staging bucket provisioned | AWS account access | Infra administrator | Phase 3, item 8 test upload/retrieval | Test image round-trip succeeds | Pending |
| Razorpay test-mode configured | Razorpay dashboard access | Infra administrator / finance contact | Phase 4, items 4–7 | Successful + failed + duplicate-webhook tests all pass | Pending |
| SMTP provider configured | SMTP provider account | Infra administrator | Phase 5, items 4–6 | All three email flows received correctly | Pending |
| CORS/API URL cross-configured correctly | None (config review) | Infra administrator | Admin login round-trip works (cookie set and sent) | Login succeeds without CORS errors in browser console | Pending |
| Backup/restore tooling exercised against real staging Atlas cluster | Atlas staging credentials | Infra administrator | One real backup + restore into a separate disposable-staging target | Restore verified with correct document counts | Pending |
| Security/ops checklist reviewed | None (review only) | Security owner | Read `SECURITY_OPERATIONS.md`, confirm `CORS_ORIGIN`/cookie flags set correctly for staging | Sign-off recorded | Pending |
| Full staging smoke test | All of the above | QA / infra administrator | `ROLLBACK.md` §8 smoke-test list, run once against staging | All items pass | Pending |

**Code readiness vs. operational completion**: every item in this table
depends on real external credentials and real provisioning this task is
explicitly restricted from touching. The *code* that each item will
exercise (mock-data safety, CORS config, health endpoints, S3 adapter,
Razorpay adapter, mailer, backup/restore scripts) is already built and
has been verified in isolation (Tasks 7L–7P) — what remains is exclusively
*operational*: creating real accounts, real credentials, and running the
above tests against them. No further code changes are anticipated to
complete this checklist, only infrastructure setup and test execution.

---

## Status

Documentation only. No external account was accessed, no database was
connected to, no AWS resource was provisioned, no Razorpay transaction was
made, and no email was sent to produce this guide.
