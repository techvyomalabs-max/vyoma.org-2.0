// Task 7I — regression coverage for the CMS-driven SEO metadata fix on the
// five public pages Task 7G's audit found ignoring their own CMS SEO fields
// (About, Credibility, Impact, Join Us, Our Work): each previously exported
// a static `export const metadata = pageMetadata({ ...hardcoded... })`,
// evaluated once at module load, which could never reflect whatever an
// admin set via the CMS's SeoForm for that page. Fixed by switching each to
// an async `generateMetadata()` that reads `SEO` from the same
// `get<Page>Content()` call the page component already makes (the pattern
// already used correctly by faq/page.js, contact/page.js, and others).
//
// --- Why source-text + a local reference implementation, not a live import -
// Each page.js file also default-exports real JSX (<div>, <Link>, ...);
// this project has already established, for the same reason, that
// `node --test` cannot import a file containing JSX without a bundler (see
// media/blog/page.seoFallback.test.mjs's header comment for the precedent).
// This file follows the same two-part technique: (1) a source-text lock
// confirming each page.js now defines generateMetadata() with the exact
// fallback expressions, and (2) a local, clearly-labeled reference
// implementation of pageMetadata()'s merge logic (mirroring lib/seo.js
// exactly, never imported from or written back to it) exercised against
// representative CMS SEO shapes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PAGES = [
  {
    name: 'about',
    file: 'about/page.js',
    contentFn: 'getAboutContent',
    path: '/about',
    fallbackTitle: 'About',
    fallbackDescriptionSnippet: "Founded in Bengaluru, Vyoma Linguistic Labs Foundation has grown into the organisation behind India's largest free Sanskrit e-learning ecosystem",
  },
  {
    name: 'credibility',
    file: 'credibility/page.js',
    contentFn: 'getCredibilityContent',
    path: '/credibility',
    fallbackTitle: 'Credibility',
    fallbackDescriptionSnippet: 'Vyoma opens its record to the people who fund and partner with it',
  },
  {
    name: 'impact',
    file: 'impact/page.js',
    contentFn: 'getImpactContent',
    path: '/impact',
    fallbackTitle: 'Impact',
    fallbackDescriptionSnippet: "Every number here represents a step in making Sanskrit and India's knowledge systems accessible to all",
  },
  {
    name: 'join-us',
    file: 'join-us/page.js',
    contentFn: 'getJoinUsContent',
    path: '/join-us',
    fallbackTitle: 'Join Us',
    fallbackDescriptionSnippet: "Whether you give your time, your skills, your company's support, or your career",
  },
  {
    name: 'our-work',
    file: 'our-work/page.js',
    contentFn: 'getOurWorkContent',
    path: '/our-work',
    fallbackTitle: 'Our Work',
    fallbackDescriptionSnippet: "From phonetics to applied AI, from children's value education to advanced research",
  },
];

// --- Part 1: source-text checks, one per affected page ---------------------

for (const p of PAGES) {
  const source = fs.readFileSync(path.join(__dirname, p.file), 'utf8');

  test(`${p.name}/page.js: defines an async generateMetadata() reading SEO from ${p.contentFn}(), not a static metadata export`, () => {
    assert.match(source, /export async function generateMetadata\s*\(\)\s*\{/, `${p.name}: expected an async generateMetadata() export`);
    assert.ok(!/export const metadata\s*=/.test(source), `${p.name}: must no longer export a static, hardcoded metadata object`);

    const metadataBody = source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('export default async function'));
    assert.ok(metadataBody.includes(`await ${p.contentFn}()`), `${p.name}: generateMetadata() must call ${p.contentFn}()`);
    assert.match(metadataBody, /const\s*\{\s*SEO\s*\}\s*=/, `${p.name}: generateMetadata() must destructure SEO from the CMS content`);
  });

  test(`${p.name}/page.js: falls back to the original hardcoded title/description exactly when CMS SEO fields are absent`, () => {
    const metadataBody = source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('export default async function'));
    assert.ok(metadataBody.includes(`SEO?.title || '${p.fallbackTitle}'`), `${p.name}: title fallback must match the page's original hardcoded title exactly`);
    assert.ok(metadataBody.includes(p.fallbackDescriptionSnippet), `${p.name}: description fallback must preserve the page's original hardcoded copy`);
    assert.ok(metadataBody.includes(`path: '${p.path}'`), `${p.name}: canonical path must be unchanged by this fix`);
  });

  test(`${p.name}/page.js: sets openGraph.images from SEO.ogImage.url when present, consistent with every other CMS-driven page`, () => {
    const metadataBody = source.slice(source.indexOf('export async function generateMetadata'), source.indexOf('export default async function'));
    assert.ok(metadataBody.includes('if (SEO?.ogImage?.url) meta.openGraph = { images: [{ url: SEO.ogImage.url }] };'));
  });
}

