// WordPress -> MERN migration: Batch 1 importer.
//
// Scope (per the approved Batch 1 manifest — see
// Backend/scripts/wordpress/reports/migration-decision-register.md):
//   - Import the 19 real WordPress blog_post items as BlogPost documents.
//   - Upsert the 11 real blog categories they use into BlogCategoryModel.
//   - Delete the 6 known demo BlogPost records and the 5 known demo
//     BlogCategory records.
//   - Update (not replace) two existing Content documents:
//       pages/home  -> data.HOME_TESTIMONIALS  = 3 curated real testimonials
//       pages/media -> data.TESTIMONIALS_FEATURED = all 7 Home-slider items
//                       data.TESTIMONIALS_ALL      = all 6 Old items
//
// Explicitly OUT of scope (must not be touched by this script):
//   DonationScheme, Team/Leadership/Timeline content, any Credibility PDFs,
//   Media/S3, the Redirect collection, FormSubmission, WPCode, User/Role/
//   AuditLog, Donation/PaymentEvent, Settings.
//
// Source of truth: the reviewed WXR export
// (Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml),
// parsed fresh by this script — nothing here is hand-invented content.
//
// Modes:
//   node batch1-import.mjs            -> dry-run (default): validates and
//                                         prints the intended operations,
//                                         writes nothing.
//   node batch1-import.mjs --commit   -> performs the real writes, only
//                                         after the same validation passes.
//
// --- Recognized baseline states (fixed in this revision) -------------------
// The database is expected to be in exactly one of:
//   STATE A — pristine: exactly the 6 demo posts + 5 demo categories, none
//             of the 19 real posts/11 real categories yet.
//   STATE B — partially migrated: any subset of {6 demo posts, 19 real
//             posts} and any subset of {5 demo categories, 11 real
//             categories} — e.g. a prior --commit that upserted the real
//             records but died before deleting the demo ones. Reruns must
//             recover from this without aborting.
//   STATE C — completed: exactly the 19 real posts + 11 real categories,
//             no demo records left. A rerun in this state is a no-op/
//             revalidation, not an error.
// Anything outside the union of demo+real slugs/names for either
// collection is treated as unexpected and aborts the run — this is what
// keeps "accept A/B/C" from becoming "accept anything".
//
// --- BlogCategory hard-delete: re-confirmed, not changed silently ---------
// BlogCategoryModel's own schema comment documents a deliberate "no delete,
// ever" policy (mirroring DonationSchemeModel), with no delete endpoint
// anywhere in the app — the concern that policy guards against is a real
// post silently losing its manageable category after an admin deletes the
// category it references. That risk does not apply to this one-time
// migration action: this script deletes a demo category ONLY together with
// the demo posts that were its sole users, in the same run, and (new in
// this revision) explicitly verifies beforehand that no OTHER post in the
// database — real or otherwise — references any of the 5 demo category
// names before deleting them (see assertNoOtherReferences()). Under that
// verified condition, hard-delete remains the safest option: leaving 5
// dead, permanently un-deletable category names in the admin's managed
// list (given the app itself has no delete UI) would be a standing, visible
// mess with no legitimate future use, for no corresponding safety benefit
// once the reference check passes. If that check ever fails, this script
// aborts rather than deleting — see assertNoOtherReferences().

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { BlogPostModel } from '../../../src/modules/blog/blogPost.model.js';
import { BlogCategoryModel } from '../../../src/modules/blog/blogCategory.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Frozen decisions (from the approved review — not invented here)
// ---------------------------------------------------------------------------

const DEFAULT_WXR_PATH = path.resolve(
  __dirname,
  '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml'
);

// Matches Backend/src/modules/blog/blog.admin.controller.js's SLUG_RE exactly.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// oldSlug -> approved final ASCII slug (the 5-slug freeze table, plus
// yoga_day — found to fail SLUG_RE only when the dry-run actually ran;
// approved separately, underscore -> hyphen, title unchanged).
const SLUG_OVERRIDES = new Map([
  ['unveiling-the-mysteries-of-ga%e1%b9%87apati', 'unveiling-the-mysteries-of-ganapati'],
  [
    'edicinal-value-of-21-kinds-of-leaves-that-are-offered-in-ga%e1%b9%87esa-puja',
    'medicinal-value-of-21-kinds-of-leaves-offered-in-ganesa-puja',
  ],
  ['what-is-sa%e1%b9%83sk%e1%b9%9btam', 'what-is-samskrtam'],
  ['why-sa%e1%b9%83sk%e1%b9%9btam', 'why-samskrtam'],
  ['how-sa%e1%b9%83sk%e1%b9%9btam', 'how-samskrtam'],
  ['yoga_day', 'yoga-day'],
]);

