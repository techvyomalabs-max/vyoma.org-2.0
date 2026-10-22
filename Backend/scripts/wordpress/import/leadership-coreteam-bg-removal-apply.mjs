// Applies approved, already-generated #F1F5F9 background-removed photos to
// the pages/about Content DRAFT (never `data` directly) -- the live
// published site is untouched until a human explicitly clicks Publish in
// the Admin CMS, exactly like every other content edit in this app.
//
// Scope:
//   - Sets data.BOARD / ADVISORS / COMMITTEE / CORE_TEAMS[*].people[*].image
//     for the 80 people listed in IMAGE_MAP below (82 staged photos minus
//     Sudhir Patavardhan, who is already live and excluded on purpose, and
//     minus Sri Ranga (iQode Technologies), excluded per explicit
//     instruction this run).
//   - CORE_TEAMS is updated group-by-group via .map() over every group,
//     INCLUDING the known duplicate "Associates In Our Journey" copies --
//     this deliberately keeps all copies of a person's card consistent
//     with each other, rather than leaving 4 of 5 duplicate cards on the
//     old photo. It does not fix or remove the duplication itself.
//   - Does NOT touch any other data key (SEO, PATRON_*, timeline, etc.),
//     names, roles, bios, group headings, ordering, or active/visibility
//     flags anywhere.
//   - All 80 target URLs are http://localhost:4000/local-media/processed/*
//     (local-development-only storage) -- this script does not check or
//     care whether that's reachable in any other environment, since this
//     entire run is explicitly local-only, per instruction.
//
// Modes:
//   node leadership-coreteam-bg-removal-apply.mjs            -> dry-run (default)
//   node leadership-coreteam-bg-removal-apply.mjs --commit   -> writes draftData
//                                                                only, after a
//                                                                pre-change backup
//
// Never publishes. Never writes to `data`. Draft only.

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const ABOUT_TYPE = 'pages/about';

const IMAGE_MAP = JSON.parse(
  fs.readFileSync('C:/Users/Dell/vyoma-image-poc/apply_image_map.json', 'utf8')
).reduce((acc, p) => {
  acc[p.name] = { url: p.url };
  return acc;
}, {});
const EXPECTED_COUNT = 80;

const EXCLUDED_NAMES = new Set([
  'Sudhir Patavardhan', // already live, excluded on purpose
  'Sri Ranga (iQode Technologies)', // excluded this run, per instruction
  'Vishnu Daya & Co (Chartered Accountants)', // logo, never processed
  'Artha Viveka', // logo, never processed
]);

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyImages(list, imageMap) {
  return list.map((person) => (imageMap[person.name] ? { ...person, image: imageMap[person.name] } : person));
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Leadership/Core Team background-removal DRAFT apply -- mode: ${commit ? 'COMMIT (will write draftData)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: data.BOARD/ADVISORS/COMMITTEE/CORE_TEAMS[*].image on ${ABOUT_TYPE} DRAFT ONLY. Never touches live data. Never publishes.`);
  console.log('='.repeat(72));

  if (Object.keys(IMAGE_MAP).length !== EXPECTED_COUNT) {
    console.error(`\nVALIDATION FAILED: expected ${EXPECTED_COUNT} target images, found ${Object.keys(IMAGE_MAP).length}.`);
    process.exitCode = 1;
    return;
  }
  for (const excluded of EXCLUDED_NAMES) {
    if (IMAGE_MAP[excluded]) {
      console.error(`\nVALIDATION FAILED: "${excluded}" must be excluded but is present in the image map.`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`[OK] Manifest self-check passed: ${EXPECTED_COUNT} target images, excluded names correctly absent.`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const errors = [];
    const doc = await ContentModel.findOne({ type: ABOUT_TYPE });
    if (!doc) throw new Error(`No Content document found for type "${ABOUT_TYPE}".`);
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
    console.log('[OK] Content document exists, draftData is currently null (clean slate).');

    const liveData = doc.data;
    const boardNames = liveData.BOARD.map((p) => p.name);
    const advisorNames = liveData.ADVISORS.map((p) => p.name);
    const committeeNames = liveData.COMMITTEE.map((p) => p.name);
    const coreTeamNames = liveData.CORE_TEAMS.flatMap((g) => g.people.map((p) => p.name));
    const allKnownNames = new Set([...boardNames, ...advisorNames, ...committeeNames, ...coreTeamNames]);

    const missing = Object.keys(IMAGE_MAP).filter((n) => !allKnownNames.has(n));
    if (missing.length) {
      console.error('\nVALIDATION FAILED (name match):');
      console.error(' - Target names not found anywhere in current live data:', missing.join(', '));
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] All 80 target names found in the current live data.');

    const nextBoard = applyImages(liveData.BOARD, IMAGE_MAP);
    const nextAdvisors = applyImages(liveData.ADVISORS, IMAGE_MAP);
    const nextCommittee = applyImages(liveData.COMMITTEE, IMAGE_MAP);
    const nextCoreTeams = liveData.CORE_TEAMS.map((g) => ({ ...g, people: applyImages(g.people, IMAGE_MAP) }));

    const nextDraftData = { ...liveData, BOARD: nextBoard, ADVISORS: nextAdvisors, COMMITTEE: nextCommittee, CORE_TEAMS: nextCoreTeams };

    // Prove every other top-level key is byte-identical before writing.
    const { BOARD: _b, ADVISORS: _a, COMMITTEE: _c, CORE_TEAMS: _t, ...restBefore } = liveData;
    const { BOARD: _b2, ADVISORS: _a2, COMMITTEE: _c2, CORE_TEAMS: _t2, ...restAfter } = nextDraftData;
    if (!deepEqual(restBefore, restAfter)) {
      console.error('\nABORT: internal check failed -- some key other than BOARD/ADVISORS/COMMITTEE/CORE_TEAMS would differ. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched.');

    // Count exactly how many image fields actually changed (a target name
    // could theoretically already have this exact image set -- not expected
    // here since draftData was null and this is the first run, but checked
    // for an honest count regardless).
    let changedCount = 0;
    for (const [list, next] of [
      [liveData.BOARD, nextBoard],
      [liveData.ADVISORS, nextAdvisors],
      [liveData.COMMITTEE, nextCommittee],
      [liveData.CORE_TEAMS.flatMap((g) => g.people), nextCoreTeams.flatMap((g) => g.people)],
    ]) {
      for (let i = 0; i < list.length; i++) {
        if (!deepEqual(list[i].image, next[i].image)) changedCount++;
      }
    }
    console.log(`\n--- Intended operation ---`);
    console.log(`Will set image on ${changedCount} person entries (across BOARD/ADVISORS/COMMITTEE/CORE_TEAMS, including any duplicate-group copies) in draftData only.`);
    console.log(`Excluded, confirmed untouched: Sudhir Patavardhan (already live), Sri Ranga (iQode Technologies), Vishnu Daya & Co (Chartered Accountants), Artha Viveka.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to write this as the pages/about draft.');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `leadership-coreteam-bg-removal-apply-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [ABOUT_TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    await ContentModel.updateOne({ type: ABOUT_TYPE }, { $set: { draftData: nextDraftData } });
    console.log('[COMMIT] Set draftData on pages/about (Board/Advisors/Committee/Core Team images only). Live data untouched. Not published.');

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
