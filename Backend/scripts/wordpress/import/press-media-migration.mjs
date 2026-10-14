// WordPress -> MERN migration: real Press/Media content — 3 audio
// recordings and the newspaper clipping galleries, replacing the entirely
// fabricated PRESS_FEATURED/PRESS_CLIPPINGS placeholder data.
//
// Scope:
//   - data.PRESS_RADIO[*].url on both {type: 'media'} and
//     {type: 'pages/media'} (these two documents are kept as exact mirrors
//     -- confirmed via direct query before writing this script -- so both
//     must be updated identically). Only `url` is added; existing
//     title/duration strings (already correct) are left untouched.
//   - data.PRESS_CLIPPING_SECTIONS on the same two documents: a brand-new
//     key replacing the old PRESS_FEATURED/PRESS_CLIPPINGS arrays, which
//     held nothing but invented publication names/dates/notes.
//   - Does NOT touch PRESS_PUBLICATIONS, or any other data key.
//
// Source of truth: the WXR export's <content:encoded> for the live,
// *published* "Media" page (post_id 11176, https://vyoma.org/media/,
// wp:status "publish" -- confirmed not a draft/revision), which contains
// the exact Divi shortcodes for a [playlist] (3 real mp3s) and 5 named
// [et_pb_gallery] sections. Every item below is taken verbatim (title,
// grouping, order, and -- for the 8 items that have one -- real caption
// text) from that shortcode and its rendered HTML in the same export, not
// invented. All 33 source URLs (3 audio + 30 images) were independently
// re-verified live (HTTP 200, correct content-type) immediately before
// this script was written.
//
// Reported separately, per instruction, before this script was written:
// the live page actually has ~30 real clipping images across 5 sections,
// not the originally-scoped 7 -- user decided (2026-10-13) to migrate all
// 30, preserving the original 5 section groupings exactly as found.
//
// Modes:
//   node press-media-migration.mjs            -> dry-run (default)
//   node press-media-migration.mjs --commit    -> real write, after
//                                                  validation, after a
//                                                  pre-change backup

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPES = ['media', 'pages/media'];

function clip(title, url, caption) {
  return caption ? { title, image: { url }, caption } : { title, image: { url } };
}

const PRESS_RADIO_URLS = {
  'Benefits and Courses of Learning Sanskrit': 'https://www.vyoma.org/wp-content/uploads/2023/08/AUD-20230701-WA0001.mp3',
  'Introduction to Vyoma Labs': 'https://www.vyoma.org/wp-content/uploads/2023/08/AUD-20230701-WA0002.mp3',
  'Sanskrit: A Magic Medicine': 'https://www.vyoma.org/wp-content/uploads/2023/08/AUD-20230701-WA0003.mp3',
};
const EXPECTED_RADIO = 3;

