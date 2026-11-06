// Task 7F.3 — regression tests confirming the SEO metadata fallback rule
// for all 19 real WordPress blog posts matches the approved content-owner
// decision (Decision 2): preserve the 3 real Rank Math overrides, use the
// existing MERN title/excerpt fallback for the other 16, never invent or
// rewrite a description, and always resolve canonical to the final MERN
// slug.
//
// --- Why this file lives here, one directory above its real target -------
// The function under test is Frontend/app/(public)/media/blog/[slug]/
// page.js's generateMetadata(). This file reads that page.js by a plain
// relative path (./[slug]/page.js, below) but is NOT itself placed inside
// the [slug] directory: empirically confirmed (both via a direct `node
// --test` invocation and via `npm test`'s own app/**/*.test.mjs glob) that
// Node's test-runner file discovery does not pick up a .test.mjs file
// whose own path contains a literal "[slug]" segment -- its internal glob
// matching appears to treat the brackets as a character class rather than
// literal text, even when the exact path is passed explicitly. Importing
// the very same file directly (bypassing `--test`'s own discovery) runs
// every test in it correctly, confirming this is a discovery-glob quirk of
// this Next.js bracket-named route directory, not a problem with the tests
// themselves. Moving the test file out of the bracketed directory (while
// its target file reference stays exactly where it really lives) is the
// narrowest fix that keeps it inside `npm test`'s own existing glob.
//
// --- Why this test cannot directly import/execute generateMetadata() -----
// `generateMetadata` (page.js lines 29-45) is a plain, JSX-free async
// function -- but it lives in the SAME FILE as the page's default-exported
// component, which contains real JSX (<div>, <script>, <Link>, ...).
// Importing ANY export from that file requires Node to parse the WHOLE
// file, JSX included, and this project has already established -- and
// explicitly documented -- that no JSX transform exists for standalone
// `node --test` execution outside Next's own bundler, and that installing
// one or hand-rolling one is out of scope (see
// Frontend/lib/testSupport/moduleAliasLoader.mjs's own header comment,
// which hit this exact wall for useBlogPostEditor.js/useContentEditor.js's
// imports and deliberately chose targeted import redirection over a JSX
// transform). That precedent doesn't even fully apply here, since the JSX
// is in the target file itself, not merely in something it imports.
//
// This file therefore tests the documented fallback rule two ways:
//   1. A source-text lock: reads page.js as plain text and asserts the
//      exact fallback expressions are still present verbatim. If a future
//      edit changes this logic, this test fails immediately, flagging
//      that the SEO contract changed -- a standard, honest technique when
//      the real function cannot be executed directly.
//   2. A local, CLEARLY LABELED reference implementation of the same
//      four-line rule (never imported from or written back to production
//      code), exercised against all 19 real posts' verified title/seo data
//      (the same data already independently confirmed live, via the real
//      WordPress export, across Tasks 7A/7B/7D of this engagement) to
//      confirm the RULE ITSELF produces the approved outcome for every
//      real post, not just that the source text looks right.
// Neither path touches the database, the importer, image mapping, the
// sanitizer, or any production file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SOURCE = fs.readFileSync(path.join(__dirname, '[slug]', 'page.js'), 'utf8');

// --- Part 1: source-text lock -----------------------------------------------

test('page.js still derives title from post.seo.title, falling back to post.title', () => {
  assert.ok(PAGE_SOURCE.includes("title: post?.seo?.title || post?.title || 'Blog'"));
});

test('page.js still derives description from post.seo.description, falling back to post.excerpt, never inventing one', () => {
  assert.ok(PAGE_SOURCE.includes('description: post?.seo?.description || post?.excerpt'));
});

test('page.js still resolves canonical to the final MERN slug, never a legacy WordPress URL', () => {
  assert.ok(PAGE_SOURCE.includes('alternates: { canonical: post?.seo?.canonical || `/media/blog/${slug}` }'));
  // The legacy WordPress permalink prefix must never appear anywhere in
  // generateMetadata()'s own logic -- confirms no hidden fallback to the
  // old /blog-post/ path exists.
  const generateMetadataBody = PAGE_SOURCE.slice(PAGE_SOURCE.indexOf('export async function generateMetadata'), PAGE_SOURCE.indexOf('export default async function BlogPostPage'));
  assert.ok(!generateMetadataBody.includes('blog-post'));
});

test('page.js still resolves the OG image with seo.ogImage taking precedence over featuredImage, omitted entirely when neither exists', () => {
  assert.ok(PAGE_SOURCE.includes('const ogImageUrl = post?.seo?.ogImage?.url || post?.featuredImage?.url;'));
  assert.ok(PAGE_SOURCE.includes('if (ogImageUrl) meta.openGraph = { images: [{ url: ogImageUrl }] };'));
});

