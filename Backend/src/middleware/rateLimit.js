import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/apiResponse.js';

// LLD Section 16: rate limiting on form and donation endpoints.
//
// `keyGenerator` is optional and defaults to express-rate-limit's own
// built-in behavior (keyed by req.ip) when omitted -- every existing caller
// of this factory passes no keyGenerator, so their behavior is completely
// unchanged. It exists for endpoints that sit behind authentication (e.g.
// media uploads), where keying by authenticated user id is more appropriate
// than by IP (see media.admin.routes.js's mediaUploadLimiter).
export function makeRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, keyGenerator } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) =>
      sendError(res, { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }),
  });
}
