// Preloaded via `node --import` in package.json's "test" script (see
// `npm test`), so `npm test` keeps working deterministically in any
// environment -- a fresh clone, CI, a machine with no .env file at all --
// without requiring a .env file to exist first. This mirrors this
// codebase's long-standing "tests need zero external setup" convention
// (see authTestHelpers.js's disposable-only MongoDB), now extended to cover
// the NODE_ENV validation introduced in src/config/env.js.
//
// Task 7T.1A — loads `.env` itself, first, before either check below.
// `--import`-preloaded modules (this one included) finish running BEFORE
// src/config/env.js's own `import 'dotenv/config'` ever executes (that only
// happens once something later imports env.js) -- so without this, both
// checks below would silently see a pre-dotenv snapshot of process.env and
// miss anything (NODE_ENV, MONGODB_URI) that only exists in a committed or
// local Backend/.env file, which is exactly the real incident scenario this
// task addresses (see the MONGODB_URI check further below). dotenv never
// overwrites an already-set process.env value, so env.js's own later
// `import 'dotenv/config'` remains a harmless no-op either way.
await import('dotenv/config');

// Only ever sets ALLOW_LOCAL_DEV_DEFAULTS when NODE_ENV is genuinely unset,
// and never overwrites an already-set value -- an explicit NODE_ENV (from a
// developer's own .env file, or a CI job that sets one) is always left
// exactly as-is, exactly matching resolveNodeEnv()'s own documented
// semantics (the opt-in is only ever consulted when NODE_ENV is unset).
if (!process.env.NODE_ENV) {
  process.env.ALLOW_LOCAL_DEV_DEFAULTS ??= 'true';
}

// Task 7T.1A — added after an incident (Task 7T-SAFE) in which
// `node --import ./scripts/testEnvDefaults.mjs src/server.js` connected to
// the explicitly protected database `vyoma_migration_dryrun`, because this
// module's whole job -- making ad-hoc local execution "disposable by
// default" -- never actually touched MONGODB_URI at all: a real, persistent
// URI already present in the environment (e.g. loaded from a committed or
// local Backend/.env) passed through completely untouched and unexamined,
// silently defeating the "disposable" premise this file's own name
// promises.
//
// This check runs at import time -- i.e. before src/server.js's module body,
// connectDb(), or anything else loaded afterward via `--import` has a
// chance to run -- so it fails before any connection attempt, exactly like
// src/config/protectedDbGuard.js's own guard it reuses here. It takes no
// NODE_ENV input at all, so it cannot be bypassed by NODE_ENV=staging,
// NODE_ENV=test, or any other value, and it does not log or expose the URI.
if (process.env.MONGODB_URI) {
  const { assertSafeMongoConnectionUri } = await import('../src/config/protectedDbGuard.js');

  // The protected-name check runs unconditionally first and can never be
  // opted out of, regardless of the flag below -- this is the one
  // non-negotiable floor.
  assertSafeMongoConnectionUri(process.env.MONGODB_URI, { label: 'inherited test' });

  // Beyond the protected-name check, this module still refuses to silently
  // run against WHATEVER MongoDB a real MONGODB_URI happens to point at --
  // "not the one specifically protected database" is not the same claim as
  // "known to be disposable." An operator who has deliberately prepared a
  // genuinely throwaway local/CI MongoDB and wants this ad-hoc execution to
  // use it must say so explicitly, rather than this module silently
  // trusting an ambient value it did not choose and cannot verify.
  if (process.env.ALLOW_EXPLICIT_TEST_MONGODB_URI !== 'true') {
    throw new Error(
      'Refusing to proceed: MONGODB_URI is already set in this environment (e.g. from Backend/.env), and testEnvDefaults.mjs ' +
        'never silently trusts an inherited connection string. If this URI genuinely points at a disposable database you ' +
        'intend to use for this run, set ALLOW_EXPLICIT_TEST_MONGODB_URI=true to confirm that explicitly. Otherwise, unset ' +
        'MONGODB_URI so connectDb() falls back to its own disposable in-memory MongoDB instance.'
    );
  }
}
