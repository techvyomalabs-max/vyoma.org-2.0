// Regression coverage for env.js's configuration predicates. Mutates the
// already-imported `env` object directly (same pattern already used by
// s3.adapter.test.js for env.s3.*) rather than re-importing the module with
// different process.env values -- env.js builds its `env` object once at
// import time, so this is the established way to exercise different
// configuration combinations in this codebase without process restarts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, isSmtpConfigured, isMockContentSeedAllowed, resolveNodeEnv, isAuthSecretConfigured } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function withOverrides(overrides, fn) {
  const smtpBackup = { ...env.smtp };
  const nodeEnvBackup = env.nodeEnv;
  const allowMockBackup = env.allowMockContentSeed;
  try {
    if (overrides.smtp) Object.assign(env.smtp, overrides.smtp);
    if ('nodeEnv' in overrides) env.nodeEnv = overrides.nodeEnv;
    if ('allowMockContentSeed' in overrides) env.allowMockContentSeed = overrides.allowMockContentSeed;
    return fn();
  } finally {
    Object.assign(env.smtp, smtpBackup);
    env.nodeEnv = nodeEnvBackup;
    env.allowMockContentSeed = allowMockBackup;
  }
}

// --- isSmtpConfigured() ---

test('isSmtpConfigured returns true when host, port, user, pass, and from are all set', () => {
  withOverrides({ smtp: { host: 'smtp.example.test', port: 587, user: 'u', pass: 'p', from: 'noreply@vyoma.org' } }, () => {
    assert.equal(isSmtpConfigured(), true);
  });
});

test('isSmtpConfigured returns false when SMTP_FROM is missing, even with host/port/user/pass all set', () => {
  withOverrides({ smtp: { host: 'smtp.example.test', port: 587, user: 'u', pass: 'p', from: null } }, () => {
    assert.equal(isSmtpConfigured(), false);
  });
});

test('isSmtpConfigured returns false when any connection setting is missing', () => {
  withOverrides({ smtp: { host: null, port: 587, user: 'u', pass: 'p', from: 'noreply@vyoma.org' } }, () => {
    assert.equal(isSmtpConfigured(), false);
  });
});

// --- isMockContentSeedAllowed() ---

test('mock-content seeding defaults to allowed in development (no explicit override)', () => {
  withOverrides({ nodeEnv: 'development', allowMockContentSeed: null }, () => {
    assert.equal(isMockContentSeedAllowed(), true);
  });
});