// Finding (not a defect introduced here, not fixed here): generateMetadata()
// never sets a `twitter` key at all. The root layout (Frontend/app/layout.js)
// supplies a page-wide `twitter: { card: 'summary_large_image' }` default,
// which Next.js uses to synthesize twitter:title/description from the
// page's own title/description -- but NOT a twitter:image, which Next.js
// never auto-copies from openGraph.images. This means that even once a
// post has a real featuredImage/ogImage, no Twitter Card image will ever
// appear for a blog post unless a future change adds an explicit `twitter`
// block here. Locked in as a known, reported gap, consistent with the
// identical finding already made in this engagement's Task 7A SEO audit.
test('finding: generateMetadata() never sets a twitter-specific metadata key (known gap, not fixed by this task)', () => {
  const generateMetadataBody = PAGE_SOURCE.slice(PAGE_SOURCE.indexOf('export async function generateMetadata'), PAGE_SOURCE.indexOf('export default async function BlogPostPage'));
  assert.ok(!generateMetadataBody.includes('twitter'), 'generateMetadata() has started setting a twitter key -- if this is now a deliberate fix, this test should be updated, not deleted');
});

// --- Part 2: reference implementation, exercised against all 19 real posts -

// Mirrors generateMetadata()'s own four lines exactly (see Part 1's
// source-text assertions, which pin the real file to this same text) --
// never imported from, and never written back to, page.js.
function deriveMetadata(post, slug) {
  const meta = {
    title: post?.seo?.title || post?.title || 'Blog',
    description: post?.seo?.description || post?.excerpt,
    alternates: { canonical: post?.seo?.canonical || `/media/blog/${slug}` },
  };
  const ogImageUrl = post?.seo?.ogImage?.url || post?.featuredImage?.url;
  if (ogImageUrl) meta.openGraph = { images: [{ url: ogImageUrl }] };
  return meta;
}

