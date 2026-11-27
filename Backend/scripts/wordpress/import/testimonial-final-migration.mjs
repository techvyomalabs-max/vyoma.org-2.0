// QA Bug 19 — Stage 7 (+ Stage 7 focused safety corrections): final,
// approved testimonial migration script.
//
// Scope: ONLY data.TESTIMONIALS_ALL and data.TESTIMONIALS_FEATURED on the
// dual Content documents {type:'pages/media'} and {type:'media'}, and ONLY
// data.HOME_TESTIMONIALS on {type:'pages/home'} — the same dual-type-sync /
// narrow-field-update pattern already proven by where-sanskrit-migration.mjs
// (see that file's own header comment). Does NOT touch any other data key on
// any of the three documents — proven before writing (pre-write diff check)
// and re-proven after writing (post-write verification), exactly like that
// precedent script.
//
// Three DISTINCT safety layers, not to be confused with one another:
//   A. A fresh FULL TEST database backup (mongodump) — a later stage, not
//      performed by this script.
//   B. A successful ISOLATED RESTORE VERIFICATION of that backup into a
//      disposable database — also a later stage, not performed here.
//   C. An IMMEDIATE PRE-CHANGE SNAPSHOT of exactly the three affected
//      Content documents, taken by THIS script, in THIS run, right before
//      the transaction — see takePreChangeSnapshot() below. This is the one
//      thing this script actually does itself; A and B are evidenced via
//      TESTIMONIAL_MIGRATION_EVIDENCE_PATH (see verifyCommitEvidence in
//      testimonialMigrationLogic.mjs) but never performed by this script.
//
// Source of truth: the final, user-approved manifest
// (testimonial-final-approved-manifest.json), pinned below by its exact
// SHA256 so this script can never silently run against a modified or
// different manifest. The manifest itself is NOT committed to this repo (it
// lives in a durable backup location outside the repo, per the standing
// safety rules for this engagement).
//
// Manifest supply: set TESTIMONIAL_MIGRATION_MANIFEST_PATH to the absolute
// path of testimonial-final-approved-manifest.json on whichever machine runs
// this script. There is no default/fallback path.
//
// Pre-change snapshot supply (commit mode only): set
// TESTIMONIAL_MIGRATION_PRECHANGE_BACKUP_DIR to a durable directory OUTSIDE
// this repository. A fresh, uniquely-timestamped subfolder is created under
// it on every commit attempt; an existing snapshot file is never overwritten.
//
// Modes:
//   node testimonial-final-migration.mjs            -> dry-run (default,
//                                                        read-only, never
//                                                        writes, never
//                                                        starts a session)
//   node testimonial-final-migration.mjs --commit   -> performs the real,
//                                                        atomic write, ONLY
//                                                        after every safety
//                                                        check below passes
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import mongoose from 'mongoose';

import { disconnectDb } from '../../../src/config/db.js';
import {
  requireExplicitAtlasTestTarget,
  assertConnectedToExpectedDatabase,
  MIGRATION_TARGET_ENV_VAR,
} from './migrationTargetGuard.mjs';
import { pruneOldRevisions } from '../../../src/modules/content/content.admin.controller.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { ContentRevisionModel } from '../../../src/modules/content/contentRevision.model.js';
import { AuditLogModel } from '../../../src/modules/audit/auditLog.model.js';
import { validateTestimonialContent } from '../../../src/modules/content/validateTestimonialContent.js';
import {
  TARGET_CONTENT_TYPES,
  MEDIA_TWIN_TYPES,
  HOME_TYPE,
  loadManifest,
  extractManifestPayload,
  validateManifestPayload,
  assessBaseline,
  computeBaselineFingerprint,
  verifyCommitEvidence,
  assertExpectedClusterHost,
  verifyPostWrite,
  redactUri,
  sha256File,
  deepEqual,
  assertNoDuplicateDocuments,
  shouldCommit,
  buildPreChangeSnapshotPayload,
  writePreChangeSnapshot,
  verifyPreChangeSnapshotMatchesBaseline,
} from '../../../src/modules/content/testimonialMigrationLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, '../../reports');
// Backend/scripts/wordpress/import -> Backend/scripts/wordpress -> Backend/scripts -> Backend -> repo root.
const REPO_ROOT = path.resolve(__dirname, '../../../..');

