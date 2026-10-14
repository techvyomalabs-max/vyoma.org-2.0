// One-off cleanup (not a WordPress import): removes the temporary "Test
// Category" that real browser testing of Batch 9's dynamic category
// management left behind in the *published* data.PATRON_CATEGORIES --
// its deletion never actually reached the backend, due to the publish()
// bug fixed alongside this script (see Frontend/lib/useContentEditor.js):
// "Publish" never sent the admin's current in-memory edits to the server,
// it only promoted whatever draftData was already stored -- so deleting
// the category in the editor had no effect on what got published.
//
// While investigating, a second, related artifact was found: the real
// "Paripalakas" category had 11 rows instead of its correct 10 -- an exact
// duplicate of its last row, "Our Parents, Gurus and Acharyas". This is
// the same underlying clone-on-add behavior (RepeatableList's "+ Add"
// clones the last item by default -- already disabled for the categories
// list itself in the prior fix, but still the default for the patron rows
// nested inside each category), surfaced on a real category rather than
// the test one.
//
// IMPORTANT, checked carefully before touching anything: several OTHER
// real categories (Rakshakas: 13 duplicate-looking name+place pairs,
// Samrakshakas: 3) also contain rows that look like duplicates. These are
// NOT testing artifacts -- cross-checked against
// patrons-source-data.json (the original, untouched, Batch 5
// WordPress-verified migration source): every one of those 16 is already
// present there, i.e. genuine original WordPress data (the same donor
// appearing more than once, indistinguishable from a duplicate in a
// table with no date/product column to tell them apart). They are
// deliberately NOT touched by this script. Paripalakas has ZERO
// duplicates in that same original source, confirming its 11th row is
// the one genuine new artifact. This script therefore removes exactly
// ONE specific, named row from Paripalakas -- not a generic
// remove-all-duplicates pass, which would have incorrectly deleted 16
// real patron records.
//
// Scope: removes the one category named "Test Category" from
// data.PATRON_CATEGORIES, and removes exactly the one accidental
// duplicate "Our Parents, Gurus and Acharyas" row from Paripalakas, on
// {type: 'pages/about'}. Does not touch any other of the 6 real
// categories, any other row, or any other data key.
//
// Modes:
//   node patron-test-category-cleanup.mjs            -> dry-run (default)
//   node patron-test-category-cleanup.mjs --commit    -> real write

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPE = 'pages/about';
const TARGET_NAME = 'Test Category';
const EXPECTED_REAL_CATEGORIES = ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'];
const EXPECTED_TOTAL_ROWS = 1375;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log('='.repeat(72));
  console.log(`Test Category cleanup -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: removes the category named "${TARGET_NAME}" from data.PATRON_CATEGORIES on {type: '${TYPE}'}.`);
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

    const categories = doc.data.PATRON_CATEGORIES;
    if (!Array.isArray(categories)) {
      console.error('\nVALIDATION FAILED: data.PATRON_CATEGORIES is not an array. ABORT.');
      process.exitCode = 1;
      return;
    }

    let realCats = categories.filter((c) => c.sanskrit !== TARGET_NAME);
    const realNames = realCats.map((c) => c.sanskrit);
    if (JSON.stringify(realNames) !== JSON.stringify(EXPECTED_REAL_CATEGORIES)) {
      console.error(`\nVALIDATION FAILED: after removing "${TARGET_NAME}", remaining categories (${realNames.join(', ')}) don't exactly match the expected 6 (${EXPECTED_REAL_CATEGORIES.join(', ')}). ABORT rather than guess.`);
      process.exitCode = 1;
      return;
    }

    // Remove exactly one specific, named accidental duplicate row from
    // Paripalakas -- NOT a generic de-duplication pass (see header comment:
    // several other categories have legitimate original-source duplicate
    // name+place pairs that must NOT be touched).
    const PARIPALAKAS_DUP_ROW = { name: 'Our Parents, Gurus and Acharyas', place: '', active: true };
    realCats = realCats.map((c) => {
      if (c.sanskrit !== 'Paripalakas') return c;
      const lastIdx = c.rows.length - 1;
      // Only remove if the last two rows are BOTH an exact match for the
      // specific artifact found -- the narrowest possible match.
      if (lastIdx >= 1 && deepEqual(c.rows[lastIdx], PARIPALAKAS_DUP_ROW) && deepEqual(c.rows[lastIdx - 1], PARIPALAKAS_DUP_ROW)) {
        return { ...c, rows: c.rows.slice(0, lastIdx) };
      }
      return c;
    });
    const paripAfter = realCats.find((c) => c.sanskrit === 'Paripalakas');
    console.log(`[INFO] Paripalakas rows after targeted duplicate removal: ${paripAfter.rows.length} (was ${categories.find((c) => c.sanskrit === 'Paripalakas').rows.length}).`);

    const targetPresentInData = categories.some((c) => c.sanskrit === TARGET_NAME);
    const targetPresentInDraft = doc.draftData != null && Array.isArray(doc.draftData.PATRON_CATEGORIES) && doc.draftData.PATRON_CATEGORIES.some((c) => c.sanskrit === TARGET_NAME);

    if (!targetPresentInData && !targetPresentInDraft) {
      console.log(`\n[OK] "${TARGET_NAME}" is not present in data or draftData -- nothing to do (safe re-run / already cleaned up).`);
      return;
    }

    const totalRowsAfter = realCats.reduce((s, c) => s + c.rows.length, 0);
    if (totalRowsAfter !== EXPECTED_TOTAL_ROWS) {
      console.error(`\nVALIDATION FAILED: expected ${EXPECTED_TOTAL_ROWS} total rows across the 6 real categories after cleanup, found ${totalRowsAfter}. ABORT.`);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Baseline confirmed: "${TARGET_NAME}" present in data: ${targetPresentInData}, in draftData: ${targetPresentInDraft}. 6 real categories, ${totalRowsAfter} total rows, verified intact.`);

    // Prove every other data key is unaffected.
    {
      const { PATRON_CATEGORIES: _c, ...restBefore } = doc.data;
      const { PATRON_CATEGORIES: _c2, ...restAfter } = { ...doc.data, PATRON_CATEGORIES: realCats };
      if (!deepEqual(restBefore, restAfter)) {
        console.error('\nABORT: internal check failed -- some key other than PATRON_CATEGORIES would change.');
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched by the planned write.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this cleanup for real.');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `patron-test-category-cleanup-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    const update = { $set: { 'data.PATRON_CATEGORIES': realCats } };
    if (targetPresentInDraft) {
      const draftRealCats = doc.draftData.PATRON_CATEGORIES.filter((c) => c.sanskrit !== TARGET_NAME);
      update.$set['draftData.PATRON_CATEGORIES'] = draftRealCats;
    }
    await ContentModel.updateOne({ type: TYPE }, update);
    console.log(`[COMMIT] Removed "${TARGET_NAME}" from data.PATRON_CATEGORIES${targetPresentInDraft ? ' and draftData.PATRON_CATEGORIES' : ''}.`);

    const after = await ContentModel.findOne({ type: TYPE }).lean();
    let ok = true;

    const dataMatch = deepEqual(after.data.PATRON_CATEGORIES, realCats);
    console.log(`[verify] data.PATRON_CATEGORIES matches (6 real categories, no Test Category): ${dataMatch ? 'YES' : 'NO'}`);
    if (!dataMatch) ok = false;

    const afterTotal = after.data.PATRON_CATEGORIES.reduce((s, c) => s + c.rows.length, 0);
    console.log(`[verify] total patron row count: ${afterTotal} (expected ${EXPECTED_TOTAL_ROWS}): ${afterTotal === EXPECTED_TOTAL_ROWS ? 'YES' : 'NO'}`);
    if (afterTotal !== EXPECTED_TOTAL_ROWS) ok = false;

    if (targetPresentInDraft) {
      const draftStillHasIt = after.draftData?.PATRON_CATEGORIES?.some((c) => c.sanskrit === TARGET_NAME);
      console.log(`[verify] draftData no longer has "${TARGET_NAME}": ${!draftStillHasIt ? 'YES' : 'NO'}`);
      if (draftStillHasIt) ok = false;
    }

    const { PATRON_CATEGORIES: _c3, ...restAfter } = after.data;
    const { PATRON_CATEGORIES: _c4, ...restBefore } = doc.data;
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
