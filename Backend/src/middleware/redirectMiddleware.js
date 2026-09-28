import { RedirectModel } from '../modules/redirects/redirect.model.js';

// Consulted after every real route has had a chance to match and before the
// generic 404 handler (see app.js) — an exact-path lookup (Week 3 Decision
// W3-3: no wildcard/prefix matching for launch) against the admin-managed
// Redirect collection. `req.path` (not `req.originalUrl`) so a query string
// on the incoming request doesn't break the match.
//
// Current dev topology note: the Frontend (Next.js, port 3000) and this
// Backend (port 4000) are separate processes with no reverse proxy between
// them, so a real browser request for a legacy top-level page (e.g.
// "/old-donate-page") never reaches this Express app at all — only requests
// that already fall through this API's own routing do. This middleware is
// correct and ready for the eventual production topology (a reverse proxy in
// front of both, per the original AWS deployment plan) where it becomes the
// actual gate for legacy URLs; it does not yet intercept Frontend page
// requests in local dev.
export async function redirectMiddleware(req, res, next) {
  try {
    const match = await RedirectModel.findOne({ fromPath: req.path }).lean();
    if (match) {
      return res.redirect(match.statusCode, match.toPath);
    }
    return next();
  } catch (err) {
    return next(err);
  }
}