// Pinned to the final, user-approved manifest
// (testimonial-final-approved-manifest.json, generated 2026-11-27, 86
// unique testimonials). Never read from an env var — an operator cannot
// repoint this script at a *different* manifest's hash without editing this
// committed source file, which is the point.
export const EXPECTED_MANIFEST_SHA256 = '772a8c146d8efd5052f4c9e1298b0743812918a9d23dcc770c3e7ad2256c2621';

const CONNECTION_OPTIONS = { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 };

// ---------------------------------------------------------------------------
// Migration-specific, session-aware revision + audit writers.
//
// recordMigrationRevision() (migrationRevision.mjs) and recordAudit()
// (audit.service.js) are both SHARED helpers used by ordinary admin-CMS code
// paths too, and neither accepts a mongoose session — recordAudit is also
// deliberately fire-and-forget (a failed audit write must never block an
// admin's real action, per its own header comment). Per this correction's
// explicit instruction not to modify shared helpers without separate
// approval, these two functions are a narrowly-scoped, migration-only
// reimplementation: same data shape and `action:'migration'` convention as
// the shared ones, but (a) accepts and uses the SAME session as the content
// write, and (b) THROWS on failure instead of swallowing it — a deliberate,
// intentional divergence from recordAudit's forgiving semantics, because
// THIS instruction requires an audit-write failure to abort the whole
// transaction, which is a stronger guarantee than ordinary admin actions
// need or want.
// ---------------------------------------------------------------------------
export async function createMigrationRevisionInSession(session, { contentType, data, scriptName, details = {} }) {
  const lastRevision = await ContentRevisionModel.findOne({ contentType }).sort({ version: -1 }).session(session).lean();
  const nextVersion = (lastRevision?.version || 0) + 1;
  const created = await ContentRevisionModel.create(
    [
      {
        contentType,
        version: nextVersion,
        data,
        action: 'migration',
        publishedBy: null,
        publishedByEmail: null,
        details: { source: 'migration-script', scriptName, ...details },
      },
    ],
    { session }
  );
  if (!created?.[0]) throw new Error(`Failed to create a migration revision row for "${contentType}" — aborting.`);
  return created[0];
}

export async function createMigrationAuditLogInSession(session, { action, targetType, targetId, details = {} }) {
  const created = await AuditLogModel.create(
    [{ actorId: null, actorEmail: 'testimonial-migration-script', action, targetType, targetId, details, ip: null }],
    { session }
  );
  if (!created?.[0]) throw new Error('Failed to create the migration audit log entry — aborting.');
  return created[0];
}

// ---------------------------------------------------------------------------
// Optimistic-concurrency guarded write.
//
// Mongoose's DEFAULT `__v` versioning only increments on specific array-
// mutating operations — NOT on a plain `doc.data = x; doc.save()` reassignment
// of a Mixed-type field, which is exactly what publishContent()/
// restoreRevision() do. Confirmed by direct code reading of both: neither
// touches an array path mongoose's versioning plugin tracks, so `__v` alone
// could stay unchanged across a concurrent publish/restore that DID change
// `data` — an unreliable guard. `updatedAt` (from this schema's own
// `{ timestamps: true }` option) is refreshed by mongoose on EVERY write
// path to this collection, with no such carve-out, so it is used here as
// the primary guard condition; `__v` is still incremented on every guarded
// write too, for whatever other code might reasonably rely on it, but it is
// no longer the thing this filter matches on.
// ---------------------------------------------------------------------------
export async function performGuardedWrites(session, writes) {
  for (const w of writes) {
    if (!w.before?.updatedAt) {
      throw new Error(`Guarded write for "${w.type}" is missing a baseline updatedAt timestamp — refusing an unguarded write.`);
    }
    const res = await ContentModel.findOneAndUpdate(
      { _id: w.before._id, updatedAt: w.before.updatedAt },
      { $set: { data: w.nextData }, $inc: { __v: 1 } },
      { session, new: true }
    );
    if (!res) {
      throw new Error(
        `Guarded update rejected for "${w.type}" — the document changed since it was read (stale baseline / concurrent ` +
          'update, detected via updatedAt). Aborting the entire transaction.'
      );
    }
  }
}

