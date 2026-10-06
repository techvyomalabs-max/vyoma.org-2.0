// WordPress -> MERN migration: Credibility documents, approved batch only.
//
// Scope (per the approved batch):
//   - Touches ONLY these keys on the single Content{type:'pages/credibility'}
//     document:
//       data.ANNUAL_REPORTS_ITEMS   -> all 4 entries get a real `document`
//       data.SOCIAL_IMPACT_ITEMS    -> ONLY the "2023-24" (FY24) entry
//       data.COLLATERALS_ITEMS      -> ONLY "Slip Sheet", "Seva Offering
//                                      Catalogue", "Publications & Products
//                                      Catalogue"
//   - Does NOT touch data.COMPLIANCES_ITEMS, data.AWARDS_ITEMS,
//     data.CREDIBILITY_SECTIONS, or data.SEO at all — verified unchanged
//     both before writing (read-only baseline check) and after (deep-equal
//     against the pre-write backup).
//   - Does NOT touch Social Impact's "2024-25" (FY25) entry — the two real
//     candidates for that year contain materially conflicting figures and
//     remain a content-owner decision, per the approved scope.
//   - Does NOT touch 6 of the 9 Collaterals entries (Company Presentation,
//     Vyoma Brochure, DSLL Brochure, DSLL Ayurveda Brochure, Digital
//     Sanskrit OTT, Kids Persona Brochure) — all still ambiguous per the
//     approved PDF/flipbook comparison.
//   - Does NOT download or rehost any file — every `document.url` below is
//     the already-verified, still-live external URL (WordPress-hosted PDF
//     or Bunny CDN flipbook), exactly as the approved comparison found it.
//   - Does NOT touch AWS/S3, Audit Reports (no such section exists), or any
//     frontend file.
//
// Source of truth: the already-completed, human-reviewed PDF/flipbook
// comparison (this conversation) — not re-derived here. Nothing in this
// script was downloaded fresh; the URLs below are the exact ones that
// comparison verified.
//
// Modes:
//   node credibility-documents-migration.mjs            -> dry-run (default)
//   node credibility-documents-migration.mjs --commit   -> performs the
//                                                          real write, only
//                                                          after validation
//                                                          passes, after
//                                                          writing a
//                                                          pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const CONTENT_TYPE = 'pages/credibility';

// ---------------------------------------------------------------------------
// Approved document assignments — keyed by the EXACT existing title string,
// never by array position, so a reordering or an unexpected title can never
// silently overwrite the wrong entry.
// ---------------------------------------------------------------------------
const ANNUAL_REPORT_DOCS = {
  'Annual Report 2021-22': {
    mediaId: null,
    url: 'http://vyoma.org/wp-content/uploads/2026/06/Annual-Report-FY22.pdf',
    filename: 'Annual-Report-FY22.pdf',
    size: null,
  },
  'Annual Report 2022-23': {
    mediaId: null,
    // The corrected version — fixes the older "-Final" file's internally
    // inconsistent "34 New Courses" figure (the same file's own Chairman's
    // letter said 52) to the consistent 52 used throughout this file.
    url: 'http://vyoma.org/wp-content/uploads/2026/06/Annual-Report-FY23.pdf',
    filename: 'Annual-Report-FY23.pdf',
    size: null,
  },
  'Annual Report 2023-24': {
    mediaId: null,
    url: 'http://vyoma.org/wp-content/uploads/2026/06/Annual-Report-FY24.pdf',
    filename: 'Annual-Report-FY24.pdf',
    size: null,
  },
  'Annual Report 2024-25': {
    mediaId: null,
    url: 'http://vyoma.org/wp-content/uploads/2026/06/Annual-Report-FY25.pdf',
    filename: 'Annual-Report-FY25.pdf',
    size: null,
  },
};

const SOCIAL_IMPACT_DOCS = {
  // FY25 ("Social Impact Report 2024-25") is deliberately NOT in this map —
  // its two candidates conflict materially and this batch does not touch it.
  'Social Impact Report 2023-24': {
    mediaId: null,
    url: 'http://vyoma.org/wp-content/uploads/2026/02/Social-Impact-Report-FY24.pdf',
    filename: 'Social-Impact-Report-FY24.pdf',
    size: null,
  },
};

