// WordPress -> MERN migration: the one verified real newsletter cover
// image that exists anywhere on the live site or in the full WXR export.
//
// Investigation (2026-10-14): searched the live Newsletter page
// (https://vyoma.org/newsletter/) and the complete WXR export for any
// cover/thumbnail image tied to an issue. Found exactly one:
// "Vol01_Dec2011.jpg", lazy-loaded on the live page next to the archive
// entry for Volume 1 (matches our "Dec 2011 · Vol. 1, Issue 1" entry
// exactly). No other of the 9 archive issues, the latest issue, or the 2
// special issues has any cover image anywhere -- per instruction, no
// placeholder/fabricated cover is added for those; they are left exactly
// as they are.
//
// Scope: data.NEWSLETTER_ARCHIVE -> the 2011 year entry's single issue
// gets a new `cover: {url}` field. Does not touch any other issue, year,
// or data key.
//
// Modes:
//   node newsletter-cover-migration.mjs            -> dry-run (default)
//   node newsletter-cover-migration.mjs --commit    -> real write

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPES = ['media', 'pages/media'];
const COVER_URL = 'https://vyoma.org/wp-content/uploads/2023/03/Vol01_Dec2011.jpg';
const TARGET_YEAR = '2011';
const TARGET_LABEL = 'Dec 2011 · Vol. 1, Issue 1';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log('='.repeat(72));
  console.log(`Newsletter cover migration -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: adds cover.url to the ${TARGET_YEAR} / "${TARGET_LABEL}" issue only, on {type:'media'} and {type:'pages/media'}.`);
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const docs = {};
    const errors = [];
    for (const type of TYPES) {
      const doc = await ContentModel.findOne({ type }).lean();
      if (!doc) errors.push(`No Content document found for type "${type}".`);
      else if (doc.draftData != null) errors.push(`Content "${type}" has a non-null draftData.`);
      else docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED:');
      for (const e of errors) console.error(' -', e);
      process.exitCode = 1;
      return;
    }
    if (!deepEqual(docs['media'].data, docs['pages/media'].data)) {
      console.error('\nVALIDATION FAILED: "media" and "pages/media" are not identical. ABORT.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, no pending draftData, confirmed identical.');

    const archive = docs['media'].data.NEWSLETTER_ARCHIVE;
    const yearEntry = archive.find((y) => y.year === TARGET_YEAR);
    if (!yearEntry) {
      console.error(`\nVALIDATION FAILED: no NEWSLETTER_ARCHIVE entry for year "${TARGET_YEAR}". ABORT.`);
      process.exitCode = 1;
      return;
    }
    const issueIdx = yearEntry.issues.findIndex((i) => i.label === TARGET_LABEL);
    if (issueIdx === -1) {
      console.error(`\nVALIDATION FAILED: no issue labeled "${TARGET_LABEL}" in year ${TARGET_YEAR}. ABORT.`);
      process.exitCode = 1;
      return;
    }
    const targetIssue = yearEntry.issues[issueIdx];
    if (targetIssue.cover?.url === COVER_URL) {
      console.log('\n[OK] Cover already set correctly -- nothing to do (safe re-run).');
      return;
    }
    if (targetIssue.cover !== undefined) {
      console.error(`\nVALIDATION FAILED: target issue already has an unexpected cover value. ABORT rather than overwrite blindly.`);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] Baseline confirmed -- target issue ("${targetIssue.title}") has no cover yet.`);

    const nextArchive = archive.map((y) =>
      y.year !== TARGET_YEAR
        ? y
        : { ...y, issues: y.issues.map((iss, i) => (i !== issueIdx ? iss : { ...iss, cover: { url: COVER_URL } })) }
    );

    for (const type of TYPES) {
      const { NEWSLETTER_ARCHIVE: _n1, ...restBefore } = docs[type].data;
      const { NEWSLETTER_ARCHIVE: _n2, ...restAfter } = { ...docs[type].data, NEWSLETTER_ARCHIVE: nextArchive };
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than NEWSLETTER_ARCHIVE would change on "${type}".`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, on both documents, is untouched by the planned write.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `newsletter-cover-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of TYPES) backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    for (const type of TYPES) {
      await ContentModel.updateOne({ type }, { $set: { 'data.NEWSLETTER_ARCHIVE': nextArchive } });
    }
    console.log('[COMMIT] Set cover on the 2011 issue, on both media and pages/media.');

    let ok = true;
    for (const type of TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const match = deepEqual(after.data.NEWSLETTER_ARCHIVE, nextArchive);
      console.log(`[verify] "${type}" NEWSLETTER_ARCHIVE matches: ${match ? 'YES' : 'NO'}`);
      if (!match) ok = false;
      const { NEWSLETTER_ARCHIVE: _n3, ...restAfter } = after.data;
      const { NEWSLETTER_ARCHIVE: _n4, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }

    if (!ok) {
      console.error('\n[WARNING] verification failed -- investigate before trusting this run.');
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
