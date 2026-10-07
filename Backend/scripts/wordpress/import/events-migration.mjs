// WordPress -> MERN migration: Events, approved batch only.
//
// Scope (per the approved batch):
//   - Touches ONLY data.PAST_EVENTS on the dual Content documents
//     {type: 'pages/media'} and {type: 'media'} (same dual-type-sync
//     pattern already proven by the Newsletter migration).
//   - Does NOT touch data.UPCOMING_EVENTS or data.EVENT_CATEGORIES — no
//     verified reason to change either.
//   - Does NOT touch any other data key (GALLERY_ALBUMS, NEWSLETTER_*,
//     TESTIMONIALS_*, PRESS_*, RESOURCE_*, MEDIA_SECTIONS) — verified
//     unchanged both before writing (baseline read) and after (deep-equal
//     against a pre-write backup).
//   - Removes the 6 known fabricated PAST_EVENTS placeholder entries and
//     replaces them with exactly 2 verified real legacy events. A 3rd real
//     WordPress event record ("Samskrta Divas 2026") is deliberately
//     EXCLUDED from this array — see the EXCLUDED_EVENT note below — rather
//     than forced in with an invented date or misrepresented as a dated
//     event.
//   - Does NOT download or rehost any poster image — every `imageUrl`
//     below is the original, still-live WordPress attachment URL.
//   - Does NOT invent a replacement for Event 1's dead external link —
//     `link` is simply omitted for that entry (confirmed dead via a fresh
//     DNS-resolution check immediately before this script was written;
//     `tour24.vyoma.org` does not resolve, while two other external
//     domains checked the same way from the same environment resolved
//     fine, so this is very likely a genuinely decommissioned subdomain,
//     not a local network artifact).
//
// Source of truth: the already-completed, human-reviewed verification in
// this conversation (WXR post/attachment records for post_id 9640 and
// 12552, plus direct visual inspection of both poster images, plus a fresh
// live HTTP check of both external links). Nothing here was invented.
//
// Modes:
//   node events-migration.mjs            -> dry-run (default)
//   node events-migration.mjs --commit   -> performs the real write, only
//                                           after validation passes, after
//                                           writing a pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// ---------------------------------------------------------------------------
// The 6 known fabricated placeholder titles this script expects to find and
// replace. If the live PAST_EVENTS array doesn't match this set exactly,
// the script aborts rather than guessing what to do.
// ---------------------------------------------------------------------------
const PLACEHOLDER_TITLES = [
  'Faculty Training Program on Indian Knowledge Systems (MSFDA)',
  'The Relevance of Sanskrit in the Digital Age',
  'Ramayana Parayanam and Discourse',
  "Annual Volunteers’ Meet",
  'Launch of New Multimedia Sanskrit Kit',
  'Open House at the Vyoma Center',
];

// ---------------------------------------------------------------------------
// The 2 verified real legacy events this script writes. Dates are the
// poster's own printed event-date range (NOT the WordPress post-creation
// date, which is a different, less meaningful thing — confirmed distinct
// for both). `note` is a faithful condensation of the poster's own real
// text, not invented copy.
// ---------------------------------------------------------------------------
const APPROVED_PAST_EVENTS = [
  {
    type: 'Parayanam',
    date: '23 May 2024 – 16 Jul 2024',
    title: 'Rāma-Sevā-Yātrā in the USA, by ‘Vyoma Sanskrit Brothers’',
    note:
      "Dr. Venkatasubramanian and Vid. CA Viswanathan ('Vyoma Sanskrit Brothers') toured the USA (Texas, Bay Area, Boston/NJ/NY) with Rāmāyaṇa recitation, devotional discourses, and talks on Rāmarājya.",
    imageUrl: 'http://vyoma.org/wp-content/uploads/2024/05/USA_MasterFlyer_1920x1080.png',
    // No `link` — the original https://tour24.vyoma.org/ no longer
    // resolves (confirmed via DNS lookup failure immediately before this
    // migration), and no replacement is invented.
  },
  {
    type: 'Parayanam',
    date: '21 Mar 2026 – 29 Mar 2026',
    title: 'Śrīmad Vālmīki Rāmāyaṇa Navāha Pārāyaṇa Pravacana Yajñaḥ',
    note:
      'A 9-day online Rāmāyaṇa Pārāyaṇa and Pravacana by Dr. Venkatasubramanian P and Dr. Viswanathan P, preceded by a pūrvaṅga-pūjā on 20 March.',
    imageUrl: 'http://vyoma.org/wp-content/uploads/2026/03/Rev-1.jpeg',
    link: 'https://www.sanskritfromhome.org/course-details/SrimadValmikiRamayanaNavahaOnlineParayanaPravacana-49025',
  },
];

