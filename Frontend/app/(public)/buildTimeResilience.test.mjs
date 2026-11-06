// Task 7R.1 — regression guard for the build-time API failure fix.
//
// Root cause: every one of these pages fetched CMS content directly in its
// default export (and/or generateMetadata), with no error handling. Next.js
// statically prerenders a page like this at `next build` time by default;
// when the configured backend is unreachable because of a DNS-resolution
// failure (e.g. a staging hostname that doesn't resolve yet) rather than an
// instant connection-refused, the resulting uncaught rejection crashed
// `next build` entirely -- confirmed by reproducing it against
// `https://staging-api.vyoma.org/api/v1` and an arbitrary unresolvable test
// hostname (both ENOTFOUND), while a loopback connection-refused placeholder
// (what the existing CI job happened to use) did not.
//
// Fix: `export const dynamic = 'force-dynamic'` on every one of these pages
// defers data fetching to request time (Next.js never invokes
// generateMetadata/the page body for a force-dynamic route during
// `next build`), so build success no longer depends on the backend being
// reachable at all. media/blog/[slug]/page.js is deliberately excluded
// here: it already had its own working generateStaticParams-returns-[]
// protection before this task and needed no change for build-safety.
//
// Task 7S.1: donate/page.js and donate/[schemeSlug]/page.js also now
// declare force-dynamic (moved into FORCE_DYNAMIC_PAGES below) -- not for
// build-safety (they already had that, via their own try/catch and
// generateStaticParams respectively), but for CACHING correctness: without
// it, a scheme activated/deactivated via the CMS after deployment would not
// be reflected until the next rebuild. Confirmed empirically that
// force-dynamic coexists cleanly with donate/[schemeSlug]/page.js's
// generateStaticParams -- it still runs at build time (harmless) but no
// longer results in static pre-rendering of any returned slug.
//
// This test reads source text only (no Next.js runtime involved) -- the
// actual build-success claim is verified by running `next build` with an
// unresolvable API hostname, documented in Task 7R.1's final report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Every public page that fetches CMS content at module scope (in
// generateMetadata and/or its default export) and relies on force-dynamic,
// relative to this test file's own directory (app/(public)).
const FORCE_DYNAMIC_PAGES = [
  'about/core-team/page.js',
  'about/leadership/page.js',
  'about/our-story/page.js',
  'about/page.js',
  'about/patrons/page.js',
  'about/roadmap/page.js',
  'contact/page.js',
  'credibility/annual-reports/page.js',
  'credibility/audit-reports/page.js',
  'credibility/awards-recognition/page.js',
  'credibility/collaterals/page.js',
  'credibility/compliances-registrations/page.js',
  'credibility/page.js',
  'credibility/social-impact-report/page.js',
  'faq/page.js',
  'impact/page.js',
  'join-us/careers/page.js',
  'join-us/csr-projects/page.js',
  'join-us/internship/page.js',
  'join-us/page.js',
  'join-us/volunteer/page.js',
  'media/blog/page.js',
  'media/events/page.js',
  'media/gallery/page.js',
  'media/newsletter/page.js',
  'media/page.js',
  'media/press/page.js',
  'media/resources/page.js',
  'media/testimonials/page.js',
  'media/what-sanskrit/page.js',
  'media/where-iks/page.js',
  'our-work/all/page.js',
  'our-work/current/page.js',
  'our-work/page.js',
  'page.js',
  'privacy/page.js',
  'terms/page.js',
  'donate/page.js',
  'donate/[schemeSlug]/page.js',
];

for (const relativePath of FORCE_DYNAMIC_PAGES) {
  test(`${relativePath}: declares export const dynamic = 'force-dynamic'`, () => {
    const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
    assert.match(
      source,
      /export const dynamic = ['"]force-dynamic['"];/,
      `${relativePath} must defer its CMS content fetch to request time so an unreachable/unresolvable backend cannot fail \`next build\``
    );
  });
}

// media/blog/[slug]/page.js is the one route that already had its own
// working build-time-failure protection before this task and was
// deliberately left untouched -- documenting that exclusion here so a
// future reader doesn't mistake it for an oversight. (donate/page.js and
// donate/[schemeSlug]/page.js are covered by FORCE_DYNAMIC_PAGES above as
// of Task 7S.1, but retain their own try/catch and generateStaticParams
// build-safety nets too -- verified separately below.)
test('media/blog/[slug]/page.js is intentionally excluded (pre-existing generateStaticParams protection, no caching-correctness concern)', () => {
  const blogSlugPage = fs.readFileSync(path.join(__dirname, 'media/blog/[slug]/page.js'), 'utf8');
  assert.match(blogSlugPage, /generateStaticParams failed, falling back to on-demand rendering/);
});

test('donate/page.js and donate/[schemeSlug]/page.js retain their pre-existing build-safety nets alongside the new force-dynamic export', () => {
  const donatePage = fs.readFileSync(path.join(__dirname, 'donate/page.js'), 'utf8');
  const donateSchemePage = fs.readFileSync(path.join(__dirname, 'donate/[schemeSlug]/page.js'), 'utf8');

  assert.match(donatePage, /try \{/, 'donate/page.js must still catch its own fetch failure');
  assert.match(donateSchemePage, /generateStaticParams failed, falling back to on-demand rendering/);
});
