import rateLimit from 'express-rate-limit';
import { sendError } from '../utils/apiResponse.js';

// LLD Section 16: rate limiting on form and donation endpoints.
export function makeRateLimiter({ windowMs = 15 * 60 * 1000, max = 20 } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      sendError(res, { status: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }),
  });
}
