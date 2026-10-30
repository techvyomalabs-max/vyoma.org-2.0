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
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { env } from '../../../src/config/env.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { BlogPostModel } from '../../../src/modules/blog/blogPost.model.js';
import { BlogCategoryModel } from '../../../src/modules/blog/blogCategory.model.js';
import { sanitizeBlogBody } from '../../../src/modules/blog/sanitizeBody.js';
import { isAlreadySafeImageHost, loadBlogImageManifest, buildImageUrlMap, resolveLocalMediaUrl } from './blogImageManifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Frozen decisions (from the approved review — not invented here)
// ---------------------------------------------------------------------------

export const DEFAULT_WXR_PATH = path.resolve(
  __dirname,
  '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml'
);

// Matches Backend/src/modules/blog/blog.admin.controller.js's SLUG_RE exactly.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// oldSlug -> approved final ASCII slug (the 5-slug freeze table, plus
// yoga_day — found to fail SLUG_RE only when the dry-run actually ran;
// approved separately, underscore -> hyphen, title unchanged).
export const SLUG_OVERRIDES = new Map([
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
export const EXPECTED_DEMO_BLOG_SLUGS = [
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

// Blocker C (Task 7C): this script must never run, read, or write against
// the standing-rules-protected dry-run database, regardless of what
// MONGODB_URI happens to be configured to at invocation time. Checked by
// database NAME only (never the full connection string, which could carry
// credentials) — see assertSafeDatabaseTarget() below, called immediately
// after every connectDb() in this file, before any query or write.
const PROTECTED_DB_NAMES = new Set(['vyoma_migration_dryrun']);

// Aborts (throws) if the active mongoose connection's database name is on
// the protected list. Takes a mongoose connection object (not a URI string)
// so nothing resembling a credential is ever inspected, logged, or printed
// — only the database name, exactly like connectDb()'s own existing
// never-log-the-connection-string convention.
export function assertSafeDatabaseTarget(connection) {
  const dbName = connection?.name || connection?.db?.databaseName || null;
  if (dbName && PROTECTED_DB_NAMES.has(dbName)) {
    throw new Error(
      `Refusing to proceed: the active database ("${dbName}") is on this script's protected list and must never be read, written, reset, or reseeded by this importer.`
    );
  }
  return dbName;
}

// Task 7C.1: a STRONGER, allow-list-style guard for automated integration
// tests specifically -- unlike assertSafeDatabaseTarget() above (a
// blocklist that only rejects one specific protected name, and would say
// nothing about any OTHER real/persistent database), this requires the
// caller to explicitly supply the exact MongoMemoryServer instance that is
// supposed to be backing the current connection, and verifies the live
// connection's host/port actually resolve to that same instance -- not
// merely "isn't named something bad". Never inspects or logs credentials;
// host/port only, same convention as assertSafeDatabaseTarget().
//
// This is deliberately NOT wired into the CLI path (main()/runFixMediaSync):
// a real, operator-run migration legitimately targets a real, ambiently-
// configured database once explicitly authorized via --commit, and that
// path is unaffected by this function. It exists so a test file's own
// setup can assert, before any write, that it is unquestionably talking to
// the disposable instance it just created -- not whatever `mongoose`'s
// default connection happens to be at that moment.
export function assertDisposableTestDatabase(connection, memoryServer) {
  if (!memoryServer || typeof memoryServer.getUri !== 'function') {
    throw new Error(
      'Refusing to run test write operations: an explicit, disposable mongodb-memory-server instance must be supplied (none was given).'
    );
  }
  const expected = new URL(memoryServer.getUri());
  const actualHost = connection?.host ?? null;
  const actualPort = connection?.port != null ? String(connection.port) : null;
  if (actualHost !== expected.hostname || actualPort !== expected.port) {
    throw new Error(
      'Refusing to run test write operations: the active connection does not match the explicitly supplied disposable mongodb-memory-server instance.'
    );
  }
  return true;
}

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
// (<p>, <h2>, <a>, ...) for sanitizeBlogBody() to allowlist-filter next, in
// toBlogPostRecord() below — the same single sanitization boundary every
// other admin-authored post's body goes through.
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

export function parseWxr(wxrPath) {
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
// Task 7F.2 — image preservation (inline + featured)
//
// Decision 1 (content owner, approved): preserve all original blog images.
// Most of this is already true today with zero code change: every inline
// <img> already hosted on vyoma.org/www.vyoma.org passes straight through
// sanitizeBlogBody()'s existing, UNMODIFIED allowlist in every environment,
// including production — confirmed in Task 7D's validation. This section
// only ever intervenes for the narrow remainder that does NOT already work:
//   (a) the 8 Google-hosted inline images across 5 posts (dropped today by
//       the sanitizer's host allowlist, which is correct and unchanged —
//       googleusercontent.com is not, and must not become, an allowed
//       host), and
//   (b) all 12 posts with a real, post-specific featured/OG image (always
//       null today, regardless of host, because no featured-image wiring
//       existed at all before this task).
// Nothing here ever changes sanitizeBody.js or its allowlist.
// ---------------------------------------------------------------------------

// Rewrites exactly one attribute — an <img> tag's `src` value — leaving
// every other attribute (alt, width, height, class, the self-closing `/`,
// attribute order) and all surrounding markup/text completely untouched.
// Only ever touches an <img> whose current `src` is NOT already on an
// always-safe host (vyoma.org images are left byte-for-byte alone, on
// purpose — rewriting them would add risk for zero benefit, since they
// already work everywhere). Returns the body unchanged plus a collected
// `issues` list — it never throws and never silently drops an image itself
// (sanitizeBlogBody(), called afterward and unmodified, is still the only
// thing that can ultimately remove an unmapped/unsafe <img>, exactly as it
// always has).
export function rewriteInlineImages(bodyHtml, postSlug, inlineMap, { devImagePreview, devImagePreviewPort } = {}) {
  const issues = [];
  if (!bodyHtml) return { html: bodyHtml, issues };

  const html = bodyHtml.replace(/<img([^>]*?)\ssrc="([^"]+)"([^>]*)>/gi, (full, before, src, after) => {
    if (isAlreadySafeImageHost(src)) return full; // already safe everywhere — never touched

    const row = inlineMap ? inlineMap.get(`${postSlug}|${src}`) : null;
    if (!row) {
      issues.push(`No manifest mapping found for a non-allowlisted-host image in "${postSlug}": ${src}`);
      return full; // left as-is; the unmodified sanitizer will drop it, same as before this task
    }
    if (!devImagePreview) {
      issues.push(`Production-safe mapping unavailable (requires S3; --dev-image-preview not enabled) for "${postSlug}": ${src}`);
      return full;
    }
    const localUrl = resolveLocalMediaUrl(row, devImagePreviewPort);
    if (!localUrl) {
      issues.push(`Manifest entry for "${postSlug}" resolved to an unsafe local path — refusing to use it: ${row.localFilename}`);
      return full;
    }
    return `<img${before} src="${localUrl}"${after}>`;
  });

  return { html, issues };
}

// Resolves a post's featured image, if the manifest has one for it. Every
// real featured-image row in the current manifest already points at a
// vyoma.org-hosted URL (confirmed by Task 7F.1's regression tests), so the
// ORIGINAL url is used directly — genuinely production-safe today, in
// every environment, requiring neither S3 nor --dev-image-preview. `alt` is
// deliberately left null rather than invented: the frontend's own existing
// render path (Frontend/app/(public)/media/blog/[slug]/page.js) already
// falls back to the post's title when featuredImage.alt is absent.
// yoga_day is correctly never resolved here: its only OG-worthy image
// (01_Yoga_Bundle.jpg) is classified "inline" in the manifest, not
// "featured" — it has no distinct featured-image attachment of its own,
// and this function must not invent one (see Task 7F's resolved finding).
export function resolveFeaturedImage(postSlug, featuredByPostSlug) {
  const row = featuredByPostSlug ? featuredByPostSlug.get(postSlug) : null;
  if (!row) return { featuredImage: null, issues: [] };
  if (!isAlreadySafeImageHost(row.originalUrl)) {
    // Not expected with the current, reviewed manifest (every known
    // featured row is vyoma.org-hosted) — handled explicitly rather than
    // assumed, per "do not silently strip images or fall back to localhost
    // URLs" for anything destined to be treated as production-safe.
    return { featuredImage: null, issues: [`Featured image for "${postSlug}" is not from an already-safe host and has no verified production mapping: ${row.originalUrl}`] };
  }
  return { featuredImage: { url: row.originalUrl, alt: null }, issues: [] };
}

// ---------------------------------------------------------------------------
// Transform: WXR record -> BlogPost.data shape
// {title, excerpt, body, featuredImage, author, categories, tags, seo}
// (Backend/src/modules/blog/blogPost.model.js)
// ---------------------------------------------------------------------------

// `imageContext` is entirely optional — every existing caller that omits it
// (including every pre-7F.2 regression test) gets EXACTLY the pre-7F.2
// behavior: no inline image is ever rewritten, featuredImage is always
// null. It is only ever populated by main() below, from a loaded manifest.
export function toBlogPostRecord(post, imageContext = {}) {
  const { inlineMap = null, featuredByPostSlug = null, devImagePreview = false, devImagePreviewPort = null } = imageContext;
  const finalSlug = SLUG_OVERRIDES.get(post.oldSlug) || post.oldSlug;

  // Keyed by the FINAL slug, not post.oldSlug: the real, reviewed manifest
  // (Backend/.local-media/blog-image-manifest.json) stores postSlug as the
  // already-overridden slug (e.g. "what-is-samskrtam", never the
  // percent-encoded "what-is-sa%e1%b9%83sk%e1%b9%9btam") for every row —
  // confirmed directly against the manifest's own content. Using oldSlug
  // here would silently fail to match any of the 3 posts whose slug
  // changes under SLUG_OVERRIDES, exactly the kind of silent-drop this
  // whole feature exists to prevent.
  const { html: imageMappedBody, issues: inlineImageIssues } = rewriteInlineImages(post.bodyHtml, finalSlug, inlineMap, {
    devImagePreview,
    devImagePreviewPort,
  });

  // Blocker B (Task 7C): every body passes through the app's own, already
  // WordPress-content-audited sanitizer (Backend/src/modules/blog/
  // sanitizeBody.js) right here, at transform time — not left for a later
  // "publish time" step that, for this script, never actually existed (see
  // the Task 7B investigation this fix came out of). The excerpt is derived
  // from this same sanitized HTML, not the raw WXR markup, so a disallowed
  // tag's inner text (e.g. a hypothetical <script>) can never leak into the
  // plain-text excerpt either. Image-URL rewriting above happens BEFORE
  // this call, never after — sanitizeBlogBody() is always the last word on
  // which <img> tags actually survive.
  const sanitizedBody = sanitizeBlogBody(imageMappedBody);

  // Same FINAL-slug key as above — the manifest's "featured" rows for
  // what-is-samskrtam/why-samskrtam/how-samskrtam are also keyed by the
  // final, not the percent-encoded, slug.
  const { featuredImage, issues: featuredImageIssues } = resolveFeaturedImage(finalSlug, featuredByPostSlug);

  return {
    slug: finalSlug,
    oldSlug: post.oldSlug, // kept only for the report; not written to Mongo
    publishedAt: post.postDate ? new Date(post.postDate.replace(' ', 'T') + 'Z') : null,
    data: {
      title: post.title,
      // Real content, mechanically derived (truncated plain text) — not
      // invented. WordPress's own excerpt field was empty for all 19 posts.
      excerpt: plainTextExcerpt(sanitizedBody, 200),
      body: sanitizedBody,
      featuredImage,
      author: post.author || null,
      categories: post.categories,
      tags: post.tags,
      seo: {
        ...(post.rankMathTitle ? { title: post.rankMathTitle } : {}),
        ...(post.rankMathDescription ? { description: post.rankMathDescription } : {}),
      },
    },
    // Not written to Mongo — consulted by main() (pre-connect) to decide
    // whether this run is safe to proceed with at all. Always [] for any
    // caller that omits imageContext, i.e. every pre-7F.2 call site.
    imageIssues: [...inlineImageIssues, ...featuredImageIssues],
  };
}

// Blocker A (Task 7C): insert-only, via $setOnInsert — never a bare
// replacement document. The prior shape (`{ slug, data, status,
// publishedAt }` with no operator) told MongoDB to REPLACE the whole
// existing document on every match, which would have silently discarded an
// admin's edited `data`, their in-progress `draftData` (replaced away
// entirely, since it isn't listed), and any `status`/`publishedAt` change,
// on every rerun — exactly the bug class already fixed for runSeed.js in
// Phase 1 Task 6I-B/6I-B3, which never covered this independently-written
// importer. `slug` is deliberately NOT repeated inside $setOnInsert: the
// upsert filter already applies it to a newly-inserted document on its own
// (verified for this exact pattern elsewhere in this codebase — see
// runSeed.js's own comment on the same point). `draftData: null` is set
// explicitly on insert so a freshly-created post has the same shape as one
// created through the normal admin flow; once a post exists, this
// importer never touches draftData again, on this call or any rerun.
export async function upsertBlogPosts(blogRecords) {
  const results = [];
  for (const r of blogRecords) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await BlogPostModel.findOneAndUpdate(
      { slug: r.slug },
      {
        $setOnInsert: {
          data: r.data,
          status: 'published',
          publishedAt: r.publishedAt,
          draftData: null,
        },
      },
      { upsert: true, new: true }
    );
    results.push(doc);
  }
  return results;
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

export function validateParsedContent(parsed) {
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

export async function classifyBaselineState(realSlugs, realCategoryNames) {
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
export async function assertNoOtherReferences() {
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
  try {
    const dbName = assertSafeDatabaseTarget(mongoose.connection);
    console.log('[OK] Connected to configured MongoDB (URI value not printed; database name:', dbName || '(unknown)', ').');

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
  const devImagePreview = process.argv.includes('--dev-image-preview');
  const wxrArgIdx = process.argv.indexOf('--wxr');
  const wxrPath = wxrArgIdx !== -1 ? process.argv[wxrArgIdx + 1] : DEFAULT_WXR_PATH;

  if (fixMediaSyncOnly) {
    return runFixMediaSync(wxrPath, commit);
  }

  // Task 7F.2, Step 2 requirement: never infer production safety from
  // NODE_ENV alone — --dev-image-preview is the PRIMARY, explicit gate.
  // This check is an additional, early, loud failure on top of that
  // explicit gate (not a replacement for it): sanitizeBlogBody()'s own,
  // separate, unmodified isLocalDevHost check would independently strip
  // any resulting localhost <img> in a real production run regardless, but
  // failing here first is clearer than letting content silently vanish
  // later.
  if (devImagePreview && env.nodeEnv === 'production') {
    console.error('\nABORT: --dev-image-preview must never be used when NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }

  console.log('='.repeat(72));
  console.log(`Batch 1 importer — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('WXR source:', wxrPath);
  console.log('Image mode:', devImagePreview ? 'DEV-PREVIEW (local-media URLs permitted)' : 'PRODUCTION-SAFE ONLY (no localhost URLs)');
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

  // Task 7F.2: image mapping is resolved and validated BEFORE any database
  // connection is made — "fail safely before any write" means before any
  // write AND before any read of a real/configured database, not merely
  // before the final commit step.
  let manifest = null;
  try {
    manifest = loadBlogImageManifest();
  } catch (err) {
    console.error('\nABORT: the blog image manifest exists but is malformed:', err.message);
    process.exitCode = 1;
    return;
  }
  if (devImagePreview && !manifest) {
    console.error('\nABORT: --dev-image-preview was requested but Backend/.local-media/blog-image-manifest.json is absent.');
    process.exitCode = 1;
    return;
  }
  const { inlineMap, featuredByPostSlug } = buildImageUrlMap(manifest);
  const imageContext = { inlineMap, featuredByPostSlug, devImagePreview, devImagePreviewPort: env.port };

  const blogRecords = parsed.blogPosts.map((p) => toBlogPostRecord(p, imageContext));
  const allImageIssues = blogRecords.flatMap((r) => r.imageIssues);
  if (allImageIssues.length) {
    console.log(`\n--- IMAGE PRESERVATION ISSUES (${allImageIssues.length}) ---`);
    for (const issue of allImageIssues) console.log(' -', issue);
    if (commit) {
      console.error(
        '\nABORT: image preservation cannot be guaranteed for the above — refusing to commit rather than silently ' +
          'dropping an original image or writing a non-production-safe URL. Re-run with --dev-image-preview for a ' +
          'local/staging-only preview, or resolve these once a verified production image host (S3) is available.'
      );
      console.error('No database connection was made.');
      process.exitCode = 1;
      return;
    }
    console.log('(dry-run: continuing to show the rest of the plan; a --commit run would ABORT here.)');
  } else {
    console.log('\n[OK] Every required image has a usable mapping for the selected image mode.');
  }

  await connectDb();
  try {
    const dbName = assertSafeDatabaseTarget(mongoose.connection);
    console.log('[OK] Connected to configured MongoDB (URI value not printed; database name:', dbName || '(unknown)', ').');

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
    // blogRecords was already built above, before connectDb() — reused here
    // as-is; see the image-mapping/validation block preceding the database
    // connection.
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

    await upsertBlogPosts(blogRecords);
    console.log(`[done] ${blogRecords.length} BlogPost upserts (insert-only — see upsertBlogPosts()).`);

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

// Blocker C (Task 7C): `main()` must only run when this file is executed
// directly as the CLI entry point (`node batch1-import.mjs [...]`), never
// as a side effect of `import`-ing it. This is what makes the exported
// functions above (parseWxr, toBlogPostRecord, upsertBlogPosts,
// assertSafeDatabaseTarget, classifyBaselineState, assertNoOtherReferences)
// safe for a test file to import directly and exercise against its own
// disposable mongodb-memory-server connection — no ambient MONGODB_URI, no
// accidental connectDb() call, no accidental write, just from importing
// this module.
const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err.message);
    process.exitCode = 1;
  });
}
