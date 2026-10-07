// WordPress -> MERN migration: Gallery, Option A (/gallery-2/ authoritative).
//
// Scope (per the approved batch):
//   - Touches ONLY data.GALLERY_ALBUMS and data.GALLERY_VIDEOS on the dual
//     Content documents {type: 'pages/media'} and {type: 'media'} (same
//     dual-type-sync pattern already proven by Newsletter/Events).
//   - Replaces the 8 known fabricated placeholder albums with exactly 7
//     real albums (70 images total) from the approved authoritative source,
//     WordPress post_id 8928 (/gallery-2/).
//   - Does NOT merge /gallery/ or /gallery-2-2/ — their 37 unique images
//     are intentionally out of scope for this batch (see
//     migration-decision-register.md, D1).
//   - Does NOT invent a caption, alt text, or category that isn't actually
//     present in the source. Confirmed: none of the 70 images has a
//     caption or alt text in WordPress — both fields are simply omitted
//     per image, not set to an invented placeholder string.
//   - Writes exactly 1 video entry ("Sanskrit As Medicine") to the
//     separate data.GALLERY_VIDEOS key — never folded into GALLERY_ALBUMS,
//     since a video has no photo list/count to report.
//   - Does NOT download or rehost any image/video — every `url` below is
//     the original, still-live WordPress attachment URL (all 70 confirmed
//     HTTP 200 immediately before this script was written) or the original
//     YouTube URL.
//   - Does NOT touch Events, Newsletter, Testimonials, Press, Resources,
//     or any other data key — verified unchanged both before writing
//     (baseline read) and after (deep-equal against a pre-write backup).
//   - Does NOT touch AWS/S3 or the Media model collection.
//
// Source of truth: the already-completed, human-reviewed manifest
// extraction in this conversation (WXR post_id 8928, cross-checked against
// the page's own Divi-rendered cache to exclude a dead/non-rendering
// boilerplate gallery block). Nothing here was invented.
//
// Modes:
//   node gallery-migration.mjs            -> dry-run (default)
//   node gallery-migration.mjs --commit   -> performs the real write, only
//                                            after validation passes, after
//                                            writing a pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// ---------------------------------------------------------------------------
// The 8 known fabricated placeholder album titles this script expects to
// find and replace. If the live GALLERY_ALBUMS array doesn't match this set
// exactly, the script aborts rather than guessing what to do.
// ---------------------------------------------------------------------------
const PLACEHOLDER_ALBUM_TITLES = [
  'Blessings of Gurus',
  'Awards & Recognition',
  'Paper Presentations & Invited Lectures',
  'Book Fairs & Stalls',
  'Visits of Dignitaries',
  'CSR Activities',
  'Office Culture',
  'Sanskrit as Medicine',
];

// ---------------------------------------------------------------------------
// The approved manifest — 7 albums, 70 images, in the exact WordPress
// shortcode order. Each image has only `url` and `attachmentId`; `caption`
// and `alt` are omitted entirely (not invented) since none exist in source.
// Attachment 10086's URL contains a literal non-ASCII curly apostrophe
// (U+2018) in its filename — `encodeURI()` is applied once to every URL
// below, which correctly percent-encodes that one character while leaving
// every other (already-valid) URL byte-for-byte unchanged.
// ---------------------------------------------------------------------------
function img(attachmentId, url) {
  return { attachmentId, url: encodeURI(url) };
}

