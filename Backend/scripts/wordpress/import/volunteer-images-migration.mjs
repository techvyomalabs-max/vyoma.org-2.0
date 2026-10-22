// WordPress -> MERN migration: real Featured Volunteer photos.
//
// Scope:
//   - Sets data.VOLUNTEER_FEATURED[*].image (already-existing but
//     previously-null field) on {type: 'pages/join-us'}.
//   - Does NOT touch names, notes, ordering, VOLUNTEER_CATEGORIES,
//     INTERNSHIP_*, CAREER_*, TRACKS, or any other data key.
//
// Source of truth: both URLs below were extracted directly from the WXR
// export (`Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.
// 2026-09-29.xml`) as real WordPress media-library attachments (each has its
// own <item>/<wp:attachment_url> entry, post_type "attachment", with a
// matching _wp_attachment_metadata width/height) -- not guessed, not a
// stock photo, not a filename-similarity match:
//   - "Smt. Radha Raju"                -> Radha-Raju.jpg   (full size 528x719, line ~35609 of the export)
//   - "Smt. Bhuvaneshwari Subramanian" -> Bhuvaneshwari.jpg (full size 1227x1280, line ~35642 of the export)
// Both are portrait photos; the public Volunteer page renders them through
// the shared SmartImage component, which always shows the full photo
// (object-contain + blurred-backdrop fill), so no cropping decision is
// needed here regardless of the image box's own aspect ratio.
//
// Modes:
//   node volunteer-images-migration.mjs            -> dry-run (default)
//   node volunteer-images-migration.mjs --commit   -> performs the real
//                                                      write, only after
//                                                      validation passes,
//                                                      after writing a
//                                                      pre-change backup
// Not run with --commit by this change -- see the task's standing
// instruction to get explicit approval before any live database write.

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

// Per instruction, backups for this batch go outside the repo entirely.
const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';

const JOIN_US_TYPE = 'pages/join-us';

function img(url) {
  return { url };
}

const VOLUNTEER_IMAGES = {
  'Smt. Radha Raju': img('https://vyoma.org/wp-content/uploads/2026/01/Radha-Raju.jpg'),
  'Smt. Bhuvaneshwari Subramanian': img('https://vyoma.org/wp-content/uploads/2026/01/Bhuvaneshwari.jpg'),
};
const EXPECTED_VOLUNTEER_IMAGES = 2;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyImages(list, imageMap) {
  return list.map((person) => (imageMap[person.name] ? { ...person, image: imageMap[person.name] } : person));
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Featured Volunteers images migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: data.VOLUNTEER_FEATURED[*].image on ${JOIN_US_TYPE}.`);
  console.log('Does NOT touch names, notes, ordering, or any other data key.');
  console.log('='.repeat(72));

  // --- Manifest self-validation --------------------------------------------
  const manifestErrors = [];
  if (Object.keys(VOLUNTEER_IMAGES).length !== EXPECTED_VOLUNTEER_IMAGES) {
    manifestErrors.push(`Expected ${EXPECTED_VOLUNTEER_IMAGES} VOLUNTEER_FEATURED images, found ${Object.keys(VOLUNTEER_IMAGES).length}.`);
  }
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: ${EXPECTED_VOLUNTEER_IMAGES} volunteer images.`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const errors = [];
    const doc = await ContentModel.findOne({ type: JOIN_US_TYPE }).lean();
    if (!doc) errors.push(`No Content document found for type "${JOIN_US_TYPE}".`);
    if (doc?.draftData != null) errors.push(`Content "${JOIN_US_TYPE}" has a non-null draftData -- aborting rather than risk it later overwriting this migration.`);
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, no pending draftData.');

    // --- Baseline: confirm every expected name is present -------------------
    const volunteerNames = doc.data.VOLUNTEER_FEATURED.map((p) => p.name);
    const missing = Object.keys(VOLUNTEER_IMAGES).filter((n) => !volunteerNames.includes(n));
    if (missing.length) errors.push(`VOLUNTEER_FEATURED: expected names not found in current data: ${missing.join(', ')}`);
    if (errors.length) {
      console.error('\nVALIDATION FAILED (name match):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    // --- Already-migrated / partial-state detection -------------------------
    const targeted = doc.data.VOLUNTEER_FEATURED.filter((p) => VOLUNTEER_IMAGES[p.name]);
    const allMatch = targeted.every((p) => deepEqual(p.image, VOLUNTEER_IMAGES[p.name]));
    const noneSet = targeted.every((p) => p.image == null);
    if (!allMatch && !noneSet) {
      console.error('\nVALIDATION FAILED (image baseline):');
      console.error(' - VOLUNTEER_FEATURED has some but not all target images already set (or set to an unexpected value) -- unexpected partial state, aborting rather than guessing.');
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    if (allMatch) {
      console.log('\n[OK] Both target images already match the approved data -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed.');

    // --- Compute next state --------------------------------------------------
    const nextVolunteerFeatured = applyImages(doc.data.VOLUNTEER_FEATURED, VOLUNTEER_IMAGES);

    // --- Prove every other data key is unaffected, before writing -----------
    const { VOLUNTEER_FEATURED: _v, ...restBefore } = doc.data;
    const { VOLUNTEER_FEATURED: _v2, ...restAfter } = { ...doc.data, VOLUNTEER_FEATURED: nextVolunteerFeatured };
    if (!deepEqual(restBefore, restAfter)) {
      console.error(`\nABORT: internal check failed -- some key other than VOLUNTEER_FEATURED would change on "${JOIN_US_TYPE}". Aborting rather than risk it.`);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set image on: ${Object.keys(VOLUNTEER_IMAGES).length} Featured Volunteers (${JOIN_US_TYPE}).`);
    for (const [name, image] of Object.entries(VOLUNTEER_IMAGES)) {
      console.log(`  - "${name}" -> ${image.url}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the document's full `data` -------
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `volunteer-images-migration-backup-${timestamp}.json`);
    const backupPayload = { [JOIN_US_TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    // --- Write (targeted dot-notation $set only -- never the whole `data`) ---
    await ContentModel.updateOne({ type: JOIN_US_TYPE }, { $set: { 'data.VOLUNTEER_FEATURED': nextVolunteerFeatured } });
    console.log('[COMMIT] Set image fields on pages/join-us (Featured Volunteers).');

    // --- Post-write verification ---------------------------------------------
    let ok = true;
    const after = await ContentModel.findOne({ type: JOIN_US_TYPE }).lean();
    const volunteersMatch = deepEqual(after.data.VOLUNTEER_FEATURED, nextVolunteerFeatured);
    console.log(`[verify] VOLUNTEER_FEATURED matches: ${volunteersMatch ? 'YES' : 'NO'}`);
    if (!volunteersMatch) ok = false;

    const { VOLUNTEER_FEATURED: _v3, ...restAfterDoc } = after.data;
    const { VOLUNTEER_FEATURED: _v4, ...restBeforeDoc } = doc.data;
    const restSame = deepEqual(restAfterDoc, restBeforeDoc);
    console.log(`[verify] every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
    if (!restSame) ok = false;

    console.log(ok ? '\n[SUCCESS] Migration verified.' : '\n[FAILURE] Post-write verification did not match expectations -- investigate before trusting this write.');
    if (!ok) process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nFATAL:', err);
  process.exitCode = 1;
});
