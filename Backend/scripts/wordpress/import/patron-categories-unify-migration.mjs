// Schema restructuring (not a WordPress import): unifies the previously
// separate data.PATRON_TIERS (6 tier-card objects) and
// data.PATRON_TIER_ROWS (an object keyed by a fixed, hardcoded 6-tier
// taxonomy) into a single data.PATRON_CATEGORIES array, where each
// category carries its own patron rows nested inside it.
//
// Why: the old shape required the tab list to be a hardcoded JS constant
// (`TABS = ['Prayojakas', ...]`, duplicated in both the admin form and the
// public page) and renaming a tier meant renaming an object key — a real
// risk of silently orphaning that tier's rows. An admin could not add a
// 7th category without a code change. The new array shape fixes both:
// adding an array item is a new category, editing a `sanskrit` field in
// place is a rename (its nested rows move with it, atomically), and
// reordering is a normal array move.
//
// `hasProductField` is a new, explicit boolean per category (Prayojakas
// only -> true), replacing the old inference-from-data-presence
// (`activeRows.some(r => 'product' in r)`) so a brand-new, still-empty
// category can still declare up front whether it should show that column.
//
// Content preservation: every sanskrit/meaning/note/active value from
// PATRON_TIERS, and every one of the 1,375 patron rows from
// PATRON_TIER_ROWS (exact fields, exact order), is carried over unchanged
// -- this script only changes where they live in the JSON, not what they
// contain. Verified below (count + deep-equal checks) before any write.
//
// Scope: on {type: 'pages/about'} only -- sets data.PATRON_CATEGORIES,
// removes data.PATRON_TIERS and data.PATRON_TIER_ROWS. Does not touch
// GOLDEN_WALL, PATRON_TESTIMONIAL_GALLERY, PATRON_MATCHING_PARTNERS, or
// any other key.
//
// Modes:
//   node patron-categories-unify-migration.mjs            -> dry-run (default)
//   node patron-categories-unify-migration.mjs --commit    -> real write

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPE = 'pages/about';

