// Removes the 4 confirmed-identical duplicate "Associates In Our Journey"
// groups from data.CORE_TEAMS, keeping exactly the first occurrence in its
// original position. All 5 copies were independently verified byte-for-byte
// identical (same 7 people, same roles/bios/images, same order, same
// active flag) before this script was written -- this is pure
// deduplication, never a content edit.
//
// Scope:
//   - Removes 4 of 5 "Associates In Our Journey" entries from
//     data.CORE_TEAMS. Keeps the first occurrence (index 12 as of this
//     writing) untouched, in its original position.
//   - Does NOT touch any of the other 12 legitimate groups, their people,
//     photos, roles, bios, or ordering.
//   - Does NOT touch BOARD/ADVISORS/COMMITTEE or any other top-level data key.
//   - Does NOT add, remove, or alter any person within the kept group --
//     K. Raghavendra Rao's missing image stays exactly as-is (no photo
//     exists for him; not invented here).
//   - Writes to draftData only. Never touches live `data`. Never publishes.
//
// Modes:
//   node coreteam-dedupe-associates.mjs            -> dry-run (default)
//   node coreteam-dedupe-associates.mjs --commit   -> writes draftData only,
//                                                      after a pre-change backup

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const ABOUT_TYPE = 'pages/about';
const TARGET_HEADING = 'Associates In Our Journey';
const EXPECTED_TOTAL_GROUPS = 17;
const EXPECTED_DUPLICATE_COUNT = 5;
const EXPECTED_FINAL_GROUPS = 13;
const EXPECTED_MEMBERS = 7;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Core Team "Associates In Our Journey" dedupe -- mode: ${commit ? 'COMMIT (will write draftData)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: data.CORE_TEAMS on ${ABOUT_TYPE} DRAFT ONLY. Removes 4 confirmed-identical duplicate groups. Never touches live data. Never publishes.`);
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc = await ContentModel.findOne({ type: ABOUT_TYPE });
    if (!doc) throw new Error(`No Content document found for type "${ABOUT_TYPE}".`);

    const errors = [];
    if (doc.draftData != null) {
      errors.push(`"${ABOUT_TYPE}" already has a non-null draftData -- aborting rather than risk overwriting an existing unsaved draft edit. Review it manually first.`);
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] draftData is currently null (clean slate).');

    const liveData = doc.data;
    const groups = liveData.CORE_TEAMS;
    console.log(`[OK] Current CORE_TEAMS has ${groups.length} groups (expected ${EXPECTED_TOTAL_GROUPS}): ${groups.length === EXPECTED_TOTAL_GROUPS ? 'MATCH' : 'MISMATCH'}`);
    if (groups.length !== EXPECTED_TOTAL_GROUPS) {
      console.error(`\nABORT: expected ${EXPECTED_TOTAL_GROUPS} groups, found ${groups.length}. State has changed since this was investigated -- re-verify before proceeding.`);
      process.exitCode = 1;
      return;
    }

    const targetIndices = groups.map((g, i) => (g.heading === TARGET_HEADING ? i : -1)).filter((i) => i !== -1);
    console.log(`[OK] Found ${targetIndices.length} "${TARGET_HEADING}" groups at indices: ${targetIndices.join(', ')} (expected ${EXPECTED_DUPLICATE_COUNT})`);
    if (targetIndices.length !== EXPECTED_DUPLICATE_COUNT) {
      console.error(`\nABORT: expected ${EXPECTED_DUPLICATE_COUNT} duplicate groups, found ${targetIndices.length}. State has changed -- re-verify before proceeding.`);
      process.exitCode = 1;
      return;
    }

    const allIdentical = targetIndices.every((i) => deepEqual(groups[i], groups[targetIndices[0]]));
    console.log(`[OK] All ${targetIndices.length} copies are byte-for-byte identical: ${allIdentical ? 'YES' : 'NO'}`);
    if (!allIdentical) {
      console.error('\nABORT: the duplicate groups are not identical -- this script only handles the confirmed exact-duplicate case. A content difference between copies needs a human decision, not an automatic merge.');
      process.exitCode = 1;
      return;
    }

    const keptGroup = groups[targetIndices[0]];
    console.log(`[OK] Keeping the first occurrence (index ${targetIndices[0]}) with ${keptGroup.people.length} members (expected ${EXPECTED_MEMBERS}): ${keptGroup.people.length === EXPECTED_MEMBERS ? 'MATCH' : 'MISMATCH'}`);
    if (keptGroup.people.length !== EXPECTED_MEMBERS) {
      console.error('\nABORT: the kept group does not have the expected 7 members.');
      process.exitCode = 1;
      return;
    }
    const raghavendra = keptGroup.people.find((p) => p.name === 'K. Raghavendra Rao');
    console.log(`[OK] K. Raghavendra Rao present, image still unset: ${raghavendra && raghavendra.image == null ? 'YES' : 'NO (check manually)'}`);

    // Build the next CORE_TEAMS: drop every target index except the first.
    const indicesToRemove = new Set(targetIndices.slice(1));
    const nextCoreTeams = groups.filter((_, i) => !indicesToRemove.has(i));
    console.log(`\n[OK] Resulting CORE_TEAMS length: ${nextCoreTeams.length} (expected ${EXPECTED_FINAL_GROUPS}): ${nextCoreTeams.length === EXPECTED_FINAL_GROUPS ? 'MATCH' : 'MISMATCH'}`);
    if (nextCoreTeams.length !== EXPECTED_FINAL_GROUPS) {
      console.error('\nABORT: resulting group count does not match expectation.');
      process.exitCode = 1;
      return;
    }

    // Confirm every one of the other 12 original groups survives untouched,
    // in its original relative order, with nothing added/removed/reordered
    // among them.
    const otherGroupsBefore = groups.filter((g) => g.heading !== TARGET_HEADING);
    const otherGroupsAfter = nextCoreTeams.filter((g) => g.heading !== TARGET_HEADING);
    const otherGroupsUnchanged = deepEqual(otherGroupsBefore, otherGroupsAfter);
    console.log(`[OK] All 12 other groups byte-for-byte unchanged and in original order: ${otherGroupsUnchanged ? 'YES' : 'NO'}`);
    if (!otherGroupsUnchanged) {
      console.error('\nABORT: internal check failed -- the other 12 groups would not survive unchanged.');
      process.exitCode = 1;
      return;
    }

    // Confirm the kept "Associates" group itself is byte-for-byte identical
    // to what it was before (not re-created, not re-ordered internally).
    const keptGroupUnchanged = deepEqual(nextCoreTeams.find((g) => g.heading === TARGET_HEADING), keptGroup);
    console.log(`[OK] Kept "${TARGET_HEADING}" group byte-for-byte unchanged: ${keptGroupUnchanged ? 'YES' : 'NO'}`);

    const nextDraftData = { ...liveData, CORE_TEAMS: nextCoreTeams };

    // Confirm every other top-level data key is untouched.
    const { CORE_TEAMS: _c1, ...restBefore } = liveData;
    const { CORE_TEAMS: _c2, ...restAfter } = nextDraftData;
    const restUnchanged = deepEqual(restBefore, restAfter);
    console.log(`[OK] Every other top-level data key (BOARD/ADVISORS/COMMITTEE/SEO/etc.) unchanged: ${restUnchanged ? 'YES' : 'NO'}`);
    if (!restUnchanged) {
      console.error('\nABORT: internal check failed -- some unrelated key would change.');
      process.exitCode = 1;
      return;
    }

    console.log('\n--- Intended operation ---');
    console.log(`Remove 4 duplicate "${TARGET_HEADING}" groups (indices ${targetIndices.slice(1).join(', ')}) from draftData.CORE_TEAMS.`);
    console.log(`Keep 1 copy (index ${targetIndices[0]}) with all 7 members unchanged, including K. Raghavendra Rao's unset image.`);
    console.log(`Preserve all other 12 groups and all other data keys exactly.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to write this as the pages/about draft.');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `coreteam-dedupe-associates-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [ABOUT_TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    await ContentModel.updateOne({ type: ABOUT_TYPE }, { $set: { draftData: nextDraftData } });
    console.log('[COMMIT] Set draftData on pages/about (CORE_TEAMS dedupe only). Live data untouched. Not published.');

    const after = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();
    let ok = true;

    const draftMatches = deepEqual(after.draftData, nextDraftData);
    console.log(`[verify] draftData matches intended value: ${draftMatches ? 'YES' : 'NO'}`);
    if (!draftMatches) ok = false;

    const liveUnchanged = deepEqual(after.data, liveData);
    console.log(`[verify] live data (published) unchanged: ${liveUnchanged ? 'YES' : 'NO'}`);
    if (!liveUnchanged) ok = false;

    console.log(`[verify] status still '${after.status}' (unchanged, not published): ${after.status === doc.status ? 'YES' : 'NO'}`);

    console.log(ok ? '\n[SUCCESS] Draft write verified.' : '\n[FAILURE] Post-write verification did not match expectations -- investigate before trusting this write.');
    if (!ok) process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exitCode = 1;
});
