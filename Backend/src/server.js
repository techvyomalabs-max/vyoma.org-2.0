import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env, isAuthSecretConfigured } from './config/env.js';
import { ContentModel } from './modules/content/content.model.js';
import { RoleModel } from './modules/auth/role.model.js';
import { runSeed } from '../scripts/runSeed.js';
import { seedRoles, bootstrapSuperAdmin } from '../scripts/bootstrapAuth.js';
import { maybeAutoSeedMockContent } from './startup/autoSeedMockContent.js';

async function main() {
  if (env.nodeEnv === 'production' && !isAuthSecretConfigured()) {
    throw new Error(
      'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be set in production — refusing to boot with dev-insecure defaults.'
    );
  }

  await connectDb();

  // Auto-seed only when the database is completely empty, AND only when
  // mock-content seeding is allowed for this environment (see
  // isMockContentSeedAllowed() in config/env.js) -- defaults to on for local
  // development, off for staging/production, overridable either way via
  // ALLOW_MOCK_CONTENT_SEED. In practice the "empty" case mostly fires for
  // the ephemeral in-memory fallback (a fresh instance every process start);
  // this guard exists specifically so a brand-new staging/production
  // MongoDB doesn't get silently populated with placeholder mock content
  // the first time the server connects to it.
  await maybeAutoSeedMockContent({ ContentModel, runSeed });

  // Roles are seeded independently of content (idempotent upsert either
  // way) so auth works even against a real, already-content-seeded Mongo
  // that predates the auth module.
  if ((await RoleModel.countDocuments()) === 0) {
    await seedRoles();
    console.log('[server] seeded auth roles (super_admin, admin)');
  }
  await bootstrapSuperAdmin();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});
