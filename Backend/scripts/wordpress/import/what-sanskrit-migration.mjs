// WordPress -> MERN migration: What Sanskrit (Batch B of the Where-IKS /
// What-Sanskrit / Where-Sanskrit audit).
//
// Scope (per the approved batch):
//   - Touches ONLY data.WHAT_SANSKRIT_CATEGORIES (new key) and
//     data.WHAT_SANSKRIT_ROWS (new key) on the dual Content documents
//     {type: 'pages/media'} and {type: 'media'} (same dual-type-sync
//     pattern already proven by Newsletter/Gallery/Events/Where-Sanskrit).
//   - Both keys are brand new — unlike Where-Sanskrit (which replaced an
//     existing fabricated placeholder), there is no prior What-Sanskrit
//     data to overwrite. Baseline logic follows the precedent already
//     established by the Audit Reports migration for adding a new key:
//     "absent" is the fresh baseline, "present and deep-equal to the
//     approved data" is a safe no-op re-run, anything else aborts.
//   - Source: the live WordPress page https://vyoma.org/what-sanskrit/
//     (post_id 5698), cross-checked exhaustively (not a spot-check)
//     against its WXR export — 76 link instances / 75 unique URLs on
//     BOTH sides, zero discrepancies. Unlike Where-Sanskrit, this page's
//     content is fully inline in the WXR's content:encoded (no TablePress
//     shortcode involved).
//   - Preserves the real 2-level structure found on the live page: 8
//     sibling top-level categories, 5 of which have an internal
//     sub-category grouping (21 distinct sub-category labels total); the
//     other 3 (Veda, Upaveda, Kavya) have none. Each row carries a
//     `subcategory` field, empty string when the live page has no
//     sub-grouping for that category.
//   - No `desc` field — the live page has no description text for any
//     entry here (unlike Where-Sanskrit). Omitted entirely rather than
//     carrying an always-empty column, per the approved decision.
//   - Preserves the ONE genuine duplicate exactly as published: "Kadambari
//     - Shukanasopadesha (Tamil Explanation)" appears twice under
//     Shravya -> Gadyakavya, both times linking to the identical URL
//     (.../shukanasopadesa-tamil-7176). This is a pre-existing duplicate
//     on the live WordPress page itself (confirmed present identically in
//     both the WXR and a fresh live fetch) — NOT deduplicated, NOT
//     flagged as an error, per the "reproduce what's live" rule already
//     applied to Audit Reports' FY2017-18 link mismatch (D18) and
//     Collaterals' copy-paste bug.
//   - Does NOT touch Where-Sanskrit's data.RESOURCE_CATEGORIES /
//     data.RESOURCE_ROWS, or any other data key — verified unchanged both
//     before writing (baseline read) and after (deep-equal against a
//     pre-write backup).
//   - Does NOT add an admin CMS form for this content (none exists for
//     Where-Sanskrit either) — out of scope for this data-only migration.
//   - Does NOT download/rehost any linked course page or video.
//
// Source of truth: a full live-page + WXR cross-checked extraction
// performed for this batch. Nothing here was invented; `subcategory: ''`
// marks rows the live page itself presents with no sub-grouping, not a
// missing/unknown value.
//
// Modes:
//   node what-sanskrit-migration.mjs            -> dry-run (default)
//   node what-sanskrit-migration.mjs --commit   -> performs the real write,
//                                                   only after validation
//                                                   passes, after writing a
//                                                   pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];
const SFH = 'https://www.sanskritfromhome.org/course-details/';

// ---------------------------------------------------------------------------
// The 8 categories, in the live page's own tab order.
// ---------------------------------------------------------------------------
const APPROVED_WHAT_SANSKRIT_CATEGORIES = ['Veda', 'Upaveda', 'Vedanga', 'Darshana', 'Itarashashtra', 'Kavya', 'Drushya kavya', 'Shravya'];

function row(subcategory, title, link) {
  return { subcategory, title, link };
}