// Deliberately excluded from APPROVED_PAST_EVENTS and from this script's
// mutation entirely — recorded here only so the exclusion is documented in
// code, not silently absent. WordPress post_id 13766, titled "Samskrta
// Divas 2026", but its actual poster content is "Śubha-Saṃskṛta-Māsaḥ"
// (Sanskrit Month) promotional material for a blog post — no date, no
// location, no registration anywhere in the poster or attachment metadata.
// Its own CTA link (a tinyurl) redirects with
// `utm_campaign=sanskritmonth_Gandharvavedablog`, confirming it's a blog
// promotion, not a calendar event. Forcing this into PAST_EVENTS would
// require inventing a date it does not have. Left out per explicit
// instruction; a content-owner decision on how (or whether) to represent
// it is still open.
const EXCLUDED_EVENT_NOTE =
  'post_id 13766 "Samskrta Divas 2026" excluded — real content is a dateless "Sanskrit Month" blog promotion, not a calendar event; see migration-decision-register.md.';

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

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Events migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.PAST_EVENTS on pages/media + media. UPCOMING_EVENTS and EVENT_CATEGORIES untouched.');
  console.log('Note:', EXCLUDED_EVENT_NOTE);
  console.log('='.repeat(72));

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
      if (!Array.isArray(doc.data?.PAST_EVENTS)) {
        errors.push(`Content "${type}" exists but data.PAST_EVENTS is not an array as expected.`);
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
    console.log('[OK] Both Content documents exist, PAST_EVENTS is an array on both, no pending draftData.');

    // --- Baseline: PAST_EVENTS must be either the 6 known placeholders
    //     (fresh run) or already the 2 approved events (safe re-run / no-op)
    const placeholderSet = new Set(PLACEHOLDER_TITLES);
    const approvedSet = new Set(APPROVED_PAST_EVENTS.map((e) => e.title));

    let anyAlreadyMigrated = false;
    let anyFreshBaseline = false;
    for (const type of MEDIA_CONTENT_TYPES) {
      const titles = byTitleSet(docs[type].data.PAST_EVENTS);
      if (setsEqual(titles, placeholderSet)) {
        anyFreshBaseline = true;
      } else if (setsEqual(titles, approvedSet)) {
        anyAlreadyMigrated = true;
      } else {
        errors.push(
          `Content "${type}"'s data.PAST_EVENTS titles are neither the 6 known placeholders nor the 2 already-approved events — unexpected state, aborting rather than guessing. Found: ${[...titles].join(' | ')}`
        );
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (PAST_EVENTS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }

    if (anyAlreadyMigrated && !anyFreshBaseline) {
      console.log('\n[OK] Both Content documents already show the 2 approved events — nothing to do (safe re-run / already migrated).');
      return;
    }
    if (anyAlreadyMigrated && anyFreshBaseline) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other (one has the placeholders, the other already has the approved events) — this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Baseline confirmed: both documents have exactly the 6 known placeholder events.');

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { PAST_EVENTS: _pe, ...restBefore } = docs[type].data;
      const wouldBeAfter = { ...docs[type].data, PAST_EVENTS: APPROVED_PAST_EVENTS };
      const { PAST_EVENTS: _pe2, ...restAfter } = wouldBeAfter;
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed — some key other than PAST_EVENTS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): UPCOMING_EVENTS, EVENT_CATEGORIES, and every other data key are untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Replace data.PAST_EVENTS (6 placeholder entries -> ${APPROVED_PAST_EVENTS.length} verified real events) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log('data.UPCOMING_EVENTS, data.EVENT_CATEGORIES, and every other data key: not part of this write at all.');
    for (const e of APPROVED_PAST_EVENTS) {
      console.log(`  - "${e.title}" | ${e.date} | link: ${e.link || '(none — omitted)'}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `events-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything, same as the Newsletter and Credibility migrations.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateMany(
      { type: { $in: MEDIA_CONTENT_TYPES } },
      { $set: { 'data.PAST_EVENTS': APPROVED_PAST_EVENTS } }
    );
    console.log(`[COMMIT] Updated data.PAST_EVENTS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const pastEventsMatch = deepEqual(after.data.PAST_EVENTS, APPROVED_PAST_EVENTS);
      console.log(`[verify] "${type}" PAST_EVENTS matches the approved 2 events exactly: ${pastEventsMatch ? 'YES' : 'NO'}`);
      if (!pastEventsMatch) ok = false;

      const { PAST_EVENTS: _pe, ...restAfter } = after.data;
      const { PAST_EVENTS: _pe2, ...restBefore } = docs[type].data;
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
