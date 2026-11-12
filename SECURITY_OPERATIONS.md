# Security and operations checklist

Task 7P, Part D. This consolidates security/operations findings gathered
during the Task 7O staging-readiness audit and this task's own review, into
one reference document. No security business logic was modified to produce
this — it is a status report distinguishing what is already implemented
from what remains a decision or a gap.

## 1. Production environment variable validation

- **Implemented**: `Frontend/lib/apiConfig.js`'s `resolveApiBase()` (Task
  7L) throws a clear, non-sensitive error at request time if
  `NEXT_PUBLIC_API_BASE_URL` is missing in production, instead of silently
  falling back to mock data or a dev default.
- **Remaining decision**: there is no single startup-time check that
  validates ALL required production env vars together (e.g.
  `MONGODB_URI`, `JWT` secrets, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`,
  SMTP credentials, `CORS_ORIGIN`) and fails fast with one clear report if
  any are missing — today, a missing var is caught individually, wherever
  that specific var happens to be used first. Adding a single consolidated
  startup check is a reasonable future hardening step, not yet built.

## 2. CORS and cookie security

- **Implemented** (`Backend/src/app.js`): `cors({ origin: env.corsOrigin,
  credentials: true })` — a single configured origin, not a wildcard;
  credentials (cookies) explicitly enabled only for that origin.
- **Implemented**: auth tokens are issued as cookies (not
  `localStorage`), consistent with the admin auth design documented in
  `Frontend/app/admin/README.md`.
- **Remaining decision**: confirm `env.corsOrigin` is set to the exact
  production Frontend origin (with the correct scheme/host) before
  go-live — a staging value left in place would either block the real
  Frontend or, worse, be set overly permissively under deployment
  pressure. Confirm cookie flags (`Secure`, `HttpOnly`, `SameSite`) are
  appropriate for the final hosting topology chosen in
  `Frontend/HOSTING.md` — e.g. `SameSite=None; Secure` would be required
  only if Frontend and Backend ever end up on different origins without a
  shared parent domain.

## 3. Rate limiting

- **Implemented**, per-route, confirmed by direct code inspection:
  - Login and forgot-password share one limiter (5/hour) —
    `auth.routes.js`.
  - Refresh and logout — `auth.routes.js`.
  - Donation order creation — `donations.routes.js`.
  - Form submission — `forms.routes.js`.
  - Media upload — `media.admin.routes.js`.
- **Gap**: public content/blog read routes and all authenticated admin
  CRUD routes (content, blog, users, settings, redirects, audit) have no
  rate limit. For authenticated admin routes this is lower risk (requires
  a valid session already), but public read routes are open to
  unauthenticated scraping/load at any volume. Whether to add a general
  rate limit here is a product/ops decision (expected traffic shape
  matters), not something this task changes unilaterally.

## 4. Security headers

- **Implemented**: `app.use(helmet())` in `Backend/src/app.js` — Helmet's
  defaults cover `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security` (only takes effect over HTTPS, which is a
  hosting-level prerequisite — see Task 7O's infrastructure checklist),
  and related headers.
- **Remaining decision**: no explicit Content-Security-Policy is
  configured beyond Helmet's defaults. A CSP tailored to this app's actual
  script/style/image sources would need deliberate construction and
  testing (a strict CSP can break third-party embeds like Razorpay's
  checkout script if not scoped correctly) — not attempted here since it
  is a business-logic-adjacent change, not a documentation task.

## 5. Secrets management

- **Current state**: secrets (`MONGODB_URI`, JWT signing keys, Razorpay
  keys, SMTP credentials) are read from environment variables via
  `Backend/src/config/env.js`-style loading — not hardcoded, not committed.
- **Remaining decision**: where these env vars are actually stored in the
  real hosting environment (a secrets manager, the hosting platform's own
  env var UI, etc.) depends entirely on the hosting choice made from
  `Frontend/HOSTING.md`/`Backend/STAGING.md` — not yet decided, so not
  something this document can finalize. No `.env` file was read, modified,
  or needs to be modified for this task.

## 6. Monitoring requirements

- **Current state**: `Backend/src/middleware/errorHandler.js` logs errors
  via `console.error` only. `/api/v1/health` (liveness) and
  `/api/v1/ready` (DB-readiness) endpoints exist and work today.
- **Gap**: no APM/error-tracking integration (e.g. Sentry) exists in
  either `package.json`. In a real deployment, `console.error` output
  needs to land somewhere actually monitored (the hosting platform's log
  aggregation, at minimum) — console logging alone is not a substitute for
  alerting. Health/readiness endpoints should be wired into the hosting
  platform's own health-check/uptime monitoring once a platform is chosen.

## 7. CSV/XLSX formula-injection risk

- **Status**: reviewed during Task 7O. `donations.admin.controller.js`'s
  own code comment explicitly states "Week 3 Decision W3-4: no refund
  action, no CSV export here" — i.e., **no CSV/XLSX export functionality
  currently exists** in the donations admin surface (or was found
  elsewhere in the admin codebase during this review). Formula-injection
  risk (a cell value starting with `=`, `+`, `-`, or `@` being interpreted
  as a formula by Excel/Sheets on open) therefore has no current attack
  surface in this codebase. **This becomes a required control the moment
  any CSV/XLSX export feature is added** (donations, forms, users, or
  audit log) — any such future feature must sanitize/prefix risky leading
  characters before export.

## 8. Logout and refresh-token revocation

- **Status**: fully investigated in Task 7M.1, Phase 4 (assessment only,
  no fix applied, per that task's explicit instruction).
- **Design as built**: `refreshTokenVersion` is a per-user integer;
  bumping it invalidates ALL outstanding refresh tokens for that user at
  once (all-or-nothing — no per-session/per-device tracking).
  `logout()` only clears the current session's cookie; it does **not**
  bump `refreshTokenVersion`. This is confirmed intentional, not a bug,
  by `auth.service.js`'s own code comment distinguishing an ordinary
  single-session logout from a separate, not-yet-built "logout
  everywhere" concept that would use the version bump.
- **Practical consequence**: if a refresh-token cookie were stolen (e.g.
  via a compromised device) before the legitimate user logs out normally,
  an ordinary logout does not revoke the stolen token — it remains valid
  until it expires on its own. This is a real residual-session-risk gap,
  not a false alarm.
- **Remaining decision**: whether to build a "logout everywhere"/
  "revoke all sessions" action (bumping `refreshTokenVersion` on explicit
  user request, e.g. from an account-security settings page) is a
  product-scope decision, not something this document or Task 7P
  implements. Flagging it here keeps it visible for a future task.

## Implemented vs. remaining — summary table

| Area | Implemented | Remaining decision / gap |
|---|---|---|
| Env var validation | Mock-data/API-base fail-fast (Frontend) | No single consolidated Backend startup check |
| CORS/cookies | Single-origin CORS, credentialed cookies | Confirm real production origin + cookie flags at go-live |
| Rate limiting | Auth, donations, forms, media | Public reads and admin CRUD routes unprotected |
| Security headers | Helmet defaults | No explicit CSP |
| Secrets | Env-var based, nothing hardcoded | Storage mechanism depends on undecided hosting choice |
| Monitoring | Health/readiness endpoints exist | No APM/alerting integration; console-only error logs |
| CSV/XLSX injection | No export feature exists today | Must be handled if/when export is ever added |
| Logout/token revocation | Per-session logout works; all-or-nothing global revocation exists | No "logout everywhere" user-facing action yet |

## Status

Documentation/audit only. No security business logic, environment
configuration, or `.env` file was modified to produce this document.