const APPROVED_WHAT_SANSKRIT_ROWS = {
  Veda: [
    row('', 'Parts of Vedas - Dr. Sowmya Krishnapur', 'https://youtu.be/w7vgmJ-fVw4'),
    row('', 'Rigveda Suktani - simple Sanskrit explanation for select suktas from Rigveda', `${SFH}rigveda-suktani-7160`),
  ],
  Upaveda: [row('', 'Basics of Ayurveda (For a Healthy Lifestyle) - Part 1', `${SFH}ayurveda_basics_part1-36655`)],
  Vedanga: [
    row('Shiksha', 'Introduction to Indian Phonetics through Paniniya Shiksha', `${SFH}paniniya_shiksha_sanskrit_phonetics-30656`),
    row('Vyakarna', 'Learn to Chant Ashtadhyayi', `${SFH}chant_ashtadhyayi-7261`),
    row('Vyakarna', 'Mastery of Paninian Grammar through Kashikavritti', `${SFH}mastery-of-paninian-grammar-through-kashikavritti-7336`),
    row('Vyakarna', 'Laghu Siddhanta Kaumudi', `${SFH}laghu_siddhanta_kaumudi_part_1-7315`),
    row('Vyakarna', 'Dhaatvartha Prakaranam of Vaiyakarana Bhushanasaara', `${SFH}bhushanasaara-dhaatvartha-7148`),
    row('Chandas', 'Chandas - Popular Sanskrit meters explained in simple Sanskrit', `${SFH}chandas-7242`),
    row('Jyotisha', "A bird's eye view of Siddhanta Jyotisha (Indian Astronomy)", `${SFH}siddhantajyotisha-37374`),
    row('Kalpa', 'Learn to do Ganesha Pooja', `${SFH}learn-ganesha-pooja-37277`),
  ],
  Darshana: [
    row('', 'Darshanas - Dr. Sowmya Krishnapur', 'https://youtu.be/UwjsgBRjzhI'),
    row('Yoga', 'A study of Yogadarshana of Patanjali', `${SFH}yogadarshana-patanjali-yoga-sutras-sanskrit-explan-7984`),
    row('Yoga', 'Hathayogapradipika - Verse by Verse in simple Sanskrit', `${SFH}hathayogapradipika-part1-upadeshas1,2-sanskrit-7219`),
    row('Yoga', 'Yogasutra Parichaya - Introduction to Yogasutras based on Vyasabhashya', `${SFH}yogasutra-parichaya-7141`),
    row('Yoga', 'Learn to Chant Yogasutras of Patanjali', `${SFH}yoga-sutras-of-patanjali-2-34591`),
    row('Nyaya', 'Learn the Basics of Nyaya Shastra through Tarkabhasha', `${SFH}learn-the-basics-of-nyaya-shastra-through-tarkabha-7318`),
    row('Vaisheshika', 'The Study of Vaisheshika Darshana', `${SFH}vaisheshika-darshana-7313`),
    row('Uttara memamsa', 'Taittiriyopanishad - Part 1 (Shikshavalli)', `${SFH}taittiriya-1-7162`),
    row('Uttara memamsa', 'Introduction to Vedanta', `${SFH}introduction-to-vedanta-7205`),
    row('Uttara memamsa', 'Upanishadaaloka - The Light of the Upanishads', `${SFH}upanishadaaloka-the-light-of-the-upanishads-7299`),
    row('Uttara memamsa', 'Tattvabodha - A Primer to Vedanta', `${SFH}tattvabodha-a-primer-to-vedanta-35011`),
    row('Uttara memamsa', 'Maneesha Panchakam', `${SFH}maneeshapanchaka-discourse-39042`),
  ],
  Itarashashtra: [
    row('Dharma', 'Sanatana Dharma', `${SFH}sanatana_dharma_questionandanswers_flipbook-32432`),
    row('Itihasa', 'Srimad Valmiki Ramayanam - Navaaha Parayanam', 'https://www.youtube.com/playlist?list=PLmozlYyYE-ET80ndk3_GtuWgVBxh0WT7a'),
    row('Itihasa', 'Adityahridayam - The power of Surya Upasana', `${SFH}adityahridayam-discourse-7279`),
    row('Itihasa', 'Ramayana Ratnamala - Audio', `${SFH}ramayanaratnamala-7158`),
    row('Itihasa', 'Ramayana Ratnamala – Flipbook', `${SFH}ramayana-ratnamala-flipbook-32820`),
    row('Itihasa', 'Learn to Chant Bhagavadgita', `${SFH}learn-to-chant-gita-7241`),
    row('Itihasa', 'Meaning of Vishnu Sahasranama Based on Shaankara Bhaashya', `${SFH}meaning-of-vishnu-sahasranama-shaankara-bhaashya-7288`),
    row('Purana', 'Srimad Bhagavatam Skandha 1 - Simple Verse-by-Verse explanation in Kannada', `${SFH}srimad-bhagavatam-skandha1-kannada-12203`),
    row('Purana', 'Srimad Bhagavatam - Skandha 1(Tamil explanation)', `${SFH}srimad-bhagavatam-skandha1-tamil-8490`),
    row('Bhakti', 'Haribhaktimanjusha', `${SFH}haribhaktimanjusha-7256`),
    row('64 Kalaa', 'The Science of Rangoli rendering and Flower stringing', `${SFH}TheScienceofRangolirenderingandFlowerstringing-30357`),
    row('64 Kalaa', 'Train the Brain with Sanskrit Riddles', `${SFH}sanskrit-riddles-35007`),
    row('Ganita', 'Lilavati - A Primer of Indian Mathematics', `${SFH}lilavati-7208`),
    row('Ganita', 'Entry into Indian Mathematics - Part 1 (Sadratnamala - Chapter 1 & 2)', `${SFH}indian-mathematics-part1-32533`),
  ],
  Kavya: [
    row('', 'An overview of Sanskrit literary works - Dr. Sowmya Krishnapur', 'https://youtu.be/uR7SoRiGml0'),
    row('', 'An overview of Sanskrit literary works (contd.) - Dr. Sowmya Krishnapur', 'https://youtu.be/OqYSxzkj6Fs'),
  ],
  'Drushya kavya': [
    row('Roopaka', 'Abhijnana Shakuntalam', `${SFH}abhijnanashakuntalam-tamil-7254`),
    row('Roopaka', 'Uttararamacharitam', `${SFH}uttararamacharitam-tamil-7238`),
    row('Roopaka', 'Mudrarakshasam - Full Text (Tamil Explanation)', `${SFH}mudrarakshasam-tamil-7282`),
    row('Roopaka', 'Mricchakatikam - Full Text (Tamil Explanation)', `${SFH}mricchakatikam-tamil-7240`),
    row('Roopaka', 'Mattavilaasa Prahasanam (Tamil Explanation)', `${SFH}mattavilasa_prahasanam-7296`),
    row('Roopaka', 'Madhyama Vyayoga - A humorous One-Act Play of Bhasa (Sanskrit Explanation)', `${SFH}madhyama-vyayoga-7331`),
    row('Nitikavya', 'Niti Shatakam of Bhartrihari (Sanskrit explanation)', `${SFH}niti-shatakam-sanskrit-12211`),
    row('Nitikavya', 'Vairagyashatakam - Full Text (Tamil Explanation)', `${SFH}vairagyasatakam-tamil-7329`),
    row('Stotra', 'Soundaryalahari – Focussed Learning (English explanation)', `${SFH}soundaryalahari-english-short-meanings-7334`),
    row('Stotra', 'Soundaryalahari – Detailed exposition in Kannada', `${SFH}soundaryalahari-kannada-7333`),
    row('Stotra', 'Shivanandalahari – Detailed exposition in Kannada', `${SFH}shivanandalahari-detailed-kannada-7337`),
    row('Stotra', 'Subrahmanya Bhujanga Stotram – Focussed Learning', `${SFH}subrahmanya-bhujanga-stotram-meaning-english-7421`),
    row('Stotra', "Sri Vedantadeshika's Padukasahasram - A delightful discourse", `${SFH}padukashasram-discourse-31959`),
    row('Stotra', 'Learn Mahishasura Mardini Stotra - A Popular Tongue Twister (Verse by Verse English Explanation)', `${SFH}mahishasura-mardini-stotram-40010`),
  ],
  Shravya: [
    row('Gadyakavya', 'Gadya Sangraha', `${SFH}gadya-sangraha-tamil-videos-12207`),
    row('Gadyakavya', 'Kadambari - Shukanasopadesha (Tamil Explanation)', `${SFH}shukanasopadesa-tamil-7176`),
    row('Gadyakavya', 'Dashakumaracharitam - Poorvapeethikaa', `${SFH}dashakumaracaritam-purvapithika-tamil-7190`),
    // Intentional, verified duplicate of the row above — present identically
    // on the live WordPress page and in the WXR export. See header comment.
    row('Gadyakavya', 'Kadambari - Shukanasopadesha (Tamil Explanation)', `${SFH}shukanasopadesa-tamil-7176`),
    row('Gadyakavya', 'Raghuveera Gadyam of Sri Vedanta Deshika - Simple Sanskrit Meaning', `${SFH}raghuveera-gadyam-meaning-sanskrit-29388`),
    row('Padyakavya', 'Raghuvamsha of Kalidasa - Summary of sargas and special verses (Kannada)', `${SFH}raghuvamsha-of-kalidasa-videos-kannada-sotinagaraj-7301`),
    row('Padyakavya', 'Raghuvamsha - Sarga 1 (Sanskrit Explanation)', `${SFH}raghuvamsha-sarga1-sanskrit-7220`),
    row('Padyakavya', 'Yadavabhyudayam - Sarga 1 (Sanskrit Explanation)', `${SFH}yadavabhyudayam-sarga-1-sanskrit-7325`),
    row('Padyakavya', 'Venisamharam - Act 3 (Tamil Explanation)', `${SFH}venisamhara-act3-7174`),
    row('Padyakavya', 'Shishupala Vadha of Magha - Sarga 1 (Tamil Explanation)', `${SFH}shishupala-vadha-sarga1-tamil-8491`),
    row('Padyakavya', 'Kumarasambhava of Kalidasa – Sarga 1 (English explanation)', `${SFH}kumara-sambhava-sarga1-english-12204`),
    row('Padyakavya', 'A Textual Study of Shivaleelarnavam - Sarga 1 (Masterpiece of Neelakantha Deekshitar)', `${SFH}textual_study_of_shivaleelarnavam_sarga1-31608`),
    row('Padyakavya', 'Poorvamegha (Section 1 of Meghaduta - Tamil)', `${SFH}purvamegha-tamil-7199`),
    row('Padyakavya', 'Uttaramegha (Section 2 of Meghaduta - Tamil)', `${SFH}uttaramegha-tamil-7200`),
    row('Champukavya', 'Champu Ramayana - Baalakaanda - In-depth study', `${SFH}champuramayana-balakanda-sanskrit-7172`),
    row('Champukavya', 'Champuramayanam - Sundarakandam (Sanskrit Explanation)', `${SFH}champuramayana-sundarakanda-sanskrit-7217`),
    row('Champukavya', 'Nilakanthavijaya Champu - Ashvasas 1,2 (English Explanation)', `${SFH}nilakanthavijayachampu-tamil-7239`),
    row('Kathasahitya', 'Stories from the Panchatantra', `${SFH}pancatantra-stories-7195`),
    row('Kathasahitya', 'Learn Life Skills through Panchatantra - 1 A textual study of Mitrabheda', `${SFH}panchatantra_mitrabheda-31125`),
    row('Kosha', 'Learn to Chant Amarakosha - Kanda 1', `${SFH}chant_amarakosha_kanda1-7262`),
    row('Kosha', 'Koshadarshanam - Learn to get the best out of Sanskrit dictionaries', `${SFH}koshadarshanam-7221`),
    row('Shashtra kavya', 'Kaavya - Shaastra -Sambandha - Appreciating the intersection of Literature and Shaastras', `${SFH}kaavya-shaastra-sambandha-7144`),
    row('Vidambanakavya', 'Kalividambanam (Tamil Explanation)', `${SFH}kalividambanam-tamil-7330`),
  ],
};

