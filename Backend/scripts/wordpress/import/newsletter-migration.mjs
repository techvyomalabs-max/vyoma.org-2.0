// WordPress -> MERN migration: Newsletter CMS readiness + legacy migration.
//
// Scope (per the approved batch):
//   - Touches ONLY data.NEWSLETTER_LATEST / data.NEWSLETTER_ARCHIVE /
//     data.NEWSLETTER_SPECIAL on the 'pages/media' and 'media' Content
//     documents (same dual-type-sync pattern already proven by
//     batch1-import.mjs's --fix-media-sync mode for TESTIMONIALS_*).
//   - Does NOT read, validate, or write EVENT_CATEGORIES, UPCOMING_EVENTS,
//     PAST_EVENTS, GALLERY_ALBUMS, TESTIMONIALS_FEATURED, TESTIMONIALS_ALL,
//     PRESS_*, RESOURCE_*, MEDIA_SECTIONS, or any other Content type.
//   - Does NOT import the ~37 Activity Report PDFs (a separate legacy
//     concept per the read-only audit — gated on Decision D26, not part of
//     this batch).
//   - Does NOT download, rehost, or touch any PDF/image binary — every
//     migrated record stores only a URL string pointing at the still-live
//     legacy WordPress or Bunny CDN location.
//   - Does NOT touch AWS/S3 in any way.
//
// Source of truth: the reviewed WXR export
// (Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml),
// parsed fresh by this script — the LEGACY_ISSUES table below was derived by
// directly reading that page's raw content:encoded body (post_id 6409) and
// is cross-validated against a fresh parse of the same file at runtime
// (see validateAgainstWxr) so this script aborts rather than silently
// drifting if the source file ever changes.
//
// Known, deliberately preserved (not resolved) data conflict:
//   Issue #10 below ("Newsletter - DEC 2017 | Vol. 3 | Issue 1") links to
//   attachment 6539, whose filename is "12880697.Newsletter_June2018.pdf" —
//   i.e. the filename says June 2018 while the page's own heading says
//   Dec 2017. This script does NOT guess which is correct: it preserves the
//   date/label exactly as displayed on the live page (Dec 2017), matching
//   what a site visitor following that link has always seen, and leaves the
//   conflict for a human content owner to resolve later.
//
// Issue #12 ("Newsletter - DEC 2011 | Vol. 1 | Issue 1") has no PDF or
// flipbook at all — only a cover image. Per explicit instruction, this batch
// does not add a cover-image field for this one record, so it migrates with
// no `url` at all (the public page simply renders no action button for it,
// rather than a dead link).
//
// Modes:
//   node newsletter-migration.mjs            -> dry-run (default): parses,
//                                                validates, prints the
//                                                intended write, writes
//                                                nothing.
//   node newsletter-migration.mjs --commit   -> performs the real write,
//                                                only after validation
//                                                passes, after writing a
//                                                pre-change backup file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_WXR_PATH = path.resolve(
  __dirname,
  '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml'
);
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const NEWSLETTER_PAGE_POST_ID = '6409';
const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// ---------------------------------------------------------------------------
// Reviewed legacy mapping — one row per <h1> heading found on the live
// /newsletter/ page, in document order. `headingRaw` is the heading text
// with its leading "N." source-numbering artifact stripped (that counter is
// itself buggy in the source — two headings are both numbered "1." — so it
// is formatting noise, not real content, and is not reproduced here).
// `url` is the exact destination already linked from that heading (an
// iframe src for the two Bunny CDN flipbooks and the nine WordPress-hosted
// PDFs, or null for the one cover-image-only entry).
// ---------------------------------------------------------------------------
const LEGACY_ISSUES = [
  {
    headingRaw: 'Newsletter - June 2026 | Vol.9 | Issue 1',
    group: 'archive',
    year: '2026',
    label: 'Jun 2026 · Vol. 9, Issue 1',
    urlType: 'bunny-cdn-flipbook',
    url: 'https://digitalsanskrit.b-cdn.net/Flipbooks/Main/Updated_Newsletter_11_09_2026/index.html',
  },
  {
    headingRaw: 'Newsletter - Dec 2025 | Vol.8 | Issue 2',
    group: 'archive',
    year: '2025',
    label: 'Dec 2025 · Vol. 8, Issue 2',
    urlType: 'bunny-cdn-flipbook',
    url: 'https://vyomalabs-lms.b-cdn.net/Newsletter_2025/Newsletter_Dec2025/index.html',
  },
  {
    headingRaw: 'Newsletter - JUNE 2025 | Vol.8 | Issue 1',
    group: 'archive',
    year: '2025',
    label: 'Jun 2025 · Vol. 8, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2025/07/Bi_Annual_Newsletter_June_2025_Vol_8_Issue_1.pdf',
  },
  {
    headingRaw: 'Special Issue - Our 10 year journey',
    group: 'special',
    label: 'Special Issue',
    title: 'Our 10 Year Journey',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2022/12/Vyoma-E-Book-Newsletter-10-years-journey-301222.pdf',
  },
  {
    headingRaw: 'Newsletter - DEC 2024 | Vol.7 | Issue 1',
    group: 'archive',
    year: '2024',
    label: 'Dec 2024 · Vol. 7, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2024/12/31-NL-pdf-1.pdf',
  },
  {
    headingRaw: 'Newsletter - DEC 2022 | Vol. 6 | Issue 1',
    group: 'archive',
    year: '2022',
    label: 'Dec 2022 · Vol. 6, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2022/12/Vyomavaartaa-2022.pdf',
  },
  {
    headingRaw: 'Special  Issue - Our 7 year journey April 2020',
    group: 'special',
    label: 'Special Issue · April 2020',
    title: 'Our 7 Year Journey',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2023/03/Vyoma-E-Book-Newsletter-7-years-journey-2020.pdf',
  },
  {
    headingRaw: 'Newsletter - Sept 2020 | Vol. 5 | Issue 2',
    group: 'archive',
    year: '2020',
    label: 'Sep 2020 · Vol. 5, Issue 2',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2023/03/VyomavaartaaFinal.pdf',
  },
  {
    headingRaw: 'Newsletter - June  2018 | Vol. 4 | Issue 1',
    group: 'archive',
    year: '2018',
    label: 'Jun 2018 · Vol. 4, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2023/03/Vol04_June2018.pdf',
  },
  {
    headingRaw: 'Newsletter - DEC 2017 | Vol. 3 | Issue 1',
    group: 'archive',
    year: '2017',
    label: 'Dec 2017 · Vol. 3, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2023/03/12880697.Newsletter_June2018.pdf',
    knownConflict:
      'Attachment 6539\'s filename says "June2018"; this page\'s own heading says "Dec 2017". Not resolved by this script — the label/date above is kept exactly as displayed on the live page, per explicit instruction not to guess.',
  },
  {
    headingRaw: 'Newsletter - Oct 2015 | Vol. 2 | Issue 1',
    group: 'archive',
    year: '2015',
    label: 'Oct 2015 · Vol. 2, Issue 1',
    urlType: 'wordpress-pdf',
    url: 'https://vyoma.org/wp-content/uploads/2023/03/Vol02_Oct2015_final.pdf',
  },
  {
    headingRaw: 'Newsletter - DEC 2011 | Vol. 1  | Issue 1',
    group: 'archive',
    year: '2011',
    label: 'Dec 2011 · Vol. 1, Issue 1',
    urlType: 'cover-image-only',
    url: null, // No PDF/flipbook exists for this issue — see header comment.
    // What the WXR actually links here (a cover image, not a PDF/flipbook) —
    // used only to validate this script's own knowledge of the source
    // against a fresh parse; deliberately NOT stored as `url` above, since
    // this batch does not add a cover-image field (see header comment).
    wxrUrl: 'https://vyoma.org/wp-content/uploads/2023/03/Vol01_Dec2011.jpg',
  },
];

