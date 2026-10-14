// WordPress -> MERN migration: real "General"-category (and a few
// Talk/Meeting/Vyoma Products/Parayanam) events, filling the gap reported
// during manual testing ("the original WordPress website displayed
// several General events that were missing from Vyoma.org 2.0").
//
// Investigation (2026-10-14), per explicit instruction not to rely only on
// WXR taxonomy exports:
//   - The live /events/ page (https://vyoma.org/events/, WXR post_id 87)
//     and its WXR export both contain almost no real content -- just the
//     "Events @ Vyoma" hero title. Confirmed via both a plain fetch and
//     the WordPress REST API (`/wp-json/wp/v2/pages/87`, content length
//     1,516 chars, no event listing).
//   - The real source is a *different*, sitemap-listed page not linked
//     from the main nav: https://vyoma.org/gallery-2/ (WXR post_id 8928,
//     wp:status "publish", title "Gallery") -- a 70-item photo gallery of
//     real, captioned visits/talks/launches/celebrations/conferences,
//     exactly matching the kind of content described as missing. All 70
//     image URLs independently verified live (HTTP 200) before migrating.
//
// The 4 user-given examples, checked individually:
//   - "BR Hills RTG bag distribution" -- VERIFIED: matches "Enrichment
//     Session at BR hills (RTG- Launch)" on that page (included below).
//   - "Prof. Sanjeev Kumar's visit to Vyoma" -- NOT FOUND. No "Sanjeev"
//     appears anywhere in the full WXR export or via the live site's own
//     WordPress search (wp-json/wp/v2/search?search=Sanjeev -> zero
//     results). The closest same-shape entry is "Prof Ganti Murthy Visit"
//     (a different, real, named professor) -- included below under its
//     own correct name, NOT relabeled as Sanjeev Kumar.
//   - "Ramakatha Event" -- NOT FOUND under that name. The live search
//     only fuzzy-matches an unrelated blog post ("...Ramanavami...").
//     The closest same-theme entry is the real "Ramayana Parayana
//     MAR-2026" gallery item (included below, tagged Parayanam) and the
//     2 existing Parayanam events already in the database -- none of
//     these is literally "Ramakatha," so this example is reported as
//     unverified rather than silently substituted.
//   - "Language Lab launch at KSU" -- NOT FOUND under that name. The
//     closest same-theme entry is "Keynote speech at Sindhi College on
//     'Sanskrit Language Lab for University Students.'" -- a real talk,
//     but at a different institution (Sindhi College, not KSU) and a
//     different kind of event (a keynote speech, not a launch).
//     Included below under its own correct description; the "KSU" claim
//     itself is reported as unverified.
//
// 14 of the 70 gallery items were deliberately excluded, each for a
// stated reason (see EXCLUDED below) -- 4 are exact duplicates of content
// already migrated into Credibility > Awards & Recognition (Batch 3) and
// would be redundant to show twice; the rest are generic internal photos
// with no event-like specificity (team photos, office photos, a repeated
// duplicate image of the same already-included celebration).
//
// Scope: data.UPCOMING_EVENTS / data.PAST_EVENTS stay as the existing 2
// Parayanam events (data.PAST_EVENTS already holds exactly those 2 --
// confirmed, unchanged) PLUS this migration's 56 new verified events,
// appended (not replacing), on {type: 'media'} and {type: 'pages/media'}
// (kept as exact mirrors -- confirmed before writing, same as every prior
// media-content batch in this engagement).
//
// Modes:
//   node events-general-migration.mjs            -> dry-run (default)
//   node events-general-migration.mjs --commit    -> real write, after
//                                                     validation, after a
//                                                     pre-change backup

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPES = ['media', 'pages/media'];
const SOURCE_PAGE = 'https://vyoma.org/gallery-2/';

function ev(type, date, title, imageUrl) {
  return { type, date, title, imageUrl, active: true };
}

