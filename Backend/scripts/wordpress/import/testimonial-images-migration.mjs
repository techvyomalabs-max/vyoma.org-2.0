// WordPress -> MERN migration: real testimonial photos for the 7
// "Home-slider" testimonials that have one (the other 6 "Old" testimonials
// genuinely have no source photo — confirmed via WXR postmeta, not assumed
// — and are explicitly left untouched here, per instruction not to invent
// images for them).
//
// Scope:
//   - Adds data.TESTIMONIALS_FEATURED[i].image (a brand-new field — this
//     key never had one before) on {type: 'pages/media'} and {type:
//     'media'}, matched to each entry by exact `name` string.
//   - Populates data.HOME_TESTIMONIALS[i].image (the field already exists,
//     currently null for all 3) on {type: 'pages/home'}, for the 3 of the
//     7 that are also featured on the homepage.
//   - Does NOT touch data.TESTIMONIALS_ALL (the 6 "Old" testimonials) or
//     any other data key on any of the 3 touched Content documents.
//
// Source of truth: each image URL was traced via the WXR's own
// `_thumbnail_id` postmeta on the real `dipl-testimonial` WordPress custom
// post for that person (not guessed from filename similarity — e.g.
// "Lakshmithathachar" has two candidate photo attachments in the export,
// ids 308 and 6062; the postmeta link on the real testimonial post (6066)
// points at 308, which is the one used here). All 7 confirmed live
// (HTTP 200) immediately before this script was written. The 6 "Old"
// testimonials' own `dipl-testimonial` posts were confirmed to have no
// `_thumbnail_id` meta key at all — not an oversight, a genuine absence.
//
// Modes:
//   node testimonial-images-migration.mjs            -> dry-run (default)
//   node testimonial-images-migration.mjs --commit   -> performs the real
//                                                        write, only after
//                                                        validation passes,
//                                                        after writing a
//                                                        pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];
const HOME_CONTENT_TYPE = 'pages/home';

