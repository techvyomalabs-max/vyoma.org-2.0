// Task 7L — single source of truth for (a) whether server-side data-fetching
// code may fall back to local mock data, and (b) resolving the real backend
// API base URL. Before this, five service files
// (contentService.js, blogService.js, donationService.js, formService.js,
// settingsService.js) each independently defined their own
// `const USE_MOCK = process.env.NEXT_PUBLIC_API_BASE_URL == null;`, and
// three more (apiClient.js, lib/adminAuthApi.js, app/api/draft/route.js)
// each independently defined their own
// `process.env.NEXT_PUBLIC_API_BASE_URL || '<fallback>'` -- eight
// independent copies of the same safety-relevant decision, none of which
// ever checked whether the app was actually running in production.
//
// Root cause this closes: NEXT_PUBLIC_API_BASE_URL being unset was treated
// as unconditional proof of "local development, use mock data" -- which is
// true for an intentionally zero-setup local dev environment, but equally
// true of a genuinely misconfigured production deployment that simply
// forgot to set this one variable. Nothing anywhere checked which situation
// was real, so a misconfigured production build would silently serve
// invented mock content to real visitors with no error, no warning, and no
// visible difference from a correctly-configured one.
//
// Next.js sets NODE_ENV to 'production' automatically and unconditionally
// for every `next build`/`next start` (including a staging/preview
// deployment built the same way) -- no separate opt-in is needed to detect
// this, unlike the Backend's src/config/env.js, which needed its own
// explicit NODE_ENV validation specifically because it supports a distinct
// 'staging' value and otherwise defaults an unset NODE_ENV to 'development'
// for local convenience. That distinction doesn't exist here: Next.js's own
// automatic NODE_ENV is already exactly the signal needed.
//
// Both functions accept an injectable `env` (default: process.env) --
// mirroring this project's own established convention for this exact kind
// of check (Backend/src/config/env.js's resolveNodeEnv(source = process.env),
// Backend/scripts/wordpress/inventory/disposableDbTarget.mjs's
// requireDisposableDbTarget(envObject = process.env)) -- specifically so
// this can be unit-tested with controlled inputs, and so callers read
// process.env fresh on every call rather than caching a decision once at
// module-import time (the same "computed once, stale thereafter" trap
// Backend's env.mongodbUri had -- see migrationDb.mjs's Task 7H.2A fix for
// the exact same class of issue on the Backend side of this engagement).

// Task 7D.11 — confirmed by REAL browser testing (never caught by any
// prior unit or HTTP-only test in this engagement, since none of them ran
// actual post-hydration client-side JavaScript): `env = process.env` as a
// default parameter -- or passing the bare `process.env` reference in as an
// argument, as adminAuthApi.js and app/api/draft/route.js used to -- does
// NOT get Next.js's build-time NEXT_PUBLIC_*/NODE_ENV inlining applied to
// it. That inlining only recognizes the literal, static expression
// `process.env.SPECIFIC_NAME` wherever it appears textually in a file's own
// source; a *reference* to the whole `process.env` object, threaded through
// a variable or a function parameter, is invisible to it. In a real browser
// there is no `process` global at all (confirmed directly: evaluating
// `process` in this app's actual client bundle throws "process is not
// defined"), so on the client, `env` silently became an effectively-empty
// object on every call across the entire app -- `env.NODE_ENV` was never
// truthfully 'production' and `env.NEXT_PUBLIC_API_BASE_URL` was always
// undefined, REGARDLESS of real configuration, in every client-side (`'use
// client'`) component that calls these functions: the public contact form,
// the newsletter signup, the CSR projects board, the donate page's
// QuickDonate widget, and the entire admin dashboard's authentication layer
// (lib/adminAuthApi.js). Concretely, this meant `shouldUseMockData()`
// returned `true` client-side in every real deployment -- including
// production -- defeating the exact protection Task 7L built this module
// for: submitForm() (services/formService.js) fabricated a fake
// `{success: true}` response after a 400ms delay and NEVER sent the
// submission to the real backend at all; `resolveApiBase()` silently
// returned each caller's hardcoded dev fallback instead of the real
// configured backend.
//
// Fixed by writing the default `env` value as an object literal built
// directly from the two specific `process.env.X` expressions, instead of
// the whole `process.env` object -- each one individually matches the
// exact literal pattern Next.js's client-bundle inlining looks for, so both
// are correctly replaced with their real build-time values in the compiled
// client bundle. Deliberately kept as each function's own default
// *parameter expression* (evaluated fresh on every call that omits the
// argument -- standard JS semantics, not cached) rather than hoisted to a
// module-level constant: this module's own existing tests
// (apiConfig.test.mjs's "defaults to reading the real process.env when no
// env object is passed") mutate process.env directly between two calls and
// expect each call to see the new value, which a module-level constant
// would have broken. Existing tests that pass their own explicit `env`
// object are unaffected either way (an explicit argument always overrides
// a default parameter, regardless of what the default computes to).

// Mock data is permitted only outside production, and only when no real API
// base URL is configured -- preserving today's zero-setup local-dev
// convenience (no .env file needed to run `npm run dev`) exactly as before,
// while making it categorically impossible in production regardless of
// what NEXT_PUBLIC_API_BASE_URL is or isn't set to.
export function shouldUseMockData(env = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL }) {
  if (env.NODE_ENV === 'production') return false;
  return !env.NEXT_PUBLIC_API_BASE_URL;
}

// Resolves the real API base URL. In production, a missing
// NEXT_PUBLIC_API_BASE_URL is a fatal configuration error -- thrown
// immediately, naming only the missing variable (never a URL, credential,
// or other sensitive value) -- rather than silently falling back to any
// default. Outside production, `devFallback` preserves each existing
// caller's own already-established convenience default (apiClient.js and
// documentLinks.js use a same-origin-relative '/api/v1'; adminAuthApi.js and
// app/api/draft/route.js use an absolute local Backend URL, since the admin
// UI/draft-preview flow calls a different origin by design).
export function resolveApiBase(env = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL }, devFallback = '/api/v1') {
  if (env.NEXT_PUBLIC_API_BASE_URL) return env.NEXT_PUBLIC_API_BASE_URL;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_API_BASE_URL is not configured. The production site must never fall back to a default API URL or to mock content -- set this environment variable to the real backend API base URL before deploying.'
    );
  }
  return devFallback;
}
