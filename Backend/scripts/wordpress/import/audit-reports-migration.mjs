// WordPress -> MERN migration: Audit Reports, Phase 1 (approved 6th
// Credibility section — NOT merged into Annual Reports).
//
// Business rule (approved): reproduce exactly what is publicly visible on
// the old vyoma.org Audit Reports page (https://vyoma.org/audit-reports/,
// WordPress post_id 8904) — same 10 financial years, same labels, same
// link targets, same order (newest first) — without changing the content
// of any PDF.
//
// Scope:
//   - Touches ONLY data.AUDIT_REPORTS_ITEMS (new key) and
//     data.CREDIBILITY_SECTIONS (appends one 6th tile, preserving the
//     existing 5 tiles and their order) on the single
//     Content{type:'pages/credibility'} document.
//   - Does NOT touch ANNUAL_REPORTS_ITEMS, SOCIAL_IMPACT_ITEMS,
//     COMPLIANCES_ITEMS, COLLATERALS_ITEMS, AWARDS_ITEMS, or SEO.
//   - Does NOT invent a report for any year after FY2021-22 — none exists
//     on the live site (re-confirmed directly against both the WXR and a
//     fresh fetch of the live page immediately before this script was
//     written).
//   - Preserves the live site's own FY2017-18 link mismatch VERBATIM: the
//     "Audit Report 2017-18" entry links to Vyoma-Financials-2018-2019.pdf
//     (the SAME file as the 2018-19 entry above it), exactly as WordPress
//     itself currently serves it. The real 2017-18 file exists as a
//     separate, live, but never-linked attachment
//     (Vyoma-Financials-2017-2018.pdf, WordPress attachment ID 8914) — NOT
//     substituted in here. This is a deliberate reproduction of a known
//     publishing error, not a bug in this script — see
//     migration-decision-register.md (D17/D18) for the flagged decision.
//   - Does NOT add the two unlabeled amarseva.org links (attached to the
//     2012-13 entry on the live page) to the visible report list — their
//     purpose is undocumented and unresolved (D20). They are recorded
//     below only as a comment for traceability, never written to MongoDB.
//   - Does NOT download/rehost any PDF, does NOT touch AWS/S3, does NOT
//     create a Media-model record.
//
// Source of truth: a fresh, direct read of both the WXR
// (Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml,
// post_id 8904) and a live fetch of https://vyoma.org/audit-reports/,
// cross-checked to confirm they still match byte-for-byte (the page has
// not been modified since 2023-11-06).
//
// Modes:
//   node audit-reports-migration.mjs            -> dry-run (default)
//   node audit-reports-migration.mjs --commit   -> performs the real write,
//                                                  only after validation
//                                                  passes, after writing a
//                                                  pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const CONTENT_TYPE = 'pages/credibility';

// ---------------------------------------------------------------------------
// The approved 10 Audit Reports, newest first — exact labels and link
// targets as currently live on https://vyoma.org/audit-reports/.
// ---------------------------------------------------------------------------
function doc(url, filename) {
  return { mediaId: null, url, filename, size: null };
}

