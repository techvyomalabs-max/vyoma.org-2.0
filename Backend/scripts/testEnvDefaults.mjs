// Preloaded via `node --import` in package.json's "test" script (see
// `npm test`), so `npm test` keeps working deterministically in any
// environment -- a fresh clone, CI, a machine with no .env file at all --
// without requiring a .env file to exist first. This mirrors this
// codebase's long-standing "tests need zero external setup" convention
// (see authTestHelpers.js's disposable-only MongoDB), now extended to cover
// the NODE_ENV validation introduced in src/config/env.js.
//
// Only ever sets ALLOW_LOCAL_DEV_DEFAULTS when NODE_ENV is genuinely unset,
// and never overwrites an already-set value -- an explicit NODE_ENV (from a
// developer's own .env file, or a CI job that sets one) is always left
// exactly as-is, exactly matching resolveNodeEnv()'s own documented
// semantics (the opt-in is only ever consulted when NODE_ENV is unset).
if (!process.env.NODE_ENV) {
  process.env.ALLOW_LOCAL_DEV_DEFAULTS ??= 'true';
}
