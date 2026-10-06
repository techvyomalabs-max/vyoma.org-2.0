// Remaining legacy redirect batch — approved 26 rules only.
//
// READ/WRITE scope: ONLY the Redirect collection. No other collection is
// ever touched by this script (no Content, BlogPost, DonationScheme,
// Settings, User, FormSubmission, or Media writes/reads beyond what's
// needed to print a scope-safety report).
//
// Same approach as Batch 2's redirect creation (batch2-import.mjs): direct
// RedirectModel writes via a one-off script, dry-run by default, idempotent
// (a rule that already exists with the identical toPath is skipped, not
// re-inserted; a rule that exists with a DIFFERENT toPath aborts the whole
// run rather than silently overwriting it).
//
// Modes:
//   node batch-redirects-remaining.mjs            -> dry-run (default)
//   node batch-redirects-remaining.mjs --commit   -> performs the real insert

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { RedirectModel } from '../../../src/modules/redirects/redirect.model.js';

const APPROVED_RULES = [
  { fromPath: '/about/', toPath: '/about' },
  { fromPath: '/contact/', toPath: '/contact' },
  { fromPath: '/events/', toPath: '/media/events' },
  { fromPath: '/newsletter/', toPath: '/media/newsletter' },
  { fromPath: '/volunteers/', toPath: '/join-us/volunteer' },
  { fromPath: '/csr-projects/', toPath: '/join-us/csr-projects' },
  { fromPath: '/corpus/', toPath: '/join-us/corpus-fund' },
  { fromPath: '/internships/', toPath: '/join-us/internship' },
  { fromPath: '/compliances_registrations/', toPath: '/credibility/compliances-registrations' },
  { fromPath: '/collaterals/', toPath: '/credibility/collaterals' },
  { fromPath: '/annual_reports/', toPath: '/credibility/annual-reports' },
  { fromPath: '/social-impact-report/', toPath: '/credibility/social-impact-report' },
  { fromPath: '/awards/', toPath: '/credibility/awards-recognition' },
  { fromPath: '/media/', toPath: '/media' },
  { fromPath: '/team/', toPath: '/about/core-team' },
  { fromPath: '/leadership/', toPath: '/about/leadership' },
  { fromPath: '/testimonials/', toPath: '/media/testimonials' },
  { fromPath: '/vidya_danam_dm/', toPath: '/donate/vidya-danam' },
  { fromPath: '/grantha-danam-2/', toPath: '/donate/grantha-danam' },
  { fromPath: '/generaldonation/', toPath: '/donate/general-donation' },
  { fromPath: '/eventscontribution/', toPath: '/donate/events-and-projects' },
  { fromPath: '/samskritsabhaujjeevanam/', toPath: '/donate/sabha-ujjivanam' },
  { fromPath: '/teachers/', toPath: '/donate/guru-dakshina' },
  { fromPath: '/scholarship-rewards/', toPath: '/donate/vidyarthi-nidhi' },
  { fromPath: '/nourishment/', toPath: '/donate/anna-danam' },
  { fromPath: '/vsp/', toPath: '/donate/bala-gurukulam' },
].map((r) => ({ ...r, statusCode: 301, notes: 'Remaining legacy redirect batch (approved, non-deferred set).' }));

function checkSafety(candidates) {
  const errors = [];
  const bySource = new Map(candidates.map((c) => [c.fromPath, c]));
  for (const c of candidates) {
    if (c.fromPath === c.toPath) errors.push(`Self-loop: ${c.fromPath}`);
    const reverse = bySource.get(c.toPath);
    if (reverse && reverse.toPath === c.fromPath) errors.push(`Direct two-rule reversal: ${c.fromPath} <-> ${c.toPath}`);
  }
  const seen = new Set();
  for (const c of candidates) {
    if (seen.has(c.fromPath)) errors.push(`Duplicate source within this batch: ${c.fromPath}`);
    seen.add(c.fromPath);
  }
  return errors;
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Remaining-redirects batch — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('='.repeat(72));

  if (APPROVED_RULES.length !== 26) {
    console.error(`\nABORT: expected exactly 26 approved rules, found ${APPROVED_RULES.length}.`);
    process.exitCode = 1;
    return;
  }

  const inBatchErrors = checkSafety(APPROVED_RULES);
  if (inBatchErrors.length) {
    console.error('\nVALIDATION FAILED (in-batch safety check):');
    for (const e of inBatchErrors) console.error(' -', e);
    process.exitCode = 1;
    return;
  }
  console.log('[OK] 26 approved rules pass in-batch duplicate/self-loop/reversal checks.');

  if (commit) {
    console.log(
      '\n[REMINDER] This will write to the configured MongoDB (Redirect collection only). Take a backup first if you have not.\n'
    );
  }

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const existingCount = await RedirectModel.countDocuments({});
    console.log(`[OK] Current Redirect count: ${existingCount} (expect 25).`);
    if (existingCount !== 25) {
      console.error('\nABORT: expected exactly 25 existing redirects before this batch — found a different count.');
      process.exitCode = 1;
      return;
    }

    const existing = await RedirectModel.find({ fromPath: { $in: APPROVED_RULES.map((r) => r.fromPath) } }).lean();
    const existingBySource = new Map(existing.map((r) => [r.fromPath, r]));
    const toCreate = [];
    const conflicts = [];
    for (const rule of APPROVED_RULES) {
      const already = existingBySource.get(rule.fromPath);
      if (!already) {
        toCreate.push(rule);
      } else if (already.toPath !== rule.toPath) {
        conflicts.push({ fromPath: rule.fromPath, existingToPath: already.toPath, candidateToPath: rule.toPath });
      }
      // else: already exists with the identical toPath — idempotent no-op, not re-inserted.
    }
    if (conflicts.length) {
      console.error('\nABORT: the following rule(s) already exist with a DIFFERENT destination:');
      for (const c of conflicts) console.error(`  - ${c.fromPath}: existing -> ${c.existingToPath}, candidate -> ${c.candidateToPath}`);
      process.exitCode = 1;
      return;
    }
    console.log(`[OK] None of the 26 fromPaths already exist (0 conflicts, 0 already-present).`);

    console.log('\n--- Intended operation ---');
    console.log(`Insert ${toCreate.length} new Redirect record(s), all statusCode 301.`);

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this insert for real.');
      return;
    }

    if (toCreate.length) {
      await RedirectModel.insertMany(toCreate);
    }
    console.log(`\n[COMMIT] Inserted ${toCreate.length} Redirect record(s).`);

    const finalCount = await RedirectModel.countDocuments({});
    console.log(`Final Redirect count: ${finalCount} (expect 51).`);
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