// ---------------------------------------------------------------------------
// WXR parsing (same hand-rolled regex approach used throughout this
// migration — no XML parser library is installed) — used ONLY to re-derive
// the heading/URL pairs from the live file and cross-check them against
// LEGACY_ISSUES above, never as the sole source (both must agree).
// ---------------------------------------------------------------------------
function findItemByPostId(xml, postId) {
  const marker = `<wp:post_id>${postId}</wp:post_id>`;
  const idx = xml.indexOf(marker);
  if (idx === -1) return null;
  const itemStart = xml.lastIndexOf('<item>', idx);
  const itemEnd = xml.indexOf('</item>', idx) + '</item>'.length;
  return xml.slice(itemStart, itemEnd);
}

function parseNewsletterPage(wxrPath) {
  const xml = fs.readFileSync(wxrPath, 'utf8');
  const item = findItemByPostId(xml, NEWSLETTER_PAGE_POST_ID);
  if (!item) return { found: false, issues: [] };

  const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*)\]\]><\/content:encoded>/);
  const content = contentMatch ? contentMatch[1] : '';

  const headingRe = /<h1>([\s\S]*?)<\/h1>/g;
  const headingMatches = [...content.matchAll(headingRe)];

  const issues = headingMatches.map((m, i) => {
    const headingText = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/^\s*\d+\.?\s*/, '') // strip the source's own leading "N." counter
      .replace(/\s+/g, ' ')
      .trim();
    const start = m.index + m[0].length;
    const end = i + 1 < headingMatches.length ? headingMatches[i + 1].index : content.length;
    const slice = content.slice(start, end);
    const srcMatch = slice.match(/\bsrc=["']?([^"'\s>]+)/);
    return { headingRaw: headingText, url: srcMatch ? srcMatch[1] : null };
  });

  return { found: true, issues };
}