// Only Prayojakas has ever had a "Product Sponsored" column -- preserved
// as an explicit flag now instead of being inferred from row data.
const PRODUCT_FIELD_TIERS = new Set(['Prayojakas']);

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log('='.repeat(72));
  console.log(`Patron categories unification -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log("Scope: merges data.PATRON_TIERS + data.PATRON_TIER_ROWS into data.PATRON_CATEGORIES, on {type: 'pages/about'}.");
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc = await ContentModel.findOne({ type: TYPE }).lean();
    if (!doc) {
      console.error(`\nVALIDATION FAILED: no Content document for type "${TYPE}". ABORT.`);
      process.exitCode = 1;
      return;
    }
    if (doc.draftData != null) {
      console.error(`\nVALIDATION FAILED: "${TYPE}" has a non-null draftData. ABORT.`);
      process.exitCode = 1;
      return;
    }

    const alreadyMigrated = Array.isArray(doc.data.PATRON_CATEGORIES);
    const oldShapePresent = Array.isArray(doc.data.PATRON_TIERS) && doc.data.PATRON_TIER_ROWS && typeof doc.data.PATRON_TIER_ROWS === 'object';

    if (alreadyMigrated && !oldShapePresent) {
      console.log('\n[OK] Already migrated (PATRON_CATEGORIES present, old keys already gone) -- nothing to do (safe re-run).');
      return;
    }
    if (!oldShapePresent) {
      console.error('\nVALIDATION FAILED: expected data.PATRON_TIERS (array) and data.PATRON_TIER_ROWS (object) to both be present. Unexpected state, aborting rather than guess.');
      process.exitCode = 1;
      return;
    }
    if (alreadyMigrated) {
      console.error('\nVALIDATION FAILED: both the old shape AND data.PATRON_CATEGORIES already exist -- unexpected partial state, aborting rather than guess which is authoritative.');
      process.exitCode = 1;
      return;
    }

    const tiers = doc.data.PATRON_TIERS;
    const rowsByTier = doc.data.PATRON_TIER_ROWS;
    const tierNames = tiers.map((t) => t.sanskrit);
    const rowKeyNames = Object.keys(rowsByTier);

    if (JSON.stringify([...tierNames].sort()) !== JSON.stringify([...rowKeyNames].sort())) {
      console.error(`\nVALIDATION FAILED: PATRON_TIERS names (${tierNames.join(', ')}) don't exactly match PATRON_TIER_ROWS keys (${rowKeyNames.join(', ')}). ABORT rather than guess a mapping.`);
      process.exitCode = 1;
      return;
    }

    const totalRowsBefore = Object.values(rowsByTier).reduce((s, rows) => s + rows.length, 0);

    const categories = tiers.map((tier) => ({
      sanskrit: tier.sanskrit,
      meaning: tier.meaning,
      note: tier.note,
      active: tier.active,
      hasProductField: PRODUCT_FIELD_TIERS.has(tier.sanskrit),
      rows: rowsByTier[tier.sanskrit],
    }));

    const totalRowsAfter = categories.reduce((s, c) => s + c.rows.length, 0);
    if (totalRowsAfter !== totalRowsBefore) {
      console.error(`\nABORT: internal check failed -- row count changed during merge (${totalRowsBefore} -> ${totalRowsAfter}).`);
      process.exitCode = 1;
      return;
    }
    // Prove every row, in every category, is byte-for-byte the same object
    // as before, just relocated -- not reconstructed/altered.
    for (const tier of tiers) {
      const before = rowsByTier[tier.sanskrit];
      const after = categories.find((c) => c.sanskrit === tier.sanskrit).rows;
      if (!deepEqual(before, after)) {
        console.error(`\nABORT: internal check failed -- rows for "${tier.sanskrit}" differ after merge.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(`[OK] Merge verified in memory: ${categories.length} categories, ${totalRowsAfter} total patron rows (unchanged from ${totalRowsBefore}), every row identical to its source.`);
    console.log('      Per-category:', JSON.stringify(Object.fromEntries(categories.map((c) => [c.sanskrit, c.rows.length]))));
    console.log('      hasProductField:', JSON.stringify(Object.fromEntries(categories.map((c) => [c.sanskrit, c.hasProductField]))));

    // Prove every other data key is unaffected.
    {
      const { PATRON_TIERS: _t, PATRON_TIER_ROWS: _r, PATRON_CATEGORIES: _c, ...restBefore } = doc.data;
      const { PATRON_TIERS: _t2, PATRON_TIER_ROWS: _r2, PATRON_CATEGORIES: _c2, ...restAfter } = { ...doc.data, PATRON_CATEGORIES: categories };
      if (!deepEqual(restBefore, restAfter)) {
        console.error('\nABORT: internal check failed -- some key other than PATRON_TIERS/PATRON_TIER_ROWS/PATRON_CATEGORIES would change.');
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched by the planned write.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `patron-categories-unify-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    await ContentModel.updateOne(
      { type: TYPE },
      { $set: { 'data.PATRON_CATEGORIES': categories }, $unset: { 'data.PATRON_TIERS': '', 'data.PATRON_TIER_ROWS': '' } }
    );
    console.log('[COMMIT] Set data.PATRON_CATEGORIES, removed data.PATRON_TIERS and data.PATRON_TIER_ROWS.');

    const after = await ContentModel.findOne({ type: TYPE }).lean();
    let ok = true;

    const categoriesMatch = deepEqual(after.data.PATRON_CATEGORIES, categories);
    console.log(`[verify] PATRON_CATEGORIES matches: ${categoriesMatch ? 'YES' : 'NO'}`);
    if (!categoriesMatch) ok = false;

    const oldKeysGone = after.data.PATRON_TIERS === undefined && after.data.PATRON_TIER_ROWS === undefined;
    console.log(`[verify] old PATRON_TIERS/PATRON_TIER_ROWS removed: ${oldKeysGone ? 'YES' : 'NO'}`);
    if (!oldKeysGone) ok = false;

    const afterTotal = after.data.PATRON_CATEGORIES.reduce((s, c) => s + c.rows.length, 0);
    console.log(`[verify] total patron row count: ${afterTotal} (expected ${totalRowsBefore}): ${afterTotal === totalRowsBefore ? 'YES' : 'NO'}`);
    if (afterTotal !== totalRowsBefore) ok = false;

    const { PATRON_TIERS: _t3, PATRON_TIER_ROWS: _r3, PATRON_CATEGORIES: _c3, ...restAfter } = after.data;
    const { PATRON_TIERS: _t4, PATRON_TIER_ROWS: _r4, PATRON_CATEGORIES: _c4, ...restBefore } = doc.data;
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
