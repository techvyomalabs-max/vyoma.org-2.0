// Pure path -> redirect-rule resolver, shared byte-for-byte between the
// Express redirectMiddleware and the generated CloudFront Function
// (Backend/scripts/deploy/generate-redirect-manifest.mjs embeds this exact
// function's source via .toString() into the generated artifact) -- so the
// two runtimes can never silently drift in matching semantics, which the
// infra/cloudfront/README.md's own "must not be improved without
// re-approving the underlying decision" warning exists to prevent.
//
// Written in a deliberately conservative dialect (var, a function
// declaration, no arrow functions/template literals/destructuring) so its
// source is valid as-is inside a CloudFront Function (an ES5.1-based
// runtime) once embedded via toString() -- do not "modernize" the syntax
// without checking it still embeds cleanly.
//
// Matching semantics:
//   1. Exact match on `uri` against `map` -- unchanged from the original
//      exact-match-only design (Week 3 Decision W3-3: no wildcard/prefix
//      matching).
//   2. If no exact match, try the other trailing-slash form of `uri` (add a
//      trailing slash if absent, strip it if present). This is the only
//      normalization applied -- percent-encoding, query string (never
//      passed in here -- both callers already strip it before calling this),
//      and case are all still matched literally, exactly as before.
//   3. A toggled match is discarded (treated as "no match") if its
//      destination is identical to the ORIGINAL, untoggled `uri`. Without
//      this guard, a real working route whose only difference from a
//      legacy "clean URL" redirect's fromPath is a trailing slash (e.g. the
//      existing rule "/about/" -> "/about") would redirect to itself when
//      requested in its own slash-less form ("/about" -> toggle to
//      "/about/" -> rule found, destination "/about" -> same as the
//      original request -- a disguised self-loop this guard exists to stop).
export function resolveRedirect(uri, map) {
  var rule = map[uri];
  if (rule) return rule;

  var altUri = uri.charAt(uri.length - 1) === '/' ? uri.slice(0, -1) : uri + '/';
  var altRule = map[altUri];
  if (!altRule) return null;
  if (altRule.toPath === uri) return null;

  return altRule;
}
