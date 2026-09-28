import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { UserModel } from '../modules/auth/user.model.js';
import { ApiError } from '../utils/apiResponse.js';

// LLD Section 16: role-guard middleware. Reads the access token from
// Authorization: Bearer <token> and attaches { id, email, roleKey, permissions }
// to req.user. The role/permission snapshot itself still comes from the
// token (see auth.service.signAccessToken) — no DB round trip for that part.
//
// One DB check remains necessary: whether the account is still 'active'.
// Without it, a Super Admin disabling a user has no effect until that user's
// already-issued access token naturally expires (up to its ~15min TTL) —
// confirmed as a real gap during a Phase 2 Week 2 production-readiness
// checkpoint (disabling didn't revoke an already-issued access token, only
// the refresh token). A single indexed `.exists()` lookup on _id is the
// smallest fix that closes this without a second auth mechanism (e.g. a
// revocation/blocklist store) or giving up the stateless-access-token design.
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header.'));
  }

  try {
    const payload = verifyAccessToken(token);
    const isActive = await UserModel.exists({ _id: payload.sub, status: 'active' });
    if (!isActive) {
      return next(new ApiError(401, 'UNAUTHENTICATED', 'This account is no longer active.'));
    }
    req.user = { id: payload.sub, email: payload.email, roleKey: payload.roleKey, permissions: payload.permissions || [] };
    return next();
  } catch {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired.'));
  }
}