// Re-reads each document WITHIN the same still-open session/transaction and
// confirms it now holds exactly the intended data — BEFORE the transaction
// is allowed to commit. A mismatch here throws, which aborts the whole
// transaction before anything becomes visible to any other reader.
export async function verifyWritesWithinSession(session, writes) {
  for (const w of writes) {
    const doc = await ContentModel.findOne({ _id: w.before._id }).session(session).lean();
    if (!doc || !deepEqual(doc.data, w.nextData)) {
      throw new Error(
        `Pre-commit verification failed for "${w.type}" — the written data does not match the intended payload within ` +
          'the transaction. Aborting before commit.'
      );
    }
  }
}

function writeReport(dir, lines) {
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(dir, `testimonial-migration-dryrun-${timestamp}.txt`);
  fs.writeFileSync(reportPath, lines.join('\n') + '\n');
  return reportPath;
}

// Immediate pre-change document snapshot (safety layer C — see header
// comment). Takes the exact three baseline docs already read this run,
// writes them to a fresh, non-conflicting, timestamped file OUTSIDE the
// repo, reads it back, SHA256-verifies it, and re-confirms the written
// snapshot matches the exact baseline being migrated — all before any
// mutation is attempted. Throws (never silently continues) on any failure.
export function takePreChangeSnapshot(backupDir, docs) {
  const payload = buildPreChangeSnapshotPayload(docs);
  const filename = `testimonial-migration-prechange-${payload.capturedAt.replace(/[:.]/g, '-')}.json`;
  const written = writePreChangeSnapshot({ dir: backupDir, filename, payload, repoRoot: REPO_ROOT });
  if (!verifyPreChangeSnapshotMatchesBaseline(JSON.parse(written.text), docs)) {
    throw new Error('Pre-change snapshot content does not match the exact baseline being migrated — refusing to proceed.');
  }
  return { ...written, payload };
}

// Re-reads all three destination documents WITHIN the already-open
// session/transaction and recomputes the SAME comprehensive fingerprint
// (content + draft state + document identity + metadata — see
// computeBaselineFingerprint's own comment) that was captured before the
// transaction began, throwing if it no longer matches. This is deliberately
// NOT just an updatedAt/__v check on each individual document (that is what
// performGuardedWrites already does, per-document, as the actual guarded
// write condition) — this is a SEPARATE, holistic re-verification of the
// exact approved baseline across all three documents together, immediately
// before any write is attempted inside the transaction.
export async function verifyBaselineWithinSession(session, expectedFingerprint) {
  const [pagesMediaDoc, mediaDoc, pagesHomeDoc] = await Promise.all(
    TARGET_CONTENT_TYPES.map((type) => ContentModel.findOne({ type }).session(session).lean())
  );
  const actualFingerprint = computeBaselineFingerprint({ pagesMediaDoc, mediaDoc, pagesHomeDoc });
  if (actualFingerprint !== expectedFingerprint) {
    throw new Error(
      'Baseline re-verification failed WITHIN the transaction — the content, draft state, document identity, or metadata ' +
        'of at least one destination document no longer matches the exact baseline fingerprint computed before this ' +
        'transaction began. Aborting before any write is attempted.'
    );
  }
  return { pagesMediaDoc, mediaDoc, pagesHomeDoc };
}