test('mock-content seeding defaults to NOT allowed in staging (no explicit override)', () => {
  withOverrides({ nodeEnv: 'staging', allowMockContentSeed: null }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

test('mock-content seeding defaults to NOT allowed in production (no explicit override)', () => {
  withOverrides({ nodeEnv: 'production', allowMockContentSeed: null }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

test('ALLOW_MOCK_CONTENT_SEED=true explicitly opts staging in', () => {
  withOverrides({ nodeEnv: 'staging', allowMockContentSeed: 'true' }, () => {
    assert.equal(isMockContentSeedAllowed(), true);
  });
});

test('ALLOW_MOCK_CONTENT_SEED=false explicitly opts development out', () => {
  withOverrides({ nodeEnv: 'development', allowMockContentSeed: 'false' }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

// --- Production is an ABSOLUTE floor: no value of ALLOW_MOCK_CONTENT_SEED
// can enable mock-content seeding when NODE_ENV=production. ---

test('production NEVER allows mock-content seeding, even with ALLOW_MOCK_CONTENT_SEED=true', () => {
  withOverrides({ nodeEnv: 'production', allowMockContentSeed: 'true' }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

test('production does not allow mock-content seeding with ALLOW_MOCK_CONTENT_SEED=false (redundant with the default, but must still hold)', () => {
  withOverrides({ nodeEnv: 'production', allowMockContentSeed: 'false' }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

test('production does not allow mock-content seeding with ALLOW_MOCK_CONTENT_SEED unset (the default)', () => {
  withOverrides({ nodeEnv: 'production', allowMockContentSeed: null }, () => {
    assert.equal(isMockContentSeedAllowed(), false);
  });
});

// --- resolveNodeEnv() ---
//
// Called directly with a controlled `source` object (resolveNodeEnv's own
// dependency-injection seam) rather than mutating process.env -- this
// exercises the actual validation/throwing logic in isolation, independent
// of env.js's own module-load-time evaluation (which already succeeded by
// the time this test file runs, via the real process.env it was loaded
// with).

test('resolveNodeEnv accepts NODE_ENV=development', () => {
  assert.equal(resolveNodeEnv({ NODE_ENV: 'development' }), 'development');
});

test('resolveNodeEnv accepts NODE_ENV=staging', () => {
  assert.equal(resolveNodeEnv({ NODE_ENV: 'staging' }), 'staging');
});

test('resolveNodeEnv accepts NODE_ENV=production', () => {
  assert.equal(resolveNodeEnv({ NODE_ENV: 'production' }), 'production');
});

test('resolveNodeEnv throws when NODE_ENV is unset and ALLOW_LOCAL_DEV_DEFAULTS is not set', () => {
  assert.throws(() => resolveNodeEnv({}), /NODE_ENV is not set/);
});

test('resolveNodeEnv throws when NODE_ENV is an empty string, with no opt-in', () => {
  assert.throws(() => resolveNodeEnv({ NODE_ENV: '' }), /NODE_ENV is not set/);
});

test('resolveNodeEnv resolves to development when NODE_ENV is unset and ALLOW_LOCAL_DEV_DEFAULTS=true', () => {
  assert.equal(resolveNodeEnv({ ALLOW_LOCAL_DEV_DEFAULTS: 'true' }), 'development');
});

test('resolveNodeEnv throws on an invalid/unrecognized NODE_ENV value', () => {
  assert.throws(() => resolveNodeEnv({ NODE_ENV: 'testing' }), /not a supported value/);
  assert.throws(() => resolveNodeEnv({ NODE_ENV: 'prod' }), /not a supported value/);
});

test('resolveNodeEnv throws on an invalid NODE_ENV value even with ALLOW_LOCAL_DEV_DEFAULTS=true -- the opt-in never rescues an invalid value', () => {
  assert.throws(() => resolveNodeEnv({ NODE_ENV: 'testing', ALLOW_LOCAL_DEV_DEFAULTS: 'true' }), /not a supported value/);
});

test('resolveNodeEnv with NODE_ENV=staging ignores ALLOW_LOCAL_DEV_DEFAULTS=true -- the opt-in never overrides an explicitly-set mode', () => {
  assert.equal(resolveNodeEnv({ NODE_ENV: 'staging', ALLOW_LOCAL_DEV_DEFAULTS: 'true' }), 'staging');
});

test('resolveNodeEnv with NODE_ENV=production ignores ALLOW_LOCAL_DEV_DEFAULTS=true -- the opt-in never overrides an explicitly-set mode', () => {
  assert.equal(resolveNodeEnv({ NODE_ENV: 'production', ALLOW_LOCAL_DEV_DEFAULTS: 'true' }), 'production');
});

// --- Production JWT-secret enforcement (server.js's existing boot-refusal
// check) remains intact and is no longer reachable via an accidentally
// -unset NODE_ENV, now that env.nodeEnv is always resolveNodeEnv()'s
// validated result. ---

function withJwtSecrets(overrides, fn) {
  const accessBackup = process.env.JWT_ACCESS_SECRET;
  const refreshBackup = process.env.JWT_REFRESH_SECRET;
  try {
    if ('JWT_ACCESS_SECRET' in overrides) process.env.JWT_ACCESS_SECRET = overrides.JWT_ACCESS_SECRET;
    else delete process.env.JWT_ACCESS_SECRET;
    if ('JWT_REFRESH_SECRET' in overrides) process.env.JWT_REFRESH_SECRET = overrides.JWT_REFRESH_SECRET;
    else delete process.env.JWT_REFRESH_SECRET;
    return fn();
  } finally {
    if (accessBackup === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = accessBackup;
    if (refreshBackup === undefined) delete process.env.JWT_REFRESH_SECRET;
    else process.env.JWT_REFRESH_SECRET = refreshBackup;
  }
}

test('isAuthSecretConfigured is false when either JWT secret is missing', () => {
  withJwtSecrets({ JWT_ACCESS_SECRET: 'a' }, () => {
    assert.equal(isAuthSecretConfigured(), false);
  });
  withJwtSecrets({ JWT_REFRESH_SECRET: 'b' }, () => {
    assert.equal(isAuthSecretConfigured(), false);
  });
});

test('isAuthSecretConfigured is true when both JWT secrets are set', () => {
  withJwtSecrets({ JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'b' }, () => {
    assert.equal(isAuthSecretConfigured(), true);
  });
});

test('the motivating compound scenario is now closed: production can no longer be reached via an accidentally-unset NODE_ENV, so the JWT-secret check can no longer be silently skipped that way', () => {
  // Before this fix, an unset NODE_ENV silently resolved to 'development',
  // meaning server.js's `env.nodeEnv === 'production'` check was always
  // false for a deployment that forgot to set NODE_ENV -- skipping the
  // JWT-secret requirement entirely. Now, an unset NODE_ENV (without the
  // local-only opt-in) refuses to resolve to anything at all.
  assert.throws(() => resolveNodeEnv({}), /NODE_ENV is not set/);
  // And the only way to reach 'production' is to set it explicitly -- which
  // is exactly the value server.js's existing check compares against.
  assert.equal(resolveNodeEnv({ NODE_ENV: 'production' }), 'production');
});

test('server.js still refuses to boot in production without JWT secrets configured, and validates configuration before connecting to the database or listening', () => {
  const serverSource = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  assert.match(serverSource, /env\.nodeEnv === 'production' && !isAuthSecretConfigured\(\)/);

  // Ordering: the JWT-secret check must appear before connectDb(), which
  // must appear before maybeAutoSeedMockContent()/seedRoles()/
  // bootstrapSuperAdmin(), which must appear before app.listen().
  const jwtCheckIndex = serverSource.indexOf("env.nodeEnv === 'production'");
  const connectDbIndex = serverSource.indexOf('await connectDb()');
  const seedIndex = serverSource.indexOf('maybeAutoSeedMockContent(');
  const bootstrapIndex = serverSource.indexOf('bootstrapSuperAdmin()');
  const listenIndex = serverSource.indexOf('app.listen(');
  assert.ok(jwtCheckIndex >= 0 && connectDbIndex >= 0 && seedIndex >= 0 && bootstrapIndex >= 0 && listenIndex >= 0);
  assert.ok(
    jwtCheckIndex < connectDbIndex && connectDbIndex < seedIndex && seedIndex < bootstrapIndex && bootstrapIndex < listenIndex,
    'expected order: JWT-secret check -> connectDb -> mock-content seeding -> role/admin bootstrap -> app.listen'
  );
});
