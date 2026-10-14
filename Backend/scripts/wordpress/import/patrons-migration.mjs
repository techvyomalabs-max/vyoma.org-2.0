// WordPress -> MERN migration: full Patrons page content — all ~1,375
// patron records across the 6 real tiers, the real donor-testimonial photo
// gallery (replacing fabricated text quotes), and the real matching-gift
// company logos (replacing 3 placeholder boxes).
//
// Scope (all on {type: 'pages/about'}):
//   - data.PATRON_TIER_ROWS: REPLACED ENTIRELY with the full, real dataset
//     (was a 5-row sample in 1 of 6 tiers; the other 5 were empty arrays).
//   - data.PATRON_TESTIMONIAL_GALLERY: NEW key, 13 real images, replacing
//     data.PATRON_TESTIMONIALS (3 entries of literal placeholder text:
//     name "Patron Name", quote "Quote placeholder...") which is removed.
//   - data.PATRON_MATCHING_PARTNERS: NEW key, 15 real company name+logo
//     pairs. (The 3 placeholder logo boxes on the live page were hardcoded
//     directly in page.js, not stored in this Content document at all, so
//     there is nothing to remove here -- only to add.)
//   - Does NOT touch data.PATRON_TIERS (6-tier metadata; already correct)
//     or data.GOLDEN_WALL (9 names; independently re-verified during this
//     batch to be an exact match against the live "Paripalakas" tier table,
//     i.e. already correct -- left untouched per instruction).
//
// Source of truth: the live, published Patrons page
// (https://vyoma.org/patrons/, WXR post_id 209, wp:status "publish") is
// fully server-rendered static HTML -- all 6 TablePress tables (ids 1, 2,
// 3, 4, 5, 8, matching the page's own [table id=N] shortcodes exactly) are
// present in the raw HTML with zero JS/AJAX required. Parsed with
// .migration-data/tmp/parse-patrons.mjs (dynamic per-table column
// detection, HTML-entity decoding, mojibake repair -- see below) into
// patrons-source-data.json (this directory), which this script loads
// as-is, performing no further transcription. Total parsed: 1,375 rows,
// 0 anomalies -- matching the ~1,375 total given in the task exactly.
//
// Cross-check performed: the WXR's own TablePress export for table id 1
// (Prayojakas) was independently inspected and found to contain the exact
// same 16 rows, in the same order, including the identical (corrupted,
// see below) byte sequence for one entry's special characters -- live page
// and WXR agree; no discrepancy to report for patron data itself.
//
// Mojibake repair: several free-text fields (chiefly Prayojakas's "Product
// Sponsored" column, which contains Sanskrit terms in IAST) were corrupted
// in the WordPress database itself by a classic double-encoding bug: a
// correctly-typed UTF-8 string was at some point decoded as Latin-1 (each
// byte read back as its own 0-255 codepoint) and re-saved, baking the
// corruption into the stored text -- present identically in both the live
// page's HTML and the WXR's raw JSON escapes, confirming it is a database
// fact, not a fetch/transport artifact. Because this mis-decoding is
// bijective for byte values 0-255, it is exactly reversible:
// `Buffer.from(s, 'latin1').toString('utf8')` recovers the original
// correctly-accented text byte-for-byte. Applied only where the result
// contains no U+FFFD (i.e. only when the reversal is clean), so any text
// that was already correct is left untouched. Verified against all 1,375
// rows: 0 remaining replacement characters, 0 remaining suspect sequences.
//
// Reported before migrating (2026-10-14): 5 of 6 tiers (all but
// Prayojakas) have only Name+Place columns on the live site -- there is no
// "Product Sponsored" data for them at all (not blank; the column does not
// exist in the source table). PATRON_TIER_ROWS entries for those 5 tiers
// therefore have no `product` field, and the frontend table only renders
// that column for tiers that have it.
//
// Modes:
//   node patrons-migration.mjs            -> dry-run (default)
//   node patrons-migration.mjs --commit    -> real write, after validation,
//                                             after a pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const ABOUT_TYPE = 'pages/about';