// Explicitly excluded gallery-2 items, with reasons -- kept here for the
// record, not migrated:
//   - "Samskrta Sevavrati award for Vyoma Labs AUG – 2024" (duplicate of
//     Awards & Recognition: "Samskrta Sevavrati Award (2024)")
//   - "Vyoma recognized as – One of the Top 10 e-learning service
//     providers AUG – 2019" (duplicate of "Best E-learning Company of the
//     Year (2019)")
//   - "Honored for 'bhageeratha prayatna...' OCT – 2022" (duplicate of
//     "'Bhageeratha Prayatna' Award (2022)")
//   - "Awarded by Sevak on World Family Day... July – 2017" (duplicate of
//     "Sevak of the Year Award (2017)")
//   - "Customer visits the book stall" (no date, no identifiable specifics)
//   - "Latha Kannan visits office" (no date, no further context)
//   - "Krishna devotees visit." (no date, no specific occasion)
//   - "Co founders From Vrtam studios" (no verb/date/context beyond a name)
//   - "Volunteering at Aapatsahaaya Foundation" (undated duplicate of the
//     two more specific, already-included Tyamagondlu/Hoskote entries)
//   - "Navratri Celebration SEPT – 2025" (2nd image) (exact duplicate
//     caption of an already-included item, different photo of the same
//     celebration)
//   - "New Office at Nagarabhavi", "Vyoma team members", "Humble pranams
//     to God from office premises.", "Temple visit by Vyoma team" (generic
//     internal/office photos, not public-facing events)

