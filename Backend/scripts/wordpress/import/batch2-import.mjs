// WordPress -> MERN migration: Batch 2 importer.
//
// Scope (per the approved Batch 2 plan):
//   - Create two new Content documents:
//       pages/privacy -> { title, effectiveDate, body, SEO }
//       pages/terms   -> { title, effectiveDate, body, SEO }
//     Both created as brand-new documents (insert only) — this script never
//     modifies an existing Content document of any other type.
//   - Create 25 Redirect documents (301):
//       19 blog post-level + 4 blog landing-page (already reviewed in the
//       Blog redirect manifest turn) + 2 new:
//         /privacy/ -> /privacy
//         /terms/   -> /terms
//
// Explicitly OUT of scope (must not be touched by this script):
//   BlogPost, BlogCategory, DonationScheme, pages/home, pages/media, media,
//   any other existing Content type, FormSubmission, WPCode, User/Role/
//   AuditLog, Donation/PaymentEvent, Settings, S3/media.
//
// Content fidelity: per explicit instruction, this script does NOT correct
// or normalize any source quirk. Known, deliberately preserved as-is:
//   - Privacy Policy's numbered sections skip "3." entirely (source jumps
//     2 -> 4, confirmed against the WXR — not a parsing artifact).
//   - Terms' section 21 ("Governing Law & Dispute Resolution") exists as
//     real content but is not inside a numbered <ol> like every other
//     section (numbering visibly jumps 20 -> 22 in the rendered page).
//   - Terms' intro paragraph links "our Donation Policy" to
//     https://vyoma.org/privacy/ (misdirected — a real Donations Policy
//     section exists later in the same document, at "16.").
//   - The literal "Effective date: 01/01/2023" line inside Privacy's body
//     text is left exactly where WordPress had it; this script does not
//     parse/extract it into the separate `effectiveDate` field (that field
//     exists for future admin use but is imported as null — extracting a
//     date from prose would require interpreting the source, which this
//     migration does not do).
//
// Source of truth: the reviewed WXR export
// (Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml),
// parsed fresh by this script.
//
// Modes:
//   node batch2-import.mjs            -> dry-run (default): validates and
//                                         prints the intended operations,
//                                         writes nothing.
//   node batch2-import.mjs --commit   -> performs the real writes, only
//                                         after the same validation passes.
//
// --- Recognized baseline states ---------------------------------------------
// Unlike Batch 1 (which had to reconcile against pre-existing demo content),
// Batch 2 is a pure insert of brand-new records, so its baseline check is
// simpler and stricter:
//   - pages/privacy / pages/terms Content documents must NOT already exist.
//     If either does, ABORT (do not overwrite unknown existing content).
//   - For each of the 25 redirect candidates: if a Redirect with the same
//     fromPath already exists with the SAME toPath, treat it as already
//     done (skip, not an error — makes reruns after a partial commit safe).
//     If it exists with a DIFFERENT toPath, that is a genuine conflict —
//     ABORT.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { RedirectModel } from '../../../src/modules/redirects/redirect.model.js';
import { BlogPostModel } from '../../../src/modules/blog/blogPost.model.js';
import { sanitizeLegalBody } from '../../../src/modules/content/sanitizeLegalBody.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_WXR_PATH = path.resolve(
  __dirname,
  '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml'
);

const LEGAL_SLUGS = ['privacy', 'terms'];

// ---------------------------------------------------------------------------
// WXR parsing (same hand-rolled helpers used throughout this migration —
// no XML parser library is installed).
// ---------------------------------------------------------------------------
function clean(s) {
  return s == null ? null : s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
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

// Strips Divi Builder shortcode wrappers ([et_pb_section ...] ... [/et_pb_
// section]) and any stray Gutenberg block comments left inside them,
// leaving only the real semantic HTML (<p>, <h1>, <ol>, <a>, ...)
// untouched — this is the ONLY transformation applied; no tag content is
// rewritten, reordered, or corrected.
function stripDiviAndGutenberg(html) {
  return (html || '')
    .replace(/\[\/?et_pb_[a-z_]+[^\]]*\]/gi, '')
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '')
    .trim();
}

