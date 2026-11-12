import { sendError } from '../utils/apiResponse.js';

// A small, dependency-free in-process guard against too many requests being
// handled AT THE SAME TIME -- a different axis from rateLimit.js, which
// bounds request COUNT over a time window, not simultaneity. Built for
// media uploads specifically: Multer buffers an entire file into memory
// before the controller runs, so the real resource being protected here is
// the Node process's own memory, which scales with how many uploads are
// in flight at once, not how many have happened recently.
//
// Keyed per-user (via the caller-supplied `keyGenerator`, exactly like
// rateLimit.js's optional keyGenerator) plus a combined global ceiling, so
// neither a single account nor several legitimate accounts acting at once
// can push the process's in-flight upload-buffer footprint past a bounded
// total.
export function makeConcurrencyLimiter({
  perUserMax,
  globalMax,
  keyGenerator,
  code = 'UPLOAD_CAPACITY_EXCEEDED',
  message = 'Upload capacity is temporarily unavailable. Please try again shortly.',
}) {
  let globalCount = 0;
  const perUserCount = new Map();

  // Synchronous and side-effect-free until the capacity check passes --
  // Node's single-threaded event loop guarantees no other request's
  // middleware can interleave between the read and the increment below, so
  // this acquire-then-increment is atomic in practice without needing an
  // explicit lock.
  function tryAcquire(userId) {
    const userCount = perUserCount.get(userId) || 0;
    if (globalCount >= globalMax || userCount >= perUserMax) return null;

    globalCount += 1;
    perUserCount.set(userId, userCount + 1);

    let released = false;
    return function release() {
      if (released) return; // idempotent -- a duplicate call is a safe no-op
      released = true;
      globalCount -= 1;
      const current = perUserCount.get(userId) || 0;
      if (current <= 1) perUserCount.delete(userId); // no stale zero-entries
      else perUserCount.set(userId, current - 1);
    };
  }

  return function concurrencyGuard(req, res, next) {
    // Evaluated before any capacity is touched: if keyGenerator throws (e.g.
    // a missing/invalid user id), no slot is ever acquired, so a failed
    // attempt can never corrupt or consume real capacity. The throw is
    // synchronous, so Express's own middleware dispatch catches it and
    // forwards it to errorHandler.js (a clean 500) -- the same fail-closed
    // behavior already verified for mediaUploadRateLimitKey.
    const userId = keyGenerator(req);
    const release = tryAcquire(userId);
    if (!release) {
      return sendError(res, { status: 503, code, message });
    }

    // Ownership handoff: 'close' on http.ServerResponse fires when "the
    // response is completed, OR its underlying connection was terminated
    // prematurely" (Node's own docs, verbatim) -- that second clause is the
    // problem for a handler with real async work downstream (e.g. an S3
    // upload). A client disconnect fires 'close' immediately, long before
    // such work actually finishes, which would release this slot while it's
    // still genuinely in use -- confirmed by direct reproduction during
    // review (res 'close' fired ~10ms after a simulated disconnect, while a
    // simulated 3-second downstream operation kept running for another
    // ~2.6 seconds afterward).
    //
    // So this middleware only owns the slot UNTIL a downstream handler
    // takes over: req.takeUploadSlotOwnership() flips `ownedByHandler`,
    // which disarms the 'close'-based safety net below. From that point on,
    // only the handler's own req.releaseUploadSlot() (expected to run in a
    // `finally`, once its real work has actually settled) may release it --
    // see media.admin.controller.js's createMedia for the handler side.
    // `release` itself is already idempotent, so whichever of the two paths
    // ends up calling it is always safe, and ownership can only move
    // forward (pre-controller -> controller), never back.
    let ownedByHandler = false;
    req.takeUploadSlotOwnership = () => {
      ownedByHandler = true;
    };
    req.releaseUploadSlot = release;

    // Pre-controller safety net: covers every path that can end the request
    // BEFORE a downstream handler ever takes ownership -- Multer errors
    // (oversized/malformed upload), a client disconnect while Multer is
    // still reading the multipart body, or any other middleware error in
    // between. None of those leave any further async work running, so
    // releasing immediately on 'close' is correct for all of them.
    res.once('close', () => {
      if (!ownedByHandler) release();
    });

    next();
  };
}
