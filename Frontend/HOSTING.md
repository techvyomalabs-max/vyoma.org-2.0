# Frontend hosting architecture — PROPOSED, not approved

Task 7P. This resolves a discrepancy found during the Task 7O staging audit:
`STAGING.md` and `infra/cloudfront/README.md` both describe the hosting plan
as "Frontend built as a static export, served from S3 + CloudFront" — but
as currently built, this application **cannot** produce a static export.
This document proposes a replacement architecture. Nothing here has been
deployed, approved, or implemented — Draft Mode and all other application
functionality are unchanged.

## Why static export does not work for this app today

Next.js's `output: 'export'` mode (the setting S3+CloudFront hosting
requires) does not support:

1. **Route Handlers that use dynamic server features.** This app has two:
   `app/api/draft/route.js` and `app/api/draft-disable/route.js` — both
   call `draftMode()` (a dynamic, request-time API) to enable/disable CMS
   preview. A static export has no server to run these against at request
   time at all.
2. **`next/image` optimization**, unless `images.unoptimized: true` is set
   or a custom loader is configured — neither is set in
   `next.config.mjs` today. Without one of those, `next build` with
   `output: 'export'` fails outright; images would need to be served
   unoptimized (larger payloads, no on-the-fly resizing) if export were
   adopted.
3. **Per-request dynamic rendering.** Several public pages call
   `generateMetadata()`/fetch CMS content from the Backend at request time
   so that publishing a change in the CMS is reflected without a
   redeploy. A static export bakes `generateMetadata()`'s output in at
   *build* time only — every page would need to be re-built and
   re-deployed for a content change to appear, a materially different
   content-ops workflow than what the CMS (draft → publish →
   immediately-live) is built to support today.

None of this is a code defect — the app was built using ordinary Next.js
Server Component/Route Handler/Draft Mode features, which is the correct,
idiomatic way to build it. The mismatch is specifically with the
*S3+CloudFront static-export hosting plan*, not with the application code.

## Options compared

| | Vercel | Node-capable host + reverse proxy | S3 + CloudFront static export |
|---|---|---|---|
| Needs a Node-capable runtime? | Provided natively, zero config | Yes — you provision it | No — and this app can't produce one anyway (see above) |
| Draft Mode / CMS preview | Works unmodified | Works unmodified | **Does not work** — would require removing the feature or rebuilding it as a separate mechanism |
| Per-request CMS content fetch | Works unmodified | Works unmodified | **Does not work as designed** — would require a full rebuild+redeploy per content change, or ISR/on-demand revalidation added (not currently implemented) |
| `next/image` optimization | Works unmodified | Works unmodified | Requires `images.unoptimized: true` (code change) or a custom loader |
| Redirects | `redirectMiddleware.js` is Backend-only either way; a Frontend-side legacy-URL redirect would use Next's own `redirects()` config or middleware — works on both Vercel and a Node host, not on static export without the CloudFront Function described in `infra/cloudfront/README.md` | Same as Vercel | Needs the CloudFront Function (`infra/cloudfront/generate-redirect-manifest.mjs` output) attached at the edge — tooling for this already exists and was built for exactly this scenario |
| SEO | No difference — `generateMetadata()` already runs server-side either way | No difference | No difference for already-published pages; a *newly* published page wouldn't get correct metadata until the next rebuild |
| Deployment config needed | Near-zero — `vercel.json` optional, env vars set in the Vercel dashboard | A Dockerfile/process manager + the reverse proxy itself (nginx/Caddy/ALB) must be built — none exists in this repo today | `next.config.mjs` needs `output: 'export'` + `images.unoptimized: true`; Draft Mode routes would need to be removed entirely; the existing CloudFront Function tooling would need actual AWS provisioning to attach |
| Code changes required | **None** | **None** to the app itself; new infra files (Dockerfile, reverse-proxy config) | `next.config.mjs` change + **removal of Draft Mode's two Route Handlers** (a real functionality loss, not just infra) |

## Recommendation: Vercel (or, if Vercel is not acceptable, any Node-capable host)

**Least disruptive: Vercel.** It is Next.js's own first-party hosting
target, requires no `output: 'export'`, supports Route Handlers and Draft
Mode natively, needs no reverse-proxy/Dockerfile work, and needs no Frontend
code changes at all — only environment variables (`NEXT_PUBLIC_API_BASE_URL`
pointed at the Backend's real staging/production URL, `NEXT_PUBLIC_RAZORPAY_KEY_ID`,
`DRAFT_MODE_SECRET`) set in its dashboard.

**If Vercel is not an option** (e.g. an organizational requirement to host
entirely within AWS), the next-least-disruptive choice is a **Node-capable
host behind a reverse proxy** (e.g. an EC2/ECS/Fargate instance running
`next start`, behind nginx or an Application Load Balancer) — this also
requires zero Frontend code changes, but does require building and
maintaining the hosting infrastructure itself (a Dockerfile, process
manager, reverse-proxy config, TLS termination), none of which exists in
this repo today.

**S3 + CloudFront static export is not recommended** unless Draft Mode is
deliberately removed or rebuilt as a separate mechanism (e.g. a signed
preview URL served by the Backend directly, bypassing Next.js's own Draft
Mode entirely) — a real product/scope decision, not a hosting
configuration change. The CloudFront redirect-function tooling
(`infra/cloudfront/`) remains useful and already-built *if and only if*
this path is chosen later; it is not wasted effort either way, since the
Backend's own `redirectMiddleware.js` is a separate, already-working
mechanism for any topology where the Backend is reachable directly.

## Impact summary by area, under the recommended (Vercel or Node-host) architecture

- **CMS previews**: unaffected — Draft Mode continues to work exactly as
  built.
- **API requests**: unaffected — `NEXT_PUBLIC_API_BASE_URL` points at the
  real Backend exactly as it does in every environment already verified
  (Tasks 7L/7N).
- **SEO**: unaffected — `generateMetadata()` already runs server-side on
  every request; this is unchanged by the hosting choice.
- **Redirects**: unaffected for any request that reaches the Backend
  directly; a Frontend-side legacy-URL redirect (if ever needed) would use
  Next's own `redirects()` config, which both Vercel and a Node host
  support without the CloudFront Function this static-export-only path
  requires.
- **Deployment configuration**: Vercel needs almost none; a Node host needs
  new infrastructure files this task did not create (out of scope here —
  this document only makes the recommendation, per the task's instruction
  not to implement or approve the hosting decision).

## Status

**Proposed only.** No hosting platform has been selected, no infrastructure
has been provisioned, and no code has been changed as a result of this
document. A product/infrastructure owner must approve one of the above
before any staging deployment proceeds (Task 7O's deployment-blocker item
"Staging deployment" remains open until this decision is made).
