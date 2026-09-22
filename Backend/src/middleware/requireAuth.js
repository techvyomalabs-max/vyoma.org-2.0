import { verifyAccessToken } from '../modules/auth/auth.service.js';
import { ApiError } from '../utils/apiResponse.js';

// LLD Section 16: role-guard middleware. Reads the access token from
// Authorization: Bearer <token> and attaches { id, email, roleKey, permissions }
// to req.user. Does not hit the database — see auth.service.signAccessToken
// for why the permission snapshot is embedded in the token.
export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Missing or malformed Authorization header.'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, roleKey: payload.roleKey, permissions: payload.permissions || [] };
    return next();
  } catch {
    return next(new ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired.'));
  }
}