// ---------------------------------------------------------------------------
// The actual DB-touching orchestration, extracted out of main() so isolated
// tests can exercise it directly against a MOCKED ContentModel / mongoose
// session (via node:test's t.mock.method on the already-imported models —
// the same established pattern as content.admin.controller.isolated.test.js),
// with zero real database connection. Returns a structured result instead of
// calling process.exit itself, so a test can assert on the outcome directly.
// `main()` below is a thin CLI wrapper around this.
// ---------------------------------------------------------------------------
export async function orchestrateMigration({ commit, payload, manifestSha256, evidencePath, preChangeBackupDir, reportDir, log = [] }) {
  const say = (line) => log.push(line);

  // --- Duplicate-destination-document check (defense in depth) -----------
  const countsByType = {};
  for (const type of TARGET_CONTENT_TYPES) {
    countsByType[type] = await ContentModel.countDocuments({ type });
  }
  const dupeCheck = assertNoDuplicateDocuments(countsByType);
  if (!dupeCheck.ok) {
    say('BLOCKED (duplicate destination document):');
    dupeCheck.errors.forEach((e) => say(' - ' + e));
    return { outcome: 'blocked', errors: dupeCheck.errors, log };
  }

  // --- Read current baseline (read-only) ----------------------------------
  const [pagesMediaDoc, mediaDoc, pagesHomeDoc] = await Promise.all(
    TARGET_CONTENT_TYPES.map((type) => ContentModel.findOne({ type }).lean())
  );
  const assessment = assessBaseline({ pagesMediaDoc, mediaDoc, pagesHomeDoc }, payload);
  if (assessment.state === 'blocked') {
    say('BLOCKED (baseline check):');
    assessment.errors.forEach((e) => say(' - ' + e));
    return { outcome: 'blocked', errors: assessment.errors, log };
  }
  if (assessment.state === 'noop') {
    say('[OK] All three destination documents already exactly match the approved final payload — explicit NO-OP.');
    return { outcome: 'noop', errors: [], log };
  }
  say('[OK] Baseline confirmed: fresh (not-yet-migrated), matches the known reviewed demo baseline, no pending drafts, twins match.');

  const baselineFingerprint = computeBaselineFingerprint({ pagesMediaDoc, mediaDoc, pagesHomeDoc });
  say(`[OK] Baseline fingerprint: ${baselineFingerprint}`);

  // --- Pre-write "every other key unchanged" self-check -------------------
  for (const [label, before, after] of [
    ['pages/media', pagesMediaDoc.data, assessment.intendedMedia],
    ['media', mediaDoc.data, assessment.intendedMedia],
    ['pages/home', pagesHomeDoc.data, assessment.intendedHome],
  ]) {
    const { TESTIMONIALS_ALL: _a1, TESTIMONIALS_FEATURED: _f1, HOME_TESTIMONIALS: _h1, ...restBefore } = before || {};
    const { TESTIMONIALS_ALL: _a2, TESTIMONIALS_FEATURED: _f2, HOME_TESTIMONIALS: _h2, ...restAfter } = after || {};
    if (!deepEqual(restBefore, restAfter)) {
      say(`ABORT: internal check failed — some key other than the testimonial fields would change on "${label}".`);
      return { outcome: 'internal-check-failed', errors: [`Unrelated key would change on "${label}".`], log };
    }
  }
  say('[OK] Confirmed (pre-write): every other data key on all three documents is untouched by the planned write.');
  say(`Intended: TESTIMONIALS_ALL -> 86, TESTIMONIALS_FEATURED -> 3 on ${MEDIA_TWIN_TYPES.join(', ')}; HOME_TESTIMONIALS -> 7 on ${HOME_TYPE}.`);
  say(`manifestSha256=${manifestSha256}`);
  say(`baselineFingerprint=${baselineFingerprint}`);

  if (!commit) {
    say('DRY-RUN complete: no writes were made.');
    const reportPath = writeReport(reportDir, log);
    const reportSha256 = sha256File(reportPath);
    return { outcome: 'dry-run', errors: [], log, reportPath, reportSha256, baselineFingerprint };
  }

  // --- Commit mode: require independently-verified evidence --------------
  if (!evidencePath || !fs.existsSync(evidencePath)) {
    return { outcome: 'missing-evidence', errors: ['TESTIMONIAL_MIGRATION_EVIDENCE_PATH must point to an existing evidence JSON file.'], log };
  }
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  } catch {
    return { outcome: 'invalid-evidence', errors: ['Evidence file is not valid JSON.'], log };
  }
  const evidenceCheck = verifyCommitEvidence(evidence, { expectedManifestSha256: manifestSha256, expectedBaselineFingerprint: baselineFingerprint });
  if (!evidenceCheck.ok) {
    return { outcome: 'invalid-evidence', errors: evidenceCheck.errors, log };
  }
  say('[OK] Commit evidence verified.');

  // --- Immediate pre-change snapshot (safety layer C) — BEFORE any mutation ---
  let snapshot;
  try {
    snapshot = takePreChangeSnapshot(preChangeBackupDir, { pagesMediaDoc, mediaDoc, pagesHomeDoc });
  } catch (e) {
    return { outcome: 'backup-failed', errors: [e.message], log };
  }
  say(`[OK] Pre-change snapshot written and verified: ${snapshot.path} (sha256 ${snapshot.sha256}).`);

  // --- Atomic, guarded, multi-document write + revision + audit + ---------
  // --- pre-commit verification, all in ONE session/transaction -----------
  const writes = [
    { type: 'pages/media', before: pagesMediaDoc, nextData: assessment.intendedMedia },
    { type: 'media', before: mediaDoc, nextData: assessment.intendedMedia },
    { type: 'pages/home', before: pagesHomeDoc, nextData: assessment.intendedHome },
  ];
  const session = await mongoose.startSession();
  const createdRevisionIds = [];
  try {
    await session.withTransaction(async () => {
      // Holistic re-verification of the EXACT approved baseline (content +
      // draft state + identity + metadata), re-read from WITHIN this
      // transaction, before anything is written — see
      // verifyBaselineWithinSession's own comment for why this is not
      // redundant with performGuardedWrites' own per-document updatedAt guard.
      await verifyBaselineWithinSession(session, baselineFingerprint);
      await performGuardedWrites(session, writes);
      for (const w of writes) {
        const rev = await createMigrationRevisionInSession(session, { contentType: w.type, data: w.nextData, scriptName: 'testimonial-final-migration.mjs', details: { manifestSha256 } });
        createdRevisionIds.push(rev._id);
      }
      await createMigrationAuditLogInSession(session, {
        action: 'content.testimonial_migration',
        targetType: 'Content',
        targetId: 'pages/media,media,pages/home',
        details: { manifestSha256, baselineFingerprint },
      });
      await verifyWritesWithinSession(session, writes);
    });
  } catch (e) {
    return { outcome: 'transaction-aborted', errors: [e.message], log };
  } finally {
    await session.endSession();
  }
  say('[COMMIT] All three destination documents, their migration revisions, and the audit log entry were committed atomically.');

  // Best-effort retention cleanup — bounded to MAX_REVISIONS_PER_TYPE per
  // type, identical to the admin controller's own publish/restore behavior.
  // By construction this can NEVER remove the revision row this exact run
  // just created: pruneOldRevisions() only ever deletes rows ranked beyond
  // the TOP `MAX_REVISIONS_PER_TYPE` by version number, and the row just
  // created always has the HIGHEST version for its type (version = last+1)
  // — so it is always rank 1, never among the pruned rows. Verified anyway,
  // defensively, rather than assumed: if this were ever violated by a future
  // change to pruneOldRevisions, this check (not a silent loss) would catch it.
  for (const type of TARGET_CONTENT_TYPES) {
    try {
      await pruneOldRevisions(type);
    } catch (e) {
      say(`[WARNING] Best-effort revision pruning failed for "${type}" (non-fatal): ${e.message}`);
    }
  }
  const survivingCount = await ContentRevisionModel.countDocuments({ _id: { $in: createdRevisionIds } });
  if (survivingCount !== createdRevisionIds.length) {
    say(
      `[CRITICAL WARNING] This migration's OWN just-created revision row(s) were removed by post-commit pruning ` +
        `(expected ${createdRevisionIds.length} to survive, found ${survivingCount}) — this should be structurally ` +
        'impossible (see comment above); investigate pruneOldRevisions() immediately. The content write itself still ' +
        'committed successfully, but migration-recovery revision history has been lost.'
    );
  } else {
    say(`[OK] Confirmed: all ${createdRevisionIds.length} migration revision rows survived post-commit pruning.`);
  }

  // --- Post-write verification (outside the transaction, independent re-read) ---
  const [pagesMediaAfter, mediaAfter, pagesHomeAfter] = await Promise.all(
    TARGET_CONTENT_TYPES.map((type) => ContentModel.findOne({ type }).lean())
  );
  const postCheck = verifyPostWrite({ pagesMediaAfter, mediaAfter, pagesHomeAfter }, assessment);
  if (!postCheck.ok) {
    say('[WARNING] Post-write verification FAILED — do not report this migration as successful.');
    return { outcome: 'post-write-failed', errors: postCheck.errors, log };
  }
  say('COMMIT complete, all post-write verifications passed.');
  return { outcome: 'committed', errors: [], log };
}

