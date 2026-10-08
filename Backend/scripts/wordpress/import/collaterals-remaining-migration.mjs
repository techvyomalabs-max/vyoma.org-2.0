// WordPress -> MERN migration: Collaterals, remaining 6 entries.
//
// Business rule (approved): migrate the genuine content currently published
// on the old vyoma.org Collaterals page (https://vyoma.org/collaterals/),
// using the single, correctly-content-verified link found for each tile
// during the latest audit (this conversation) — not guessed from filename
// or upload date, and not the tile's other, confirmed-wrong-or-stale link.
//
// Scope:
//   - Touches ONLY the `document` field of exactly these 6
//     COLLATERALS_ITEMS entries, on the single Content{type:
//     'pages/credibility'} document:
//       Company Presentation, Vyoma Brochure,
//       Digital Sanskrit Language Lab Brochure, DSLL Ayurveda Brochure,
//       Digital Sanskrit OTT, Kids Persona Brochure
//   - Does NOT touch the 3 already-migrated Collaterals entries (Slip
//     Sheet, Seva Offering Catalogue, Publications & Products Catalogue).
//   - Does NOT touch ANNUAL_REPORTS_ITEMS, SOCIAL_IMPACT_ITEMS,
//     COMPLIANCES_ITEMS, AUDIT_REPORTS_ITEMS, AWARDS_ITEMS,
//     CREDIBILITY_SECTIONS, or SEO.
//   - Does NOT download/rehost any file, does NOT touch AWS/S3, does NOT
//     create a Media-model record.
//
// Each URL below is the single link this audit confirmed (via each
// flipbook's own config.js title/page-count/download-filename, or — for
// Company Presentation — a real fetched %PDF header) to be the tile's
// correct, live, currently-content-matching destination:
//   - Company Presentation: the inner-heading PDF (the column's flipbook
//     was confirmed to be a different, unrelated brochure's content).
//   - Vyoma Brochure: the inner-heading flipbook (newer export; the column
//     flipbook is an older, differently-titled asset).
//   - Digital Sanskrit Language Lab Brochure: the inner-heading flipbook
//     (the column's flipbook is a stale, ~11-month-older export with no
//     working download file configured).
//   - DSLL Ayurveda Brochure: the inner-heading flipbook (slightly newer
//     edition than the column's; both were live and usable, inner-heading
//     picked as current).
//   - Digital Sanskrit OTT: the inner-heading flipbook only — the column
//     link is a CONFIRMED copy-paste bug pointing at unrelated DSLL
//     Brochure content, not OTT content at all.
//   - Kids Persona Brochure: the inner-heading flipbook only, at the
//     current live path — the column link shares the exact same
//     DSLL-content bug URL as Digital Sanskrit OTT's column link.
//
// Modes:
//   node collaterals-remaining-migration.mjs            -> dry-run (default)
//   node collaterals-remaining-migration.mjs --commit   -> performs the
//                                                         real write, only
//                                                         after validation
//                                                         passes, after
//                                                         writing a
//                                                         pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const CONTENT_TYPE = 'pages/credibility';

function doc(url) {
  return { mediaId: null, url, filename: null, size: null };
}

// Keyed by the EXACT existing title string — never by array position, so a
// reordering or an unexpected title can never silently overwrite the wrong
// entry.
const APPROVED_DOCS = {
  'Company Presentation': doc('https://vyoma.org/wp-content/uploads/2026/09/Vyoma_presentation_Aug_2026.pdf'),
  'Vyoma Brochure': doc('https://vyomalabs-lms.b-cdn.net/Company_Broucher_2026/Vyoma_Brochure_12_05_2026/index.html'),
  'Digital Sanskrit Language Lab Brochure': doc('https://vyomalabs-lms.b-cdn.net/DSLL_2026_May_18/DSLL_18_05_2026/Output/index.html'),
  'DSLL Ayurveda Brochure': doc('https://vyomalabs-lms.b-cdn.net/Ayurveda_18_05_2026/Ayurveda_18_05_2026/outputfile/index.html'),
  'Digital Sanskrit OTT': doc('https://vyomalabs-lms.b-cdn.net/OTT_Flyer/index.html'),
  'Kids Persona Brochure': doc('https://vyomalabs-lms.b-cdn.net/Kids_Persona_2026/Kids_Persona_brochure_06_03_2026/Kids_Persona_brochure_06_03_2026/index.html'),
};

