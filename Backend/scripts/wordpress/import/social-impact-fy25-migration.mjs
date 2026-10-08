// WordPress -> MERN migration: Social Impact Report FY25, approved
// live-site-copy only.
//
// Business rule (explicitly approved — see migration-decision-register.md):
// migrate exactly what is currently published/live-linked on the old
// vyoma.org site. No content-owner approval is required for copying an
// already-live-linked document as-is; that approval is only needed when
// choosing between multiple candidates, which this is not — the two FY25
// candidate PDFs disagree on a headline registrant figure (1,07,305 vs.
// 91,723, see migration-decision-register.md) and that conflict is NOT
// being resolved or corrected here. This script copies the URL currently
// live-linked on WordPress, verbatim, without touching either PDF's
// content.
//
// Scope:
//   - Touches ONLY the "Social Impact Report 2024-25" entry's `document`
//     field inside data.SOCIAL_IMPACT_ITEMS, on the single
//     Content{type:'pages/credibility'} document (NOT a dual-type document
//     — confirmed from the admin editor's own `const TYPE =
//     'pages/credibility'`, a single string, unlike the Newsletter/Events/
//     Gallery dual-type pattern).
//   - Does NOT touch the "Social Impact Report 2023-24" entry (already
//     wired, from the earlier Credibility migration).
//   - Does NOT touch ANNUAL_REPORTS_ITEMS, COMPLIANCES_ITEMS,
//     COLLATERALS_ITEMS, AWARDS_ITEMS, CREDIBILITY_SECTIONS, or SEO.
//   - Does NOT download/rehost the PDF, does NOT touch AWS/S3, does NOT
//     create a Media-model record.
//
// Approved source (verified live-linked on WordPress immediately before
// writing this script — https://vyoma.org/social-impact-report/'s own
// `et_link_options_data`, class `et_pb_column_1`, the "24-25" card):
//   https://vyoma.org/wp-content/uploads/2026/09/Social-Impact-Report-FY25-FINAL-1.pdf
//   (WordPress attachment ID 13931)
//
// Modes:
//   node social-impact-fy25-migration.mjs            -> dry-run (default)
//   node social-impact-fy25-migration.mjs --commit   -> performs the real
//                                                       write, only after
//                                                       validation passes,
//                                                       after writing a
//                                                       pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const CONTENT_TYPE = 'pages/credibility';
const TARGET_TITLE = 'Social Impact Report 2024-25';
const UNTOUCHED_SIBLING_TITLE = 'Social Impact Report 2023-24';

