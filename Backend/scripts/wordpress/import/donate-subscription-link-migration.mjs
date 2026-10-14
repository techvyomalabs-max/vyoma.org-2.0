// WordPress -> MERN fix: restore the real destination for the "Annual
// Subscription Plan" button on /donate, which previously had no href at
// all (a dead button).
//
// Source: the live WordPress donation hub (https://vyoma.org/donors/,
// WXR post_id 7548) has a button with the exact text "Annual Subscription
// Plan - Donate Now" linking to https://rzp.io/l/QY77Y4TDc -- confirmed
// live right now (resolves to a real, active Razorpay payment page:
// https://pages.razorpay.com/pl_NzykS36jImWiGD/view). This restores
// navigation to that existing, verified external page; it does not create
// any new recurring-payment system.
//
// Scope: data.OTHER_WAYS.subscriptionCtaHref on {type: 'pages/donate'}
// only. Does not touch any other field.
//
// Modes:
//   node donate-subscription-link-migration.mjs            -> dry-run (default)
//   node donate-subscription-link-migration.mjs --commit    -> real write

import fs from 'node:fs';
import path from 'node:path';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const BACKUP_DIR = 'C:\\Users\\Dell\\vyoma-migration-backups';
const TYPE = 'pages/donate';
const HREF = 'https://rzp.io/l/QY77Y4TDc';

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const commit = process.argv.includes('--commit');
  console.log('='.repeat(72));
  console.log(`Donate subscription-link fix -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log(`Scope: data.OTHER_WAYS.subscriptionCtaHref = "${HREF}" on {type: '${TYPE}'}.`);
  console.log('='.repeat(72));

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const doc = await ContentModel.findOne({ type: TYPE }).lean();
    if (!doc) {
      console.error(`\nVALIDATION FAILED: no Content document found for type "${TYPE}". ABORT.`);
      process.exitCode = 1;
      return;
    }
    if (doc.draftData != null) {
      console.error(`\nVALIDATION FAILED: Content "${TYPE}" has a non-null draftData. ABORT.`);
      process.exitCode = 1;
      return;
    }
    if (!doc.data.OTHER_WAYS || typeof doc.data.OTHER_WAYS !== 'object') {
      console.error('\nVALIDATION FAILED: data.OTHER_WAYS is missing or not an object. ABORT.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Content document exists, no pending draftData, OTHER_WAYS present.');

    const currentHref = doc.data.OTHER_WAYS.subscriptionCtaHref;
    if (currentHref === HREF) {
      console.log('\n[OK] subscriptionCtaHref already set correctly -- nothing to do (safe re-run).');
      return;
    }
    if (currentHref !== undefined) {
      console.error(`\nVALIDATION FAILED: subscriptionCtaHref already has an unexpected value ("${currentHref}") -- aborting rather than overwrite blindly.`);
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Baseline confirmed -- subscriptionCtaHref not yet set.');

    const nextOtherWays = { ...doc.data.OTHER_WAYS, subscriptionCtaHref: HREF };
    const { OTHER_WAYS: _o1, ...restBefore } = doc.data;
    const { OTHER_WAYS: _o2, ...restAfter } = { ...doc.data, OTHER_WAYS: nextOtherWays };
    if (!deepEqual(restBefore, restAfter)) {
      console.error('\nABORT: internal check failed -- some key other than OTHER_WAYS would change. Aborting rather than risk it.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Confirmed (pre-write): every other data key is untouched by the planned write.');

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      return;
    }

    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `donate-subscription-link-migration-backup-${timestamp}.json`);
    fs.writeFileSync(backupPath, JSON.stringify({ [TYPE]: { data: doc.data, draftData: doc.draftData, status: doc.status } }, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup (outside the repo): ${backupPath}`);

    await ContentModel.updateOne({ type: TYPE }, { $set: { 'data.OTHER_WAYS': nextOtherWays } });
    console.log('[COMMIT] Set data.OTHER_WAYS.subscriptionCtaHref.');

    const after = await ContentModel.findOne({ type: TYPE }).lean();
    const match = after.data.OTHER_WAYS.subscriptionCtaHref === HREF;
    console.log(`[verify] subscriptionCtaHref matches: ${match ? 'YES' : 'NO'}`);
    const { OTHER_WAYS: _o3, ...restAfterCheck } = after.data;
    const { OTHER_WAYS: _o4, ...restBeforeCheck } = doc.data;
    const restSame = deepEqual(restAfterCheck, restBeforeCheck);
    console.log(`[verify] every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);

    if (!match || !restSame) {
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