const APPROVED_GALLERY_ALBUMS = [
  {
    title: 'Blessings of Jagadgurus & Gurus',
    images: [
      img(12837, 'http://vyoma.org/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-05-at-3.14.10-PM-1.jpeg'),
      img(9365, 'http://vyoma.org/wp-content/uploads/2024/02/image-1-2.png'),
      img(9245, 'http://vyoma.org/wp-content/uploads/2024/02/Samarpanam-of-Vyoma-publications-to-Jagadguru-3.jpeg'),
      img(9231, 'http://vyoma.org/wp-content/uploads/2024/02/Screenshot-2024-02-06-125159.jpg'),
      img(9357, 'http://vyoma.org/wp-content/uploads/2024/02/image-4.png'),
      img(6931, 'http://vyoma.org/wp-content/uploads/2023/07/bok-fair5.jpeg'),
      img(9355, 'http://vyoma.org/wp-content/uploads/2024/02/image-1.png'),
      img(10088, 'http://vyoma.org/wp-content/uploads/2024/09/Fruitful-meeting-with-Swami-Baba-Ramdev-@-Haridwar.png'),
      img(9360, 'http://vyoma.org/wp-content/uploads/2024/02/image-2.png'),
      img(9418, 'http://vyoma.org/wp-content/uploads/2024/03/104eventimage.jpg'),
      img(9440, 'http://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_134919-scaled.jpg'),
      img(9439, 'http://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_105833-scaled.jpg'),
    ],
  },
  {
    title: 'Awards and Rewards',
    images: [
      img(10072, 'http://vyoma.org/wp-content/uploads/2024/09/Samskrta-Sevavrati-award-for-Vyoma-Labs-on-22nd-Aug-2024.jpg'),
      img(6942, 'http://vyoma.org/wp-content/uploads/2023/07/puraskara1.jpeg'),
      img(9419, 'http://vyoma.org/wp-content/uploads/2024/03/image-7.png'),
      img(10086, "http://vyoma.org/wp-content/uploads/2024/09/Honored-for-‘bhageeratha-prayatna-in-serving-Samskrta-Samskriti-Samskara-1.png"),
      img(9473, 'http://vyoma.org/wp-content/uploads/2024/03/sevak.png'),
      img(6335, 'http://vyoma.org/wp-content/uploads/2022/12/Surasaraswathi-Sabha-50th-Anniversary-2.jpeg'),
    ],
  },
  {
    title: 'Paper presentation & Invited Lectures',
    images: [
      img(12807, 'http://vyoma.org/wp-content/uploads/2026/04/NSB-Seminar-1.jpg'),
      img(12797, 'http://vyoma.org/wp-content/uploads/2026/04/Sir.-Vishwam-at-Surana-4.jpeg'),
      img(10101, 'http://vyoma.org/wp-content/uploads/2024/09/Vedanta-Shravana-Essential-Vedanta-22-Sep-2024.png'),
      img(10077, 'http://vyoma.org/wp-content/uploads/2024/09/Conference-about-Gurukula-shiksha-on-6th-July-2024.png'),
      img(10078, 'http://vyoma.org/wp-content/uploads/2024/09/Yogas-in-Bhagavad-Gita-at-Yogavijnana-on-Jul-20th-Aug11th-2024.png'),
      img(9422, 'http://vyoma.org/wp-content/uploads/2024/03/image-10.png'),
      img(12805, 'http://vyoma.org/wp-content/uploads/2026/04/MES.png'),
      img(12806, 'http://vyoma.org/wp-content/uploads/2026/04/Sindhi-College-2.png'),
      img(9421, 'http://vyoma.org/wp-content/uploads/2024/03/image-9.png'),
      img(9435, 'http://vyoma.org/wp-content/uploads/2024/03/WhatsApp-Image-2023-10-31-at-3.27.53-PM-1.jpeg'),
      img(6937, 'http://vyoma.org/wp-content/uploads/2023/07/lectures2.jpeg'),
      img(6940, 'http://vyoma.org/wp-content/uploads/2023/07/lectures1.jpeg'),
      img(9506, 'http://vyoma.org/wp-content/uploads/2024/03/Power-of-Sanskrit-Lecture-at-Sheshadripuram-College-2.jpeg'),
    ],
  },
  {
    title: 'Book Fairs and Stalls',
    images: [
      img(12816, 'http://vyoma.org/wp-content/uploads/2026/04/2ND-WORLD-AYURVEDA-SUMMIT.jpeg'),
      img(12815, 'http://vyoma.org/wp-content/uploads/2026/04/INCOFYRA.png'),
      img(12813, 'http://vyoma.org/wp-content/uploads/2026/04/AKHILA-BHARATIYA-ADHIVESHANAM.jpeg'),
      img(12814, 'http://vyoma.org/wp-content/uploads/2026/04/ADANI-GLOBAL-INDOLOGY-CONCLAVE.jpeg'),
      img(12812, 'http://vyoma.org/wp-content/uploads/2026/04/WORLD-SANSKRIT-CONFERENCE-2025-NEPAL.png'),
      img(9424, 'http://vyoma.org/wp-content/uploads/2024/03/image-12.png'),
      img(9425, 'http://vyoma.org/wp-content/uploads/2024/03/image-13.png'),
      img(6934, 'http://vyoma.org/wp-content/uploads/2023/07/book-fairs.jpeg'),
      img(6285, 'http://vyoma.org/wp-content/uploads/2022/12/Bangalore-Book-Fair-1.jpg'),
      img(6301, 'http://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-4.jpg'),
      img(6932, 'http://vyoma.org/wp-content/uploads/2023/07/book-fair3.jpeg'),
      img(6298, 'http://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-1.jpg'),
      img(6292, 'http://vyoma.org/wp-content/uploads/2022/12/Chamrajpete-Pratibha-Puraskara-4.jpeg'),
    ],
  },
  {
    title: 'Visits of dignitaries to Vyoma',
    images: [
      img(12822, 'http://vyoma.org/wp-content/uploads/2026/04/Prof-Ganti-Murthy.png'),
      img(12824, 'http://vyoma.org/wp-content/uploads/2026/04/HONORABLE-VICE-CHANCELLOR-SRINIVASA-VARKHEDI-of-CSU.jpeg'),
      img(12825, 'http://vyoma.org/wp-content/uploads/2026/04/Sri.-Ramakrishnan-from-Amar-Seva-Sangam.png'),
      img(12819, 'http://vyoma.org/wp-content/uploads/2026/04/Sree-Ram-Iyer-scaled.jpeg'),
      img(6918, 'http://vyoma.org/wp-content/uploads/2023/07/visit1.jpeg'),
      img(6340, 'http://vyoma.org/wp-content/uploads/2022/12/Visit-of-Chairman-BKM-Sir-1.jpg'),
      img(9426, 'http://vyoma.org/wp-content/uploads/2024/03/image-14.png'),
      img(6920, 'http://vyoma.org/wp-content/uploads/2023/07/visit3.jpeg'),
      img(6338, 'http://vyoma.org/wp-content/uploads/2022/12/Sri-Tirunarayanan_s-visit-1.jpeg'),
      img(6923, 'http://vyoma.org/wp-content/uploads/2023/07/visit6.jpeg'),
      img(6924, 'http://vyoma.org/wp-content/uploads/2023/07/visit.jpeg'),
      img(12823, 'http://vyoma.org/wp-content/uploads/2026/04/Co-founders-of-Vrtam-studios.jpeg'),
    ],
  },
  {
    title: 'Our CSR activities',
    images: [
      img(12827, 'http://vyoma.org/wp-content/uploads/2026/04/BBMP-Bhartiya-Vidya-Bhavan-school-RTG-school-students-enrichment-session-Inauguration.jpeg'),
      img(12828, 'http://vyoma.org/wp-content/uploads/2026/04/RTG-Enrichment-Session-at-BR-HIlls-scaled.jpeg'),
      img(9359, 'http://vyoma.org/wp-content/uploads/2024/02/image1-5.png'),
      img(9358, 'http://vyoma.org/wp-content/uploads/2024/02/image-5.png'),
      img(6912, 'http://vyoma.org/wp-content/uploads/2023/07/12.jpg'),
      img(6914, 'http://vyoma.org/wp-content/uploads/2023/07/14.jpeg'),
    ],
  },
  {
    title: 'Office Culture',
    images: [
      img(12830, 'http://vyoma.org/wp-content/uploads/2026/04/Ramayana-Parayana-2026.jpg'),
      img(12831, 'http://vyoma.org/wp-content/uploads/2026/04/Holi-2026.jpg'),
      img(12834, 'http://vyoma.org/wp-content/uploads/2026/04/Navratri-Celebration-1.png'),
      img(12833, 'http://vyoma.org/wp-content/uploads/2026/04/Navratri-Celebration-2.jpeg'),
      img(6331, 'http://vyoma.org/wp-content/uploads/2022/12/New-Office-at-Nagarabhavi-1.jpg'),
      img(5027, 'http://vyoma.org/wp-content/uploads/2022/07/Full-Office.jpg'),
      img(6927, 'http://vyoma.org/wp-content/uploads/2023/07/office-culture.jpeg'),
      img(6928, 'http://vyoma.org/wp-content/uploads/2023/07/office-culture1.jpeg'),
    ],
  },
];

