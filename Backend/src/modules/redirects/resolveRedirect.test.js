// Regression coverage for trailing-slash tolerance in legacy-URL redirect
// matching -- see resolveRedirect.js for the full semantics. Both the
// Express redirectMiddleware and the generated CloudFront Function call/
// embed this exact function, so these tests cover both runtimes at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRedirect } from './resolveRedirect.js';

// A small fixture mirroring the real shape of the 51-record Redirect
// collection: 19 blog-post rules (percent-encoded and plain slugs), the 4
// blog landing-page rules, and a sample of the "clean URL" page rules whose
// destination is the source with its trailing slash stripped -- the exact
// shape that makes the self-redirect guard necessary.
const MAP = {
  '/blog-post/rathasaptami/': { toPath: '/media/blog/rathasaptami', statusCode: 301 },
  '/blog-post/unveiling-the-mysteries-of-ga%e1%b9%87apati/': { toPath: '/media/blog/unveiling-the-mysteries-of-ganapati', statusCode: 301 },
  '/blog-post/what-is-sa%e1%b9%83sk%e1%b9%9btam/': { toPath: '/media/blog/what-is-samskrtam', statusCode: 301 },
  '/blog/': { toPath: '/media/blog', statusCode: 301 },
  '/about/': { toPath: '/about', statusCode: 301 },
  '/contact/': { toPath: '/contact', statusCode: 301 },
  '/team/': { toPath: '/about/core-team', statusCode: 301 },
};

test('trailing slash: a rule authored with a trailing slash matches exactly as before', () => {
  const rule = resolveRedirect('/blog-post/rathasaptami/', MAP);
  assert.deepEqual(rule, { toPath: '/media/blog/rathasaptami', statusCode: 301 });
});

test('no trailing slash: the same legacy URL without its trailing slash now also matches', () => {
  const rule = resolveRedirect('/blog-post/rathasaptami', MAP);
  assert.deepEqual(rule, { toPath: '/media/blog/rathasaptami', statusCode: 301 });
});

test('percent-encoded slugs: diacritic-containing legacy slugs match literally, slash or no slash', () => {
  assert.deepEqual(resolveRedirect('/blog-post/unveiling-the-mysteries-of-ga%e1%b9%87apati/', MAP), {
    toPath: '/media/blog/unveiling-the-mysteries-of-ganapati',
    statusCode: 301,
  });
  assert.deepEqual(resolveRedirect('/blog-post/unveiling-the-mysteries-of-ga%e1%b9%87apati', MAP), {
    toPath: '/media/blog/unveiling-the-mysteries-of-ganapati',
    statusCode: 301,
  });
  assert.deepEqual(resolveRedirect('/blog-post/what-is-sa%e1%b9%83sk%e1%b9%9btam', MAP), {
    toPath: '/media/blog/what-is-samskrtam',
    statusCode: 301,
  });
});

test('percent-encoding is never decoded or re-encoded: a decoded variant of an encoded slug does not match', () => {
  // The real slug is percent-encoded ("ga%e1%b9%87apati"); a caller that
  // decoded it first ("gaṇapati") must NOT accidentally match -- matching
  // stays purely literal, per the documented semantics.
  assert.equal(resolveRedirect('/blog-post/unveiling-the-mysteries-of-ganapati/', MAP), null);
});

test('query parameters are the caller\'s responsibility: resolveRedirect only ever sees a bare path', () => {
  // Both real callers (Express's req.path and CloudFront's event.request.uri)
  // already exclude the query string before calling this function, so a
  // query string appended directly to the lookup key must never match --
  // this guards against ever passing a raw, unstripped URL in by mistake.
  assert.equal(resolveRedirect('/blog-post/rathasaptami/?utm_source=test', MAP), null);
  // The correct usage (query string already stripped by the caller) still works.
  assert.deepEqual(resolveRedirect('/blog-post/rathasaptami/', MAP), { toPath: '/media/blog/rathasaptami', statusCode: 301 });
});

test('unknown URLs: a path with no rule in either slash form returns null, not a throw', () => {
  assert.equal(resolveRedirect('/this-was-never-a-wordpress-page/', MAP), null);
  assert.equal(resolveRedirect('/this-was-never-a-wordpress-page', MAP), null);
});

test('existing valid redirects: an unrelated rule with no self-reference risk matches in both slash forms, destination unchanged', () => {
  assert.deepEqual(resolveRedirect('/team/', MAP), { toPath: '/about/core-team', statusCode: 301 });
  assert.deepEqual(resolveRedirect('/team', MAP), { toPath: '/about/core-team', statusCode: 301 });
  assert.deepEqual(resolveRedirect('/blog/', MAP), { toPath: '/media/blog', statusCode: 301 });
  assert.deepEqual(resolveRedirect('/blog', MAP), { toPath: '/media/blog', statusCode: 301 });
});

test('self-redirect guard: a "clean URL" rule whose destination equals its own slash-less source never loops', () => {
  // "/about/" -> "/about" is a real existing rule. Requesting the real,
  // working, slash-less route "/about" must NOT be redirected back to
  // itself via the trailing-slash toggle finding "/about/" -> "/about".
  assert.equal(resolveRedirect('/about', MAP), null);
  assert.equal(resolveRedirect('/contact', MAP), null);
  // The rule itself, requested in its own authored (slash) form, still
  // fires normally -- the guard only suppresses the toggled, disguised case.
  assert.deepEqual(resolveRedirect('/about/', MAP), { toPath: '/about', statusCode: 301 });
  assert.deepEqual(resolveRedirect('/contact/', MAP), { toPath: '/contact', statusCode: 301 });
});

test('self-redirect guard does not suppress an unrelated rule that happens to toggle to a real match', () => {
  // Sanity check that the guard is specific to "destination === original
  // requested uri", not a blanket "never toggle onto a /x/ -> /x shape" rule.
  const map = { '/x/': { toPath: '/y', statusCode: 301 } };
  assert.deepEqual(resolveRedirect('/x', map), { toPath: '/y', statusCode: 301 });
});

test('exact match always wins over a toggled match when both exist', () => {
  const map = {
    '/dup/': { toPath: '/dup-with-slash-destination', statusCode: 301 },
    '/dup': { toPath: '/dup-without-slash-destination', statusCode: 302 },
  };
  assert.deepEqual(resolveRedirect('/dup/', map), { toPath: '/dup-with-slash-destination', statusCode: 301 });
  assert.deepEqual(resolveRedirect('/dup', map), { toPath: '/dup-without-slash-destination', statusCode: 302 });
});