// TITLE is rendered as plain text (PageHero's <h1>{TITLE}</h1>, an admin
// text input), not as HTML — unlike BODY, it needs HTML entities decoded
// here, since nothing downstream will decode them for it.
function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// The page's own <h1> becomes the separate `title` field (matching every
// other public page's convention of one PageHero-rendered H1, sourced from
// its own title field, not duplicated inside the body) — the remaining
// body starts immediately after it, otherwise byte-for-byte unchanged.
function extractTitleAndBody(rawHtml) {
  const cleaned = stripDiviAndGutenberg(rawHtml);
  const h1Match = cleaned.match(/<h1>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? decodeEntities(h1Match[1].replace(/<[^>]+>/g, '').trim()) : null;
  const body = h1Match ? cleaned.replace(h1Match[0], '').trim() : cleaned;
  return { title, body };
}

function parseLegalPages(wxrPath) {
  const xml = fs.readFileSync(wxrPath, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

  const found = {};
  for (const item of items) {
    if (tag('wp:post_type', item) !== 'page') continue;
    const slug = tag('wp:post_name', item);
    if (!LEGAL_SLUGS.includes(slug)) continue;

    const rawContent = tag('content:encoded', item) || '';
    const meta = postmetaOf(item);
    const { title, body } = extractTitleAndBody(rawContent);

    found[slug] = {
      postId: tag('wp:post_id', item),
      slug,
      status: tag('wp:status', item),
      title,
      body,
      rankMathTitle: meta['rank_math_title'] || null,
      rankMathDescription: meta['rank_math_description'] || null,
    };
  }
  return found;
}

// Field names are UPPERCASE_SNAKE_CASE to match the established convention
// for every other Content type's `data` shape in this codebase (e.g.
// HOME_TESTIMONIALS, TESTIMONIALS_FEATURED, FAQ_GROUPS) — a deliberate,
// flagged deviation from the plan message's lowercase example shape, kept
// consistent with every existing page.js/mockData pairing rather than
// introducing the first lowercase-keyed Content type.
function toContentRecord(page, contentType, publicPath) {
  return {
    type: contentType,
    data: {
      TITLE: page.title,
      EFFECTIVE_DATE: null,
      BODY: sanitizeLegalBody(page.body),
      SEO: { title: page.rankMathTitle || page.title, description: page.rankMathDescription || null, canonical: publicPath, ogImage: null },
    },
  };
}

// ---------------------------------------------------------------------------
// Redirect manifest (25 rules): the 19 post-level + 4 landing-page blog
// rules already reviewed/approved in the Blog redirect manifest turn, plus
// the 2 new Privacy/Terms rules.
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
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

function finalBlogSlug(oldSlug) {
  return SLUG_OVERRIDES.get(oldSlug) || oldSlug;
}

function buildRedirectCandidates(wxrPath) {
  const xml = fs.readFileSync(wxrPath, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const blogSlugs = items.filter((b) => tag('wp:post_type', b) === 'blog_post').map((b) => tag('wp:post_name', b));

  const candidates = blogSlugs.map((oldSlug) => ({
    fromPath: `/blog-post/${oldSlug}/`,
    toPath: `/media/blog/${finalBlogSlug(oldSlug)}`,
    statusCode: 301,
    notes: 'Batch 2: blog post redirect (WordPress -> MERN blog).',
  }));

  for (const p of ['/blog/', '/blog-2/', '/blogs/', '/blog-post/']) {
    candidates.push({ fromPath: p, toPath: '/media/blog', statusCode: 301, notes: 'Batch 2: blog landing-page redirect.' });
  }

  candidates.push({ fromPath: '/privacy/', toPath: '/privacy', statusCode: 301, notes: 'Batch 2: Privacy Policy redirect.' });
  candidates.push({ fromPath: '/terms/', toPath: '/terms', statusCode: 301, notes: 'Batch 2: Terms & Conditions redirect.' });

  return candidates;
}

function checkRedirectSafety(candidates) {
  const errors = [];
  const bySource = new Map();
  for (const c of candidates) {
    if (bySource.has(c.fromPath)) errors.push(`Duplicate source within this batch: ${c.fromPath}`);
    bySource.set(c.fromPath, c);
  }
  for (const c of candidates) {
    if (c.fromPath === c.toPath) errors.push(`Self-loop: ${c.fromPath}`);
    const reverse = bySource.get(c.toPath);
    if (reverse && reverse.toPath === c.fromPath) errors.push(`Direct two-rule reversal: ${c.fromPath} <-> ${c.toPath}`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const commit = process.argv.includes('--commit');
  const wxrArgIdx = process.argv.indexOf('--wxr');
  const wxrPath = wxrArgIdx !== -1 ? process.argv[wxrArgIdx + 1] : DEFAULT_WXR_PATH;

  console.log('='.repeat(72));
  console.log(`Batch 2 importer — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('WXR source:', wxrPath);
  console.log('='.repeat(72));

  if (commit) {
    console.log(
      '\n[REMINDER] This will write to the configured MongoDB. Take a backup first if you have not:\n' +
        '  mongodump --uri="mongodb://127.0.0.1:27017/vyoma_migration_dryrun" --out=./backup-before-batch2\n' +
        '(the URI shown here is the one YOU configured earlier in this conversation, not read from .env by this script)\n'
    );
  }

  if (!fs.existsSync(wxrPath)) {
    console.error(`\nABORT: WXR file not found at ${wxrPath}`);
    process.exitCode = 1;
    return;
  }

  const pages = parseLegalPages(wxrPath);
  const missing = LEGAL_SLUGS.filter((s) => !pages[s]);
  if (missing.length) {
    console.error(`\nABORT: could not find WXR page(s) for slug(s): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (!pages.privacy.title || !pages.terms.title) {
    console.error('\nABORT: could not extract an <h1> title from the parsed Privacy/Terms content.');
    process.exitCode = 1;
    return;
  }
  console.log(`\n[OK] Parsed WXR: Privacy (post_id ${pages.privacy.postId}, ${pages.privacy.body.length} body chars), ` +
    `Terms (post_id ${pages.terms.postId}, ${pages.terms.body.length} body chars).`);

  const redirectCandidates = buildRedirectCandidates(wxrPath);
  const redirectErrors = checkRedirectSafety(redirectCandidates);
  if (redirectErrors.length) {
    console.error('\nVALIDATION FAILED (redirect manifest, in-batch check):');
    for (const e of redirectErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] ${redirectCandidates.length} redirect candidates pass in-batch duplicate/self-loop/reversal checks.`);
  if (redirectCandidates.length !== 25) {
    console.error(`\nABORT: expected exactly 25 redirect candidates, built ${redirectCandidates.length}.`);
    process.exitCode = 1;
    return;
  }

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    // ---- Baseline: Content -------------------------------------------------
    const existingPrivacy = await ContentModel.findOne({ type: 'pages/privacy' }).lean();
    const existingTerms = await ContentModel.findOne({ type: 'pages/terms' }).lean();
    if (existingPrivacy) {
      console.error('\nABORT: Content{type: "pages/privacy"} already exists — this script only inserts brand-new records.');
      process.exitCode = 1;
      return;
    }
    if (existingTerms) {
      console.error('\nABORT: Content{type: "pages/terms"} already exists — this script only inserts brand-new records.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Neither pages/privacy nor pages/terms exists yet — safe to create.');

    // ---- Baseline: destination BlogPosts still resolve ---------------------
    const blogRedirects = redirectCandidates.filter((c) => c.toPath.startsWith('/media/blog/'));
    const destSlugs = blogRedirects.map((c) => c.toPath.replace('/media/blog/', ''));
    const foundPosts = await BlogPostModel.find({ slug: { $in: destSlugs } }).select('slug').lean();
    const foundSlugSet = new Set(foundPosts.map((p) => p.slug));
    const unresolved = destSlugs.filter((s) => !foundSlugSet.has(s));
    if (unresolved.length) {
      console.error('\nABORT: the following blog redirect destinations do not resolve to a real BlogPost:', unresolved);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] All ${destSlugs.length} blog redirect destinations resolve to a real BlogPost document.`);

    // ---- Baseline: Redirect conflicts --------------------------------------
    const existingRedirects = await RedirectModel.find({ fromPath: { $in: redirectCandidates.map((c) => c.fromPath) } }).lean();
    const existingBySource = new Map(existingRedirects.map((r) => [r.fromPath, r]));
    const toCreate = [];
    const alreadyDone = [];
    const conflicts = [];
    for (const c of redirectCandidates) {
      const existing = existingBySource.get(c.fromPath);
      if (!existing) {
        toCreate.push(c);
      } else if (existing.toPath === c.toPath) {
        alreadyDone.push(c);
      } else {
        conflicts.push({ fromPath: c.fromPath, existingToPath: existing.toPath, candidateToPath: c.toPath });
      }
    }
    if (conflicts.length) {
      console.error('\nABORT: the following redirect(s) already exist with a DIFFERENT destination — a genuine conflict:');
      for (const c of conflicts) console.error(`  - ${c.fromPath}: existing -> ${c.existingToPath}, candidate -> ${c.candidateToPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Redirect baseline: ${toCreate.length} to create, ${alreadyDone.length} already present (identical, will be skipped), 0 conflicts.`);

    // ---- Build the operation plan ------------------------------------------
    const privacyRecord = toContentRecord(pages.privacy, 'pages/privacy', '/privacy');
    const termsRecord = toContentRecord(pages.terms, 'pages/terms', '/terms');

    console.log('\n--- Intended operations ---');
    console.log(`1. Create Content{type: 'pages/privacy'} — TITLE: "${privacyRecord.data.TITLE}", BODY: ${privacyRecord.data.BODY.length} sanitized chars, status: published.`);
    console.log(`2. Create Content{type: 'pages/terms'}   — TITLE: "${termsRecord.data.TITLE}", BODY: ${termsRecord.data.BODY.length} sanitized chars, status: published.`);
    console.log(`3. Insert ${toCreate.length} new Redirect record(s)${alreadyDone.length ? ` (${alreadyDone.length} already present, skipped)` : ''}.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform these operations for real.');
      return;
    }

    // ---- Execute (commit mode only) ----------------------------------------
    await ContentModel.create({ type: 'pages/privacy', data: privacyRecord.data, draftData: null, status: 'published' });
    await ContentModel.create({ type: 'pages/terms', data: termsRecord.data, draftData: null, status: 'published' });
    console.log('[COMMIT] Created pages/privacy and pages/terms.');

    if (toCreate.length) {
      await RedirectModel.insertMany(toCreate);
    }
    console.log(`[COMMIT] Inserted ${toCreate.length} Redirect record(s).`);

    console.log('\n--- COMMIT complete. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