const APPROVED_AUDIT_REPORTS_ITEMS = [
  { title: 'Audit Report 2021-22', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2021-2022.pdf', 'Vyoma-Financials-2021-2022.pdf'), active: true },
  { title: 'Audit Report 2020-21', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2020-2021.pdf', 'Vyoma-Financials-2020-2021.pdf'), active: true },
  { title: 'Audit Report 2019-20', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2019-2020.pdf', 'Vyoma-Financials-2019-2020.pdf'), active: true },
  { title: 'Audit Report 2018-19', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2018-2019.pdf', 'Vyoma-Financials-2018-2019.pdf'), active: true },
  // --- Known publishing error, reproduced verbatim, NOT corrected --------
  // The live site's own "Audit Report 2017-18" entry links to the 2018-19
  // PDF (same URL as the entry above). The real 2017-18 file exists at
  // https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2017-2018.pdf
  // (attachment 8914, confirmed live, HTTP 200) but is never linked from
  // the live page — see migration-decision-register.md D17/D18.
  { title: 'Audit Report 2017-18', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2018-2019.pdf', 'Vyoma-Financials-2018-2019.pdf'), active: true },
  { title: 'Audit Report 2016-17', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2016-2017.pdf', 'Vyoma-Financials-2016-2017.pdf'), active: true },
  { title: 'Audit Report 2015-16', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2015-2016.pdf', 'Vyoma-Financials-2015-2016.pdf'), active: true },
  { title: 'Audit Report 2014-15', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2014-2015.pdf', 'Vyoma-Financials-2014-2015.pdf'), active: true },
  { title: 'Audit Report 2013-14', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2013-2014.pdf', 'Vyoma-Financials-2013-2014.pdf'), active: true },
  { title: 'Audit Report 2012-13', body: '', document: doc('https://vyoma.org/wp-content/uploads/2023/11/Vyoma-Financials-2012-2013.pdf', 'Vyoma-Financials-2012-2013.pdf'), active: true },
];

// NOT migrated, deliberately — recorded here only for traceability, never
// written to MongoDB. Attached to the live "2012-13" list item with no
// visible label; purpose unresolved (D20).
// const UNRESOLVED_AMARSEVA_LINKS = [
//   'https://www.amarseva.org/uploads/default/files/reports/stuff/8cbe9535513e9b442cb6de720f9358e8.pdf',
//   'https://www.amarseva.org/uploads/default/files/reports/stuff/0430df06666b7a1af3007e720f47c4b1.pdf',
// ];

const EXISTING_SECTION_TITLES = ['Collaterals', 'Annual Reports', 'Social Impact Report', 'Compliances & Registrations', 'Awards & Recognition'];
const NEW_SECTION_TILE = {
  title: 'Audit Reports',
  body: 'Our audited annual financial statements, published in full (FY2012-13 to FY2021-22).',
  cta: 'View audit reports',
  href: '/credibility/audit-reports',
  active: true,
};

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Audit Reports migration (Phase 1) — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: ONLY data.AUDIT_REPORTS_ITEMS (new key) and data.CREDIBILITY_SECTIONS (+1 tile) on Content{type:"${CONTENT_TYPE}"}.`);
  console.log('Reproduces the live site exactly, including the known FY2017-18 link mismatch (NOT corrected).');
  console.log('Does NOT add the 2 unlabeled amarseva.org links to the visible list.');
  console.log('='.repeat(72));

  if (APPROVED_AUDIT_REPORTS_ITEMS.length !== 10) {
    console.error(`\nABORT: expected exactly 10 Audit Report entries, found ${APPROVED_AUDIT_REPORTS_ITEMS.length}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 10 entries, newest-first (2021-22 ... 2012-13).`);

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
    if (!Array.isArray(doc_.data?.CREDIBILITY_SECTIONS)) {
      console.error(`\nABORT: data.CREDIBILITY_SECTIONS is not an array as expected.`);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, CREDIBILITY_SECTIONS is an array, no pending draftData.');

    // --- Baseline: AUDIT_REPORTS_ITEMS must be absent (fresh) or already
    //     match the approved set (safe re-run / no-op) ---------------------
    const existingAuditItems = doc_.data.AUDIT_REPORTS_ITEMS;
    const auditItemsAlreadyMigrated = existingAuditItems !== undefined && deepEqual(existingAuditItems, APPROVED_AUDIT_REPORTS_ITEMS);
    if (existingAuditItems !== undefined && !auditItemsAlreadyMigrated) {
      console.error('\nABORT: data.AUDIT_REPORTS_ITEMS already exists but does not match the approved 10-entry set — unexpected state, aborting rather than overwriting unknown existing content.');
      console.error('Found:', JSON.stringify(existingAuditItems));
      process.exitCode = 1;
      return;
    }

    // --- Baseline: CREDIBILITY_SECTIONS must be exactly the 5 known tiles
    //     (fresh) or already have the 6th Audit Reports tile too (no-op) ---
    const sectionTitles = doc_.data.CREDIBILITY_SECTIONS.map((s) => s.title);
    const hasExactly5 = sectionTitles.length === 5 && EXISTING_SECTION_TITLES.every((t, i) => sectionTitles[i] === t);
    const hasExactly6WithAudit =
      sectionTitles.length === 6 &&
      EXISTING_SECTION_TITLES.every((t, i) => sectionTitles[i] === t) &&
      sectionTitles[5] === 'Audit Reports' &&
      deepEqual(doc_.data.CREDIBILITY_SECTIONS[5], NEW_SECTION_TILE);

    if (!hasExactly5 && !hasExactly6WithAudit) {
      console.error('\nABORT: data.CREDIBILITY_SECTIONS is neither the 5 known existing tiles (in order) nor those 5 plus the approved 6th Audit Reports tile — unexpected state, aborting rather than guessing.');
      console.error('Found titles, in order:', JSON.stringify(sectionTitles));
      process.exitCode = 1;
      return;
    }

    if (auditItemsAlreadyMigrated && hasExactly6WithAudit) {
      console.log('\n[OK] Both AUDIT_REPORTS_ITEMS and the 6th CREDIBILITY_SECTIONS tile already match the approved state — nothing to do (safe re-run / already migrated).');
      return;
    }
    if (auditItemsAlreadyMigrated !== hasExactly6WithAudit) {
      console.error('\nABORT: AUDIT_REPORTS_ITEMS and CREDIBILITY_SECTIONS are out of sync with each other (one migrated, one not) — this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Baseline confirmed: AUDIT_REPORTS_ITEMS absent, CREDIBILITY_SECTIONS has exactly the 5 known tiles in order.');

    const updatedSections = [...doc_.data.CREDIBILITY_SECTIONS, NEW_SECTION_TILE];

    // --- Prove every other data key is unaffected, before writing ---------
    const { AUDIT_REPORTS_ITEMS: _ar, CREDIBILITY_SECTIONS: _cs, ...restBefore } = doc_.data;
    const wouldBeAfter = { ...doc_.data, AUDIT_REPORTS_ITEMS: APPROVED_AUDIT_REPORTS_ITEMS, CREDIBILITY_SECTIONS: updatedSections };
    const { AUDIT_REPORTS_ITEMS: _ar2, CREDIBILITY_SECTIONS: _cs2, ...restAfter } = wouldBeAfter;
    if (!deepEqual(restBefore, restAfter)) {
      console.error('\nABORT: internal check failed — some key other than AUDIT_REPORTS_ITEMS/CREDIBILITY_SECTIONS would change. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    const first5Unchanged = deepEqual(updatedSections.slice(0, 5), doc_.data.CREDIBILITY_SECTIONS);
    if (!first5Unchanged) {
      console.error('\nABORT: internal check failed — one of the 5 existing CREDIBILITY_SECTIONS tiles would change. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): ANNUAL_REPORTS_ITEMS, SOCIAL_IMPACT_ITEMS, COMPLIANCES_ITEMS, COLLATERALS_ITEMS, AWARDS_ITEMS, SEO, and the 5 existing CREDIBILITY_SECTIONS tiles (in their original order) are all untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set data.AUDIT_REPORTS_ITEMS -> 10 entries (newest first) on Content{type:"${CONTENT_TYPE}"}.`);
    console.log('Append a 6th tile ("Audit Reports") to data.CREDIBILITY_SECTIONS, preserving the existing 5 tiles and their order.');
    for (const item of APPROVED_AUDIT_REPORTS_ITEMS) {
      console.log(`  - "${item.title}" -> ${item.document.filename}${item.title === 'Audit Report 2017-18' ? '  [KNOWN MISMATCH — reproduced as-is, see comment]' : ''}`);
    }
    console.log('Not added to the visible list (unresolved, D20): 2 unlabeled amarseva.org links from the live 2012-13 entry.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the whole Content document -----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `audit-reports-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ type: CONTENT_TYPE, data: doc_.data, draftData: doc_.draftData, status: doc_.status }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateOne(
      { type: CONTENT_TYPE },
      { $set: { 'data.AUDIT_REPORTS_ITEMS': APPROVED_AUDIT_REPORTS_ITEMS, 'data.CREDIBILITY_SECTIONS': updatedSections } }
    );
    console.log(`[COMMIT] Updated data.AUDIT_REPORTS_ITEMS and data.CREDIBILITY_SECTIONS on Content{type:"${CONTENT_TYPE}"}.`);

    // --- Post-write verification -------------------------------------------
    const after = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    const itemsOk = deepEqual(after.data.AUDIT_REPORTS_ITEMS, APPROVED_AUDIT_REPORTS_ITEMS);
    const sectionsOk = deepEqual(after.data.CREDIBILITY_SECTIONS, updatedSections);
    const { AUDIT_REPORTS_ITEMS: _ar3, CREDIBILITY_SECTIONS: _cs3, ...restFinal } = after.data;
    const otherKeysOk = deepEqual(restFinal, restBefore);

    console.log(`[verify] AUDIT_REPORTS_ITEMS matches the approved 10 entries exactly: ${itemsOk ? 'YES' : 'NO'}`);
    console.log(`[verify] CREDIBILITY_SECTIONS has the 5 existing tiles + approved 6th tile: ${sectionsOk ? 'YES' : 'NO'}`);
    console.log(`[verify] Every other data key unchanged: ${otherKeysOk ? 'YES' : 'NO'}`);

    if (!itemsOk || !sectionsOk || !otherKeysOk) {
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
