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
// reachable at all. donate/page.js, donate/[schemeSlug]/page.js, and
// media/blog/[slug]/page.js are deliberately excluded here: each already had
// its own working try/catch (or, for the dynamic-segment pages,
// generateStaticParams returning [] on failure) before this task and needed
// no change -- see each file's own pre-existing comments.
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

// The three routes that already had their own working build-time-failure
// protection before this task (and were deliberately left untouched) are
// NOT required to use force-dynamic -- documenting that exclusion here so a
// future reader doesn't mistake it for an oversight.
test('donate/page.js, donate/[schemeSlug]/page.js, and media/blog/[slug]/page.js are intentionally excluded (pre-existing try/catch protection)', () => {
  const donatePage = fs.readFileSync(path.join(__dirname, 'donate/page.js'), 'utf8');
  const donateSchemePage = fs.readFileSync(path.join(__dirname, 'donate/[schemeSlug]/page.js'), 'utf8');
  const blogSlugPage = fs.readFileSync(path.join(__dirname, 'media/blog/[slug]/page.js'), 'utf8');

  assert.match(donatePage, /try \{/, 'donate/page.js already catches its own build-time fetch failure');
  assert.match(donateSchemePage, /generateStaticParams failed, falling back to on-demand rendering/);
  assert.match(blogSlugPage, /generateStaticParams failed, falling back to on-demand rendering/);
});
