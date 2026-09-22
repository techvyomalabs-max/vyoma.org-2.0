import { createApp } from './app.js';
import { connectDb } from './config/db.js';
import { env, isAuthSecretConfigured } from './config/env.js';
import { ContentModel } from './modules/content/content.model.js';
import { RoleModel } from './modules/auth/role.model.js';
import { runSeed } from '../scripts/runSeed.js';
import { seedRoles, bootstrapSuperAdmin } from '../scripts/bootstrapAuth.js';

async function main() {
  if (env.nodeEnv === 'production' && !isAuthSecretConfigured()) {
    throw new Error(
      'JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be set in production — refusing to boot with dev-insecure defaults.'
    );
  }

  await connectDb();

  // Auto-seed only when the database is completely empty. In practice this
  // only fires for the ephemeral in-memory fallback (a fresh instance every
  // process start) — a real, already-seeded MongoDB is never touched here.
  const count = await ContentModel.countDocuments();
  if (count === 0) {
    console.log('[server] database is empty — auto-seeding from mock data...');
    const result = await runSeed();
    console.log(`[server] seeded ${result.contentTypes} content types, ${result.donationSchemes} donation schemes`);
  }

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
