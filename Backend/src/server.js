import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env, isAuthSecretConfigured } from './config/env.js';
import { ContentModel } from './modules/content/content.model.js';
import { RoleModel } from './modules/auth/role.model.js';
import { runSeed } from '../scripts/runSeed.js';
import { seedRoles, bootstrapSuperAdmin } from '../scripts/bootstrapAuth.js';
import { maybeAutoSeedMockContent } from './startup/autoSeedMockContent.js';
import { createGracefulShutdown } from './shutdown.js';

// Exported (and the auto-run below guarded to only fire when this file is
// executed directly, not imported -- same pattern already used by
// scripts/bootstrapAuth.js) so shutdown.test.js can call main() directly to
// exercise the startup-failure cleanup path against a disposable in-memory
// MongoDB, without this module's own auto-run firing a second, real,
// uncontrolled server startup as a side effect of merely importing it.
export async function main() {
  // Task 7T.3 (Fix 1): was `env.nodeEnv === 'production'` -- staging is a
  // real, internet-reachable deployment target too (see Backend/STAGING.md),
  // and the dev-insecure default JWT secrets ('dev-insecure-access-secret' /
  // 'dev-insecure-refresh-secret', see config/env.js) being usable there was
  // a genuine auth-bypass risk: anyone who reads this source could forge
  // valid tokens against a staging deployment that forgot to set these.
  // Excluding only 'development' (rather than requiring exactly
  // 'production') closes that gap for staging too, with no change to
  // production's existing behavior.
  if (env.nodeEnv !== 'development' && !isAuthSecretConfigured()) {
    throw new Error(
      'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be set outside local development — refusing to boot with dev-insecure defaults.'
    );
  }

  await connectDb();

  // Everything below this point runs after a real database connection has
  // already been established -- a failure in any of these steps must still
  // disconnect that connection before the process exits (and, in local
  // development, stop the in-memory MongoDB it may have spun up), rather
  // than relying solely on the OS to reclaim it on process exit.
  try {
    // Auto-seed only when the database is completely empty, AND only when
    // mock-content seeding is allowed for this environment (see
    // isMockContentSeedAllowed() in config/env.js) -- defaults to on for
    // local development, off for staging/production, overridable either way
    // via ALLOW_MOCK_CONTENT_SEED. In practice the "empty" case mostly fires
    // for the ephemeral in-memory fallback (a fresh instance every process
    // start); this guard exists specifically so a brand-new staging/
    // production MongoDB doesn't get silently populated with placeholder
    // mock content the first time the server connects to it.
    await maybeAutoSeedMockContent({ ContentModel, runSeed });

    // Roles are seeded independently of content (idempotent upsert either
    // way) so auth works even against a real, already-content-seeded Mongo
    // that predates the auth module.
    if ((await RoleModel.countDocuments()) === 0) {
      await seedRoles();
      console.log('[server] seeded auth roles (super_admin, admin)');
    }
    await bootstrapSuperAdmin();
  } catch (err) {
    console.error('[server] startup failed after the database connection was established — disconnecting before exit:', err);
    await disconnectDb().catch(() => {});
    throw err;
  }

  const app = createApp();
  // KNOWN LIMITATION (Phase 1 Task 4C, deliberately out of scope): app.listen()
  // itself can fail asynchronously (e.g. EADDRINUSE) by emitting an 'error'
  // event on the returned server, not by rejecting a promise or throwing --
  // neither this function's own try/catch above nor main().catch() below
  // observes that event. An async listen failure is therefore not covered by
  // the startup-failure cleanup (disconnectDb()) added in this task; it is
  // handled today only by Node's default behavior for an unhandled 'error'
  // event on an EventEmitter (which throws and crashes the process). Left
  // unaddressed here to keep this task's scope to the graceful-shutdown path
  // itself.
  const server = app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });

  // SIGINT (local Ctrl+C / dev interrupt) and SIGTERM (the platform's own
  // graceful-stop request) both trigger the exact same shutdown sequence —
  // only the logged signal name differs.
  const shutdown = createGracefulShutdown({ server, disconnectDb });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Only auto-runs when this file is executed directly (`node src/server.js`,
// which is exactly what `npm start`/`npm run dev` already do) -- never when
// it's imported, e.g. by shutdown.test.js to call main() directly. Same
// cross-platform "was this file run directly" check already established by
// scripts/bootstrapAuth.js.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[server] failed to start:', err);
    process.exit(1);
  });
}