// Aborts (returns non-empty error list) unless the live WXR produces exactly
// the same heading-text + URL pairs, in the same order, as LEGACY_ISSUES —
// this is what keeps the hardcoded table from silently drifting out of sync
// with its own source.
function validateAgainstWxr(wxrPath) {
  const errors = [];
  const parsed = parseNewsletterPage(wxrPath);
  if (!parsed.found) {
    errors.push(`Could not find WXR <item> for post_id ${NEWSLETTER_PAGE_POST_ID} (the /newsletter/ page).`);
    return errors;
  }
  if (parsed.issues.length !== LEGACY_ISSUES.length) {
    errors.push(
      `Expected ${LEGACY_ISSUES.length} <h1> issue headings on the live /newsletter/ page, found ${parsed.issues.length}.`
    );
    return errors;
  }
  for (let i = 0; i < LEGACY_ISSUES.length; i++) {
    const expected = LEGACY_ISSUES[i];
    const actual = parsed.issues[i];
    const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();
    if (normalize(expected.headingRaw) !== normalize(actual.headingRaw)) {
      errors.push(`Issue #${i + 1} heading mismatch: expected "${expected.headingRaw}", WXR has "${actual.headingRaw}".`);
    }
    const expectedWxrUrl = expected.wxrUrl || expected.url || null;
    if (expectedWxrUrl !== actual.url) {
      errors.push(`Issue #${i + 1} URL mismatch: expected "${expectedWxrUrl}", WXR has "${actual.url}".`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Build the three Content.data fields from LEGACY_ISSUES
// ---------------------------------------------------------------------------
function buildNewsletterData() {
  const archiveIssues = LEGACY_ISSUES.filter((i) => i.group === 'archive');
  const specialIssues = LEGACY_ISSUES.filter((i) => i.group === 'special');

  const toArchiveIssue = (i) => {
    const issue = { label: i.label, title: i.headingRaw };
    if (i.url) issue.url = i.url;
    return issue;
  };

  // Group archive issues by year, preserving the page's own (newest-first)
  // document order within and across years — no re-sorting applied.
  const years = [];
  const byYear = new Map();
  for (const i of archiveIssues) {
    if (!byYear.has(i.year)) {
      byYear.set(i.year, []);
      years.push(i.year);
    }
    byYear.get(i.year).push(toArchiveIssue(i));
  }
  const NEWSLETTER_ARCHIVE = years.map((year) => ({ year, issues: byYear.get(year) }));

  const NEWSLETTER_SPECIAL = specialIssues.map((i) => {
    const entry = { label: i.label, title: i.title };
    if (i.url) entry.url = i.url;
    return entry;
  });

  // The most recent archive issue (document order = newest-first, per the
  // live page itself) doubles as NEWSLETTER_LATEST — same redundant-highlight
  // convention already used by the placeholder data it replaces (the latest
  // issue also appears as the first entry of its year's archive group).
  const mostRecent = archiveIssues[0];
  const NEWSLETTER_LATEST = { label: mostRecent.label, title: mostRecent.headingRaw, summary: '' };
  if (mostRecent.url) NEWSLETTER_LATEST.url = mostRecent.url;

  return { NEWSLETTER_LATEST, NEWSLETTER_ARCHIVE, NEWSLETTER_SPECIAL };
}

// ---------------------------------------------------------------------------
// Database baseline / safety checks
// ---------------------------------------------------------------------------
async function assertBaseline() {
  const errors = [];
  const docs = {};
  for (const type of MEDIA_CONTENT_TYPES) {
    const doc = await ContentModel.findOne({ type }).lean();
    if (!doc) {
      errors.push(`No Content document found for type "${type}" — baseline not established.`);
      continue;
    }
    if (doc.data?.NEWSLETTER_LATEST === undefined || doc.data?.NEWSLETTER_ARCHIVE === undefined || doc.data?.NEWSLETTER_SPECIAL === undefined) {
      errors.push(`Content "${type}" exists but is missing one of NEWSLETTER_LATEST / NEWSLETTER_ARCHIVE / NEWSLETTER_SPECIAL.`);
    }
    // A non-null draftData means an admin has an in-progress unpublished
    // edit pending. Writing `data` underneath that would be invisible until
    // the pending draft is itself saved/published again (which would then
    // silently overwrite this migration with whatever stale draft existed)
    // — so this is a hard abort, not a warning, until a human resolves it.
    if (doc.draftData != null) {
      errors.push(`Content "${type}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`);
    }
    docs[type] = doc;
  }
  return { errors, docs };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const commit = process.argv.includes('--commit');
  const wxrArgIdx = process.argv.indexOf('--wxr');
  const wxrPath = wxrArgIdx !== -1 ? process.argv[wxrArgIdx + 1] : DEFAULT_WXR_PATH;

  console.log('='.repeat(72));
  console.log(`Newsletter migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.NEWSLETTER_LATEST / data.NEWSLETTER_ARCHIVE / data.NEWSLETTER_SPECIAL on pages/media + media.');
  console.log('WXR source:', wxrPath);
  console.log('='.repeat(72));

  if (!fs.existsSync(wxrPath)) {
    console.error(`\nABORT: WXR file not found at ${wxrPath}`);
    process.exitCode = 1;
    return;
  }

  const wxrErrors = validateAgainstWxr(wxrPath);
  if (wxrErrors.length) {
    console.error('\nVALIDATION FAILED (hardcoded LEGACY_ISSUES vs. live WXR):');
    for (const e of wxrErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] All ${LEGACY_ISSUES.length} legacy issue headings + destination URLs match a fresh parse of the live WXR exactly.`);

  const { NEWSLETTER_LATEST, NEWSLETTER_ARCHIVE, NEWSLETTER_SPECIAL } = buildNewsletterData();
  const withUrl = LEGACY_ISSUES.filter((i) => i.url).length;
  console.log(`[OK] Built: 1 latest, ${NEWSLETTER_ARCHIVE.reduce((n, g) => n + g.issues.length, 0)} archive issues across ${NEWSLETTER_ARCHIVE.length} year group(s), ${NEWSLETTER_SPECIAL.length} special issue(s).`);
  console.log(`[OK] ${withUrl} of ${LEGACY_ISSUES.length} issues have a destination URL; 1 (Vol.1, Dec 2011) intentionally has none (cover image only, per instruction not to add a cover-image field).`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const { errors: baselineErrors, docs } = await assertBaseline();
    if (baselineErrors.length) {
      console.error('\nVALIDATION FAILED (database baseline):');
      for (const e of baselineErrors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Both ${MEDIA_CONTENT_TYPES.join(' and ')} exist, have the expected Newsletter fields, and have no pending draftData.`);

    // Capture every OTHER data key untouched, per type, so a post-write
    // verification can assert they are byte-for-byte identical afterward.
    const otherKeysBefore = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const { NEWSLETTER_LATEST: _l, NEWSLETTER_ARCHIVE: _a, NEWSLETTER_SPECIAL: _s, ...rest } = docs[type].data;
      otherKeysBefore[type] = rest;
    }

    console.log('\n--- Intended operation ---');
    console.log(`Set data.NEWSLETTER_LATEST / data.NEWSLETTER_ARCHIVE / data.NEWSLETTER_SPECIAL identically on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log('Every other data key on both documents is left untouched.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `newsletter-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateMany(
      { type: { $in: MEDIA_CONTENT_TYPES } },
      { $set: { 'data.NEWSLETTER_LATEST': NEWSLETTER_LATEST, 'data.NEWSLETTER_ARCHIVE': NEWSLETTER_ARCHIVE, 'data.NEWSLETTER_SPECIAL': NEWSLETTER_SPECIAL } }
    );
    console.log(`[COMMIT] Updated data.NEWSLETTER_LATEST / data.NEWSLETTER_ARCHIVE / data.NEWSLETTER_SPECIAL on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification: every other key byte-for-byte unchanged -
    let unchangedOk = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const { NEWSLETTER_LATEST: _l, NEWSLETTER_ARCHIVE: _a, NEWSLETTER_SPECIAL: _s, ...restAfter } = after.data;
      const same = JSON.stringify(restAfter) === JSON.stringify(otherKeysBefore[type]);
      console.log(`[verify] "${type}" — all other data keys unchanged: ${same ? 'YES' : 'NO'}`);
      if (!same) unchangedOk = false;
    }
    if (!unchangedOk) {
      console.error('\n[WARNING] At least one unrelated data key changed unexpectedly — investigate before trusting this run.');
      process.exitCode = 1;
      return;
    }

    console.log('\n--- COMMIT complete. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
