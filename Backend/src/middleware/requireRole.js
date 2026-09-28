import { ApiError } from '../utils/apiResponse.js';

// Must run after requireAuth. Two guards, both reading the token's embedded
// snapshot (no DB lookup):
// - requireRole(...keys): exact role match, e.g. requireRole('super_admin').
// - requirePermission(perm): '*' or an exact 'module:action' string match —
//   the data-driven half of Phase 2 Decision D8, so future roles narrower
//   than "admin" don't need new middleware, only a new Role document.
export function requireRole(...allowedRoleKeys) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Not authenticated.'));
    if (!allowedRoleKeys.includes(req.user.roleKey)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Your role does not have access to this resource.'));
    }
    return next();
  };
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Not authenticated.'));
    const perms = req.user.permissions || [];
    if (!perms.includes('*') && !perms.includes(permission)) {
      return next(new ApiError(403, 'FORBIDDEN', 'Your role does not have this permission.'));
    }
    return next();
  };
}