const NEW_EVENTS = [
  ev('General', 'Feb 2026', 'Swami Parmarthananda, Astika Bhakta Samaj', 'https://vyoma.org/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-05-at-3.14.10-PM-1.jpeg'),
  ev('Vyoma Products', '', 'Website release by Sringeri Jagadguru @ Sringeri', 'https://vyoma.org/wp-content/uploads/2024/02/image-1-2.png'),
  ev('Vyoma Products', '', 'Samarpanam of Vyoma publications to Jagadguru', 'https://vyoma.org/wp-content/uploads/2024/02/Samarpanam-of-Vyoma-publications-to-Jagadguru-3.jpeg'),
  ev('General', 'Sep 2023', 'Sri Ramanacharanatirtha Nochur Venkataraman at Narayaneeyam Valedictory function', 'https://vyoma.org/wp-content/uploads/2024/02/Screenshot-2024-02-06-125159.jpg'),
  ev('Vyoma Products', '', 'Release of Vocabulary 1 & 2 @ Udupi by Pejawar Mutt Swamiji', 'https://vyoma.org/wp-content/uploads/2024/02/image-4.png'),
  ev('General', '', 'Sri Ranganji exploring the Bhagavad Gita book of Vyoma', 'https://vyoma.org/wp-content/uploads/2023/07/bok-fair5.jpeg'),
  ev('Meeting', '', 'Meeting with Sri Sri Guruji @ Bangalore', 'https://vyoma.org/wp-content/uploads/2024/02/image-1.png'),
  ev('Meeting', '', 'Fruitful meeting with Swami Baba Ramdev @ Haridwar', 'https://vyoma.org/wp-content/uploads/2024/09/Fruitful-meeting-with-Swami-Baba-Ramdev-@-Haridwar.png'),
  ev('Vyoma Products', '', 'Bhagavad Gita product release by Swami Tejomayananda @ Pune', 'https://vyoma.org/wp-content/uploads/2024/02/image-2.png'),
  ev('General', 'Jul 2019', 'VSB with Swami Brahmananda of Chinmaya Mission', 'https://vyoma.org/wp-content/uploads/2024/03/104eventimage.jpg'),
  ev('General', '', 'Prof. Mani Dravid Sastrigal visits Vyoma stall', 'https://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_134919-scaled.jpg'),
  ev('General', '', 'Sri. Srirama Ghanapati, Veda Bhavanam visits Vyoma stall', 'https://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_105833-scaled.jpg'),
  ev('General', 'Feb 2023', 'World conference on Contribution of Indian Knowledge & Sanskrit as Humanity', 'https://vyoma.org/wp-content/uploads/2023/07/puraskara1.jpeg'),
  ev('General', 'Jul 2022', 'Surasaraswathi Sabha 50th Anniversary', 'https://vyoma.org/wp-content/uploads/2022/12/Surasaraswathi-Sabha-50th-Anniversary-2.jpeg'),
  ev('Talk', 'Sep 2025', 'A talk at "National Seminar on Indian Knowledge Systems – Leadership Lessons from Ancient Indian Wisdom" in association with IQAC, NSB Academy', 'https://vyoma.org/wp-content/uploads/2026/04/NSB-Seminar-1.jpg'),
  ev('Talk', 'Oct 2025', 'Lecture on "IKS concept – Management Priniciples from the Ramayana" at Surana College', 'https://vyoma.org/wp-content/uploads/2026/04/Sir.-Vishwam-at-Surana-4.jpeg'),
  ev('Talk', 'Sep 2024', 'Vedanta Shravana – Essential Vedanta', 'https://vyoma.org/wp-content/uploads/2024/09/Vedanta-Shravana-Essential-Vedanta-22-Sep-2024.png'),
  ev('General', 'Jul 2024', 'Conference about Gurukula shiksha', 'https://vyoma.org/wp-content/uploads/2024/09/Conference-about-Gurukula-shiksha-on-6th-July-2024.png'),
  ev('Talk', 'Aug 2024', 'Yogas in Bhagavad Gita at Yogavijnana', 'https://vyoma.org/wp-content/uploads/2024/09/Yogas-in-Bhagavad-Gita-at-Yogavijnana-on-Jul-20th-Aug11th-2024.png'),
  ev('Parayanam', 'Feb 2024', 'In-person Valmiki Ramayana Navaha Upanyasam at Agastya Gurukulam', 'https://vyoma.org/wp-content/uploads/2024/03/image-10.png'),
  ev('Talk', 'Nov 2025', 'Lecture – "Indian Knowledge System – an Overview" at MES Institute of Management, Bangalore', 'https://vyoma.org/wp-content/uploads/2026/04/MES.png'),
  ev('Talk', 'Oct 2025', 'Keynote speech at Sindhi College on "Sanskrit Language Lab for University Students"', 'https://vyoma.org/wp-content/uploads/2026/04/Sindhi-College-2.png'),
  ev('Talk', 'Jan 2024', 'Online lecture on Unveiling Timeless Insights from Puranas through Indica', 'https://vyoma.org/wp-content/uploads/2024/03/image-9.png'),
  ev('Talk', 'Sep 2023', 'Talk on Timeless Gita Endless Bliss at JP Nagar, Bangalore', 'https://vyoma.org/wp-content/uploads/2024/03/WhatsApp-Image-2023-10-31-at-3.27.53-PM-1.jpeg'),
  ev('Talk', '2023', 'Presentation by Viswanathan P during World Sanskrit Conference 2023', 'https://vyoma.org/wp-content/uploads/2023/07/lectures2.jpeg'),
  ev('Talk', '2023', 'Smt. Maheswari presenting in World Sanskrit Conference 2023', 'https://vyoma.org/wp-content/uploads/2023/07/lectures1.jpeg'),
  ev('Talk', '', 'Power of Sanskrit Lecture at Sheshadripuram College', 'https://vyoma.org/wp-content/uploads/2024/03/Power-of-Sanskrit-Lecture-at-Sheshadripuram-College-2.jpeg'),
  ev('General', 'Dec 2025', '2nd Ayurveda World Summit', 'https://vyoma.org/wp-content/uploads/2026/04/2ND-WORLD-AYURVEDA-SUMMIT.jpeg'),
  ev('General', 'Dec 2025', 'INCOFYRA conference', 'https://vyoma.org/wp-content/uploads/2026/04/INCOFYRA.png'),
  ev('General', 'Nov 2025', "Vyoma's Participation at Akhila Bharatiyam Adhiveshanam", 'https://vyoma.org/wp-content/uploads/2026/04/AKHILA-BHARATIYA-ADHIVESHANAM.jpeg'),
  ev('General', 'Nov 2025', 'Adani Global Indology Conclave', 'https://vyoma.org/wp-content/uploads/2026/04/ADANI-GLOBAL-INDOLOGY-CONCLAVE.jpeg'),
  ev('General', 'Jun 2025', "Vyoma's offerings at 19th World Sanskrit Conference, Kathmandu, Nepal", 'https://vyoma.org/wp-content/uploads/2026/04/WORLD-SANSKRIT-CONFERENCE-2025-NEPAL.png'),
  ev('General', 'Feb 2024', 'Vyoma Labs participated in the New Delhi World Book Fair', 'https://vyoma.org/wp-content/uploads/2024/03/image-12.png'),
  ev('General', 'Nov 2023', 'Vyoma Stall at Namasmaran', 'https://vyoma.org/wp-content/uploads/2024/03/image-13.png'),
  ev('General', 'Nov 2023', 'Vyoma book stall in National seminar on Bharatiya 64 Arts organised by Samskriti Foundation', 'https://vyoma.org/wp-content/uploads/2023/07/book-fairs.jpeg'),
  ev('General', 'Dec 2018', 'Bangalore Book Fair', 'https://vyoma.org/wp-content/uploads/2022/12/Bangalore-Book-Fair-1.jpg'),
  ev('General', 'Jan 2018', 'Vyoma Labs participated in Hindu Spiritual Service Fair', 'https://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-4.jpg'),
  ev('General', '', 'Rama Sivaraman, Chairperson of Vyoma visiting our book stall', 'https://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-1.jpg'),
  ev('General', '', 'Chamrajpete Pratibha Puraskara', 'https://vyoma.org/wp-content/uploads/2022/12/Chamrajpete-Pratibha-Puraskara-4.jpeg'),
  ev('General', '30 Mar 2026', 'Prof Ganti Murthy Visit', 'https://vyoma.org/wp-content/uploads/2026/04/Prof-Ganti-Murthy.png'),
  ev('General', 'Feb 2026', 'Honorable Vice Chancellor Srinivas Varkhedi from CSU', 'https://vyoma.org/wp-content/uploads/2026/04/HONORABLE-VICE-CHANCELLOR-SRINIVASA-VARKHEDI-of-CSU.jpeg'),
  ev('General', 'Nov 2025', 'Padmashri Award 2020 recipient Sri Ramakrishnan S from Amar Seva Sangam', 'https://vyoma.org/wp-content/uploads/2026/04/Sri.-Ramakrishnan-from-Amar-Seva-Sangam.png'),
  ev('General', 'Nov 2025', 'Sree Ram Iyer – COO and Head of Group Capability Centres, visited Vyoma', 'https://vyoma.org/wp-content/uploads/2026/04/Sree-Ram-Iyer-scaled.jpeg'),
  ev('General', '', 'Students of Dr. Sowmya Krishnapur visit office', 'https://vyoma.org/wp-content/uploads/2023/07/visit1.jpeg'),
  ev('General', 'Dec 2023', 'Visit of Chairman – BKM Sir', 'https://vyoma.org/wp-content/uploads/2022/12/Visit-of-Chairman-BKM-Sir-1.jpg'),
  ev('General', 'Feb 2024', 'Shri. Yashodeep Deodhar, CEO of 21notes.com visited the Vyoma Office', 'https://vyoma.org/wp-content/uploads/2024/03/image-14.png'),
  ev('General', 'Jul 2023', 'MM Dorbala Prabhakara Sharma visit to office', 'https://vyoma.org/wp-content/uploads/2023/07/visit3.jpeg'),
  ev('General', 'Dec 2022', "Sri Tirunarayanan's visit", 'https://vyoma.org/wp-content/uploads/2022/12/Sri-Tirunarayanan_s-visit-1.jpeg'),
  ev('General', 'Jan 2026', 'BBMP Bhartiya Vidya Bhavan School RTG inauguration', 'https://vyoma.org/wp-content/uploads/2026/04/BBMP-Bhartiya-Vidya-Bhavan-school-RTG-school-students-enrichment-session-Inauguration.jpeg'),
  ev('General', '', 'Enrichment Session at BR hills (RTG-Launch)', 'https://vyoma.org/wp-content/uploads/2026/04/RTG-Enrichment-Session-at-BR-HIlls-scaled.jpeg'),
  ev('General', '', 'Volunteering at Aapatsahaaya Foundation by teaching classes in Tyamagondlu', 'https://vyoma.org/wp-content/uploads/2024/02/image1-5.png'),
  ev('General', '', 'Volunteering at Aapatsahaaya Foundation by teaching classes in Hoskote', 'https://vyoma.org/wp-content/uploads/2024/02/image-5.png'),
  ev('General', 'Sep 2020', 'Collaboration with Shankara Colony', 'https://vyoma.org/wp-content/uploads/2023/07/12.jpg'),
  ev('Parayanam', 'Mar 2026', 'Ramayana Parayana', 'https://vyoma.org/wp-content/uploads/2026/04/Ramayana-Parayana-2026.jpg'),
  ev('General', 'Mar 2026', 'Holi celebration', 'https://vyoma.org/wp-content/uploads/2026/04/Holi-2026.jpg'),
  ev('General', 'Sep 2025', 'Navratri Celebration', 'https://vyoma.org/wp-content/uploads/2026/04/Navratri-Celebration-1.png'),
];

