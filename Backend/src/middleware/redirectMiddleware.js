import { RedirectModel } from '../modules/redirects/redirect.model.js';
import { resolveRedirect } from '../modules/redirects/resolveRedirect.js';

// Consulted after every real route has had a chance to match and before the
// generic 404 handler (see app.js). `req.path` (not `req.originalUrl`) so a
// query string on the incoming request doesn't break the match -- the
// query string is matched on neither here nor in the generated CloudFront
// Function, and is never forwarded to the redirect target, same as before.
//
// Looks up both the requested path and its other trailing-slash form in one
// query, then hands both candidates to resolveRedirect() -- the exact same
// matching function (down to the byte) that the generated CloudFront
// Function embeds, so a legacy URL redirects identically whether this
// Express app or that edge Function is the one serving it. See
// resolveRedirect.js for the full matching semantics and why the
// trailing-slash toggle needs its own self-redirect guard.
//
// Current dev topology note: the Frontend (Next.js, port 3000) and this
// Backend (port 4000) are separate processes with no reverse proxy between
// them, so a real browser request for a legacy top-level page (e.g.
// "/old-donate-page") never reaches this Express app at all -- only requests
// that already fall through this API's own routing do. This middleware is
// correct and useful for any environment where a request for a legacy page
// does reach this Backend directly (e.g. a reverse-proxy topology, or direct
// API/script access) -- it does not intercept Frontend page requests in
// local dev, and in the planned production topology (S3 + CloudFront static
// hosting for the Frontend) it won't intercept them there either, since
// static assets are served straight from S3/CloudFront without ever
// reaching this Express app. For that topology, the equivalent legacy-page
// redirect gate is a generated CloudFront Function
// (infra/cloudfront/redirect-function.generated.js, produced by
// Backend/scripts/deploy/generate-redirect-manifest.mjs) running at the
// CloudFront edge instead of here. Either way, the Redirect collection
// below remains the single authoring source of truth -- this middleware and
// the generated CloudFront Function are just two different runtimes
// consuming the same data.
export async function redirectMiddleware(req, res, next) {
  try {
    const uri = req.path;
    const altUri = uri.charAt(uri.length - 1) === '/' ? uri.slice(0, -1) : uri + '/';
    const docs = await RedirectModel.find({ fromPath: { $in: [uri, altUri] } }).lean();
    const map = {};
    for (const d of docs) map[d.fromPath] = { toPath: d.toPath, statusCode: d.statusCode };

    const rule = resolveRedirect(uri, map);
    if (rule) return res.redirect(rule.statusCode, rule.toPath);
    return next();
  } catch (err) {
    return next(err);
  }
}