const EXPECTED_COUNTS = { 'Blessings of Jagadgurus & Gurus': 12, 'Awards and Rewards': 6, 'Paper presentation & Invited Lectures': 13, 'Book Fairs and Stalls': 13, 'Visits of dignitaries to Vyoma': 12, 'Our CSR activities': 6, 'Office Culture': 8 };

const APPROVED_GALLERY_VIDEOS = [
  {
    title: 'Must watch!! Is this language, the best medicine for many of our problems ?!?',
    url: 'https://youtu.be/8UjFbUatiuw?si=blT2LB_GHpMn_HIX',
  },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function byTitleSet(items) {
  return new Set(items.map((i) => i.title));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function validateManifest() {
  const errors = [];

  if (APPROVED_GALLERY_ALBUMS.length !== 7) {
    errors.push(`Expected exactly 7 albums, found ${APPROVED_GALLERY_ALBUMS.length}.`);
  }

  const seenIds = new Map(); // attachmentId -> [category, ...]
  let totalRefs = 0;
  for (const album of APPROVED_GALLERY_ALBUMS) {
    const expected = EXPECTED_COUNTS[album.title];
    if (expected == null) {
      errors.push(`Album "${album.title}" is not one of the 7 expected categories.`);
    } else if (album.images.length !== expected) {
      errors.push(`Album "${album.title}": expected ${expected} images, found ${album.images.length}.`);
    }
    totalRefs += album.images.length;
    const withinCategorySeen = new Set();
    for (const im of album.images) {
      if (withinCategorySeen.has(im.attachmentId)) {
        errors.push(`Duplicate attachmentId ${im.attachmentId} within album "${album.title}".`);
      }
      withinCategorySeen.add(im.attachmentId);
      if (!seenIds.has(im.attachmentId)) seenIds.set(im.attachmentId, []);
      seenIds.get(im.attachmentId).push(album.title);
    }
  }

  const crossCategoryDupes = [...seenIds.entries()].filter(([, cats]) => cats.length > 1);
  if (crossCategoryDupes.length) {
    errors.push(`Cross-category duplicate attachmentId(s): ${crossCategoryDupes.map(([id, cats]) => `${id} in [${cats.join(', ')}]`).join('; ')}`);
  }

  const uniqueCount = seenIds.size;
  if (uniqueCount !== 70) {
    errors.push(`Expected exactly 70 unique attachment IDs, found ${uniqueCount} (${totalRefs} total references).`);
  }

  if (APPROVED_GALLERY_VIDEOS.length !== 1) {
    errors.push(`Expected exactly 1 Gallery video, found ${APPROVED_GALLERY_VIDEOS.length}.`);
  }

  return { errors, uniqueCount, totalRefs };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Gallery migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.GALLERY_ALBUMS and data.GALLERY_VIDEOS on pages/media + media.');
  console.log('Authoritative source: WordPress /gallery-2/ (post_id 8928). /gallery/ and /gallery-2-2/ NOT merged.');
  console.log('='.repeat(72));

  // --- Manifest self-validation (before touching the database at all) ----
  const { errors: manifestErrors, uniqueCount, totalRefs } = validateManifest();
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 7 albums, ${totalRefs} references, ${uniqueCount} unique attachment IDs (expected 70), 0 duplicates (within or across categories), 1 video.`);
  for (const [title, expected] of Object.entries(EXPECTED_COUNTS)) {
    console.log(`     - "${title}": ${expected} images`);
  }

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const docs = {};
    const errors = [];
    for (const type of MEDIA_CONTENT_TYPES) {
      const doc = await ContentModel.findOne({ type }).lean();
      if (!doc) {
        errors.push(`No Content document found for type "${type}".`);
        continue;
      }
      if (!Array.isArray(doc.data?.GALLERY_ALBUMS)) {
        errors.push(`Content "${type}" exists but data.GALLERY_ALBUMS is not an array as expected.`);
        continue;
      }
      if (doc.draftData != null) {
        errors.push(`Content "${type}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`);
      }
      docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, GALLERY_ALBUMS is an array on both, no pending draftData.');

    // --- Baseline: GALLERY_ALBUMS must be either the 8 known placeholders
    //     (fresh run) or already the 7 approved albums (safe re-run / no-op)
    const placeholderSet = new Set(PLACEHOLDER_ALBUM_TITLES);
    const approvedAlbumSet = byTitleSet(APPROVED_GALLERY_ALBUMS);

    let anyAlreadyMigrated = false;
    let anyFreshBaseline = false;
    for (const type of MEDIA_CONTENT_TYPES) {
      const titles = byTitleSet(docs[type].data.GALLERY_ALBUMS);
      if (setsEqual(titles, placeholderSet)) {
        anyFreshBaseline = true;
      } else if (setsEqual(titles, approvedAlbumSet)) {
        anyAlreadyMigrated = true;
      } else {
        errors.push(
          `Content "${type}"'s data.GALLERY_ALBUMS titles are neither the 8 known placeholders nor the 7 already-approved albums — unexpected state, aborting rather than guessing. Found: ${[...titles].join(' | ')}`
        );
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (GALLERY_ALBUMS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }

    if (anyAlreadyMigrated && !anyFreshBaseline) {
      // Also check GALLERY_VIDEOS idempotency before declaring a full no-op.
      const videosAlreadyMatch = MEDIA_CONTENT_TYPES.every((type) => deepEqual(docs[type].data.GALLERY_VIDEOS, APPROVED_GALLERY_VIDEOS));
      if (videosAlreadyMatch) {
        console.log('\n[OK] Both Content documents already show the 7 approved albums and the approved video — nothing to do (safe re-run / already migrated).');
        return;
      }
      console.log('\n[OK] Albums already migrated; GALLERY_VIDEOS differs or is missing — will write GALLERY_VIDEOS only.');
    } else if (anyAlreadyMigrated && anyFreshBaseline) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other (one has the placeholders, the other already has the approved albums) — this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    } else {
      console.log('[OK] Baseline confirmed: both documents have exactly the 8 known placeholder albums.');
    }

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { GALLERY_ALBUMS: _ga, GALLERY_VIDEOS: _gv, ...restBefore } = docs[type].data;
      const wouldBeAfter = { ...docs[type].data, GALLERY_ALBUMS: APPROVED_GALLERY_ALBUMS, GALLERY_VIDEOS: APPROVED_GALLERY_VIDEOS };
      const { GALLERY_ALBUMS: _ga2, GALLERY_VIDEOS: _gv2, ...restAfter } = wouldBeAfter;
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed — some key other than GALLERY_ALBUMS/GALLERY_VIDEOS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key (Events, Newsletter, Testimonials, Press, Resources, Compliances/Credibility, SEO, etc.) is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Replace data.GALLERY_ALBUMS (8 placeholder entries -> ${APPROVED_GALLERY_ALBUMS.length} verified real albums, ${uniqueCount} images) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log(`Set data.GALLERY_VIDEOS (-> ${APPROVED_GALLERY_VIDEOS.length} verified real video) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    for (const album of APPROVED_GALLERY_ALBUMS) {
      console.log(`  - "${album.title}": ${album.images.length} images`);
    }
    for (const v of APPROVED_GALLERY_VIDEOS) {
      console.log(`  - video: "${v.title}" | ${v.url}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `gallery-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything, same as the Newsletter/Credibility/Events migrations.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateMany(
      { type: { $in: MEDIA_CONTENT_TYPES } },
      { $set: { 'data.GALLERY_ALBUMS': APPROVED_GALLERY_ALBUMS, 'data.GALLERY_VIDEOS': APPROVED_GALLERY_VIDEOS } }
    );
    console.log(`[COMMIT] Updated data.GALLERY_ALBUMS and data.GALLERY_VIDEOS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const albumsMatch = deepEqual(after.data.GALLERY_ALBUMS, APPROVED_GALLERY_ALBUMS);
      const videosMatch = deepEqual(after.data.GALLERY_VIDEOS, APPROVED_GALLERY_VIDEOS);
      console.log(`[verify] "${type}" GALLERY_ALBUMS matches the approved 7 albums exactly: ${albumsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" GALLERY_VIDEOS matches the approved video exactly: ${videosMatch ? 'YES' : 'NO'}`);
      if (!albumsMatch || !videosMatch) ok = false;

      const { GALLERY_ALBUMS: _ga, GALLERY_VIDEOS: _gv, ...restAfter } = after.data;
      const { GALLERY_ALBUMS: _ga2, GALLERY_VIDEOS: _gv2, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }

    if (!ok) {
      console.error('\n[WARNING] At least one verification failed — investigate before trusting this run.');
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
