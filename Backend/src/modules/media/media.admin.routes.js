import { Router } from 'express';
import { requirePermission } from '../../middleware/requireRole.js';
import { makeRateLimiter } from '../../middleware/rateLimit.js';
import { makeConcurrencyLimiter } from '../../middleware/concurrencyLimit.js';
import { listMedia, createMedia, deleteMedia, uploadMiddleware } from './media.admin.controller.js';

// Mounted under /api/v1/admin, which already applies requireAuth.
export const mediaAdminRouter = Router();

// Keyed by authenticated user id (not IP, unlike every other limiter in this
// codebase -- see rateLimit.js): this route sits behind requireAuth +
// requirePermission('media:write') already, so req.user.id is always
// present by the time this runs, and per-user keying avoids two problems
// per-IP keying would have here specifically -- this app never sets Express's
// `trust proxy`, so req.ip collapses to a reverse proxy's own address in any
// deployment that sits behind one; and multiple admins on the same office/VPN
// NAT would otherwise share a single IP-based quota. 60/15min is generous
// enough for a legitimate bulk-upload CMS session while still bounding the
// rate of repeated large (up to 15MB) in-memory buffer allocations and real
// S3 PUT calls a single compromised or malicious admin account could drive.
//
// Throws rather than falling back to a shared/IP-based key if req.user.id is
// ever missing -- this should be unreachable given the mandated middleware
// order below (requireAuth and requirePermission both already guarantee
// req.user.id by the time this runs), but a throw here fails the request
// closed (a clean 500, see errorHandler.js) instead of silently collapsing
// unrelated users into one rate-limit bucket if that order is ever broken.
// Exported separately so this fail-safe behavior can be unit-tested directly.
export function mediaUploadRateLimitKey(req) {
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('mediaUploadLimiter: req.user.id is required but missing -- check middleware order.');
  }
  return String(userId);
}

const mediaUploadLimiter = makeRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: mediaUploadRateLimitKey,
});

// A different axis of protection from mediaUploadLimiter above: that one
// bounds request COUNT over a 15-minute window; this one bounds how many
// uploads can be buffering a file in memory AT THE SAME MOMENT, regardless
// of how far under the rate-limit window a user still is. Reuses the same
// fail-safe mediaUploadRateLimitKey (per-user id, throws rather than
// collapsing into a shared bucket if req.user.id is ever missing).
// Limits: 3 concurrent per user, 20 concurrent globally -- see
// media.concurrency.test.js and the preceding investigation for the
// reasoning (the current Media Library UI only ever uploads one file per
// user action, so 3 is already generous headroom; 20 globally keeps the
// worst-case raw in-memory buffer total at 300MB for this single-process
// Backend).
const mediaUploadConcurrencyGuard = makeConcurrencyLimiter({
  perUserMax: 3,
  globalMax: 20,
  keyGenerator: mediaUploadRateLimitKey,
});

mediaAdminRouter.get('/', requirePermission('media:read'), listMedia);
// Rate limiting and the concurrency guard both run after requirePermission
// (so an unauthorized request never consumes a legitimate quota/slot) and
// before uploadMiddleware (so a rejected request never reaches Multer,
// which is where the actual memory-buffering happens).
mediaAdminRouter.post(
  '/',
  requirePermission('media:write'),
  mediaUploadLimiter,
  mediaUploadConcurrencyGuard,
  uploadMiddleware,
  createMedia
);
mediaAdminRouter.delete('/:id', requirePermission('media:write'), deleteMedia);