// All 19 real posts, final MERN slugs and real titles verified against the
// live WordPress export across Tasks 7A/7B/7D/7F of this engagement. The
// three real Rank Math overrides (exact values, independently confirmed
// live on vyoma.org in Task 7A) are reproduced verbatim -- everything else
// uses a placeholder excerpt string, since this test exercises the
// FALLBACK RULE, not the real excerpt wording (which is irrelevant to
// whether the rule itself is correct).
const REAL_POSTS = [
  { slug: 'unveiling-the-mysteries-of-ganapati', oldSlug: 'unveiling-the-mysteries-of-ga%e1%b9%87apati', title: 'Unveiling the Mysteries of Ganapati: His Origins and Significance', excerpt: 'Historical Significance of Ganapati...', seo: {} },
  { slug: 'medicinal-value-of-21-kinds-of-leaves-offered-in-ganesa-puja', oldSlug: 'edicinal-value-of-21-kinds-of-leaves-that-are-offered-in-ga%e1%b9%87esa-puja', title: 'Medicinal Value of 21 Kinds of Leaves that are offered in Gaṇeśa-pūjā', excerpt: 'If there is one festival...', seo: {} },
  { slug: 'rathasaptami', oldSlug: 'rathasaptami', title: 'Rathasaptamī Revelations: Expressing Gratitude, Embracing Tradition and Celebrating Spirituality', excerpt: 'Greatness of Sūrya Bhagavān...', seo: {} },
  { slug: 'bhishma-ashtami', oldSlug: 'bhishma-ashtami', title: 'Venerating the Warrior of Virtue: Bhīṣma-aṣṭamī and Its Significance', excerpt: 'Introduction to Bhīṣma...', seo: {} },
  { slug: 'mahasivaratri', oldSlug: 'mahasivaratri', title: "Don't Miss this 'High-Impact, less-time-effort-' occasion: Mahāśivarātri", excerpt: 'Mahāśivarātri is an auspicious occasion...', seo: {} },
  { slug: 'ramanavami', oldSlug: 'ramanavami', title: "What is the symbolism of Rāmanavamī and how is it relevant for today's generation?", excerpt: 'The festival of Rāmanavamī...', seo: {} },
  { slug: 'yoga-day', oldSlug: 'yoga_day', title: 'Embracing Aṣṭāṅga Yoga: Ancient Wisdom for International Yoga Day', excerpt: 'Since 2014, International Yoga Day...', seo: {} },
  { slug: 'guru-purnima', oldSlug: 'guru-purnima', title: 'Obeisance to various Guru-Pañcaka-s in the light of Guru-Pūrṇimā', excerpt: 'Without a guru, knowledge cannot arise...', seo: {} },
  { slug: 'what-is-samskrtam', oldSlug: 'what-is-sa%e1%b9%83sk%e1%b9%9btam', title: 'What is Saṃskṛtam?', excerpt: 'In the previous newsletters...', seo: {} },
  { slug: 'why-samskrtam', oldSlug: 'why-sa%e1%b9%83sk%e1%b9%9btam', title: 'Why Saṃskṛtam?', excerpt: 'Saṃskṛta is not a mere language...', seo: {} },
  { slug: 'how-samskrtam', oldSlug: 'how-sa%e1%b9%83sk%e1%b9%9btam', title: 'How Saṃskṛtam ?', excerpt: 'Learning Saṃskṛta and Indian Knowledge Systems...', seo: {} },
  { slug: 'the-lion-as-vahana-of-the-goddess-textual-zoological-and-symbolic-perspectives', oldSlug: 'the-lion-as-vahana-of-the-goddess-textual-zoological-and-symbolic-perspectives', title: 'The Lion as Vāhana of the Goddess: Textual, Zoological, and Symbolic Perspectives', excerpt: 'The Siṃha-vāhana stands as more than mythic imagery...', seo: {} },
  { slug: 'dhanurveda-the-science-of-warfare-and-wisdom-in-indian-knowledge-systems', oldSlug: 'dhanurveda-the-science-of-warfare-and-wisdom-in-indian-knowledge-systems', title: 'Dhanurveda: The Science of Warfare and Wisdom in Indian Knowledge Systems', excerpt: 'The purpose of Dhanurveda extends beyond mere combat...', seo: {} },
  { slug: 'a-blissful-awakening-our-vision-for-todays-children-at-vyoma-bala-gurukulam', oldSlug: 'a-blissful-awakening-our-vision-for-todays-children-at-vyoma-bala-gurukulam', title: "A Blissful Awakening: Our Vision for today's children at Vyoma Bala Gurukulam", excerpt: 'A few years ago, a parent asked us...', seo: {} },
  { slug: 'gandharvaveda-the-science-of-music-and-dance-in-indian-knowledge-systems', oldSlug: 'gandharvaveda-the-science-of-music-and-dance-in-indian-knowledge-systems', title: 'Gāndharvaveda: The Science of Music and Dance in Indian Knowledge Systems', excerpt: 'Saṃskṛta is not a mere transactional language...', seo: {} },
  {
    slug: 'how-panchatantra-teaches-without-teaching',
    oldSlug: 'how-panchatantra-teaches-without-teaching',
    title: 'How the Panchatantra Teaches Without Teaching',
    excerpt: 'A scholar taught three careless princes everything...',
    seo: { title: 'How the Panchatantra Teaches Without Teaching' }, // real Rank Math override: TITLE only
  },
  {
    slug: 'why-the-amarakosha-was-written-to-be-sung',
    oldSlug: 'why-the-amarakosha-was-written-to-be-sung',
    title: 'Why the Amarakosha Was Written to Be Sung',
    excerpt: 'A grammar teacher explains why the Amarakosha was sung...',
    seo: { description: 'A grammar teacher on why the Amarakosha was sung, not studied silently, and the chants, epics and audio waiting on digitalsanskrit.com.' }, // real Rank Math override: DESCRIPTION only
  },
  { slug: 'raksha-bandhan-gift-a-year-of-sanskrit', oldSlug: 'raksha-bandhan-gift-a-year-of-sanskrit', title: 'Give a Year of Samskritam This Raksha Bandhan', excerpt: 'This Raksha Bandhan, gift a year of Sanskrit...', seo: {} },
  {
    slug: 'why-sanskrit-is-not-finished-it-is-alive',
    oldSlug: 'why-sanskrit-is-not-finished-it-is-alive',
    title: 'Why Sanskrit Is Not Finished',
    excerpt: 'Every generation calls Sanskrit dead...',
    seo: { description: 'Sanskrit is not finished: every generation calls it dead, yet today a child learns her first śloka. See how it lives on, one ordinary day at a time.' }, // real Rank Math override: DESCRIPTION only
  },
];

const OVERRIDE_SLUGS = new Set(['how-panchatantra-teaches-without-teaching', 'why-the-amarakosha-was-written-to-be-sung', 'why-sanskrit-is-not-finished-it-is-alive']);

test('all 19 real WordPress posts are represented in this regression fixture', () => {
  assert.equal(REAL_POSTS.length, 19);
  assert.equal(new Set(REAL_POSTS.map((p) => p.slug)).size, 19, 'expected 19 distinct final slugs');
});

test('exactly the 3 known posts carry a Rank Math override; the other 16 carry none', () => {
  const withOverride = REAL_POSTS.filter((p) => p.seo.title || p.seo.description);
  assert.equal(withOverride.length, 3);
  assert.deepEqual(new Set(withOverride.map((p) => p.slug)), OVERRIDE_SLUGS);
});