const APPROVED_DOCUMENT = {
  mediaId: null,
  // Scheme kept as http:// to match the exact approved instruction and the
  // FY24 sibling entry's own convention (both resolve correctly — the live
  // site itself serves this file over https via a standard 301 redirect,
  // confirmed separately; storing the literal approved value rather than
  // silently normalizing the scheme).
  url: 'http://vyoma.org/wp-content/uploads/2026/09/Social-Impact-Report-FY25-FINAL-1.pdf',
  filename: 'Social-Impact-Report-FY25-FINAL-1.pdf',
  size: null,
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Social Impact Report FY25 migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: ONLY the "${TARGET_TITLE}" entry's \`document\` field in data.SOCIAL_IMPACT_ITEMS on Content{type:"${CONTENT_TYPE}"}.`);
  console.log('Business rule: copying the document currently live-linked on WordPress verbatim — no figure correction, no reconciliation.');
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    if (!doc) {
      console.error(`\nABORT: No Content document found for type "${CONTENT_TYPE}".`);
      process.exitCode = 1;
      return;
    }
    if (doc.draftData != null) {
      console.error(`\nABORT: Content "${CONTENT_TYPE}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`);
      process.exitCode = 1;
      return;
    }
    const items = doc.data?.SOCIAL_IMPACT_ITEMS;
    if (!Array.isArray(items)) {
      console.error(`\nABORT: data.SOCIAL_IMPACT_ITEMS is not an array as expected.`);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, SOCIAL_IMPACT_ITEMS is an array, no pending draftData.');

    const matches = items.filter((i) => i.title === TARGET_TITLE);
    if (matches.length !== 1) {
      console.error(`\nABORT: expected exactly 1 entry titled "${TARGET_TITLE}", found ${matches.length}.`);
      process.exitCode = 1;
      return;
    }
    const target = matches[0];

    const sibling = items.find((i) => i.title === UNTOUCHED_SIBLING_TITLE);
    if (!sibling || !sibling.document?.url) {
      console.error(`\nABORT: expected "${UNTOUCHED_SIBLING_TITLE}" to already be wired with a document (from the earlier Credibility migration) — baseline looks different than expected.`);
      process.exitCode = 1;
      return;
    }

    if (deepEqual(target.document, APPROVED_DOCUMENT)) {
      console.log(`\n[OK] "${TARGET_TITLE}" already has the approved document — nothing to do (safe re-run / already migrated).`);
      return;
    }
    if (target.document != null) {
      console.error(`\nABORT: "${TARGET_TITLE}".document is neither null nor the approved value — unexpected state, aborting rather than guessing. Found: ${JSON.stringify(target.document)}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Baseline confirmed: "${TARGET_TITLE}".document is null, as expected.`);

    // Build the updated array by title match only — every other entry
    // (including the FY24 sibling) is returned by reference, untouched.
    const updatedItems = items.map((item) =>
      item.title === TARGET_TITLE ? { ...item, document: APPROVED_DOCUMENT } : item
    );

    // Prove every sibling entry and every other data key is unaffected.
    const updatedSibling = updatedItems.find((i) => i.title === UNTOUCHED_SIBLING_TITLE);
    if (!deepEqual(updatedSibling, sibling)) {
      console.error(`\nABORT: internal check failed — "${UNTOUCHED_SIBLING_TITLE}" would be changed by this script. Aborting rather than risk it.`);
      process.exitCode = 1;
      return;
    }
    const { SOCIAL_IMPACT_ITEMS: _si, ...restBefore } = doc.data;
    const wouldBeAfter = { ...doc.data, SOCIAL_IMPACT_ITEMS: updatedItems };
    const { SOCIAL_IMPACT_ITEMS: _si2, ...restAfter } = wouldBeAfter;
    if (!deepEqual(restBefore, restAfter)) {
      console.error('\nABORT: internal check failed — some key other than SOCIAL_IMPACT_ITEMS would change. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): the FY24 sibling entry and every other data key (ANNUAL_REPORTS_ITEMS, COMPLIANCES_ITEMS, COLLATERALS_ITEMS, AWARDS_ITEMS, CREDIBILITY_SECTIONS, SEO) are untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set "${TARGET_TITLE}".document on Content{type:"${CONTENT_TYPE}"}:`);
    console.log(`  url: ${APPROVED_DOCUMENT.url}`);
    console.log(`  filename: ${APPROVED_DOCUMENT.filename}`);
    console.log('Title, body, active, ordering, and every other field/entry: unchanged.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the whole Content document -----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `social-impact-fy25-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ type: CONTENT_TYPE, data: doc.data, draftData: doc.draftData, status: doc.status }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateOne(
      { type: CONTENT_TYPE },
      { $set: { 'data.SOCIAL_IMPACT_ITEMS': updatedItems } }
    );
    console.log(`[COMMIT] Updated data.SOCIAL_IMPACT_ITEMS on Content{type:"${CONTENT_TYPE}"}.`);

    // --- Post-write verification ---------------------------------------
    const after = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    const afterTarget = after.data.SOCIAL_IMPACT_ITEMS.find((i) => i.title === TARGET_TITLE);
    const afterSibling = after.data.SOCIAL_IMPACT_ITEMS.find((i) => i.title === UNTOUCHED_SIBLING_TITLE);
    const targetOk = deepEqual(afterTarget.document, APPROVED_DOCUMENT);
    const siblingOk = deepEqual(afterSibling, sibling);
    const { SOCIAL_IMPACT_ITEMS: _si3, ...restFinal } = after.data;
    const otherKeysOk = deepEqual(restFinal, restBefore);

    console.log(`[verify] "${TARGET_TITLE}" has the approved document: ${targetOk ? 'YES' : 'NO'}`);
    console.log(`[verify] "${UNTOUCHED_SIBLING_TITLE}" unchanged: ${siblingOk ? 'YES' : 'NO'}`);
    console.log(`[verify] Every other data key unchanged: ${otherKeysOk ? 'YES' : 'NO'}`);

    if (!targetOk || !siblingOk || !otherKeysOk) {
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
