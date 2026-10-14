// WordPress -> MERN migration: real Leadership (Board/Advisors/Committee),
// Core Team, and Awards & Recognition photos.
//
// Scope:
//   - Adds/populates data.BOARD[*].image, data.ADVISORS[*].image,
//     data.COMMITTEE[*].image, data.CORE_TEAMS[*].people[*].image (all
//     already-existing but previously-null fields) on {type: 'pages/about'}
//     and {type: 'pages/credibility'}'s data.AWARDS_ITEMS[*].image.
//   - Does NOT touch names, roles, bios, headings, group structure, or
//     ordering anywhere -- every person/award stays exactly where and as
//     they already are; only the `image` field is set.
//   - Does NOT touch any other data key on either document.
//
// Source of truth: every URL below was extracted structurally from the WXR
// export (`Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.
// 2026-09-29.xml`) by pairing each Divi `front_background_image`/
// `image_url` attribute with its immediately-following team-member/heading
// tag, in document order -- not by filename similarity -- then
// cross-checked against the live site's own compiled CSS (including the
// deferred/async CSS Divi serves for below-the-fold sections, which a
// plain text fetch misses). All 98 distinct URLs were verified live
// (HTTP 200, real image content-type) immediately before this script was
// written; several were independently re-spot-checked a second time.
//
// Two flagged judgment calls, made explicitly rather than silently:
//   - "K. Raghavendra Rao" (Associates In Our Journey): the live site's own
//     image for him is a generic stock "Pngtree law firm logo" asset, not a
//     real photo of him or his firm. Per the explicit "no generated/
//     unrelated/placeholder images" rule, this is deliberately NOT migrated
//     -- he is left with no image, same as anyone with no real source.
//   - 4 of the 9 Awards items (1, 2, 3, 5) each have TWO real rotating
//     photos on the live page (a slider pair), but AWARDS_ITEMS' schema
//     only has one `image` field per entry. The first-listed photo (the
//     one that appears first in that award's slider, i.e. document order)
//     is used for each; the second photo of each pair is recorded in a
//     comment below for the record, not silently discarded from this
//     register, in case a future schema change wants to show both.
//
// Modes:
//   node leadership-awards-images-migration.mjs            -> dry-run (default)
//   node leadership-awards-images-migration.mjs --commit   -> performs the
//                                                              real write,
//                                                              only after
//                                                              validation
//                                                              passes,
//                                                              after
//                                                              writing a
//                                                              pre-change
//                                                              backup

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

// Per instruction, backups for this batch go outside the repo entirely.
const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';

const ABOUT_TYPE = 'pages/about';
const CREDIBILITY_TYPE = 'pages/credibility';

function img(url) {
  return { url };
}

// --- Leadership -------------------------------------------------------------
const BOARD_IMAGES = {
  'Dr. CA. Viswanathan P': img('https://www.vyoma.org/wp-content/uploads/2022/07/Vishwanathan.png'),
  'Dr. Venkatasubramanian P': img('https://www.vyoma.org/wp-content/uploads/2022/12/Dr.-Venkata-Subramanian-P.jpeg'),
  'Dr. B. Krishnamurthy': img('https://www.vyoma.org/wp-content/uploads/2022/07/B_Krishna_Murthy.png'),
  'Sudhir Patavardhan': img('https://www.vyoma.org/wp-content/uploads/2024/12/WhatsApp-Image-2024-12-11-at-15.48.03_4cdeb4c3.jpg'),
  'Dr. Balaji Srinivasan': img('https://www.vyoma.org/wp-content/uploads/2024/12/5.png'),
  'Dr. Sowmya Krishnapur': img('https://www.vyoma.org/wp-content/uploads/2022/07/Sowmya-Krishnapur.png'),
};

const ADVISORS_IMAGES = {
  'Dr. B. Mahadevan': img('https://www.vyoma.org/wp-content/uploads/2022/09/Prof-Mahadevan.jpg'),
  'Smt. Rama Sivaraman': img('https://www.vyoma.org/wp-content/uploads/2022/09/rama_sivaraman.jpg'),
  'Dr. Rajesh Bhaskaran Nair': img('https://www.vyoma.org/wp-content/uploads/2022/12/rajesh-nair.jpg'),
};

