// Shared, disposable-only test infrastructure for the auth/MFA/RBAC
// regression suite (auth.login.test.js, auth.jwt.test.js, auth.mfa.test.js,
// auth.session.test.js, auth.rbac.test.js). Not itself a *.test.js file, so
// `node --test src/**/*.test.js` never picks it up as a suite.
//
// Every test file gets its own throwaway MongoMemoryServer instance (same
// pattern already used by blogPost.model.minimize.test.js) — never the real,
// persistent development database. seedRoles() is the actual production
// role-seeding code (scripts/bootstrapAuth.js), reused here so the
// super_admin/admin permission lists tested against can't drift out of sync
// with what really ships; bootstrapSuperAdmin() is deliberately NOT called
// (it's gated on real BOOTSTRAP_ADMIN_* env vars) — test users are created
// directly instead, so no real administrator account is ever touched.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { UserModel } from './user.model.js';
import { hashPassword } from './auth.service.js';
import { seedRoles } from '../../../scripts/bootstrapAuth.js';
import { createApp } from '../../app.js';

export const TEST_PASSWORD = 'TestPassword123!';

export async function setupTestEnv() {
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  await seedRoles();

  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  return { mem, server, baseUrl: `http://127.0.0.1:${port}` };
}

export async function teardownTestEnv({ mem, server }) {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mem.stop();
}

let counter = 0;
export async function createTestUser(overrides = {}) {
  counter += 1;
  const { roleKey = 'admin', password = TEST_PASSWORD, ...rest } = overrides;
  return UserModel.create({
    name: 'Test User',
    email: `test-user-${counter}-${Date.now()}@example.test`,
    passwordHash: await hashPassword(password),
    roleKey,
    status: 'active',
    ...rest,
  });
}

// Pulls one cookie's "name=value" pair out of a fetch Response's Set-Cookie
// header(s), ready to forward as a plain `Cookie` request header on a
// subsequent fetch (Node's fetch has no built-in cookie jar).
export function extractCookie(res, name) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const match = raw.find((c) => c.startsWith(`${name}=`));
  return match ? match.split(';')[0] : null;
}