const EXPECTED_NEW_EVENTS = 56;
const EXPECTED_EXISTING_PAST_EVENTS = 2;

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Events (General) migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: appends ${EXPECTED_NEW_EVENTS} verified events to data.PAST_EVENTS on {type:'media'} and {type:'pages/media'}. Source: ${SOURCE_PAGE}`);
  console.log('Does NOT touch the 2 existing Parayanam events, EVENT_CATEGORIES, or any other data key.');
  console.log('='.repeat(72));

  const manifestErrors = [];
  if (NEW_EVENTS.length !== EXPECTED_NEW_EVENTS) manifestErrors.push(`Expected ${EXPECTED_NEW_EVENTS} new events, found ${NEW_EVENTS.length}.`);
  for (const [i, e] of NEW_EVENTS.entries()) {
    if (!e.title || !e.imageUrl || !e.type) manifestErrors.push(`Event ${i}: missing required field(s): ${JSON.stringify(e)}`);
  }
  const categoryCounts = NEW_EVENTS.reduce((acc, e) => ({ ...acc, [e.type]: (acc[e.type] || 0) + 1 }), {});
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: ${NEW_EVENTS.length} new events. Category breakdown:`, JSON.stringify(categoryCounts));

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
      console.error('\nVALIDATION FAILED: "media" and "pages/media" data are not currently identical. ABORT rather than guess which is authoritative.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, no pending draftData, and are confirmed identical.');

    const currentPast = docs['media'].data.PAST_EVENTS;
    if (currentPast.length !== EXPECTED_EXISTING_PAST_EVENTS) {
      console.error(`\nVALIDATION FAILED: expected exactly ${EXPECTED_EXISTING_PAST_EVENTS} existing PAST_EVENTS (the 2 verified Parayanam events), found ${currentPast.length}. ABORT rather than guess how to merge.`);
      process.exitCode = 1;
      return;
    }
    const hasNonParayanam = currentPast.some((e) => e.type !== 'Parayanam');
    if (hasNonParayanam) {
      console.error('\nVALIDATION FAILED: an existing PAST_EVENTS entry is not of type Parayanam -- unexpected state, aborting rather than guess.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed exactly 2 existing PAST_EVENTS, both Parayanam, as expected.');

    // --- Already-migrated detection (idempotent re-run) ---------------------
    const newTitles = new Set(NEW_EVENTS.map((e) => e.title));
    const alreadyPresentCount = currentPast.filter((e) => newTitles.has(e.title)).length;
    if (alreadyPresentCount > 0 && alreadyPresentCount < NEW_EVENTS.length) {
      console.error(`\nVALIDATION FAILED: ${alreadyPresentCount} of ${NEW_EVENTS.length} new events already present but not all -- unexpected partial state, aborting rather than guess.`);
      process.exitCode = 1;
      return;
    }
    if (alreadyPresentCount === NEW_EVENTS.length) {
      console.log('\n[OK] All target events already present -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed -- none of the new events are present yet.');

    const nextPastEvents = [...currentPast, ...NEW_EVENTS];

    // --- Prove every other data key is unaffected, before writing -----------
    for (const type of TYPES) {
      const { PAST_EVENTS: _p, ...restBefore } = docs[type].data;
      const { PAST_EVENTS: _p2, ...restAfter } = { ...docs[type].data, PAST_EVENTS: nextPastEvents };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than PAST_EVENTS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, on both documents, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Append ${NEW_EVENTS.length} events to PAST_EVENTS (media + pages/media): ${currentPast.length} existing + ${NEW_EVENTS.length} new = ${nextPastEvents.length} total.`);
    console.log('Category breakdown of new events:', JSON.stringify(categoryCounts));

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup ---------------------------------------------------------------
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `events-general-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of TYPES) backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    // --- Write ------------------------------------------------------------------
    for (const type of TYPES) {
      await ContentModel.updateOne({ type }, { $set: { 'data.PAST_EVENTS': nextPastEvents } });
    }
    console.log('[COMMIT] Appended new events to PAST_EVENTS on both media and pages/media.');

    // --- Post-write verification -------------------------------------------------
    let ok = true;
    for (const type of TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const match = deepEqual(after.data.PAST_EVENTS, nextPastEvents);
      console.log(`[verify] "${type}" PAST_EVENTS matches: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;

      const { PAST_EVENTS: _p3, ...restAfter } = after.data;
      const { PAST_EVENTS: _p4, ...restBefore } = docs[type].data;
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