const EXPECTED_TIER_COUNTS = {
  Prayojakas: 16,
  Rakshakas: 963,
  Samrakshakas: 229,
  Poshakas: 72,
  Mahaposhakas: 85,
  Paripalakas: 10,
};
const EXPECTED_TOTAL = 1375;
const EXPECTED_TESTIMONIAL_IMAGES = 13;
const EXPECTED_MATCHING_PARTNERS = 15;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Patrons migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log("Scope: data.PATRON_TIER_ROWS (full replace), data.PATRON_TESTIMONIAL_GALLERY (new), data.PATRON_MATCHING_PARTNERS (new), all on {type:'pages/about'}.");
  console.log('Does NOT touch data.PATRON_TIERS or data.GOLDEN_WALL (both already verified correct).');
  console.log('='.repeat(72));

  // --- Load + self-validate the pre-built, pre-verified source dataset ----
  const sourcePath = path.join(__dirname, 'patrons-source-data.json');
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const { PATRON_TIER_ROWS, PATRON_TESTIMONIAL_GALLERY, PATRON_MATCHING_PARTNERS } = source;

  const manifestErrors = [];
  for (const [tier, expectedCount] of Object.entries(EXPECTED_TIER_COUNTS)) {
    const actual = PATRON_TIER_ROWS[tier]?.length;
    if (actual !== expectedCount) manifestErrors.push(`Tier "${tier}": expected ${expectedCount} rows, found ${actual}.`);
  }
  const totalRows = Object.values(PATRON_TIER_ROWS).reduce((s, v) => s + v.length, 0);
  if (totalRows !== EXPECTED_TOTAL) manifestErrors.push(`Expected ${EXPECTED_TOTAL} total patron rows, found ${totalRows}.`);
  if (PATRON_TESTIMONIAL_GALLERY.length !== EXPECTED_TESTIMONIAL_IMAGES) manifestErrors.push(`Expected ${EXPECTED_TESTIMONIAL_IMAGES} testimonial-gallery images, found ${PATRON_TESTIMONIAL_GALLERY.length}.`);
  if (PATRON_MATCHING_PARTNERS.length !== EXPECTED_MATCHING_PARTNERS) manifestErrors.push(`Expected ${EXPECTED_MATCHING_PARTNERS} matching partners, found ${PATRON_MATCHING_PARTNERS.length}.`);
  // Every row must have a non-empty name; "product" must only be present for Prayojakas.
  for (const [tier, rows] of Object.entries(PATRON_TIER_ROWS)) {
    for (const [i, row] of rows.entries()) {
      if (!row.name) manifestErrors.push(`Tier "${tier}" row ${i}: empty name.`);
      const hasProduct = 'product' in row;
      if (tier === 'Prayojakas' && !hasProduct) manifestErrors.push(`Tier "${tier}" row ${i}: missing expected "product" field.`);
      if (tier !== 'Prayojakas' && hasProduct) manifestErrors.push(`Tier "${tier}" row ${i}: unexpected "product" field.`);
    }
  }
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors.slice(0, 20)) console.error(' -', e);
    if (manifestErrors.length > 20) console.error(`   ...and ${manifestErrors.length - 20} more.`);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: ${totalRows} patron rows across ${Object.keys(PATRON_TIER_ROWS).length} tiers, ${PATRON_TESTIMONIAL_GALLERY.length} testimonial images, ${PATRON_MATCHING_PARTNERS.length} matching partners.`);
  console.log('      Per-tier:', JSON.stringify(Object.fromEntries(Object.entries(PATRON_TIER_ROWS).map(([k, v]) => [k, v.length]))));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();
    const errors = [];
    if (!doc) errors.push(`No Content document found for type "${ABOUT_TYPE}".`);
    else if (doc.draftData != null) errors.push(`Content "${ABOUT_TYPE}" has a non-null draftData -- aborting rather than risk it later overwriting this migration.`);
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, no pending draftData.');

    // --- Confirm the 6-tier taxonomy + GOLDEN_WALL still match expectations ---
    const currentTierKeys = Object.keys(doc.data.PATRON_TIER_ROWS || {});
    const expectedTierKeys = Object.keys(EXPECTED_TIER_COUNTS);
    if (JSON.stringify([...currentTierKeys].sort()) !== JSON.stringify([...expectedTierKeys].sort())) {
      console.error(`\nVALIDATION FAILED: current PATRON_TIER_ROWS keys (${currentTierKeys.join(', ')}) do not match the expected 6 tiers (${expectedTierKeys.join(', ')}). ABORT rather than guess.`);
      process.exitCode = 1;
      return;
    }
    const EXPECTED_GOLDEN_WALL = [
      'Shri. B Krishnamurthy — Coimbatore',
      'Prof. B Mahadevan — Bangalore',
      'Smt. Rama Sivaraman — Chennai',
      'Shri. Sudhir Patavardhan — Bangalore',
      'Dr. Rajesh Nair — India',
      'Shri. Visvanathan Ganesan — Bangalore',
      'Smt. Malathi M, Shri. Shivashankar — Bangalore',
      'Shri. Rajesh Anandaramu, Smt. Sandhya Rajesh & Family — Bangalore',
      'Late Shri. Kuppuswamy; Shri Nagesh, Smt. Kamakshi; Shri Sarangan, Smt. Gomati; Shri Ananda, Smt. Prema; Shri Harish, Smt. Janani; Shri Mahesh, Smt. Aishwarya',
    ];
    if (!deepEqual(doc.data.GOLDEN_WALL, EXPECTED_GOLDEN_WALL)) {
      console.error('\nVALIDATION FAILED: GOLDEN_WALL has changed since it was independently re-verified during this batch -- aborting rather than assume it is still correct.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] 6-tier taxonomy and GOLDEN_WALL confirmed unchanged from the verified baseline.');

    // --- Already-migrated detection -----------------------------------------
    const tierRowsAlreadyMatch = deepEqual(doc.data.PATRON_TIER_ROWS, PATRON_TIER_ROWS);
    const galleryAlreadyMatches = deepEqual(doc.data.PATRON_TESTIMONIAL_GALLERY, PATRON_TESTIMONIAL_GALLERY);
    const partnersAlreadyMatch = deepEqual(doc.data.PATRON_MATCHING_PARTNERS, PATRON_MATCHING_PARTNERS);
    const testimonialsStillPresent = doc.data.PATRON_TESTIMONIALS !== undefined;

    const tierRowsIsSampleOrEmpty = Object.values(doc.data.PATRON_TIER_ROWS).every(
      (rows) => Array.isArray(rows) && (rows.length === 0 || rows.length <= 20)
    );
    if (!tierRowsAlreadyMatch && !tierRowsIsSampleOrEmpty) {
      console.error('\nVALIDATION FAILED: PATRON_TIER_ROWS already contains substantial data that does not match the verified dataset -- unexpected partial/foreign state, aborting rather than overwrite blindly.');
      process.exitCode = 1;
      return;
    }

    if (tierRowsAlreadyMatch && galleryAlreadyMatches && partnersAlreadyMatch && !testimonialsStillPresent) {
      console.log('\n[OK] All target data already matches the verified content -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed.');

    // --- Prove every other data key is unaffected, before writing -----------
    {
      const { PATRON_TIER_ROWS: _t, PATRON_TESTIMONIALS: _x, PATRON_TESTIMONIAL_GALLERY: _g, PATRON_MATCHING_PARTNERS: _p, ...restBefore } = doc.data;
      const { PATRON_TIER_ROWS: _t2, PATRON_TESTIMONIALS: _x2, PATRON_TESTIMONIAL_GALLERY: _g2, PATRON_MATCHING_PARTNERS: _p2, ...restAfter } = {
        ...doc.data,
        PATRON_TIER_ROWS,
        PATRON_TESTIMONIAL_GALLERY,
        PATRON_MATCHING_PARTNERS,
      };
      if (!deepEqual(restBefore, restAfter)) {
        console.error('\nABORT: internal check failed -- some key other than PATRON_TIER_ROWS/PATRON_TESTIMONIALS/PATRON_TESTIMONIAL_GALLERY/PATRON_MATCHING_PARTNERS would change. Aborting rather than risk it.');
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Replace PATRON_TIER_ROWS: ${totalRows} rows across 6 tiers.`);
    console.log(`Set PATRON_TESTIMONIAL_GALLERY: ${PATRON_TESTIMONIAL_GALLERY.length} images.`);
    console.log(`Set PATRON_MATCHING_PARTNERS: ${PATRON_MATCHING_PARTNERS.length} companies.`);
    console.log(`Remove fabricated PATRON_TESTIMONIALS: ${testimonialsStillPresent ? 'yes, present' : 'already absent'}.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the full `data` -------------------
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `patrons-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [ABOUT_TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    // --- Write (targeted dot-notation $set/$unset only -- never the whole `data`) ---
    await ContentModel.updateOne(
      { type: ABOUT_TYPE },
      {
        $set: {
          'data.PATRON_TIER_ROWS': PATRON_TIER_ROWS,
          'data.PATRON_TESTIMONIAL_GALLERY': PATRON_TESTIMONIAL_GALLERY,
          'data.PATRON_MATCHING_PARTNERS': PATRON_MATCHING_PARTNERS,
        },
        $unset: { 'data.PATRON_TESTIMONIALS': '' },
      }
    );
    console.log('[COMMIT] Replaced PATRON_TIER_ROWS, set PATRON_TESTIMONIAL_GALLERY + PATRON_MATCHING_PARTNERS, removed fabricated PATRON_TESTIMONIALS.');

    // --- Post-write verification ---------------------------------------------
    let ok = true;
    const after = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();

    const tierRowsMatch = deepEqual(after.data.PATRON_TIER_ROWS, PATRON_TIER_ROWS);
    const galleryMatch = deepEqual(after.data.PATRON_TESTIMONIAL_GALLERY, PATRON_TESTIMONIAL_GALLERY);
    const partnersMatch = deepEqual(after.data.PATRON_MATCHING_PARTNERS, PATRON_MATCHING_PARTNERS);
    const testimonialsGone = after.data.PATRON_TESTIMONIALS === undefined;
    console.log(`[verify] PATRON_TIER_ROWS matches: ${tierRowsMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] PATRON_TESTIMONIAL_GALLERY matches: ${galleryMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] PATRON_MATCHING_PARTNERS matches: ${partnersMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] fabricated PATRON_TESTIMONIALS removed: ${testimonialsGone ? 'YES' : 'NO'}`);
    if (!tierRowsMatch || !galleryMatch || !partnersMatch || !testimonialsGone) ok = false;

    const afterTotal = Object.values(after.data.PATRON_TIER_ROWS).reduce((s, v) => s + v.length, 0);
    console.log(`[verify] total patron row count: ${afterTotal} (expected ${EXPECTED_TOTAL}): ${afterTotal === EXPECTED_TOTAL ? 'YES' : 'NO'}`);
    if (afterTotal !== EXPECTED_TOTAL) ok = false;

    const goldenWallUnchanged = deepEqual(after.data.GOLDEN_WALL, EXPECTED_GOLDEN_WALL);
    const tiersUnchanged = deepEqual(after.data.PATRON_TIERS, doc.data.PATRON_TIERS);
    console.log(`[verify] GOLDEN_WALL unchanged: ${goldenWallUnchanged ? 'YES' : 'NO'}`);
    console.log(`[verify] PATRON_TIERS unchanged: ${tiersUnchanged ? 'YES' : 'NO'}`);
    if (!goldenWallUnchanged || !tiersUnchanged) ok = false;

    const { PATRON_TIER_ROWS: _t3, PATRON_TESTIMONIALS: _x3, PATRON_TESTIMONIAL_GALLERY: _g3, PATRON_MATCHING_PARTNERS: _p3, ...restAfter } = after.data;
    const { PATRON_TIER_ROWS: _t4, PATRON_TESTIMONIALS: _x4, PATRON_TESTIMONIAL_GALLERY: _g4, PATRON_MATCHING_PARTNERS: _p4, ...restBefore } = doc.data;
    const restSame = deepEqual(restAfter, restBefore);
    console.log(`[verify] every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
    if (!restSame) ok = false;

    if (!ok) {
      console.error('\n[WARNING] At least one verification failed -- investigate before trusting this run.');
      process.exitCode = 1;
      return;
    }

    console.log('\n--- COMMIT complete, all verifications passed. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
