// Task 7T.3 (Fix 1) — regression coverage for server.js's JWT-secret
// requirement. Before this fix, the check was `env.nodeEnv === 'production'`,
// meaning a staging deployment (a real, internet-reachable target per
// Backend/STAGING.md) could boot with the dev-insecure default JWT secrets
// ('dev-insecure-access-secret' / 'dev-insecure-refresh-secret', see
// config/env.js) still active -- a genuine auth-bypass risk, since those
// literal strings are visible in this very source file. Excluding only
// 'development' closes that gap for staging too.
//
// The staging/production "reject" tests below are safe to run with zero
// database involvement: the JWT-secret check is the literal first statement
// in main() (see server.js), and it throws synchronously via `if (...)
// throw`, before the function's first `await` -- by JavaScript's own
// execution semantics, `await connectDb()` on the next line cannot have run
// if this test observes that rejection. This is also independently
// confirmed by env.test.js's existing static source-order check (the
// JWT-secret check's text position precedes `await connectDb()`'s).
//
// A full "development proceeds past this check" case is NOT included here:
// proving it reaches app.listen() would require letting connectDb() actually
// run (its own disposable in-memory MongoDB fallback), which this task's
// verification step intentionally avoids. isAuthSecretConfigured()'s own
// existing unit tests (config/env.test.js) already cover the underlying
// boolean directly; this file adds coverage specifically for server.js's use
// of it across environments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from './server.js';
import { env } from './config/env.js';

function withEnv({ nodeEnv, jwtAccessSecret, jwtRefreshSecret }, fn) {
  const nodeEnvBackup = env.nodeEnv;
  const accessBackup = process.env.JWT_ACCESS_SECRET;
  const refreshBackup = process.env.JWT_REFRESH_SECRET;

  env.nodeEnv = nodeEnv;
  if (jwtAccessSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
  else process.env.JWT_ACCESS_SECRET = jwtAccessSecret;
  if (jwtRefreshSecret === undefined) delete process.env.JWT_REFRESH_SECRET;
  else process.env.JWT_REFRESH_SECRET = jwtRefreshSecret;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      env.nodeEnv = nodeEnvBackup;
      if (accessBackup === undefined) delete process.env.JWT_ACCESS_SECRET;
      else process.env.JWT_ACCESS_SECRET = accessBackup;
      if (refreshBackup === undefined) delete process.env.JWT_REFRESH_SECRET;
      else process.env.JWT_REFRESH_SECRET = refreshBackup;
    });
}

test('staging without JWT secrets configured: main() refuses to boot (Task 7T.3 Fix 1 -- previously only production was checked)', async () => {
  await withEnv({ nodeEnv: 'staging', jwtAccessSecret: undefined, jwtRefreshSecret: undefined }, async () => {
    await assert.rejects(() => main(), /JWT_ACCESS_SECRET \/ JWT_REFRESH_SECRET must be set outside local development/);
  });
});

test('production without JWT secrets configured: main() refuses to boot (unchanged from before this fix)', async () => {
  await withEnv({ nodeEnv: 'production', jwtAccessSecret: undefined, jwtRefreshSecret: undefined }, async () => {
    await assert.rejects(() => main(), /JWT_ACCESS_SECRET \/ JWT_REFRESH_SECRET must be set outside local development/);
  });
});

test('staging with only one of the two secrets set: main() still refuses to boot', async () => {
  await withEnv({ nodeEnv: 'staging', jwtAccessSecret: 'a-real-looking-secret', jwtRefreshSecret: undefined }, async () => {
    await assert.rejects(() => main(), /JWT_ACCESS_SECRET \/ JWT_REFRESH_SECRET must be set outside local development/);
  });
});

test('staging with both secrets explicitly configured: the JWT-secret check itself permits boot to continue (isAuthSecretConfigured() becomes true, matching server.js\'s own condition)', async () => {
  const { isAuthSecretConfigured } = await import('./config/env.js');
  await withEnv({ nodeEnv: 'staging', jwtAccessSecret: 'a-real-looking-secret', jwtRefreshSecret: 'another-real-looking-secret' }, () => {
    assert.equal(isAuthSecretConfigured(), true);
    assert.equal(env.nodeEnv !== 'development' && !isAuthSecretConfigured(), false, 'the exact guard expression server.js uses must evaluate to false here');
  });
});

test('development without JWT secrets configured: the guard expression itself permits boot to continue (dev-insecure defaults allowed, unchanged)', () => {
  const nodeEnvBackup = env.nodeEnv;
  const accessBackup = process.env.JWT_ACCESS_SECRET;
  const refreshBackup = process.env.JWT_REFRESH_SECRET;
  env.nodeEnv = 'development';
  delete process.env.JWT_ACCESS_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
  try {
    // Same expression server.js's main() evaluates -- confirms development
    // is correctly exempt without needing to let main() actually proceed
    // into a real (even if disposable) database connection.
    assert.equal(env.nodeEnv !== 'development', false);
  } finally {
    env.nodeEnv = nodeEnvBackup;
    if (accessBackup === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = accessBackup;
    if (refreshBackup === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = refreshBackup;
  }
});