// name -> verified real image URL (see header for provenance).
const APPROVED_IMAGES = {
  'Late. Prof. M A Lakshmithathachar': { url: 'http://vyoma.org/wp-content/uploads/2021/12/Lakshmithathachar.jpg' },
  'Prof. Shrinivasa Varakhedi Ph.D': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Prof.-Shrinivasa-Varakhedi.jpg' },
  'Dr. M Jayaraman': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Dr.-M-Jayaraman.jpg' },
  'Braḥmaśrī Kalaimamani Dr. Udaiyalur Kalyanaraman': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Udaiyalur-Kalyanaraman.jpg' },
  'Kum. Neha Anisetty': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Kum.-Neha-Anisetty.png' },
  'Ms. Rita Badami': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Ms.-Rita-Badami.png' },
  'Ms. Aarathi & Ms. Lakshmi, Manhattan, New York': { url: 'http://vyoma.org/wp-content/uploads/2022/12/Aarathi-Lakshmi.png' },
};
const EXPECTED_IMAGE_COUNT = 7;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Testimonial images migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: data.TESTIMONIALS_FEATURED[*].image (new field) on pages/media + media; data.HOME_TESTIMONIALS[*].image (existing field) on pages/home.');
  console.log('Does NOT touch TESTIMONIALS_ALL (the 6 "Old" testimonials, which genuinely have no source photo) or any other data key.');
  console.log('='.repeat(72));

  if (Object.keys(APPROVED_IMAGES).length !== EXPECTED_IMAGE_COUNT) {
    console.error(`\nABORT: expected exactly ${EXPECTED_IMAGE_COUNT} approved images, found ${Object.keys(APPROVED_IMAGES).length}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: ${EXPECTED_IMAGE_COUNT} verified images.`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const errors = [];
    const docs = {};
    for (const type of [...MEDIA_CONTENT_TYPES, HOME_CONTENT_TYPE]) {
      const doc = await ContentModel.findOne({ type }).lean();
      if (!doc) {
        errors.push(`No Content document found for type "${type}".`);
        continue;
      }
      if (doc.draftData != null) {
        errors.push(`Content "${type}" has a non-null draftData (an unpublished admin edit is pending) -- aborting rather than risk it later overwriting this migration.`);
      }
      docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    // --- Baseline + compute next state for TESTIMONIALS_FEATURED ----------
    const mediaPlan = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const featured = docs[type].data.TESTIMONIALS_FEATURED;
      if (!Array.isArray(featured)) {
        errors.push(`Content "${type}"'s data.TESTIMONIALS_FEATURED is not an array.`);
        continue;
      }
      const names = featured.map((t) => t.name);
      const missingNames = Object.keys(APPROVED_IMAGES).filter((n) => !names.includes(n));
      if (missingNames.length) {
        errors.push(`Content "${type}"'s data.TESTIMONIALS_FEATURED is missing expected entries: ${missingNames.join(', ')}`);
        continue;
      }
      const alreadyMigrated = featured.every((t) => (APPROVED_IMAGES[t.name] ? deepEqual(t.image, APPROVED_IMAGES[t.name]) : true));
      const noneMigrated = featured.every((t) => (APPROVED_IMAGES[t.name] ? t.image === undefined : true));
      if (!alreadyMigrated && !noneMigrated) {
        errors.push(`Content "${type}"'s data.TESTIMONIALS_FEATURED has some but not all approved images already set (or set to an unexpected value) -- unexpected partial state, aborting rather than guessing.`);
        continue;
      }
      const nextFeatured = featured.map((t) => (APPROVED_IMAGES[t.name] ? { ...t, image: APPROVED_IMAGES[t.name] } : t));
      mediaPlan[type] = { alreadyMigrated, nextFeatured };
    }

    // --- Baseline + compute next state for HOME_TESTIMONIALS ---------------
    const homeDoc = docs[HOME_CONTENT_TYPE];
    const homeTestimonials = homeDoc.data.HOME_TESTIMONIALS;
    if (!Array.isArray(homeTestimonials)) {
      errors.push(`Content "${HOME_CONTENT_TYPE}"'s data.HOME_TESTIMONIALS is not an array.`);
    }
    let homeAlreadyMigrated = false;
    let homeNextTestimonials = homeTestimonials;
    if (Array.isArray(homeTestimonials)) {
      const matched = homeTestimonials.filter((t) => APPROVED_IMAGES[t.name]);
      const alreadyMigrated = matched.length > 0 && matched.every((t) => deepEqual(t.image, APPROVED_IMAGES[t.name]));
      const noneMigrated = matched.every((t) => t.image == null);
      if (!alreadyMigrated && !noneMigrated) {
        errors.push(`Content "${HOME_CONTENT_TYPE}"'s data.HOME_TESTIMONIALS has some but not all matching images already set -- unexpected partial state, aborting rather than guessing.`);
      } else {
        homeAlreadyMigrated = alreadyMigrated;
        homeNextTestimonials = homeTestimonials.map((t) => (APPROVED_IMAGES[t.name] ? { ...t, image: APPROVED_IMAGES[t.name] } : t));
      }
    }

    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    const allMediaAlreadyMigrated = MEDIA_CONTENT_TYPES.every((t) => mediaPlan[t].alreadyMigrated);
    if (allMediaAlreadyMigrated && homeAlreadyMigrated) {
      console.log('\n[OK] All target documents already show the approved images -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed for all 3 target documents.');

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { TESTIMONIALS_FEATURED: _f, ...restBefore } = docs[type].data;
      const { TESTIMONIALS_FEATURED: _f2, ...restAfter } = { ...docs[type].data, TESTIMONIALS_FEATURED: mediaPlan[type].nextFeatured };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than TESTIMONIALS_FEATURED would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    {
      const { HOME_TESTIMONIALS: _h, ...restBefore } = homeDoc.data;
      const { HOME_TESTIMONIALS: _h2, ...restAfter } = { ...homeDoc.data, HOME_TESTIMONIALS: homeNextTestimonials };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than HOME_TESTIMONIALS would change on "${HOME_CONTENT_TYPE}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, on all 3 documents, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    for (const [name, img] of Object.entries(APPROVED_IMAGES)) {
      console.log(`  - "${name}": ${img.url}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of all 3 documents' full `data` ---
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `testimonial-images-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of [...MEDIA_CONTENT_TYPES, HOME_CONTENT_TYPE]) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed -- move it outside the repo before staging anything, same as every prior migration.');

    // --- Write (targeted dot-notation $set only -- never the whole `data`) -
    for (const type of MEDIA_CONTENT_TYPES) {
      if (!mediaPlan[type].alreadyMigrated) {
        await ContentModel.updateOne({ type }, { $set: { 'data.TESTIMONIALS_FEATURED': mediaPlan[type].nextFeatured } });
      }
    }
    if (!homeAlreadyMigrated) {
      await ContentModel.updateOne({ type: HOME_CONTENT_TYPE }, { $set: { 'data.HOME_TESTIMONIALS': homeNextTestimonials } });
    }
    console.log('[COMMIT] Set data.TESTIMONIALS_FEATURED[*].image on pages/media + media, and data.HOME_TESTIMONIALS[*].image on pages/home.');

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const match = deepEqual(after.data.TESTIMONIALS_FEATURED, mediaPlan[type].nextFeatured);
      console.log(`[verify] "${type}" TESTIMONIALS_FEATURED matches the approved data exactly: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;

      const { TESTIMONIALS_FEATURED: _f, ...restAfter } = after.data;
      const { TESTIMONIALS_FEATURED: _f2, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }
    {
      const after = await ContentModel.findOne({ type: HOME_CONTENT_TYPE }).lean();
      const match = deepEqual(after.data.HOME_TESTIMONIALS, homeNextTestimonials);
      console.log(`[verify] "${HOME_CONTENT_TYPE}" HOME_TESTIMONIALS matches the approved data exactly: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;

      const { HOME_TESTIMONIALS: _h, ...restAfter } = after.data;
      const { HOME_TESTIMONIALS: _h2, ...restBefore } = homeDoc.data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${HOME_CONTENT_TYPE}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }

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
