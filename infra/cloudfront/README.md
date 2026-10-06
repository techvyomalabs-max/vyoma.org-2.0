# CloudFront redirect function — pre-AWS local preparation

This directory holds a **generated, local** CloudFront Function artifact for
serving legacy-URL redirects at the edge, in front of the planned S3-hosted
static Frontend. It does **not** deploy anything — there is no AWS access
from this tooling at all. Actually attaching this function to a real
CloudFront distribution is a separate, later step that requires AWS
provisioning and is out of scope here.

## Why this exists

The production hosting plan is: Frontend built as a static export, served
from S3 behind CloudFront. In that topology, a request for a legacy page
(e.g. `/team/`) is served directly from S3/CloudFront and never reaches the
Backend's Express app — so the existing `redirectMiddleware.js` (which does
an exact-match lookup against the `Redirect` MongoDB collection) has nothing
to intercept. A CloudFront Function running at the viewer-request step, with
the redirect rules embedded directly in its code, fills that gap: it runs
at the edge, before S3 is touched, with no live Backend dependency and no
added request latency to a separate service.

## Architecture

```
MongoDB Redirect collection  (authoring source of truth — unchanged;
        │                     still edited via the existing admin screen)
        │
        ▼
generate-redirect-manifest.mjs   (Backend/scripts/deploy/ — READ-ONLY
        │                         against MongoDB; local script, run by a
        │                         developer/operator whenever the Redirect
        │                         collection changes and a fresh deploy
        │                         is needed)
        │
        ▼
redirect-function.generated.js   (this directory — a plain embedded
        │                         object literal + a CloudFront-Functions-
        │                         compatible `handler(event)`; no AWS SDK
        │                         calls, no network access, no MongoDB
        │                         access at runtime)
        │
        ▼
 (future, AWS-provisioning step, NOT part of this tooling)
        │
        ▼
CloudFront Function, attached to the distribution's viewer-request event
        │
        ▼
      S3 (frontend static origin)
```

MongoDB/the admin Redirect screen remains the single authoring source of
truth regardless of which runtime ultimately consumes the data — the
existing Express `redirectMiddleware` and this generated CloudFront
Function are just two different consumers of the same collection.

## Files in this directory

- `redirect-function.generated.js` — the CloudFront Function source. **Do
  not hand-edit.** Regenerate it instead (see below).
- `redirect-map.generated.json` — the same redirect data as plain JSON, for
  diffing between generations and for the local test harness. Also
  generated, also not hand-edited.

Both files are regenerated in full every run; neither is meant to carry
manual changes forward.

## Workflow

1. Edit redirects as usual, via the existing admin Redirect CRUD screen (no
   change to that workflow at all).
2. Regenerate the local artifacts:
   ```
   cd Backend
   node scripts/deploy/generate-redirect-manifest.mjs
   ```
   This connects to MongoDB using the project's existing configuration
   (`MONGODB_URI`, via `connectDb()`), reads every `Redirect` document,
   validates the full set, and overwrites the two files in this directory.
   It never writes to MongoDB and never touches AWS.
3. Validate the result locally, with no AWS access required:
   ```
   node scripts/deploy/test-redirect-manifest.mjs
   ```
   This loads the generated function in a sandboxed Node VM and exercises
   it against every live rule plus a set of named edge cases (see
   "Testing" below).
4. (Not part of this tooling) Once AWS/CloudFront is provisioned, the
   generated `redirect-function.generated.js` is what gets attached to the
   distribution's viewer-request event — a manual AWS console/CLI/IaC step,
   deliberately not automated by anything here.

## Validation (fails loudly, never silently repairs)

Before writing any file, the generator checks every `Redirect` document for:

- empty/missing `fromPath` or `toPath`
- `statusCode` outside the schema's own enum (`301`/`302`)
- duplicate `fromPath`
- self-loop (`fromPath === toPath`)
- direct two-rule reversal (A→B and B→A both present)
- redirect chains (a rule's `toPath` is itself another rule's `fromPath`)

Any failure aborts generation with a non-zero exit code and a clear
per-issue message. No partial or "best effort" file is ever written.

## Matching semantics (must not be changed without re-approving the
underlying decision — these mirror the existing Express middleware exactly)

- **Exact match only** — no wildcard/prefix matching, consistent with Week
  3 Decision W3-3 already governing `redirectMiddleware.js`.
- **Case-sensitive** — `/Team/` does not match a rule for `/team/`.
- **No trailing-slash normalization** — `/team` and `/team/` are distinct
  keys; only the exact stored `fromPath` matches.
- **Query string ignored for matching, and never forwarded** to the
  redirect target — CloudFront delivers `event.request.uri` without the
  query string already, so this requires no extra code; it is a property
  of the CloudFront Functions runtime contract, not something this function
  implements itself.
- **Percent-encoding is matched literally** — CloudFront delivers
  `event.request.uri` already percent-encoded as received, and this
  function neither decodes nor re-encodes it. This is consistent with
  AWS's documented CloudFront Functions behavior, but has not been
  independently re-verified against a real CloudFront distribution, since
  that would require live AWS access out of scope for this local-only task.
- **No match → passthrough** — the original `request` object is returned
  unchanged, so CloudFront continues on to the S3 origin normally.

## Testing

`Backend/scripts/deploy/test-redirect-manifest.mjs` is a local-only harness
(no AWS, no MongoDB) that loads the generated function in a sandboxed Node
`vm` context and calls its `handler()` directly with hand-built mock
`event` objects. It currently checks:

- every one of the 51 live redirect rules, for an exact statusCode/location match
- `/team/` and `/leadership/` resolving distinctly and correctly
- `/privacy` and `/terms` passing through unchanged (they have no legacy
  `fromPath` rule — they were added as sitemap entries only, not redirects)
- `/media/` and a donation-legacy path (`/vidya_danam_dm/`)
- one plain-ASCII blog redirect and one percent-encoded Sanskrit blog
  redirect, including proving the **decoded** form of that same URI does
  *not* match (confirms no decoding happens)
- a completely unmatched path (passthrough)
- `/team` (no trailing slash) **not** matching `/team/`'s rule
- `/TEAM/` (uppercase) **not** matching `/team/`'s rule (case-sensitivity)
- a matched path with a query string attached — redirects correctly and the
  query string is not present in the resulting `location`

All 64 checks currently pass. This proves the generated handler behaves as
designed when run locally in Node; it has not been verified against a real
CloudFront distribution, which would require AWS access out of scope here.

## Size vs. CloudFront Functions platform constraints

The generated function is currently **~7.3 KB** (51 rules). CloudFront
Functions enforces a **10 KB** limit on the deployed function source. At
current scale this fits comfortably, with roughly 2.7 KB of headroom
remaining — no redesign for hypothetical future growth has been made here,
per scope; if the Redirect collection grows substantially (several hundred+
more rules), that headroom should be re-checked before relying on this
approach, but that is a future concern, not a current constraint.

## Safety

- This tooling makes **zero** AWS calls — no SDK, no credentials, no
  network calls to any AWS endpoint.
- The generator script only ever **reads** the `Redirect` collection; it
  never creates, updates, or deletes any MongoDB document.
- No secrets or credentials appear in either generated file or in this
  README — the generated files contain only `fromPath`/`toPath`/`statusCode`
  values already visible in the existing admin Redirect screen.
- Nothing in this directory is deployed automatically by anything in this
  repository. Attaching the generated function to a real CloudFront
  distribution remains a manual, later, AWS-side step.