const PRESS_CLIPPING_SECTIONS = [
  {
    heading: 'OTT Launch Updates in Kannada Newspapers',
    items: [
      clip('Udayavani-20 Jul 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Udayavani-page3-Date-20-Jul-25.jpg'),
      clip('Samyukata Karnataka – 20 Jul 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Samyukata-Karnataka-20-Jul-25.jpg'),
      clip('Vijay Karnataka – 21 July 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Vijay-Karnataka-page9-Date-21-JU-25.jpg'),
      clip('Kannada Prabha', 'https://www.vyoma.org/wp-content/uploads/2025/08/Kannada-Prabha.jpeg'),
      clip('Sanje Samaya page4 Date 19 Jul 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Sanje-Samaya-page4-Date-19-Jul-25.jpg'),
      clip('Eesanje page6 Date 20 JUl 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Eesanje-page6-Date-20-JUl-25.jpg'),
      clip('Hosadigantha page12 Date 20 Jul 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Hosadigantha-page12-Date-20-Jul-25.jpg'),
      clip('Indu Sanje page4 Date 19 JUl 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Indu-Sanje-page4-Date-19-JUl-25.jpg'),
      clip('Sanje Samaya page4 Date 19 Jul 25 ', 'https://www.vyoma.org/wp-content/uploads/2025/08/Sanje-Samaya-page4-Date-19-Jul-25-1.jpg'),
      clip('Sanjevani page Date 19 Jul 25', 'https://www.vyoma.org/wp-content/uploads/2025/08/Sanjevani-page-Date-19-Jul-25.jpg'),
    ],
  },
  {
    heading: 'OTT Launch Updates in English Newspapers',
    items: [
      clip('The Hindu', 'https://www.vyoma.org/wp-content/uploads/2025/08/The-Hindu-page2-Date-20-Jul-25.jpg'),
      clip('Sanskrit News', 'https://www.vyoma.org/wp-content/uploads/2025/08/SANSKRIT-NEWS-1.jpeg'),
      clip('Rajasthan Mirror', 'https://www.vyoma.org/wp-content/uploads/2025/08/Rajasthan-Mirror.png'),
      clip('Indore Pioneer', 'https://www.vyoma.org/wp-content/uploads/2025/08/Indore-Pioneer.png'),
      clip('The evening post', 'https://www.vyoma.org/wp-content/uploads/2025/08/The-evening-post.png'),
      clip('Delhi NEWS now', 'https://www.vyoma.org/wp-content/uploads/2025/08/Delhi-NEWS-now-1.png'),
      clip('Prakhar Jagran', 'https://www.vyoma.org/wp-content/uploads/2025/08/Prakhar-Jagran-1.png'),
      clip('UP patrika 2', 'https://www.vyoma.org/wp-content/uploads/2025/08/UP-patrika-2-1.png'),
    ],
  },
  {
    heading: 'OTT Launch Updates in Sanskrit Newspaper',
    items: [clip('Sudharma', 'https://www.vyoma.org/wp-content/uploads/2025/08/Sudharma-1.jpeg')],
  },
  {
    heading: 'OTT Launch Updates in Tamil & Telugu Newspapers',
    items: [
      clip('Dinasudar – 19-07-2025', 'https://www.vyoma.org/wp-content/uploads/2025/08/Dinasudar-page2-Date-19-Jul-25.jpg'),
      clip('Andhra Jyothi', 'https://www.vyoma.org/wp-content/uploads/2025/08/Andhra-Jyothi.jpeg'),
      clip('News today', 'https://www.vyoma.org/wp-content/uploads/2025/08/NEWS-Today.jpeg'),
    ],
  },
  {
    heading: 'More Press Coverage',
    items: [
      clip(
        'Vyoma Linguistic Labs Foundation Sanskrit Day celebration on 9th Aug 2025',
        'https://www.vyoma.org/wp-content/uploads/2025/08/media.jpeg'
      ),
      clip(
        'Tattva Loka Magazine',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Tattva-Loka-Magazine.png',
        'A book review of our publication – Experience the Bliss of Bhakti and Vibhakti in Srimannarayaniyam was published in TATTVALOKA The Splendour of Truth magazine of May issue 2025.'
      ),
      clip(
        'Tattva Loka Magazine',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Tattva-Loka-Magazine-.png',
        'A book review of our publication – Experience the Bliss of Bhakti and Vibhakti in Srimannarayaniyam was published in TATTVALOKA The Splendour of Truth magazine of May issue 2025.'
      ),
      clip(
        'Jaipur TDG Network',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Jaipur-TDG-Network.jpg',
        'Central Sanskrit University Conducted a 6 day Sanskrit Technology Training Program at Jaipur, Our COO Dr. Venkatsubramanian was Chief Guest of the event and our CEO Dr. Viswanathan was the Saraswath Guest of the event. The event details were covered and published in major Newspapers in English and Hindi.'
      ),
      clip(
        'Rajasthan Vision',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Rajasthan-Vision.jpg',
        'Central Sanskrit University Conducted a 6 day Sanskrit Technology Training Program at Jaipur, Our COO Dr. Venkatsubramanian was Chief Guest of the event and our CEO Dr. Viswanathan was the Saraswath Guest of the event. The event details were covered and published in major Newspapers in English and Hindi.'
      ),
      clip(
        'Kannada Prabha World Environment day 2025',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Kannada-Prabha-World-Environment-day-2025.jpg',
        'On account of World Environment Day June 5,2024 Shri Shri Shri Basava Ramananda Swamiji, along with officials from Vyoma Linguistic Labs, Aapath Sahaaya Foundation, teachers, and students from Shri Veena Makkala Mandira, came together to plant 108 fruit trees in the Vanakallu Malleshwara area.'
      ),
      clip(
        'Prajapragathi World Environment Day 2025',
        'https://www.vyoma.org/wp-content/uploads/2025/06/Prajapragathi-World-Environment-Day-2025.jpg',
        'On account of World Environment Day June 5,2024 Shri Shri Shri Basava Ramananda Swamiji, along with officials from Vyoma Linguistic Labs, Aapath Sahaaya Foundation, teachers, and students from Shri Veena Makkala Mandira, came together to plant 108 fruit trees in the Vanakallu Malleshwara area.'
      ),
      clip(
        'The Daily News – World Environment day 2025',
        'https://www.vyoma.org/wp-content/uploads/2025/06/The-Daily-News-World-Environment-day-2025.jpg',
        'On account of World Environment Day June 5,2024 Shri Shri Shri Basava Ramananda Swamiji, along with officials from Vyoma Linguistic Labs, Aapath Sahaaya Foundation, teachers, and students from Shri Veena Makkala Mandira, came together to plant 108 fruit trees in the Vanakallu Malleshwara area.'
      ),
    ],
  },
];
const EXPECTED_SECTIONS = 5;
const EXPECTED_CLIPPINGS = 30;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Press/Media migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log("Scope: data.PRESS_RADIO[*].url and data.PRESS_CLIPPING_SECTIONS on {type:'media'} and {type:'pages/media'}.");
  console.log('Does NOT touch PRESS_PUBLICATIONS or any other data key.');
  console.log('='.repeat(72));

  // --- Manifest self-validation --------------------------------------------
  const manifestErrors = [];
  if (Object.keys(PRESS_RADIO_URLS).length !== EXPECTED_RADIO) manifestErrors.push(`Expected ${EXPECTED_RADIO} radio URLs, found ${Object.keys(PRESS_RADIO_URLS).length}.`);
  if (PRESS_CLIPPING_SECTIONS.length !== EXPECTED_SECTIONS) manifestErrors.push(`Expected ${EXPECTED_SECTIONS} clipping sections, found ${PRESS_CLIPPING_SECTIONS.length}.`);
  const totalClippings = PRESS_CLIPPING_SECTIONS.reduce((sum, s) => sum + s.items.length, 0);
  if (totalClippings !== EXPECTED_CLIPPINGS) manifestErrors.push(`Expected ${EXPECTED_CLIPPINGS} total clipping items, found ${totalClippings}.`);
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: ${EXPECTED_RADIO} radio URLs, ${EXPECTED_SECTIONS} sections, ${totalClippings} total clipping items.`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const docs = {};
    const errors = [];
    for (const type of TYPES) {
      const doc = await ContentModel.findOne({ type }).lean();
      if (!doc) errors.push(`No Content document found for type "${type}".`);
      else if (doc.draftData != null) errors.push(`Content "${type}" has a non-null draftData -- aborting rather than risk it later overwriting this migration.`);
      else docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    if (!deepEqual(docs['media'].data, docs['pages/media'].data)) {
      console.error('\nVALIDATION FAILED: "media" and "pages/media" data are not currently identical -- expected them to be kept in sync. ABORT rather than guess which is authoritative.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, no pending draftData, and are confirmed identical.');

    // --- Baseline: confirm every expected radio title is present -----------
    const radioTitles = docs['media'].data.PRESS_RADIO.map((r) => r.title);
    const missingTitles = Object.keys(PRESS_RADIO_URLS).filter((t) => !radioTitles.includes(t));
    if (missingTitles.length) {
      console.error(`\nVALIDATION FAILED: expected PRESS_RADIO titles not found in current data: ${missingTitles.join(', ')}`);
      console.error('ABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    // --- Already-migrated / partial-state detection -------------------------
    function radioState(radioList) {
      const targeted = radioList.filter((r) => PRESS_RADIO_URLS[r.title]);
      const allMatch = targeted.every((r) => r.url === PRESS_RADIO_URLS[r.title]);
      const noneSet = targeted.every((r) => !r.url);
      return { allMatch, noneSet };
    }
    const mediaRadioState = radioState(docs['media'].data.PRESS_RADIO);
    const sectionsAlreadyMatch = deepEqual(docs['media'].data.PRESS_CLIPPING_SECTIONS, PRESS_CLIPPING_SECTIONS);
    const sectionsEmpty = !docs['media'].data.PRESS_CLIPPING_SECTIONS || docs['media'].data.PRESS_CLIPPING_SECTIONS.length === 0;

    if (!mediaRadioState.allMatch && !mediaRadioState.noneSet) {
      console.error('\nVALIDATION FAILED: PRESS_RADIO has some but not all target urls already set (or set to an unexpected value) -- unexpected partial state, aborting rather than guessing.');
      process.exitCode = 1;
      return;
    }
    if (!sectionsAlreadyMatch && !sectionsEmpty) {
      console.error('\nVALIDATION FAILED: PRESS_CLIPPING_SECTIONS already has unexpected content (neither empty nor matching the approved data) -- aborting rather than overwrite it blindly.');
      process.exitCode = 1;
      return;
    }

    const staleKeysPresent = ['PRESS_FEATURED', 'PRESS_CLIPPINGS'].some((k) => docs['media'].data[k] !== undefined);

    if (mediaRadioState.allMatch && sectionsAlreadyMatch && !staleKeysPresent) {
      console.log('\n[OK] All target data already matches the approved content -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed.');

    // --- Compute next state --------------------------------------------------
    const nextRadio = docs['media'].data.PRESS_RADIO.map((r) => (PRESS_RADIO_URLS[r.title] ? { ...r, url: PRESS_RADIO_URLS[r.title] } : r));

    // --- Prove every other data key is unaffected, before writing -----------
    for (const type of TYPES) {
      const { PRESS_RADIO: _r, PRESS_CLIPPING_SECTIONS: _c, PRESS_FEATURED: _f, PRESS_CLIPPINGS: _p, ...restBefore } = docs[type].data;
      const { PRESS_RADIO: _r2, PRESS_CLIPPING_SECTIONS: _c2, PRESS_FEATURED: _f2, PRESS_CLIPPINGS: _p2, ...restAfter } = {
        ...docs[type].data,
        PRESS_RADIO: nextRadio,
        PRESS_CLIPPING_SECTIONS,
      };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than PRESS_RADIO/PRESS_CLIPPING_SECTIONS/PRESS_FEATURED/PRESS_CLIPPINGS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, on both documents, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set url on: ${Object.keys(PRESS_RADIO_URLS).length} PRESS_RADIO entries (media + pages/media).`);
    console.log(`Set PRESS_CLIPPING_SECTIONS: ${EXPECTED_SECTIONS} sections, ${totalClippings} total items (media + pages/media).`);
    console.log(`Remove stale fabricated keys PRESS_FEATURED/PRESS_CLIPPINGS (media + pages/media): ${staleKeysPresent ? 'yes, present' : 'already absent'}.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` -------
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `press-media-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of TYPES) backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    // --- Write (targeted dot-notation $set/$unset only -- never the whole `data`) ---
    for (const type of TYPES) {
      await ContentModel.updateOne(
        { type },
        {
          $set: { 'data.PRESS_RADIO': nextRadio, 'data.PRESS_CLIPPING_SECTIONS': PRESS_CLIPPING_SECTIONS },
          $unset: { 'data.PRESS_FEATURED': '', 'data.PRESS_CLIPPINGS': '' },
        }
      );
    }
    console.log('[COMMIT] Set PRESS_RADIO urls and PRESS_CLIPPING_SECTIONS, removed stale PRESS_FEATURED/PRESS_CLIPPINGS, on both media and pages/media.');

    // --- Post-write verification ---------------------------------------------
    let ok = true;
    for (const type of TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const radioMatch = deepEqual(after.data.PRESS_RADIO, nextRadio);
      const sectionsMatch = deepEqual(after.data.PRESS_CLIPPING_SECTIONS, PRESS_CLIPPING_SECTIONS);
      const staleGone = after.data.PRESS_FEATURED === undefined && after.data.PRESS_CLIPPINGS === undefined;
      console.log(`[verify] "${type}" PRESS_RADIO matches: ${radioMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" PRESS_CLIPPING_SECTIONS matches: ${sectionsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" stale PRESS_FEATURED/PRESS_CLIPPINGS removed: ${staleGone ? 'YES' : 'NO'}`);
      if (!radioMatch || !sectionsMatch || !staleGone) ok = false;

      const { PRESS_RADIO: _r3, PRESS_CLIPPING_SECTIONS: _c3, PRESS_FEATURED: _f3, PRESS_CLIPPINGS: _p3, ...restAfter } = after.data;
      const { PRESS_RADIO: _r4, PRESS_CLIPPING_SECTIONS: _c4, PRESS_FEATURED: _f4, PRESS_CLIPPINGS: _p4, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
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
