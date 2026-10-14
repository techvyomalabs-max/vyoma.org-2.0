// WordPress -> MERN migration: real donation-scheme photos, replacing the
// "2:1 image" ImagePlaceholder on /donate's scheme grid and each scheme's
// own /donate/[schemeSlug] page.
//
// Source: the live "Donate SSS" hub page (https://vyoma.org/donors/,
// WXR post_id 7548), which links out to each scheme's own sub-page via a
// blurb card -- one real image per card, in the same order as our 9
// DonationSchemeModel records (confirmed by slug/name match before
// writing this script). All 9 URLs independently verified live (HTTP 200)
// before migrating.
//
// Scope: sets `image` on the 9 DonationScheme documents (a MongoDB
// collection, not a Content document -- this scheme data has lived in its
// own collection since Phase D, per donationScheme.model.js). Does not
// touch name/description/note/amountOptions/status/displayOrder or any
// other field.
//
// Modes:
//   node donation-scheme-images-migration.mjs            -> dry-run (default)
//   node donation-scheme-images-migration.mjs --commit    -> real write,
//                                                             after
//                                                             validation,
//                                                             after a
//                                                             pre-change
//                                                             backup

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { DonationSchemeModel } from '../../../src/modules/donations/donationScheme.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';

const SCHEME_IMAGES = {
  'guru-dakshina': 'https://vyoma.org/wp-content/uploads/2023/08/guru-purnima.png',
  'vidya-danam': 'https://vyoma.org/wp-content/uploads/2023/08/content_image_ac3ff8a2-90ce-49e2-9c8d-ed9b076f846b.jpeg',
  'grantha-danam': 'https://vyoma.org/wp-content/uploads/2023/10/donatebook.png',
  'vidyarthi-nidhi': 'https://vyoma.org/wp-content/uploads/2023/08/vidyarthi_nidhi.jpg',
  'sabha-ujjivanam': 'https://vyoma.org/wp-content/uploads/2023/10/sabha.png',
  'anna-danam': 'https://vyoma.org/wp-content/uploads/2023/08/Annadanam.png',
  'bala-gurukulam': 'https://vyoma.org/wp-content/uploads/2024/10/Balagurukulam.jpg',
  'events-and-projects': 'https://vyoma.org/wp-content/uploads/2026/05/events_and_projects.png',
  'general-donation': 'https://vyoma.org/wp-content/uploads/2026/07/General-Fund.jpg',
};
const EXPECTED_SCHEMES = 9;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Donation scheme images migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: sets `image` on all 9 DonationScheme documents. Does not touch any other field.');
  console.log('='.repeat(72));

  if (Object.keys(SCHEME_IMAGES).length !== EXPECTED_SCHEMES) {
    console.error(`\nVALIDATION FAILED: expected ${EXPECTED_SCHEMES} scheme images, found ${Object.keys(SCHEME_IMAGES).length}. ABORT.`);
    process.exitCode = 1;
    return;
  }

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const current = await DonationSchemeModel.find({}).lean();
    const currentSlugs = current.map((s) => s.slug).sort();
    const expectedSlugs = Object.keys(SCHEME_IMAGES).sort();
    if (JSON.stringify(currentSlugs) !== JSON.stringify(expectedSlugs)) {
      console.error(`\nVALIDATION FAILED: current scheme slugs (${currentSlugs.join(', ')}) do not match expected (${expectedSlugs.join(', ')}). ABORT rather than guess.`);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] All 9 expected scheme slugs confirmed present.');

    const alreadyMatch = current.every((s) => deepEqual(s.image, { url: SCHEME_IMAGES[s.slug] }));
    const noneSet = current.every((s) => s.image == null);
    if (!alreadyMatch && !noneSet) {
      console.error('\nVALIDATION FAILED: some schemes already have an unexpected `image` value (neither empty nor matching). ABORT rather than overwrite blindly.');
      process.exitCode = 1;
      return;
    }
    if (alreadyMatch) {
      console.log('\n[OK] All schemes already have the correct image -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed -- no scheme currently has an image set.');

    console.log('\n--- Intended operation ---');
    console.log(`Set image on all ${EXPECTED_SCHEMES} DonationScheme documents.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `donation-scheme-images-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(current, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    for (const [slug, url] of Object.entries(SCHEME_IMAGES)) {
      await DonationSchemeModel.updateOne({ slug }, { $set: { image: { url } } });
    }
    console.log('[COMMIT] Set image on all 9 DonationScheme documents.');

    let ok = true;
    const after = await DonationSchemeModel.find({}).lean();
    for (const s of after) {
      const match = deepEqual(s.image, { url: SCHEME_IMAGES[s.slug] });
      console.log(`[verify] "${s.slug}" image matches: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;

      const before = current.find((c) => c.slug === s.slug);
      const { image: _i1, updatedAt: _u1, ...restBefore } = before;
      const { image: _i2, updatedAt: _u2, ...restAfter } = s;
      const restSame = deepEqual(restBefore, restAfter);
      if (!restSame) {
        console.log(`[verify] "${s.slug}" every other field unchanged: NO`);
        ok = false;
      }
    }
    if (ok) console.log('[verify] Every other field on every scheme unchanged: YES');

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
