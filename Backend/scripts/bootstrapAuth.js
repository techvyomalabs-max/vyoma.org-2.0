import { pathToFileURL } from 'node:url';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { RoleModel } from '../src/modules/auth/role.model.js';
import { UserModel } from '../src/modules/auth/user.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';

// Phase 2 Decision D8: 2 roles at launch, data-driven so more can be added
// later without touching code. super_admin gets '*' (everything, including
// user/role management and audit-log access); admin gets full CRUD on the
// day-to-day modules only.
const ROLES = [
  { key: 'super_admin', name: 'Super Admin', permissions: ['*'], mfaRequired: true },
  {
    key: 'admin',
    name: 'Admin',
    permissions: [
      'content:read', 'content:write',
      'forms:read', 'forms:write',
      'donations:read', 'donations:write',
      'media:read', 'media:write',
      'redirects:read', 'redirects:write',
      'settings:read', 'settings:write',
      'blog:read', 'blog:write',
    ],
    mfaRequired: false,
  },
];

export async function seedRoles() {
  for (const role of ROLES) {
    // eslint-disable-next-line no-await-in-loop
    await RoleModel.findOneAndUpdate({ key: role.key }, role, { upsert: true, new: true });
  }
}

// Creates the first Super Admin if BOOTSTRAP_ADMIN_EMAIL/PASSWORD are set.
// Gated on whether ANY super_admin exists yet — not just a matching email —
// so leaving BOOTSTRAP_ADMIN_* set in production after go-live is inert
// rather than a standing "resurrect this account with the original password"
// backdoor if that one admin is ever deleted. Once a Super Admin exists,
// every subsequent user is created via the admin API by an existing one.
export async function bootstrapSuperAdmin() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[bootstrap] BOOTSTRAP_ADMIN_EMAIL/PASSWORD not set — skipping Super Admin creation.');
    return null;
  }

  const anySuperAdmin = await UserModel.exists({ roleKey: 'super_admin' });
  if (anySuperAdmin) {
    console.log(
      '[bootstrap] A Super Admin already exists — skipping. ' +
        'Remove BOOTSTRAP_ADMIN_EMAIL/PASSWORD from this environment now; they no longer do anything.'
    );
    return null;
  }

  const user = await UserModel.create({
    name: process.env.BOOTSTRAP_ADMIN_NAME || 'Super Admin',
    email: email.toLowerCase().trim(),
    passwordHash: await hashPassword(password),
    roleKey: 'super_admin',
    status: 'active',
  });
  console.log(`[bootstrap] Created Super Admin: ${user.email}`);
  return user;
}

async function main() {
  await connectDb();
  await seedRoles();
  await bootstrapSuperAdmin();
  await disconnectDb();
  process.exit(0);
}

// Cross-platform "was this file run directly" check — a plain string
// comparison against process.argv[1] breaks on Windows (backslash paths vs.
// the file:// URL's forward slashes), which silently no-op'd this script.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[bootstrap] failed:', err);
    process.exit(1);
  });
}