const COLLATERALS_DOCS = {
  'Slip Sheet': {
    mediaId: null,
    url: 'https://vyomalabs-lms.b-cdn.net/Slip_Sheet/index.html',
    filename: 'Slip Sheet',
    size: null,
  },
  'Seva Offering Catalogue': {
    mediaId: null,
    url: 'https://vyomalabs-lms.b-cdn.net/Seva_Offering/Seva_Offering/index.html',
    filename: 'Seva Offering Catalogue',
    size: null,
  },
  'Publications & Products Catalogue': {
    mediaId: null,
    url: 'https://vyomalabs-lms.b-cdn.net/Publications_2026/Publication/index.html',
    filename: 'Publications & Products Catalogue',
    size: null,
  },
};

// Exact expected title sets — used both to build the updated arrays (match
// by title, never by index) and to assert nothing unexpected is present.
const EXPECTED_ANNUAL_REPORT_TITLES = Object.keys(ANNUAL_REPORT_DOCS);
const EXPECTED_SOCIAL_IMPACT_DOC_TITLES = Object.keys(SOCIAL_IMPACT_DOCS); // only the one being touched
const EXPECTED_SOCIAL_IMPACT_ALL_TITLES = ['Social Impact Report 2024-25', 'Social Impact Report 2023-24'];
const EXPECTED_COLLATERALS_DOC_TITLES = Object.keys(COLLATERALS_DOCS); // only the 3 being touched
const EXPECTED_COLLATERALS_ALL_TITLES = [
  'Company Presentation',
  'Slip Sheet',
  'Vyoma Brochure',
  'Seva Offering Catalogue',
  'Publications & Products Catalogue',
  'Digital Sanskrit Language Lab Brochure',
  'DSLL Ayurveda Brochure',
  'Digital Sanskrit OTT',
  'Kids Persona Brochure',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function byTitleCounts(items) {
  const counts = new Map();
  for (const item of items) counts.set(item.title, (counts.get(item.title) || 0) + 1);
  return counts;
}

// Applies `docsMap` (title -> document) onto `items` by title match only.
// Every field other than `document` on a matched item is left untouched
// (same title/body/active); every non-matched item is returned as-is
// (same reference), so an unrelated entry's `document` is impossible to
// accidentally overwrite.
function applyDocsByTitle(items, docsMap) {
  const errors = [];
  const counts = byTitleCounts(items);

  for (const title of Object.keys(docsMap)) {
    const count = counts.get(title) || 0;
    if (count === 0) errors.push(`Expected title "${title}" not found in the live array.`);
    if (count > 1) errors.push(`Title "${title}" appears ${count} times in the live array — expected exactly 1 (ambiguous, aborting).`);
  }
  if (errors.length) return { errors, updated: null };

  const updated = items.map((item) => {
    if (Object.prototype.hasOwnProperty.call(docsMap, item.title)) {
      return { ...item, document: docsMap[item.title] };
    }
    return item;
  });
  return { errors: [], updated };
}

function assertTitleSetMatches(items, expectedTitles, label) {
  const errors = [];
  const actualTitles = items.map((i) => i.title);
  const actualSet = new Set(actualTitles);
  const expectedSet = new Set(expectedTitles);
  if (actualTitles.length !== actualSet.size) {
    errors.push(`${label}: duplicate titles found in the live array (${actualTitles.join(', ')}).`);
  }
  for (const t of expectedTitles) {
    if (!actualSet.has(t)) errors.push(`${label}: expected title "${t}" is missing from the live array.`);
  }
  for (const t of actualTitles) {
    if (!expectedSet.has(t)) errors.push(`${label}: unexpected title "${t}" found in the live array — expected exactly: ${expectedTitles.join(', ')}.`);
  }
  return errors;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Credibility documents migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.ANNUAL_REPORTS_ITEMS (all 4), data.SOCIAL_IMPACT_ITEMS (FY24 only),');
  console.log('       data.COLLATERALS_ITEMS (Slip Sheet / Seva Offering Catalogue / Publications & Products Catalogue only)');
  console.log('       on Content{type:"pages/credibility"}. Compliances, Awards, Credibility category grid, SEO: untouched.');
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
      console.error(
        `\nABORT: Content "${CONTENT_TYPE}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`
      );
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, no pending draftData.');

    const data = doc.data || {};
    const annualReports = data.ANNUAL_REPORTS_ITEMS;
    const socialImpact = data.SOCIAL_IMPACT_ITEMS;
    const collaterals = data.COLLATERALS_ITEMS;
    const compliances = data.COMPLIANCES_ITEMS;
    const awards = data.AWARDS_ITEMS;

    if (!Array.isArray(annualReports) || !Array.isArray(socialImpact) || !Array.isArray(collaterals)) {
      console.error('\nABORT: one of ANNUAL_REPORTS_ITEMS / SOCIAL_IMPACT_ITEMS / COLLATERALS_ITEMS is not an array as expected.');
      process.exitCode = 1;
      return;
    }

    // --- Baseline structural validation (fail loudly, never guess) --------
    const baselineErrors = [
      ...assertTitleSetMatches(annualReports, EXPECTED_ANNUAL_REPORT_TITLES, 'ANNUAL_REPORTS_ITEMS'),
      ...assertTitleSetMatches(socialImpact, EXPECTED_SOCIAL_IMPACT_ALL_TITLES, 'SOCIAL_IMPACT_ITEMS'),
      ...assertTitleSetMatches(collaterals, EXPECTED_COLLATERALS_ALL_TITLES, 'COLLATERALS_ITEMS'),
    ];
    if (!Array.isArray(compliances) || compliances.length !== 8) {
      baselineErrors.push(`COMPLIANCES_ITEMS: expected exactly 8 entries, found ${Array.isArray(compliances) ? compliances.length : 'not an array'}.`);
    }
    if (baselineErrors.length) {
      console.error('\nVALIDATION FAILED (baseline structure):');
      for (const e of baselineErrors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Baseline structure matches exactly what this script expects (4 Annual Reports, 2 Social Impact, 9 Collaterals, 8 Compliances).');

    // --- Build the three updated arrays (title-matched only) --------------
    const arResult = applyDocsByTitle(annualReports, ANNUAL_REPORT_DOCS);
    const siResult = applyDocsByTitle(socialImpact, SOCIAL_IMPACT_DOCS);
    const colResult = applyDocsByTitle(collaterals, COLLATERALS_DOCS);
    const applyErrors = [...arResult.errors, ...siResult.errors, ...colResult.errors];
    if (applyErrors.length) {
      console.error('\nVALIDATION FAILED (title matching):');
      for (const e of applyErrors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] All 8 approved entries matched by exact title, no duplicates, no missing entries.');

    // --- Prove untouched entries are staying untouched, before writing ----
    const untouchedSocialImpact = siResult.updated.find((i) => i.title === 'Social Impact Report 2024-25');
    const originalSocialImpactFY25 = socialImpact.find((i) => i.title === 'Social Impact Report 2024-25');
    if (!deepEqual(untouchedSocialImpact, originalSocialImpactFY25)) {
      console.error('\nABORT: internal check failed — Social Impact FY25 would be changed by this script. This should be impossible; aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    const unchangedCollateralTitles = EXPECTED_COLLATERALS_ALL_TITLES.filter((t) => !EXPECTED_COLLATERALS_DOC_TITLES.includes(t));
    for (const title of unchangedCollateralTitles) {
      const before = collaterals.find((i) => i.title === title);
      const after = colResult.updated.find((i) => i.title === title);
      if (!deepEqual(before, after)) {
        console.error(`\nABORT: internal check failed — Collaterals entry "${title}" would be changed by this script. Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(`[OK] Confirmed (pre-write): Social Impact FY25 and the other ${unchangedCollateralTitles.length} Collaterals entries are untouched by the planned write.`);

    console.log('\n--- Intended operation ---');
    console.log('Set data.ANNUAL_REPORTS_ITEMS (4 entries get `document`), data.SOCIAL_IMPACT_ITEMS (1 of 2 entries gets `document`),');
    console.log('    data.COLLATERALS_ITEMS (3 of 9 entries get `document`) on Content{type:"pages/credibility"}.');
    console.log('data.COMPLIANCES_ITEMS, data.AWARDS_ITEMS, data.CREDIBILITY_SECTIONS, data.SEO: not part of this write at all.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of the whole Content document -----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `credibility-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ type: CONTENT_TYPE, data, draftData: doc.draftData, status: doc.status }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything, same as the Newsletter migration.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateOne(
      { type: CONTENT_TYPE },
      {
        $set: {
          'data.ANNUAL_REPORTS_ITEMS': arResult.updated,
          'data.SOCIAL_IMPACT_ITEMS': siResult.updated,
          'data.COLLATERALS_ITEMS': colResult.updated,
        },
      }
    );
    console.log('[COMMIT] Updated data.ANNUAL_REPORTS_ITEMS / data.SOCIAL_IMPACT_ITEMS / data.COLLATERALS_ITEMS.');

    // --- Post-write verification -------------------------------------------
    const after = await ContentModel.findOne({ type: CONTENT_TYPE }).lean();
    let ok = true;

    for (const title of EXPECTED_ANNUAL_REPORT_TITLES) {
      const item = after.data.ANNUAL_REPORTS_ITEMS.find((i) => i.title === title);
      const match = item && deepEqual(item.document, ANNUAL_REPORT_DOCS[title]);
      console.log(`[verify] Annual Report "${title}" has the approved document: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;
    }
    for (const title of EXPECTED_SOCIAL_IMPACT_DOC_TITLES) {
      const item = after.data.SOCIAL_IMPACT_ITEMS.find((i) => i.title === title);
      const match = item && deepEqual(item.document, SOCIAL_IMPACT_DOCS[title]);
      console.log(`[verify] Social Impact "${title}" has the approved document: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;
    }
    for (const title of EXPECTED_COLLATERALS_DOC_TITLES) {
      const item = after.data.COLLATERALS_ITEMS.find((i) => i.title === title);
      const match = item && deepEqual(item.document, COLLATERALS_DOCS[title]);
      console.log(`[verify] Collaterals "${title}" has the approved document: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;
    }

    const fy25After = after.data.SOCIAL_IMPACT_ITEMS.find((i) => i.title === 'Social Impact Report 2024-25');
    const fy25Same = deepEqual(fy25After, originalSocialImpactFY25);
    console.log(`[verify] Social Impact FY25 unchanged: ${fy25Same ? 'YES' : 'NO'}`);
    if (!fy25Same) ok = false;

    for (const title of unchangedCollateralTitles) {
      const before = collaterals.find((i) => i.title === title);
      const afterItem = after.data.COLLATERALS_ITEMS.find((i) => i.title === title);
      const same = deepEqual(before, afterItem);
      if (!same) {
        console.log(`[verify] Collaterals "${title}" unchanged: NO`);
        ok = false;
      }
    }
    console.log(`[verify] Other ${unchangedCollateralTitles.length} Collaterals entries unchanged: ${unchangedCollateralTitles.every((t) => deepEqual(collaterals.find((i) => i.title === t), after.data.COLLATERALS_ITEMS.find((i) => i.title === t))) ? 'YES' : 'NO'}`);

    const complianceSame = deepEqual(after.data.COMPLIANCES_ITEMS, compliances);
    console.log(`[verify] COMPLIANCES_ITEMS (all 8) unchanged: ${complianceSame ? 'YES' : 'NO'}`);
    if (!complianceSame) ok = false;

    const awardsSame = deepEqual(after.data.AWARDS_ITEMS, awards);
    console.log(`[verify] AWARDS_ITEMS unchanged: ${awardsSame ? 'YES' : 'NO'}`);
    if (!awardsSame) ok = false;

    const sectionsSame = deepEqual(after.data.CREDIBILITY_SECTIONS, data.CREDIBILITY_SECTIONS);
    const seoSame = deepEqual(after.data.SEO, data.SEO);
    console.log(`[verify] CREDIBILITY_SECTIONS unchanged: ${sectionsSame ? 'YES' : 'NO'}`);
    console.log(`[verify] SEO unchanged: ${seoSame ? 'YES' : 'NO'}`);
    if (!sectionsSame || !seoSame) ok = false;

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