// Known demo records — each is individually OPTIONAL in the database (may
// already be gone from a prior partial run). Any BlogPost slug or
// BlogCategory name found that is NOT in one of these known sets (demo or
// real) aborts the run — see classifyBaselineState().
const EXPECTED_DEMO_BLOG_SLUGS = [
  'how-the-pancatantra-teaches-without-teaching',
  'what-a-decade-of-sanskrit-camps-taught-us-about-retention',
  'grammar-as-play-rethinking-the-first-lesson',
  'inside-a-village-sanskrit-camp-a-week-in-photos',
  'why-volunteers-keep-coming-back',
  'the-grandmother-who-learned-sanskrit-at-71',
];
const EXPECTED_DEMO_CATEGORY_NAMES = ['Stories', 'Research', 'Teaching', 'Camps', 'Community'];

// The 3 curated names approved for the Home page (by WordPress author_name,
// exactly as captured — see dipl_testimonial_author_name in Section E).
const HOME_CURATED_NAMES = new Set(['Prof. Shrinivasa Varakhedi Ph.D', 'Ms. Rita Badami', 'Kum. Neha Anisetty']);

// Backend/scripts/runSeed.js's CONTENT_SEED deliberately seeds TWO Content
// documents from the same media.js dataset — 'pages/media' and a bare
// 'media' twin — because Frontend/services/mediaService.js requests the
// bare type. Both must always carry identical testimonial data, or the
// public /media/testimonials page (which reads the bare 'media' type) goes
// out of sync with 'pages/media' silently. Discovered via smoke-testing
// after the first Batch 1 commit; fixed here so every future run (full or
// the narrow --fix-media-sync correction) keeps both in step.
const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// ---------------------------------------------------------------------------
// Minimal WXR reader (mirrors the read-only helpers used throughout the
// review — clean()/tag()/categoriesOf()/postmeta() — kept self-contained
// here rather than importing the inventory scripts, since those are
// throwaway analysis tools, not part of the app).
// ---------------------------------------------------------------------------