test('the 3 posts with overrides retain their imported value for the overridden field, and fall back for the other field', () => {
  const panchatantra = REAL_POSTS.find((p) => p.slug === 'how-panchatantra-teaches-without-teaching');
  const meta1 = deriveMetadata(panchatantra, panchatantra.slug);
  assert.equal(meta1.title, 'How the Panchatantra Teaches Without Teaching'); // from seo.title override
  assert.equal(meta1.description, panchatantra.excerpt); // no seo.description -- falls back to excerpt

  const amarakosha = REAL_POSTS.find((p) => p.slug === 'why-the-amarakosha-was-written-to-be-sung');
  const meta2 = deriveMetadata(amarakosha, amarakosha.slug);
  assert.equal(meta2.title, amarakosha.title); // no seo.title -- falls back to post.title
  assert.equal(meta2.description, 'A grammar teacher on why the Amarakosha was sung, not studied silently, and the chants, epics and audio waiting on digitalsanskrit.com.'); // from seo.description override

  const sanskritAlive = REAL_POSTS.find((p) => p.slug === 'why-sanskrit-is-not-finished-it-is-alive');
  const meta3 = deriveMetadata(sanskritAlive, sanskritAlive.slug);
  assert.equal(meta3.title, sanskritAlive.title);
  assert.equal(meta3.description, 'Sanskrit is not finished: every generation calls it dead, yet today a child learns her first śloka. See how it lives on, one ordinary day at a time.');
});

test('the 16 posts without an override use post.title and post.excerpt exactly, never rewritten or invented', () => {
  for (const post of REAL_POSTS) {
    if (OVERRIDE_SLUGS.has(post.slug)) continue;
    const meta = deriveMetadata(post, post.slug);
    assert.equal(meta.title, post.title, `title must be exactly post.title for "${post.slug}"`);
    assert.equal(meta.description, post.excerpt, `description must be exactly post.excerpt for "${post.slug}"`);
  }
});

test('canonical URL uses the final MERN slug for all 19 posts, never the legacy WordPress URL', () => {
  for (const post of REAL_POSTS) {
    const meta = deriveMetadata(post, post.slug);
    assert.equal(meta.alternates.canonical, `/media/blog/${post.slug}`);
    assert.ok(!meta.alternates.canonical.includes('blog-post'), `canonical must never reference the legacy /blog-post/ path for "${post.slug}"`);
    assert.ok(!meta.alternates.canonical.includes(post.oldSlug) || post.oldSlug === post.slug, `canonical must never leak the raw legacy slug for "${post.slug}"`);
  }
});

test('missing featuredImage/ogImage (true for all 19 posts today) never causes a rendering failure, and omits openGraph entirely', () => {
  for (const post of REAL_POSTS) {
    const meta = deriveMetadata({ ...post, featuredImage: null }, post.slug);
    assert.doesNotThrow(() => JSON.stringify(meta));
    assert.equal('openGraph' in meta, false, `openGraph must be entirely absent (not an empty object) for "${post.slug}" when no image exists`);
  }
});

test('Open Graph image precedence: seo.ogImage wins over featuredImage when both are present', () => {
  const post = { title: 'T', excerpt: 'E', seo: { ogImage: { url: 'https://vyoma.org/seo-image.jpg' } }, featuredImage: { url: 'https://vyoma.org/featured-image.jpg' } };
  const meta = deriveMetadata(post, 'some-slug');
  assert.equal(meta.openGraph.images[0].url, 'https://vyoma.org/seo-image.jpg');
});

test('Open Graph image falls back to featuredImage when seo.ogImage is absent', () => {
  const post = { title: 'T', excerpt: 'E', seo: {}, featuredImage: { url: 'https://vyoma.org/featured-image.jpg' } };
  const meta = deriveMetadata(post, 'some-slug');
  assert.equal(meta.openGraph.images[0].url, 'https://vyoma.org/featured-image.jpg');
});

test('Sanskrit/IAST Unicode characters pass through title and description completely unchanged', () => {
  const samskrtam = REAL_POSTS.find((p) => p.slug === 'what-is-samskrtam');
  const meta = deriveMetadata(samskrtam, samskrtam.slug);
  assert.equal(meta.title, 'What is Saṃskṛtam?');

  const gandharvaveda = REAL_POSTS.find((p) => p.slug === 'gandharvaveda-the-science-of-music-and-dance-in-indian-knowledge-systems');
  const metaG = deriveMetadata(gandharvaveda, gandharvaveda.slug);
  assert.equal(metaG.title, 'Gāndharvaveda: The Science of Music and Dance in Indian Knowledge Systems');

  const bhishma = REAL_POSTS.find((p) => p.slug === 'bhishma-ashtami');
  const metaB = deriveMetadata(bhishma, bhishma.slug);
  assert.equal(metaB.title, 'Venerating the Warrior of Virtue: Bhīṣma-aṣṭamī and Its Significance');
});