test('exactly the 5 pages identified in Task 7G are covered by this regression file', () => {
  assert.equal(PAGES.length, 5);
  assert.deepEqual(
    PAGES.map((p) => p.name).sort(),
    ['about', 'credibility', 'impact', 'join-us', 'our-work']
  );
});

// --- Part 2: reference implementation of the merge/fallback rule -----------
// Mirrors lib/seo.js's pageMetadata() plus each page's own
// `SEO?.ogImage?.url` handling -- never imported from, and never written
// back to, production code.
function deriveMetadata({ path: canonicalPath, seo, fallbackTitle, fallbackDescription }) {
  const meta = {
    title: seo?.title || fallbackTitle,
    description: seo?.description || fallbackDescription,
    alternates: { canonical: canonicalPath },
  };
  if (seo?.ogImage?.url) meta.openGraph = { images: [{ url: seo.ogImage.url }] };
  return meta;
}

test('CMS-managed SEO title and description are used when present, overriding the hardcoded fallback', () => {
  const meta = deriveMetadata({
    path: '/about',
    seo: { title: 'Admin-set About title', description: 'Admin-set About description.' },
    fallbackTitle: 'About',
    fallbackDescription: 'The hardcoded fallback description.',
  });
  assert.equal(meta.title, 'Admin-set About title');
  assert.equal(meta.description, 'Admin-set About description.');
});

test('fallback metadata is used exactly as before when CMS SEO fields are null/absent (matches every mock page\'s SEO: { title: null, description: null, ... })', () => {
  for (const nullSeo of [{ title: null, description: null, canonical: '/about', ogImage: null }, {}, null, undefined]) {
    const meta = deriveMetadata({
      path: '/about',
      seo: nullSeo,
      fallbackTitle: 'About',
      fallbackDescription: 'The hardcoded fallback description.',
    });
    assert.equal(meta.title, 'About');
    assert.equal(meta.description, 'The hardcoded fallback description.');
    assert.equal('openGraph' in meta, false, 'openGraph must be entirely absent, not an empty object, when no ogImage exists');
  }
});

test('a CMS-set title with no CMS description falls back only for the missing field, never both', () => {
  const meta = deriveMetadata({
    path: '/impact',
    seo: { title: 'Admin-set Impact title only' },
    fallbackTitle: 'Impact',
    fallbackDescription: 'The hardcoded fallback description.',
  });
  assert.equal(meta.title, 'Admin-set Impact title only');
  assert.equal(meta.description, 'The hardcoded fallback description.');
});

test('canonical path is always the page\'s own real route, independent of CMS data', () => {
  const meta = deriveMetadata({ path: '/join-us', seo: { title: 'X' }, fallbackTitle: 'Join Us', fallbackDescription: 'D' });
  assert.equal(meta.alternates.canonical, '/join-us');
});

test('Sanskrit/IAST Unicode characters in a CMS-set title/description pass through unchanged', () => {
  const meta = deriveMetadata({
    path: '/our-work',
    seo: { title: 'Saṃskṛtam at Vyoma', description: 'Saṃskṛtiḥ and Saṃskāraḥ, explained for every learner.' },
    fallbackTitle: 'Our Work',
    fallbackDescription: 'D',
  });
  assert.equal(meta.title, 'Saṃskṛtam at Vyoma');
  assert.equal(meta.description, 'Saṃskṛtiḥ and Saṃskāraḥ, explained for every learner.');
});