function clean(s) {
  return s == null ? null : s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
}
function categoriesOf(block, domain) {
  const re = new RegExp(`<category domain="${domain}"[^>]*><!\\[CDATA\\[(.*?)\\]\\]></category>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function postmetaOf(block) {
  const out = {};
  const re = /<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g;
  let m;
  while ((m = re.exec(block))) {
    const key = tag('wp:meta_key', m[1]);
    const val = tag('wp:meta_value', m[1]);
    if (key) out[key] = val;
  }
  return out;
}

// Blog post bodies are stored as Gutenberg blocks (`<!-- wp:paragraph -->`
// etc.), not Divi shortcodes — confirmed during the review (Section D). This
// strips only the block-editor HTML comments, leaving the real markup
// (<p>, <h2>, <a>, ...) untouched for sanitizeBody() to allowlist-filter at
// publish time, same as any other admin-authored post.
function stripGutenbergComments(html) {
  return (html || '').replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').trim();
}

function plainTextExcerpt(html, maxLen = 200) {
  const text = (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8217;|&#8220;|&#8221;|&amp;|&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLen ? text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…' : text;
}

function parseWxr(wxrPath) {
  const xml = fs.readFileSync(wxrPath, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  const blogPosts = items
    .filter((b) => tag('wp:post_type', b) === 'blog_post')
    .map((b) => {
      const rawContent = tag('content:encoded', b) || '';
      const meta = postmetaOf(b);
      return {
        postId: tag('wp:post_id', b),
        title: tag('title', b),
        oldSlug: tag('wp:post_name', b),
        postDate: tag('wp:post_date', b),
        author: tag('dc:creator', b),
        categories: categoriesOf(b, 'blog-category'),
        tags: categoriesOf(b, 'post_tag'),
        bodyHtml: stripGutenbergComments(rawContent),
        rankMathTitle: meta['rank_math_title'] || null,
        rankMathDescription: meta['rank_math_description'] || null,
      };
    });

  const testimonials = items
    .filter((b) => tag('wp:post_type', b) === 'dipl-testimonial')
    .map((b) => {
      const rawContent = tag('content:encoded', b) || '';
      const meta = postmetaOf(b);
      return {
        postId: tag('wp:post_id', b),
        name: meta['dipl_testimonial_author_name'] || tag('title', b),
        designation: (meta['dipl_testimonial_author_designation'] || '').trim() || null,
        category: categoriesOf(b, 'dipl-testimonial-category')[0] || null,
        quote: plainTextExcerpt(rawContent, 10000), // full text, not truncated — 10000 is just a safety ceiling
      };
    });

  return { blogPosts, testimonials };
}

// ---------------------------------------------------------------------------
// Transform: WXR record -> BlogPost.data shape
// {title, excerpt, body, featuredImage, author, categories, tags, seo}
// (Backend/src/modules/blog/blogPost.model.js)
// ---------------------------------------------------------------------------

function toBlogPostRecord(post) {
  const finalSlug = SLUG_OVERRIDES.get(post.oldSlug) || post.oldSlug;
  return {
    slug: finalSlug,
    oldSlug: post.oldSlug, // kept only for the report; not written to Mongo
    publishedAt: post.postDate ? new Date(post.postDate.replace(' ', 'T') + 'Z') : null,
    data: {
      title: post.title,
      // Real content, mechanically derived (truncated plain text) — not
      // invented. WordPress's own excerpt field was empty for all 19 posts.
      excerpt: plainTextExcerpt(post.bodyHtml, 200),
      body: post.bodyHtml,
      // Media/S3 migration is explicitly out of scope for Batch 1 — no
      // featured image is wired here even where a WordPress thumbnail
      // existed; that is real, deferred work, not an oversight.
      featuredImage: null,
      author: post.author || null,
      categories: post.categories,
      tags: post.tags,
      seo: {
        ...(post.rankMathTitle ? { title: post.rankMathTitle } : {}),
        ...(post.rankMathDescription ? { description: post.rankMathDescription } : {}),
      },
    },
  };
}

function toHomeTestimonialRecord(t) {
  return { name: t.name, role: t.designation, quote: t.quote, image: null, active: true };
}
function toMediaTestimonialRecord(t) {
  return { quote: t.quote, name: t.name, role: t.designation };
}
function toMediaAllTestimonialRecord(t) {
  return { type: 'text', quote: t.quote, name: t.name, role: t.designation };
}

// ---------------------------------------------------------------------------
// Validation of parsed WXR content (no DB connection needed for this part)
// ---------------------------------------------------------------------------

function validateParsedContent(parsed) {
  const errors = [];

  if (parsed.blogPosts.length !== 19) {
    errors.push(`Expected exactly 19 blog_post items in the WXR, found ${parsed.blogPosts.length}.`);
  }
  if (parsed.testimonials.length !== 13) {
    errors.push(`Expected exactly 13 dipl-testimonial items in the WXR, found ${parsed.testimonials.length}.`);
  }

  const finalSlugs = parsed.blogPosts.map((p) => SLUG_OVERRIDES.get(p.oldSlug) || p.oldSlug);
  for (const slug of finalSlugs) {
    if (!SLUG_RE.test(slug)) errors.push(`Slug "${slug}" fails SLUG_RE.`);
  }
  const dupeSlugs = finalSlugs.filter((s, i) => finalSlugs.indexOf(s) !== i);
  if (dupeSlugs.length) errors.push(`Duplicate final slugs found: ${[...new Set(dupeSlugs)].join(', ')}`);

  const homeSlider = parsed.testimonials.filter((t) => t.category === 'Home-slider');
  const old = parsed.testimonials.filter((t) => t.category === 'Old');
  if (homeSlider.length !== 7) errors.push(`Expected 7 Home-slider testimonials, found ${homeSlider.length}.`);
  if (old.length !== 6) errors.push(`Expected 6 Old testimonials, found ${old.length}.`);

  const homeSliderNames = new Set(homeSlider.map((t) => t.name));
  for (const name of HOME_CURATED_NAMES) {
    if (!homeSliderNames.has(name)) errors.push(`Curated Home name "${name}" not found among the 7 Home-slider testimonials.`);
  }

  return { errors, homeSlider, old, finalSlugs };
}

// ---------------------------------------------------------------------------
// Baseline state detection (STATE A / B / C model — see header comment)
// ---------------------------------------------------------------------------

function setDiff(a, b) {
  const bSet = new Set(b);
  return a.filter((x) => !bSet.has(x));
}
function setIntersect(a, b) {
  const bSet = new Set(b);
  return a.filter((x) => bSet.has(x));
}

async function classifyBaselineState(realSlugs, realCategoryNames) {
  const errors = [];

  const existingPosts = await BlogPostModel.find({}, { slug: 1 }).lean();
  const existingSlugs = existingPosts.map((p) => p.slug);
  const allowedSlugs = [...EXPECTED_DEMO_BLOG_SLUGS, ...realSlugs];
  const unexpectedSlugs = setDiff(existingSlugs, allowedSlugs);
  if (unexpectedSlugs.length) {
    errors.push(
      `Found ${unexpectedSlugs.length} BlogPost slug(s) that are neither a known demo post nor one of the ` +
        `19 approved real posts — aborting rather than guessing what these are: ${unexpectedSlugs.join(', ')}`
    );
  }

  const existingCategories = await BlogCategoryModel.find({}, { name: 1 }).lean();
  const existingNames = existingCategories.map((c) => c.name);
  const allowedNames = [...EXPECTED_DEMO_CATEGORY_NAMES, ...realCategoryNames];
  const unexpectedNames = setDiff(existingNames, allowedNames);
  if (unexpectedNames.length) {
    errors.push(
      `Found ${unexpectedNames.length} BlogCategory name(s) that are neither a known demo category nor one ` +
        `of the 11 approved real categories — aborting rather than guessing what these are: ${unexpectedNames.join(', ')}`
    );
  }

  if (errors.length) return { errors };

  const demoPostsPresent = setIntersect(existingSlugs, EXPECTED_DEMO_BLOG_SLUGS);
  const realPostsPresent = setIntersect(existingSlugs, realSlugs);
  const demoCategoriesPresent = setIntersect(existingNames, EXPECTED_DEMO_CATEGORY_NAMES);
  const realCategoriesPresent = setIntersect(existingNames, realCategoryNames);

  let state;
  if (
    demoPostsPresent.length === EXPECTED_DEMO_BLOG_SLUGS.length &&
    realPostsPresent.length === 0 &&
    demoCategoriesPresent.length === EXPECTED_DEMO_CATEGORY_NAMES.length &&
    realCategoriesPresent.length === 0
  ) {
    state = 'A (pristine)';
  } else if (
    realPostsPresent.length === realSlugs.length &&
    demoPostsPresent.length === 0 &&
    realCategoriesPresent.length === realCategoryNames.length &&
    demoCategoriesPresent.length === 0
  ) {
    state = 'C (completed)';
  } else {
    state = 'B (partially migrated)';
  }

  const homeContent = await ContentModel.findOne({ type: 'pages/home' }).lean();
  if (!homeContent) errors.push('No Content document found for type "pages/home" — baseline not established.');
  else if (!Array.isArray(homeContent.data?.HOME_TESTIMONIALS)) {
    errors.push('Content "pages/home" exists but data.HOME_TESTIMONIALS is not an array as expected.');
  }

  const mediaErrors = await assertMediaBaseline();
  errors.push(...mediaErrors);

  return {
    errors,
    state,
    demoPostsPresent,
    realPostsPresent,
    demoCategoriesPresent,
    realCategoriesPresent,
  };
}

// Verifies BOTH the 'pages/media' and 'media' Content documents exist and
// already have array-shaped testimonial fields — required before either is
// ever written to, by both the full importer and the narrow
// --fix-media-sync correction. Returns a list of error strings (empty if OK).
async function assertMediaBaseline() {
  const errors = [];
  for (const type of MEDIA_CONTENT_TYPES) {
    const doc = await ContentModel.findOne({ type }).lean();
    if (!doc) {
      errors.push(`No Content document found for type "${type}" — baseline not established.`);
      continue;
    }
    if (!Array.isArray(doc.data?.TESTIMONIALS_FEATURED)) {
      errors.push(`Content "${type}" exists but data.TESTIMONIALS_FEATURED is not an array as expected.`);
    }
    if (!Array.isArray(doc.data?.TESTIMONIALS_ALL)) {
      errors.push(`Content "${type}" exists but data.TESTIMONIALS_ALL is not an array as expected.`);
    }
  }
  return errors;
}

// The one write both the full importer and --fix-media-sync use — always
// keeps 'pages/media' and 'media' identical, via a targeted dot-notation
// $set on only these two fields (never the whole data object).
async function writeMediaTestimonials(featuredRecords, allRecords) {
  await ContentModel.updateMany(
    { type: { $in: MEDIA_CONTENT_TYPES } },
    { $set: { 'data.TESTIMONIALS_FEATURED': featuredRecords, 'data.TESTIMONIALS_ALL': allRecords } }
  );
}

// Extra guard for the BlogCategory hard-delete exception (see header
// comment): confirm no post OTHER than the known demo posts currently
// references any of the 5 demo category names, in either its published or
// draft data. If this ever finds a hit, the run aborts and deletes nothing
// — this is what keeps the hard-delete decision safe rather than just
// assumed safe.
async function assertNoOtherReferences() {
  const offenders = await BlogPostModel.find(
    {
      slug: { $nin: EXPECTED_DEMO_BLOG_SLUGS },
      $or: [
        { 'data.categories': { $in: EXPECTED_DEMO_CATEGORY_NAMES } },
        { 'draftData.categories': { $in: EXPECTED_DEMO_CATEGORY_NAMES } },
      ],
    },
    { slug: 1 }
  ).lean();
  return offenders.map((o) => o.slug);
}

// ---------------------------------------------------------------------------
// Narrow correction mode: --fix-media-sync
//
// Touches ONLY data.TESTIMONIALS_FEATURED / data.TESTIMONIALS_ALL on the
// 'pages/media' and 'media' Content documents. Never reads, validates, or
// writes BlogPost, BlogCategory, or pages/home — those are already correct
// from the completed Batch 1 run and are deliberately out of reach here, per
// the approved narrow-correction scope.
// ---------------------------------------------------------------------------

async function runFixMediaSync(wxrPath, commit) {
  console.log('='.repeat(72));
  console.log(`--fix-media-sync — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.TESTIMONIALS_FEATURED / data.TESTIMONIALS_ALL on pages/media + media.');
  console.log('WXR source:', wxrPath);
  console.log('='.repeat(72));

  if (!fs.existsSync(wxrPath)) {
    console.error(`\nABORT: WXR file not found at ${wxrPath}`);
    process.exitCode = 1;
    return;
  }

  const parsed = parseWxr(wxrPath);
  const homeSlider = parsed.testimonials.filter((t) => t.category === 'Home-slider');
  const old = parsed.testimonials.filter((t) => t.category === 'Old');
  const errors = [];
  if (parsed.testimonials.length !== 13) errors.push(`Expected 13 testimonials in the WXR, found ${parsed.testimonials.length}.`);
  if (homeSlider.length !== 7) errors.push(`Expected 7 Home-slider testimonials, found ${homeSlider.length}.`);
  if (old.length !== 6) errors.push(`Expected 6 Old testimonials, found ${old.length}.`);
  if (errors.length) {
    console.error('\nVALIDATION FAILED (parsed WXR content):');
    for (const e of errors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log('\n[OK] Parsed WXR content passes structural checks (13 testimonials, 7/6 split).');

  const featuredRecords = homeSlider.map(toMediaTestimonialRecord);
  const allRecords = old.map(toMediaAllTestimonialRecord);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const mediaErrors = await assertMediaBaseline();
    if (mediaErrors.length) {
      console.error('\nVALIDATION FAILED (database baseline):');
      for (const e of mediaErrors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Both ${MEDIA_CONTENT_TYPES.join(' and ')} exist with the expected array-shaped testimonial fields.`);

    console.log('\n--- Intended operation ---');
    console.log(
      `Set data.TESTIMONIALS_FEATURED (${featuredRecords.length} entries) and data.TESTIMONIALS_ALL ` +
        `(${allRecords.length} entries) identically on: ${MEDIA_CONTENT_TYPES.join(', ')}`
    );
    console.log('No BlogPost, BlogCategory, or pages/home operation is part of this mode.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --fix-media-sync --commit to perform this correction for real.');
      return;
    }

    await writeMediaTestimonials(featuredRecords, allRecords);
    console.log(`\n[done] Updated data.TESTIMONIALS_FEATURED / data.TESTIMONIALS_ALL on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);
    console.log('--- COMMIT complete. ---');
  } finally {
    await disconnectDb();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const commit = process.argv.includes('--commit');
  const fixMediaSyncOnly = process.argv.includes('--fix-media-sync');
  const wxrArgIdx = process.argv.indexOf('--wxr');
  const wxrPath = wxrArgIdx !== -1 ? process.argv[wxrArgIdx + 1] : DEFAULT_WXR_PATH;

  if (fixMediaSyncOnly) {
    return runFixMediaSync(wxrPath, commit);
  }

  console.log('='.repeat(72));
  console.log(`Batch 1 importer — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('WXR source:', wxrPath);
  console.log('='.repeat(72));

  if (commit) {
    console.log(
      '\n[REMINDER] This will write to the configured MongoDB. Take a backup first if you have not:\n' +
        '  mongodump --uri="mongodb://127.0.0.1:27017/vyoma_migration_dryrun" --out=./backup-before-batch1\n' +
        '(the URI shown here is the one YOU configured earlier in this conversation, not read from .env by this script)\n'
    );
  }

  if (!fs.existsSync(wxrPath)) {
    console.error(`\nABORT: WXR file not found at ${wxrPath}`);
    process.exitCode = 1;
    return;
  }

  const parsed = parseWxr(wxrPath);
  const { errors: contentErrors, homeSlider, old, finalSlugs } = validateParsedContent(parsed);

  if (contentErrors.length) {
    console.error('\nVALIDATION FAILED (parsed WXR content):');
    for (const e of contentErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log('\n[OK] Parsed WXR content passes all structural checks (19 posts, 13 testimonials, slugs unique/valid, 7/6 split, 3 curated names present).');

  const realCategoryNames = [...new Set(parsed.blogPosts.flatMap((p) => p.categories))].sort();

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const baseline = await classifyBaselineState(finalSlugs, realCategoryNames);
    if (baseline.errors.length) {
      console.error('\nVALIDATION FAILED (database baseline):');
      for (const e of baseline.errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Baseline recognized as STATE ${baseline.state}.`);
    console.log(
      `     Demo posts present: ${baseline.demoPostsPresent.length}/${EXPECTED_DEMO_BLOG_SLUGS.length} | ` +
        `Real posts present: ${baseline.realPostsPresent.length}/${finalSlugs.length}`
    );
    console.log(
      `     Demo categories present: ${baseline.demoCategoriesPresent.length}/${EXPECTED_DEMO_CATEGORY_NAMES.length} | ` +
        `Real categories present: ${baseline.realCategoriesPresent.length}/${realCategoryNames.length}`
    );
    if (baseline.state === 'C (completed)') {
      console.log('     This run will be a no-op/revalidation — Batch 1 already appears complete.');
    }

    // Only the demo records that are ACTUALLY present get deleted — this is
    // what makes a rerun from STATE B safe (a prior partial run may have
    // already removed some of them).
    const demoPostsToDelete = baseline.demoPostsPresent;
    const demoCategoriesToDelete = baseline.demoCategoriesPresent;

    let otherReferences = [];
    if (demoCategoriesToDelete.length) {
      otherReferences = await assertNoOtherReferences();
      if (otherReferences.length) {
        console.error(
          '\nABORT: found non-demo BlogPost(s) still referencing a demo category name — the hard-delete ' +
            'safety condition is not met:',
          otherReferences
        );
        console.error('No writes were made. This needs manual investigation before Batch 1 can proceed.');
        process.exitCode = 1;
        return;
      }
      console.log('[OK] Confirmed no non-demo post references any of the 5 demo category names — hard-delete remains safe.');
    }

    // ---- Build the operation plan (same in both modes) --------------------
    const blogRecords = parsed.blogPosts.map(toBlogPostRecord);
    const homeRecords = homeSlider.filter((t) => HOME_CURATED_NAMES.has(t.name)).map(toHomeTestimonialRecord);
    const featuredRecords = homeSlider.map(toMediaTestimonialRecord);
    const allRecords = old.map(toMediaAllTestimonialRecord);

    console.log('\n--- Intended operations ---');
    console.log(`1. Upsert ${realCategoryNames.length} BlogCategory records (idempotent — already-present ones are unchanged):`, realCategoryNames);
    console.log(`2. Upsert ${blogRecords.length} BlogPost records by slug (idempotent):`);
    for (const r of blogRecords) {
      const changed = r.slug !== r.oldSlug ? `  [slug changed from "${r.oldSlug}"]` : '';
      const already = baseline.realPostsPresent.includes(r.slug) ? '  [already present]' : '';
      console.log(`   - ${r.slug}${changed}${already}`);
    }
    console.log(
      `3. Delete ${demoPostsToDelete.length}/${EXPECTED_DEMO_BLOG_SLUGS.length} demo BlogPost records ` +
        `still present:`,
      demoPostsToDelete.length ? demoPostsToDelete : '(none left to delete)'
    );
    console.log(
      `4. Delete ${demoCategoriesToDelete.length}/${EXPECTED_DEMO_CATEGORY_NAMES.length} demo BlogCategory ` +
        `records still present (EXCEPTION to the model's documented "no delete, ever" convention — see the ` +
        `header comment for why this remains safe):`,
      demoCategoriesToDelete.length ? demoCategoriesToDelete : '(none left to delete)'
    );
    console.log(`5. Update Content{type:'pages/home'}.data.HOME_TESTIMONIALS -> ${homeRecords.length} curated entries:`);
    for (const r of homeRecords) console.log(`   - ${r.name} (${r.role})`);
    console.log(
      `6. Update Content{type in [${MEDIA_CONTENT_TYPES.map((t) => `'${t}'`).join(', ')}]}.data.TESTIMONIALS_FEATURED ` +
        `-> ${featuredRecords.length} entries (all 7 Home-slider) — both documents kept identical`
    );
    console.log(
      `7. Update Content{type in [${MEDIA_CONTENT_TYPES.map((t) => `'${t}'`).join(', ')}]}.data.TESTIMONIALS_ALL ` +
        `-> ${allRecords.length} entries (all 6 Old) — both documents kept identical`
    );

    if (homeRecords.length !== 3) {
      console.error(`\nABORT: expected exactly 3 curated Home records, resolved ${homeRecords.length}.`);
      process.exitCode = 1;
      return;
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform these operations for real.');
      return;
    }

    // ---- Execute (commit mode only) ---------------------------------------
    // No multi-document transaction is used: this is a standalone mongod
    // (not a replica set), which does not support Mongoose sessions/
    // transactions. Operations are ordered to fail as safely as possible —
    // new content is written before anything old is deleted, so a failure
    // partway through never leaves the site with less content than before,
    // only (at worst) some leftover demo records — which the delta-based
    // baseline detection above means a simple rerun will finish cleanly.
    console.log('\n--- COMMIT: executing operations ---');

    for (const name of realCategoryNames) {
      await BlogCategoryModel.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    }
    console.log(`[done] ${realCategoryNames.length} BlogCategory upserts.`);

    for (const r of blogRecords) {
      await BlogPostModel.findOneAndUpdate(
        { slug: r.slug },
        { slug: r.slug, data: r.data, status: 'published', publishedAt: r.publishedAt },
        { upsert: true, new: true }
      );
    }
    console.log(`[done] ${blogRecords.length} BlogPost upserts.`);

    if (demoPostsToDelete.length) {
      const delPosts = await BlogPostModel.deleteMany({ slug: { $in: demoPostsToDelete } });
      console.log(`[done] Deleted ${delPosts.deletedCount} demo BlogPost record(s).`);
    } else {
      console.log('[skip] No demo BlogPost records left to delete.');
    }

    if (demoCategoriesToDelete.length) {
      const delCats = await BlogCategoryModel.deleteMany({ name: { $in: demoCategoriesToDelete } });
      console.log(`[done] Deleted ${delCats.deletedCount} demo BlogCategory record(s).`);
    } else {
      console.log('[skip] No demo BlogCategory records left to delete.');
    }

    await ContentModel.findOneAndUpdate({ type: 'pages/home' }, { $set: { 'data.HOME_TESTIMONIALS': homeRecords } });
    console.log('[done] Updated pages/home data.HOME_TESTIMONIALS.');

    await writeMediaTestimonials(featuredRecords, allRecords);
    console.log(`[done] Updated data.TESTIMONIALS_FEATURED / data.TESTIMONIALS_ALL on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    const finalPostCount = await BlogPostModel.countDocuments();
    const finalCategoryCount = await BlogCategoryModel.countDocuments();
    console.log('\n--- Post-commit counts ---');
    console.log('BlogPost:', finalPostCount, '(expected 19)');
    console.log('BlogCategory:', finalCategoryCount, '(expected 11)');
    console.log('\n--- COMMIT complete. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exitCode = 1;
});