const COMMITTEE_IMAGES = {
  'CA. Viswanathan Ganesan': img('https://www.vyoma.org/wp-content/uploads/2024/02/VishwanathanGaneshan.png'),
  'B. K. Shivakumar': img('https://www.vyoma.org/wp-content/uploads/2024/02/BKS-1.png'),
  'Uma V': img('https://www.vyoma.org/wp-content/uploads/2024/12/uma-venkataraman.png'),
  'Venkat Indrakanti': img('https://www.vyoma.org/wp-content/uploads/2024/12/WhatsApp-Image-2024-12-11-at-14.49.26_316cdba1.jpg'),
  'Harshvardhan Khemani': img('https://www.vyoma.org/wp-content/uploads/2024/12/Screenshot-2024-12-11-151115.png'),
};

// --- Core Team (71 across 13 groups) ----------------------------------------
const CORE_TEAM_IMAGES = {
  // CXO's Office
  'Sripriya Krishnamoorthy': img('https://www.vyoma.org/wp-content/uploads/2025/04/Sripriya.png'),
  'Amogha Rao': img('https://www.vyoma.org/wp-content/uploads/2023/05/Amogha-Rao.jpg'),
  'Vasudha Srinath': img('https://www.vyoma.org/wp-content/uploads/2026/02/Vasudha_1.png'),
  // Systems & Processes
  'Srilatha Sriram': img('https://www.vyoma.org/wp-content/uploads/2022/07/Srilatha.png'),
  'M Manish': img('https://vyoma.org/wp-content/uploads/2026/08/Manish.png'),
  // Linguists & Publications
  'Dr. Sathyanarayana C T': img('https://www.vyoma.org/wp-content/uploads/2023/05/Dr.-Sathyanarayana_C_T.png'),
  'Dr. Leena Doshi': img('https://www.vyoma.org/wp-content/uploads/2024/07/Dr-Leena-Doshi-1.png'),
  'Shankararama Sharma': img('https://www.vyoma.org/wp-content/uploads/2022/07/Shanakararama-Sharma.png'),
  'Shreevalli Bhat': img('https://www.vyoma.org/wp-content/uploads/2022/10/Shreevalli-Bhat.png'),
  'Sriranjani V': img('https://www.vyoma.org/wp-content/uploads/2022/12/Sriranjani-Vijaykumar.jpg'),
  'Namana S M': img('https://www.vyoma.org/wp-content/uploads/2025/10/Namana.png'),
  'Ramya Mangala Lakshmi': img('https://www.vyoma.org/wp-content/uploads/2024/07/2024_Passport-pic.jpg'),
  'Kalyani Mahesh': img('https://www.vyoma.org/wp-content/uploads/2023/12/Kalyani.png'),
  'Smt. Padmavathi B R': img('https://www.vyoma.org/wp-content/uploads/2025/11/Linguist.png'),
  'Vamsi Sudha': img('https://www.vyoma.org/wp-content/uploads/2026/04/vamsi.png'),
  'Sindhoora C': img('https://www.vyoma.org/wp-content/uploads/2026/04/sindhoora-1.png'),
  'Sivakami B': img('https://www.vyoma.org/wp-content/uploads/2026/04/sivakami.png'),
  'Rohit Kumar': img('https://www.vyoma.org/wp-content/uploads/2026/04/rohit.png'),
  'Jishnu Suresh': img('https://www.vyoma.org/wp-content/uploads/2026/07/jishnu_Sir.png'),
  'Sreedath Padh T S': img('https://www.vyoma.org/wp-content/uploads/2026/07/Sreedathsir.png'),
  // Kids Persona Team
  'Sowmya Nagaraj': img('https://www.vyoma.org/wp-content/uploads/2022/10/Sowmya-Nagaraj.png'),
  'Archana Rao': img('https://www.vyoma.org/wp-content/uploads/2025/04/ArchanaRao.png'),
  'Rajeshwari Kamath': img('https://www.vyoma.org/wp-content/uploads/2026/02/Rajeshwari-Kamath-Photo.png'),
  // IKS (Indian Knowledge Systems)
  // Dr. Vinayak Rajat Bhat's URL filename ("Kesavan-1.png") is a coincidental
  // WP-media-library reuse, NOT a wrong-person mix-up -- independently
  // confirmed via the live site's own per-element CSS link, and via a
  // direct visual compare against the unrelated "Kesavan Sekar" photo
  // (different URL, different person, confirmed to show different men).
  'Dr. Vinayak Rajat Bhat': img('https://www.vyoma.org/wp-content/uploads/2026/01/Kesavan-1.png'),
  'Brunda Karanam': img('https://www.vyoma.org/wp-content/uploads/2023/05/Brunda-karanam.png'),
  'Battu Bhargava Sai': img('https://vyoma.org/wp-content/uploads/2026/08/bhargavabattu.png'),
  'Javali Battu': img('https://www.vyoma.org/wp-content/uploads/2025/12/Javali-Battu.png'),
  // Technology, AI & Language Lab
  'Sandhya L S': img('https://www.vyoma.org/wp-content/uploads/2025/12/Sandhya-L-S.png'),
  'Prasanna M': img('https://www.vyoma.org/wp-content/uploads/2022/07/Prasanna-Sir.png'),
  'Shubhashree Bhat': img('https://vyoma.org/wp-content/uploads/2026/08/shubhashree.png'),
  'Kavya C V': img('https://vyoma.org/wp-content/uploads/2026/08/kavyacv.png'),
  'Sapna Patil': img('https://www.vyoma.org/wp-content/uploads/2024/04/Sapnapatilvyoma.png'),
  'Deepalakshmi S': img('https://www.vyoma.org/wp-content/uploads/2025/04/Deepalakshmi.png'),
  'Deepika H S': img('https://www.vyoma.org/wp-content/uploads/2025/04/DeepikaHS.png'),
  'Shashank Rao': img('https://www.vyoma.org/wp-content/uploads/2025/06/Shashank_AI.png'),
  // E-learning
  'Deepthi Rao': img('https://www.vyoma.org/wp-content/uploads/2025/04/DeepthiRao.png'),
  'Nagashree Arun': img('https://www.vyoma.org/wp-content/uploads/2022/10/Nagashree.png'),
  'Shrinidhi C': img('https://www.vyoma.org/wp-content/uploads/2025/04/Shrinidhi.png'),
  'Archana K V': img('https://www.vyoma.org/wp-content/uploads/2026/04/Archana.png'),
  'Shwetha B K': img('https://www.vyoma.org/wp-content/uploads/2022/07/Shwetha.png'),
  Bharathi: img('https://www.vyoma.org/wp-content/uploads/2023/08/ADI005511-1-scaled.jpg'),
  'Iswarya S': img('https://www.vyoma.org/wp-content/uploads/2025/04/131-1.jpg'),
  'Shubham Ramashankar Kanaujiya': img('https://vyoma.org/wp-content/uploads/2026/08/shubham.png'),
  // Promotion, Events & Digital Marketing
  'Kesavan Sekar': img('https://www.vyoma.org/wp-content/uploads/2025/06/Kesavansir.png'),
  'Vandana Bellur': img('https://www.vyoma.org/wp-content/uploads/2026/04/Vandana.png'),
  'Pratiksha Bharadwaj': img('https://vyoma.org/wp-content/uploads/2024/01/Pratiksha.png'),
  Sonika: img('https://www.vyoma.org/wp-content/uploads/2025/06/sonika.png'),
  'Pallavi V': img('https://www.vyoma.org/wp-content/uploads/2026/04/Pallavi.png'),
  // Sales
  Phaneendra: img('https://www.vyoma.org/wp-content/uploads/2022/10/Phaneendra.png'),
  'Kiran M': img('https://www.vyoma.org/wp-content/uploads/2026/04/kiran.png'),
  'Pallavi Shenoy': img('https://www.vyoma.org/wp-content/uploads/2026/04/pallavi-s.png'),
  // RTG & Customer Seva
  'Shubha Prasad': img('https://www.vyoma.org/wp-content/uploads/2022/09/Shubha.png'),
  'Smt. Nalini S Prasad': img('https://www.vyoma.org/wp-content/uploads/2026/02/Nalini.png'),
  // Finance, Fundraising & Legal
  'Shivaramakrishnan M N': img('https://www.vyoma.org/wp-content/uploads/2025/10/shivaramakrishnan.png'),
  'D Govindarajan': img('https://www.vyoma.org/wp-content/uploads/2025/10/govindarajan.png'),
  'CA. Raksha Sankaranarayanan': img('https://www.vyoma.org/wp-content/uploads/2024/12/Raksha.png'),
  Chaitra: img('https://www.vyoma.org/wp-content/uploads/2022/07/Chaitra.png'),
  'Sudha Krishnan': img('https://www.vyoma.org/wp-content/uploads/2025/06/Sudha_Krishnan.png'),
  'Deepika M': img('https://www.vyoma.org/wp-content/uploads/2026/05/DeepikaM.png'),
  'Monisha R': img('https://www.vyoma.org/wp-content/uploads/2026/04/Monisha.png'),
  // HR & Admin
  'Manjula N': img('https://www.vyoma.org/wp-content/uploads/2025/04/ManjulaUpdated.png'),
  'Jayashankar S': img('https://www.vyoma.org/wp-content/uploads/2022/09/Jayshankar-Sir.png'),
  'Karthik Sarangan': img('https://www.vyoma.org/wp-content/uploads/2022/09/Karthik.png'),
  Lakshmi: img('https://www.vyoma.org/wp-content/uploads/2025/06/Lakshmi.png'),
  // Associates In Our Journey
  // "K. Raghavendra Rao" is deliberately EXCLUDED (see header) -- the live
  // site's own image for him is a generic stock logo, not a real photo.
  'CA. Uday Kumar (Hon.)': img('https://www.vyoma.org/wp-content/uploads/2022/07/Udayji.png'),
  'Edmingle (Ascorb Technologies Pvt. Ltd)': img('https://www.vyoma.org/wp-content/uploads/2024/08/gauravjoshi.png'),
  'Sri Ranga (iQode Technologies)': img('https://www.vyoma.org/wp-content/uploads/2022/12/Sri_F1000.jpg'),
  'Pranava (Pranava Studios)': img('https://www.vyoma.org/wp-content/uploads/2024/08/pranavstudios.png'),
  'Vishnu Daya & Co (Chartered Accountants)': img('https://www.vyoma.org/wp-content/uploads/2022/12/CA-Logo.png'),
  'Artha Viveka': img('https://vyoma.org/wp-content/uploads/2026/08/viveka_artha_logo.png'),
};