const UNTOUCHED_SIBLING_TITLES = ['Slip Sheet', 'Seva Offering Catalogue', 'Publications & Products Catalogue'];
const ALL_EXPECTED_TITLES = [
  'Company Presentation', 'Slip Sheet', 'Vyoma Brochure', 'Seva Offering Catalogue',
  'Publications & Products Catalogue', 'Digital Sanskrit Language Lab Brochure',
  'DSLL Ayurveda Brochure', 'Digital Sanskrit OTT', 'Kids Persona Brochure',
];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Collaterals (remaining 6) migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: ONLY the \`document\` field of 6 named COLLATERALS_ITEMS entries on Content{type:"${CONTENT_TYPE}"}.`);
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc_ = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    if (!doc_) {
      console.error(`\nABORT: No Content document found for type "${CONTENT_TYPE}".`);
      process.exitCode = 1;
      return;
    }
    if (doc_.draftData != null) {
      console.error(`\nABORT: Content "${CONTENT_TYPE}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`);
      process.exitCode = 1;
      return;
    }
    const items = doc_.data?.COLLATERALS_ITEMS;
    if (!Array.isArray(items)) {
      console.error('\nABORT: data.COLLATERALS_ITEMS is not an array as expected.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, COLLATERALS_ITEMS is an array, no pending draftData.');

    // --- Baseline: exact title set must match all 9 known entries --------
    const titles = items.map((i) => i.title);
    const titlesOk = titles.length === ALL_EXPECTED_TITLES.length && ALL_EXPECTED_TITLES.every((t) => titles.includes(t));
    if (!titlesOk) {
      console.error('\nABORT: COLLATERALS_ITEMS titles do not match the expected 9 — unexpected state, aborting rather than guessing.');
      console.error('Found:', JSON.stringify(titles));
      process.exitCode = 1;
      return;
    }

    // --- Per-target baseline: each of the 6 must be null OR already the
    //     approved value (idempotent re-run) ------------------------------
    const errors = [];
    let anyNull = false;
    let anyAlreadyMigrated = false;
    for (const title of Object.keys(APPROVED_DOCS)) {
      const entry = items.find((i) => i.title === title);
      if (!entry) {
        errors.push(`Expected entry "${title}" not found.`);
        continue;
      }
      if (entry.document == null) {
        anyNull = true;
      } else if (deepEqual(entry.document, APPROVED_DOCS[title])) {
        anyAlreadyMigrated = true;
      } else {
        errors.push(`"${title}".document is neither null nor the approved value — unexpected state. Found: ${JSON.stringify(entry.document)}`);
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (per-entry baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    if (anyAlreadyMigrated && !anyNull) {
      console.log('\n[OK] All 6 entries already have the approved document — nothing to do (safe re-run / already migrated).');
      return;
    }
    if (anyAlreadyMigrated && anyNull) {
      console.error('\nABORT: some of the 6 entries are already migrated and others are still null — partially-applied state; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Baseline confirmed: all 6 target entries have document: null; the 3 sibling entries and all other data untouched so far.');

    // --- Build the updated array by title match only ----------------------
    const updatedItems = items.map((item) =>
      Object.prototype.hasOwnProperty.call(APPROVED_DOCS, item.title) ? { ...item, document: APPROVED_DOCS[item.title] } : item
    );

    // --- Prove the 3 siblings and every other data key are unaffected -----
    for (const title of UNTOUCHED_SIBLING_TITLES) {
      const before = items.find((i) => i.title === title);
      const after = updatedItems.find((i) => i.title === title);
      if (!deepEqual(before, after)) {
        console.error(`\nABORT: internal check failed — sibling entry "${title}" would be changed. Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    const { COLLATERALS_ITEMS: _ci, ...restBefore } = doc_.data;
    const wouldBeAfter = { ...doc_.data, COLLATERALS_ITEMS: updatedItems };
    const { COLLATERALS_ITEMS: _ci2, ...restAfter } = wouldBeAfter;
    if (!deepEqual(restBefore, restAfter)) {
      console.error('\nABORT: internal check failed — some key other than COLLATERALS_ITEMS would change. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): the 3 already-migrated Collaterals entries, and every other data key (ANNUAL_REPORTS_ITEMS, SOCIAL_IMPACT_ITEMS, COMPLIANCES_ITEMS, AUDIT_REPORTS_ITEMS, AWARDS_ITEMS, CREDIBILITY_SECTIONS, SEO), are untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log('Set `document` on 6 named COLLATERALS_ITEMS entries, preserving title/body/active/ordering for all 9 entries:');
    for (const [title, d] of Object.entries(APPROVED_DOCS)) {
      console.log(`  - "${title}" -> ${d.url}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the whole Content document -----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `collaterals-remaining-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ type: CONTENT_TYPE, data: doc_.data, draftData: doc_.draftData, status: doc_.status }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateOne(
      { type: CONTENT_TYPE },
      { $set: { 'data.COLLATERALS_ITEMS': updatedItems } }
    );
    console.log(`[COMMIT] Updated data.COLLATERALS_ITEMS on Content{type:"${CONTENT_TYPE}"}.`);

    // --- Post-write verification -------------------------------------------
    const after = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    let ok = true;
    for (const title of Object.keys(APPROVED_DOCS)) {
      const item = after.data.COLLATERALS_ITEMS.find((i) => i.title === title);
      const match = item && deepEqual(item.document, APPROVED_DOCS[title]);
      console.log(`[verify] "${title}" has the approved document: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;
    }
    for (const title of UNTOUCHED_SIBLING_TITLES) {
      const before = items.find((i) => i.title === title);
      const afterItem = after.data.COLLATERALS_ITEMS.find((i) => i.title === title);
      const same = deepEqual(before, afterItem);
      console.log(`[verify] "${title}" unchanged: ${same ? 'YES' : 'NO'}`);
      if (!same) ok = false;
    }
    const { COLLATERALS_ITEMS: _ci3, ...restFinal } = after.data;
    const otherKeysOk = deepEqual(restFinal, restBefore);
    console.log(`[verify] Every other data key unchanged: ${otherKeysOk ? 'YES' : 'NO'}`);
    if (!otherKeysOk) ok = false;

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