export async function main() {
  const commit = shouldCommit(process.argv);
  const log = [];
  console.log('='.repeat(72));
  console.log(`Final testimonial migration — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('='.repeat(72));

  // --- Manifest load + integrity pin (no DB connection yet) ---------------
  const manifestPath = process.env.TESTIMONIAL_MIGRATION_MANIFEST_PATH;
  const { manifest } = loadManifest(manifestPath, EXPECTED_MANIFEST_SHA256);
  console.log(`[OK] Manifest loaded and SHA256-verified: ${EXPECTED_MANIFEST_SHA256}`);

  const payload = extractManifestPayload(manifest);
  const { errors: manifestErrors, byType, byCategory } = validateManifestPayload(payload);
  if (manifestErrors.length) {
    console.error('VALIDATION FAILED (manifest self-check):');
    manifestErrors.forEach((e) => console.error(' - ' + e));
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 86 unique (${JSON.stringify(byType)}), categories ${JSON.stringify(byCategory)}.`);

  // --- Per-item + per-array validation against the real committed validator ---
  let allPass = 0, allFail = 0;
  for (const item of payload.TESTIMONIALS_ALL) {
    const err = validateTestimonialContent('pages/media', { TESTIMONIALS_FEATURED: [], TESTIMONIALS_ALL: [item] }, null);
    if (err) { allFail++; console.error(`  [FAIL] TESTIMONIALS_ALL ${item.id} -> ${err}`); } else { allPass++; }
  }
  let homePass = 0, homeFail = 0;
  for (const item of payload.HOME_TESTIMONIALS) {
    const err = validateTestimonialContent('pages/home', { HOME_TESTIMONIALS: [item] }, null);
    if (err) { homeFail++; console.error(`  [FAIL] HOME_TESTIMONIALS ${item.id} -> ${err}`); } else { homePass++; }
  }
  let featPass = 0, featFail = 0;
  for (const item of payload.TESTIMONIALS_FEATURED) {
    const err = validateTestimonialContent('pages/media', { TESTIMONIALS_FEATURED: [item], TESTIMONIALS_ALL: [] }, null);
    if (err) { featFail++; console.error(`  [FAIL] TESTIMONIALS_FEATURED ${item.id} -> ${err}`); } else { featPass++; }
  }
  const fullMediaErr = validateTestimonialContent('pages/media', { TESTIMONIALS_ALL: payload.TESTIMONIALS_ALL, TESTIMONIALS_FEATURED: payload.TESTIMONIALS_FEATURED }, null);
  const fullHomeErr = validateTestimonialContent('pages/home', { HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS }, null);
  console.log(`[OK] Per-item validation: ALL ${allPass}/${payload.TESTIMONIALS_ALL.length}, HOME ${homePass}/${payload.HOME_TESTIMONIALS.length}, FEATURED ${featPass}/${payload.TESTIMONIALS_FEATURED.length}.`);
  if (allFail || homeFail || featFail || fullMediaErr || fullHomeErr) {
    console.error('ABORT — validation failed, no database connection was made.');
    process.exitCode = 1;
    return;
  }

  // --- Target guard: database name + CONFIRM + our own extra cluster-host layer ---
  const { uri, dbName } = requireExplicitAtlasTestTarget();
  assertExpectedClusterHost(uri);
  console.log(`[OK] Target pre-connection checks passed. Target database: ${dbName}.`);

  await mongoose.connect(uri, CONNECTION_OPTIONS);
  try {
    assertConnectedToExpectedDatabase(mongoose.connection, dbName);
    console.log(`[OK] Connected (URI never logged). Verified connected database: ${dbName}.`);

    const result = await orchestrateMigration({
      commit,
      payload,
      manifestSha256: EXPECTED_MANIFEST_SHA256,
      evidencePath: process.env.TESTIMONIAL_MIGRATION_EVIDENCE_PATH,
      preChangeBackupDir: process.env.TESTIMONIAL_MIGRATION_PRECHANGE_BACKUP_DIR,
      reportDir: REPORT_DIR,
    });
    result.log.forEach((line) => console.log(line));
    result.errors.forEach((e) => console.error(' - ' + e));

    if (result.outcome === 'dry-run') {
      console.log(`\nDry-run report: ${result.reportPath} (sha256 ${result.reportSha256})`);
      console.log(`Baseline fingerprint: ${result.baselineFingerprint}`);
      console.log('Re-run with --commit (and TESTIMONIAL_MIGRATION_EVIDENCE_PATH / TESTIMONIAL_MIGRATION_PRECHANGE_BACKUP_DIR set) to perform this migration for real.');
      return;
    }
    if (result.outcome === 'noop' || result.outcome === 'committed') {
      return;
    }
    // Every other outcome is a failure/abort.
    process.exitCode = 1;
  } finally {
    await disconnectDb();
  }
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('UNEXPECTED ERROR:', redactUri(err?.message, process.env[MIGRATION_TARGET_ENV_VAR]));
    process.exitCode = 1;
  });
}