const EXPECTED_BOARD = 6;
const EXPECTED_ADVISORS = 3;
const EXPECTED_COMMITTEE = 5;
const EXPECTED_CORE_TEAM_IMAGES = 70; // 71 people minus the 1 deliberately-excluded (K. Raghavendra Rao)

// --- Awards (9 items; 4 of them have a 2nd rotating photo, recorded here
//     for the record even though the schema only stores one per item) ------
const AWARDS_IMAGES = {
  'Excellence Award (2024-25)': img('https://vyoma.org/wp-content/uploads/2025/02/VenkatsirRotaryaward-scaled.jpg'),
  // 2nd photo (not migrated, schema holds one image per item):
  // https://vyoma.org/wp-content/uploads/2025/02/VenkatRotaryAward2-scaled.jpg
  'Vocational Excellence Award (2024-25)': img('https://vyoma.org/wp-content/uploads/2025/02/skr_rotary_club_award-1.jpg'),
  // 2nd photo: https://vyoma.org/wp-content/uploads/2025/02/skr_AwardByRotary.jpg
  'Samskrta Sevavrati Award (2024)': img('https://vyoma.org/wp-content/uploads/2024/08/Vyoma-Sevavrati-award.jpg'),
  // 2nd photo: https://vyoma.org/wp-content/uploads/2024/08/sanskritaward-scaled.jpg
  'Recognition Certificate, Samskriti Foundation (2023)': img('https://vyoma.org/wp-content/uploads/2024/09/Sameeksha-recognition-scaled.jpg'),
  "'Bhageeratha Prayatna' Award (2022)": img('https://vyoma.org/wp-content/uploads/2024/08/Bhageeratha_award.jpeg'),
  // 2nd photo: https://vyoma.org/wp-content/uploads/2024/08/maithri_Sanskrit_bhageeratha.jpeg
  "'Shikshakasammaan' Award (2022)": img('https://vyoma.org/wp-content/uploads/2024/09/teachersaward-sringeri-scaled.jpg'),
  'Best E-learning Company of the Year (2019)': img('https://vyoma.org/wp-content/uploads/2024/08/Elearning.jpeg'),
  'Sevak of the Year Award (2017)': img('https://vyoma.org/wp-content/uploads/2024/02/Award2.jpg'),
  'Certificate, Karnataka Sanskrit University (2016)': img('https://vyoma.org/wp-content/uploads/2024/09/KSU-certificate-scaled.jpg'),
};
const EXPECTED_AWARDS = 9;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function applyImages(list, imageMap) {
  return list.map((person) => (imageMap[person.name] ? { ...person, image: imageMap[person.name] } : person));
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Leadership + Core Team + Awards images migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: data.BOARD/ADVISORS/COMMITTEE/CORE_TEAMS[*].image on pages/about; data.AWARDS_ITEMS[*].image on pages/credibility.');
  console.log('Does NOT touch names, roles, bios, group headings, ordering, or any other data key.');
  console.log('='.repeat(72));

  // --- Manifest self-validation --------------------------------------------
  const manifestErrors = [];
  if (Object.keys(BOARD_IMAGES).length !== EXPECTED_BOARD) manifestErrors.push(`Expected ${EXPECTED_BOARD} BOARD images, found ${Object.keys(BOARD_IMAGES).length}.`);
  if (Object.keys(ADVISORS_IMAGES).length !== EXPECTED_ADVISORS) manifestErrors.push(`Expected ${EXPECTED_ADVISORS} ADVISORS images, found ${Object.keys(ADVISORS_IMAGES).length}.`);
  if (Object.keys(COMMITTEE_IMAGES).length !== EXPECTED_COMMITTEE) manifestErrors.push(`Expected ${EXPECTED_COMMITTEE} COMMITTEE images, found ${Object.keys(COMMITTEE_IMAGES).length}.`);
  if (Object.keys(CORE_TEAM_IMAGES).length !== EXPECTED_CORE_TEAM_IMAGES) manifestErrors.push(`Expected ${EXPECTED_CORE_TEAM_IMAGES} CORE_TEAM images, found ${Object.keys(CORE_TEAM_IMAGES).length}.`);
  if (Object.keys(AWARDS_IMAGES).length !== EXPECTED_AWARDS) manifestErrors.push(`Expected ${EXPECTED_AWARDS} AWARDS images, found ${Object.keys(AWARDS_IMAGES).length}.`);
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  const totalLeadership = EXPECTED_BOARD + EXPECTED_ADVISORS + EXPECTED_COMMITTEE + EXPECTED_CORE_TEAM_IMAGES;
  console.log(`[OK] Manifest self-check passed: ${totalLeadership} leadership/core-team images (${EXPECTED_BOARD} Board + ${EXPECTED_ADVISORS} Advisors + ${EXPECTED_COMMITTEE} Committee + ${EXPECTED_CORE_TEAM_IMAGES} Core Team), ${EXPECTED_AWARDS} award images.`);

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const errors = [];
    const aboutDoc = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();
    const credDoc = await ContentModel.findOne({ type: CREDIBILITY_TYPE }).lean();
    if (!aboutDoc) errors.push(`No Content document found for type "${ABOUT_TYPE}".`);
    if (!credDoc) errors.push(`No Content document found for type "${CREDIBILITY_TYPE}".`);
    if (aboutDoc?.draftData != null) errors.push(`Content "${ABOUT_TYPE}" has a non-null draftData -- aborting rather than risk it later overwriting this migration.`);
    if (credDoc?.draftData != null) errors.push(`Content "${CREDIBILITY_TYPE}" has a non-null draftData -- aborting rather than risk it later overwriting this migration.`);
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, no pending draftData.');

    // --- Baseline: confirm every expected name/title is present -----------
    const boardNames = aboutDoc.data.BOARD.map((p) => p.name);
    const advisorNames = aboutDoc.data.ADVISORS.map((p) => p.name);
    const committeeNames = aboutDoc.data.COMMITTEE.map((p) => p.name);
    const coreTeamNames = aboutDoc.data.CORE_TEAMS.flatMap((g) => g.people.map((p) => p.name));
    const awardTitles = credDoc.data.AWARDS_ITEMS.map((a) => a.title);

    for (const [label, expectedNames, actualNames] of [
      ['BOARD', Object.keys(BOARD_IMAGES), boardNames],
      ['ADVISORS', Object.keys(ADVISORS_IMAGES), advisorNames],
      ['COMMITTEE', Object.keys(COMMITTEE_IMAGES), committeeNames],
      ['CORE_TEAMS people', Object.keys(CORE_TEAM_IMAGES), coreTeamNames],
      ['AWARDS_ITEMS', Object.keys(AWARDS_IMAGES), awardTitles],
    ]) {
      const missing = expectedNames.filter((n) => !actualNames.includes(n));
      if (missing.length) errors.push(`${label}: expected names/titles not found in current data: ${missing.join(', ')}`);
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (name/title match):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    // --- Already-migrated / partial-state detection -------------------------
    function imageState(list, imageMap) {
      const targeted = list.filter((p) => imageMap[p.name]);
      const allMatch = targeted.every((p) => deepEqual(p.image, imageMap[p.name]));
      const noneSet = targeted.every((p) => p.image == null);
      return { allMatch, noneSet };
    }
    const boardState = imageState(aboutDoc.data.BOARD, BOARD_IMAGES);
    const advisorState = imageState(aboutDoc.data.ADVISORS, ADVISORS_IMAGES);
    const committeeState = imageState(aboutDoc.data.COMMITTEE, COMMITTEE_IMAGES);
    const coreTeamPeopleFlat = aboutDoc.data.CORE_TEAMS.flatMap((g) => g.people);
    const coreTeamState = imageState(coreTeamPeopleFlat, CORE_TEAM_IMAGES);
    const awardsTargeted = credDoc.data.AWARDS_ITEMS.filter((a) => AWARDS_IMAGES[a.title]);
    const awardsAllMatch = awardsTargeted.every((a) => deepEqual(a.image, AWARDS_IMAGES[a.title]));
    const awardsNoneSet = awardsTargeted.every((a) => a.image == null);

    for (const [label, state] of [
      ['BOARD', boardState],
      ['ADVISORS', advisorState],
      ['COMMITTEE', committeeState],
      ['CORE_TEAMS', coreTeamState],
      ['AWARDS_ITEMS', { allMatch: awardsAllMatch, noneSet: awardsNoneSet }],
    ]) {
      if (!state.allMatch && !state.noneSet) {
        errors.push(`${label} has some but not all target images already set (or set to an unexpected value) -- unexpected partial state, aborting rather than guessing.`);
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (image baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    const allAlreadyMigrated = boardState.allMatch && advisorState.allMatch && committeeState.allMatch && coreTeamState.allMatch && awardsAllMatch;
    if (allAlreadyMigrated) {
      console.log('\n[OK] All target images already match the approved data -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed.');

    // --- Compute next state --------------------------------------------------
    const nextBoard = applyImages(aboutDoc.data.BOARD, BOARD_IMAGES);
    const nextAdvisors = applyImages(aboutDoc.data.ADVISORS, ADVISORS_IMAGES);
    const nextCommittee = applyImages(aboutDoc.data.COMMITTEE, COMMITTEE_IMAGES);
    const nextCoreTeams = aboutDoc.data.CORE_TEAMS.map((g) => ({ ...g, people: applyImages(g.people, CORE_TEAM_IMAGES) }));
    const nextAwards = credDoc.data.AWARDS_ITEMS.map((a) => (AWARDS_IMAGES[a.title] ? { ...a, image: AWARDS_IMAGES[a.title] } : a));

    // --- Prove every other data key is unaffected, before writing -----------
    {
      const { BOARD: _b, ADVISORS: _a, COMMITTEE: _c, CORE_TEAMS: _t, ...restBefore } = aboutDoc.data;
      const { BOARD: _b2, ADVISORS: _a2, COMMITTEE: _c2, CORE_TEAMS: _t2, ...restAfter } = {
        ...aboutDoc.data,
        BOARD: nextBoard,
        ADVISORS: nextAdvisors,
        COMMITTEE: nextCommittee,
        CORE_TEAMS: nextCoreTeams,
      };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than BOARD/ADVISORS/COMMITTEE/CORE_TEAMS would change on "${ABOUT_TYPE}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    {
      const { AWARDS_ITEMS: _w, ...restBefore } = credDoc.data;
      const { AWARDS_ITEMS: _w2, ...restAfter } = { ...credDoc.data, AWARDS_ITEMS: nextAwards };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than AWARDS_ITEMS would change on "${CREDIBILITY_TYPE}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, on both documents, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set image on: ${Object.keys(BOARD_IMAGES).length} Board, ${Object.keys(ADVISORS_IMAGES).length} Advisors, ${Object.keys(COMMITTEE_IMAGES).length} Committee, ${Object.keys(CORE_TEAM_IMAGES).length} Core Team people (pages/about).`);
    console.log(`Set image on: ${Object.keys(AWARDS_IMAGES).length} Awards items (pages/credibility).`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` -------
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `leadership-awards-images-migration-backup-${timestamp}.json`);
    const backupPayload = {
      [ABOUT_TYPE]: { data: aboutDoc.data, draftData: aboutDoc.draftData, status: aboutDoc.status },
      [CREDIBILITY_TYPE]: { data: credDoc.data, draftData: credDoc.draftData, status: credDoc.status },
    };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    // --- Write (targeted dot-notation $set only -- never the whole `data`) ---
    if (!boardState.allMatch || !advisorState.allMatch || !committeeState.allMatch || !coreTeamState.allMatch) {
      await ContentModel.updateOne(
        { type: ABOUT_TYPE },
        { $set: { 'data.BOARD': nextBoard, 'data.ADVISORS': nextAdvisors, 'data.COMMITTEE': nextCommittee, 'data.CORE_TEAMS': nextCoreTeams } }
      );
    }
    if (!awardsAllMatch) {
      await ContentModel.updateOne({ type: CREDIBILITY_TYPE }, { $set: { 'data.AWARDS_ITEMS': nextAwards } });
    }
    console.log('[COMMIT] Set image fields on pages/about (Board/Advisors/Committee/Core Team) and pages/credibility (Awards).');

    // --- Post-write verification ---------------------------------------------
    let ok = true;
    const afterAbout = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();
    const afterCred = await ContentModel.findOne({ type: CREDIBILITY_TYPE }).lean();

    const boardMatch = deepEqual(afterAbout.data.BOARD, nextBoard);
    const advisorsMatch = deepEqual(afterAbout.data.ADVISORS, nextAdvisors);
    const committeeMatch = deepEqual(afterAbout.data.COMMITTEE, nextCommittee);
    const coreTeamsMatch = deepEqual(afterAbout.data.CORE_TEAMS, nextCoreTeams);
    const awardsMatch = deepEqual(afterCred.data.AWARDS_ITEMS, nextAwards);
    console.log(`[verify] BOARD matches: ${boardMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] ADVISORS matches: ${advisorsMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] COMMITTEE matches: ${committeeMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] CORE_TEAMS matches: ${coreTeamsMatch ? 'YES' : 'NO'}`);
    console.log(`[verify] AWARDS_ITEMS matches: ${awardsMatch ? 'YES' : 'NO'}`);
    if (!boardMatch || !advisorsMatch || !committeeMatch || !coreTeamsMatch || !awardsMatch) ok = false;

    const { BOARD: _b3, ADVISORS: _a3, COMMITTEE: _c3, CORE_TEAMS: _t3, ...restAfterAbout } = afterAbout.data;
    const { BOARD: _b4, ADVISORS: _a4, COMMITTEE: _c4, CORE_TEAMS: _t4, ...restBeforeAbout } = aboutDoc.data;
    const aboutRestSame = deepEqual(restAfterAbout, restBeforeAbout);
    console.log(`[verify] pages/about every other data key unchanged: ${aboutRestSame ? 'YES' : 'NO'}`);
    if (!aboutRestSame) ok = false;

    const { AWARDS_ITEMS: _w3, ...restAfterCred } = afterCred.data;
    const { AWARDS_ITEMS: _w4, ...restBeforeCred } = credDoc.data;
    const credRestSame = deepEqual(restAfterCred, restBeforeCred);
    console.log(`[verify] pages/credibility every other data key unchanged: ${credRestSame ? 'YES' : 'NO'}`);
    if (!credRestSame) ok = false;

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