const EXPECTED_ROW_COUNTS = {
  Veda: 2,
  Upaveda: 1,
  Vedanga: 8,
  Darshana: 12,
  Itarashashtra: 14,
  Kavya: 2,
  'Drushya kavya': 14,
  Shravya: 23,
};
const EXPECTED_TOTAL_ROWS = 76;
const EXPECTED_UNIQUE_URLS = 75;
const KNOWN_DUPLICATE_URL = `${SFH}shukanasopadesa-tamil-7176`;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateManifest() {
  const errors = [];

  if (APPROVED_WHAT_SANSKRIT_CATEGORIES.length !== 8) {
    errors.push(`Expected exactly 8 categories, found ${APPROVED_WHAT_SANSKRIT_CATEGORIES.length}.`);
  }

  let total = 0;
  const urlCounts = new Map();
  for (const cat of APPROVED_WHAT_SANSKRIT_CATEGORIES) {
    const rows = APPROVED_WHAT_SANSKRIT_ROWS[cat];
    const expected = EXPECTED_ROW_COUNTS[cat];
    if (!Array.isArray(rows)) {
      errors.push(`Category "${cat}" has no row array in APPROVED_WHAT_SANSKRIT_ROWS.`);
      continue;
    }
    if (rows.length !== expected) {
      errors.push(`Category "${cat}": expected ${expected} rows, found ${rows.length}.`);
    }
    for (const r of rows) {
      if (typeof r.title !== 'string' || !r.title) errors.push(`Category "${cat}" has a row with a missing/empty title.`);
      if (typeof r.subcategory !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string subcategory.`);
      if (typeof r.link !== 'string' || !r.link) errors.push(`Category "${cat}" row "${r.title}" has a missing/empty link.`);
      urlCounts.set(r.link, (urlCounts.get(r.link) || 0) + 1);
    }
    total += rows.length;
  }

  const extraKeys = Object.keys(APPROVED_WHAT_SANSKRIT_ROWS).filter((k) => !APPROVED_WHAT_SANSKRIT_CATEGORIES.includes(k));
  if (extraKeys.length) errors.push(`APPROVED_WHAT_SANSKRIT_ROWS has categories not listed in APPROVED_WHAT_SANSKRIT_CATEGORIES: ${extraKeys.join(', ')}`);

  if (total !== EXPECTED_TOTAL_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_TOTAL_ROWS} total rows, found ${total}.`);
  }

  const uniqueUrls = urlCounts.size;
  if (uniqueUrls !== EXPECTED_UNIQUE_URLS) {
    errors.push(`Expected exactly ${EXPECTED_UNIQUE_URLS} unique URLs, found ${uniqueUrls}.`);
  }

  // The ONE known, verified duplicate must appear exactly twice; no other
  // URL may repeat (an unexpected extra duplicate suggests a transcription
  // error, not a real second live-page duplicate).
  const duplicated = [...urlCounts.entries()].filter(([, count]) => count > 1);
  if (duplicated.length !== 1 || duplicated[0][0] !== KNOWN_DUPLICATE_URL || duplicated[0][1] !== 2) {
    errors.push(`Expected exactly one duplicated URL (${KNOWN_DUPLICATE_URL}, appearing twice) — found: ${JSON.stringify(duplicated)}.`);
  }

  return { errors, total, uniqueUrls };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`What Sanskrit migration (Batch B) — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.WHAT_SANSKRIT_CATEGORIES (new) and data.WHAT_SANSKRIT_ROWS (new) on pages/media + media.');
  console.log('Source: live https://vyoma.org/what-sanskrit/ (post_id 5698), cross-checked exhaustively against its WXR export — 100% parity.');
  console.log('Does NOT touch Where-Sanskrit (RESOURCE_CATEGORIES/RESOURCE_ROWS) or any other data key.');
  console.log('='.repeat(72));

  // --- Manifest self-validation (before touching the database at all) ----
  const { errors: manifestErrors, total, uniqueUrls } = validateManifest();
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 8 categories, ${total} total rows, ${uniqueUrls} unique URLs (expected ${EXPECTED_TOTAL_ROWS}/${EXPECTED_UNIQUE_URLS}), exactly 1 known duplicate preserved.`);
  for (const [cat, expected] of Object.entries(EXPECTED_ROW_COUNTS)) {
    console.log(`     - "${cat}": ${expected} rows`);
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
    console.log('[OK] Both Content documents exist, no pending draftData.');

    // --- Baseline: WHAT_SANSKRIT_CATEGORIES/ROWS must be absent (fresh,
    //     brand-new keys — same precedent as the Audit Reports migration)
    //     or already match the approved data (safe re-run / no-op).
    let anyAlreadyMigrated = false;
    let anyFreshBaseline = false;
    for (const type of MEDIA_CONTENT_TYPES) {
      const existingCats = docs[type].data.WHAT_SANSKRIT_CATEGORIES;
      const existingRows = docs[type].data.WHAT_SANSKRIT_ROWS;
      const isAbsent = existingCats === undefined && existingRows === undefined;
      const isApproved = deepEqual(existingCats, APPROVED_WHAT_SANSKRIT_CATEGORIES) && deepEqual(existingRows, APPROVED_WHAT_SANSKRIT_ROWS);
      if (isAbsent) {
        anyFreshBaseline = true;
      } else if (isApproved) {
        anyAlreadyMigrated = true;
      } else {
        errors.push(`Content "${type}"'s data.WHAT_SANSKRIT_CATEGORIES/ROWS is neither absent (fresh) nor the approved data — unexpected/partial state, aborting rather than overwriting unknown existing content.`);
      }
      // Also confirm Where-Sanskrit's keys exist and are untouched by this check.
      if (!Array.isArray(docs[type].data.RESOURCE_CATEGORIES) || typeof docs[type].data.RESOURCE_ROWS !== 'object') {
        errors.push(`Content "${type}"'s data.RESOURCE_CATEGORIES/RESOURCE_ROWS (Where-Sanskrit) is missing or malformed — aborting rather than proceed in an unexpected overall state.`);
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (WHAT_SANSKRIT baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }

    if (anyAlreadyMigrated && anyFreshBaseline) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other (one is fresh, the other already has the approved data) — this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    if (anyAlreadyMigrated) {
      console.log('\n[OK] Both Content documents already show the approved real What-Sanskrit data — nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed: both documents have no WHAT_SANSKRIT_CATEGORIES/ROWS keys yet (fresh), and Where-Sanskrit\'s own data is present and untouched.');

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { WHAT_SANSKRIT_CATEGORIES: _wc, WHAT_SANSKRIT_ROWS: _wr, ...restBefore } = docs[type].data;
      const wouldBeAfter = { ...docs[type].data, WHAT_SANSKRIT_CATEGORIES: APPROVED_WHAT_SANSKRIT_CATEGORIES, WHAT_SANSKRIT_ROWS: APPROVED_WHAT_SANSKRIT_ROWS };
      const { WHAT_SANSKRIT_CATEGORIES: _wc2, WHAT_SANSKRIT_ROWS: _wr2, ...restAfter } = wouldBeAfter;
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed — some key other than WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, including Where-Sanskrit\'s RESOURCE_CATEGORIES/RESOURCE_ROWS, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Add data.WHAT_SANSKRIT_CATEGORIES (8 categories) and data.WHAT_SANSKRIT_ROWS (${total} rows, ${uniqueUrls} unique URLs) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    for (const [cat, rows] of Object.entries(APPROVED_WHAT_SANSKRIT_ROWS)) {
      console.log(`  - "${cat}": ${rows.length} rows`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `what-sanskrit-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything, same as every prior migration.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateMany(
      { type: { $in: MEDIA_CONTENT_TYPES } },
      { $set: { 'data.WHAT_SANSKRIT_CATEGORIES': APPROVED_WHAT_SANSKRIT_CATEGORIES, 'data.WHAT_SANSKRIT_ROWS': APPROVED_WHAT_SANSKRIT_ROWS } }
    );
    console.log(`[COMMIT] Added data.WHAT_SANSKRIT_CATEGORIES and data.WHAT_SANSKRIT_ROWS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const catsMatch = deepEqual(after.data.WHAT_SANSKRIT_CATEGORIES, APPROVED_WHAT_SANSKRIT_CATEGORIES);
      const rowsMatch = deepEqual(after.data.WHAT_SANSKRIT_ROWS, APPROVED_WHAT_SANSKRIT_ROWS);
      console.log(`[verify] "${type}" WHAT_SANSKRIT_CATEGORIES matches exactly: ${catsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" WHAT_SANSKRIT_ROWS matches the approved data exactly: ${rowsMatch ? 'YES' : 'NO'}`);
      if (!catsMatch || !rowsMatch) ok = false;

      const { WHAT_SANSKRIT_CATEGORIES: _wc, WHAT_SANSKRIT_ROWS: _wr, ...restAfter } = after.data;
      const { WHAT_SANSKRIT_CATEGORIES: _wc2, WHAT_SANSKRIT_ROWS: _wr2, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key (incl. Where-Sanskrit) unchanged: ${restSame ? 'YES' : 'NO'}`);
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
