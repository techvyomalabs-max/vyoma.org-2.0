// QA Bug 19 — Stage 7: isolated, DB-free coverage for
// testimonialMigrationLogic.mjs. Every test here is a pure-function call
// with plain fixture objects — no mongoose connection, no mocked database,
// no network activity of any kind (file-hash checks below operate only on
// temp files this test itself creates and deletes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  loadManifest,
  extractManifestPayload,
  validateManifestPayload,
  buildIntendedMediaData,
  buildIntendedHomeData,
  assessBaseline,
  computeBaselineFingerprint,
  verifyCommitEvidence,
  assertExpectedClusterHost,
  verifyPostWrite,
  redactUri,
  shouldCommit,
  assertNoDuplicateDocuments,
  sha256File,
  sha256String,
  deepEqual,
  COMMIT_CONFIRMATION_PHRASE,
  EXPECTED_ATLAS_CLUSTER_HOST,
  EXPECTED_TARGET_DB_NAME,
  EXPECTED_RESTORE_CHECK_DB_NAME,
  EXPECTED_DEMO_TESTIMONIALS_ALL,
  EXPECTED_DEMO_TESTIMONIALS_FEATURED,
  EXPECTED_DEMO_HOME_TESTIMONIALS,
  bsonSafeTransform,
  serializeDocForSnapshot,
  buildPreChangeSnapshotPayload,
  serializeSnapshotToText,
  writePreChangeSnapshot,
  verifyPreChangeSnapshotMatchesBaseline,
} from './testimonialMigrationLogic.mjs';

function tmpFile(content) {
  const p = path.join(os.tmpdir(), `tml-test-${crypto.randomBytes(8).toString('hex')}.json`);
  fs.writeFileSync(p, content);
  return p;
}

function tmpNamedFile(suffix, content) {
  const p = path.join(os.tmpdir(), `tml-test-${crypto.randomBytes(8).toString('hex')}${suffix}`);
  fs.writeFileSync(p, content);
  return p;
}

function validTestimonial(overrides = {}) {
  return { id: 't-1', sourceId: 's-1', type: 'text', category: 'learner', quote: 'A genuine quote.', name: 'Someone', active: true, ...overrides };
}

function minimalPayload() {
  return {
    TESTIMONIALS_ALL: Array.from({ length: 86 }, (_, i) => {
      const type = i < 65 ? 'text' : i < 67 ? 'video' : 'image';
      const base = { id: `t-${i}`, sourceId: `s-${i}`, type, category: 'learner', active: true };
      return type === 'text' ? { ...base, quote: 'q' } : type === 'video' ? { ...base, url: 'https://res.cloudinary.com/x/video/upload/v.mp4' } : { ...base, testimonialImage: { url: 'https://vyoma.org/x.jpg' } };
    }),
    HOME_TESTIMONIALS: Array.from({ length: 7 }, (_, i) => ({ id: `t-${i}`, sourceId: `s-${i}`, type: 'text', category: 'other', quote: 'q', active: true })),
    TESTIMONIALS_FEATURED: Array.from({ length: 3 }, (_, i) => ({ id: `t-${i}`, sourceId: `s-${i}`, type: 'text', category: 'other', quote: 'q', active: true })),
  };
}

// --- 7. Missing or invalid manifest hash ------------------------------------
test('loadManifest rejects a missing manifest path', () => {
  assert.throws(() => loadManifest('', 'deadbeef'), /must be supplied explicitly/);
});
test('loadManifest rejects a missing expected hash', () => {
  const p = tmpFile('{}');
  assert.throws(() => loadManifest(p, ''), /expected manifest SHA256 must be supplied/);
  fs.unlinkSync(p);
});
test('loadManifest rejects a nonexistent file', () => {
  assert.throws(() => loadManifest('/no/such/file.json', 'deadbeef'), /not found/);
});
test('loadManifest rejects a file whose SHA256 does not match', () => {
  const p = tmpFile('{"a":1}');
  assert.throws(() => loadManifest(p, '0'.repeat(64)), /integrity check FAILED/);
  fs.unlinkSync(p);
});
test('loadManifest accepts a file whose SHA256 exactly matches and parses its JSON', () => {
  const content = JSON.stringify({ hello: 'world' });
  const p = tmpFile(content);
  const expected = sha256String(content);
  const { manifest, sha256 } = loadManifest(p, expected);
  assert.deepEqual(manifest, { hello: 'world' });
  assert.equal(sha256, expected);
  fs.unlinkSync(p);
});

// --- extractManifestPayload --------------------------------------------------
test('extractManifestPayload rejects a manifest missing destination arrays', () => {
  assert.throws(() => extractManifestPayload({}), /missing one or more required destination arrays/);
});
test('extractManifestPayload strips _provenance from every array', () => {
  const manifest = {
    proposedDestinations: {
      TESTIMONIALS_ALL: [{ id: 'a', _provenance: { x: 1 } }],
      HOME_TESTIMONIALS: [{ id: 'b', _provenance: { x: 1 } }],
      TESTIMONIALS_FEATURED: [{ id: 'c', _provenance: { x: 1 } }],
    },
  };
  const payload = extractManifestPayload(manifest);
  assert.ok(!('_provenance' in payload.TESTIMONIALS_ALL[0]));
  assert.ok(!('_provenance' in payload.HOME_TESTIMONIALS[0]));
  assert.ok(!('_provenance' in payload.TESTIMONIALS_FEATURED[0]));
});

// --- 8. Incorrect manifest count ---------------------------------------------
test('validateManifestPayload rejects a TESTIMONIALS_ALL count other than 86', () => {
  const payload = minimalPayload();
  payload.TESTIMONIALS_ALL.pop();
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /Expected exactly 86/.test(e)));
});
test('validateManifestPayload rejects a HOME_TESTIMONIALS count other than 7', () => {
  const payload = minimalPayload();
  payload.HOME_TESTIMONIALS.pop();
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /Expected exactly 7/.test(e)));
});
test('validateManifestPayload rejects a TESTIMONIALS_FEATURED count other than 3', () => {
  const payload = minimalPayload();
  payload.TESTIMONIALS_FEATURED.pop();
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /Expected exactly 3/.test(e)));
});
test('validateManifestPayload accepts the exact approved 86/7/3, 65/2/19 shape', () => {
  const { errors, byType } = validateManifestPayload(minimalPayload());
  assert.deepEqual(errors, []);
  assert.deepEqual(byType, { text: 65, video: 2, image: 19 });
});

// --- 9. Duplicate stable IDs --------------------------------------------------
test('validateManifestPayload rejects a duplicate id within TESTIMONIALS_ALL', () => {
  const payload = minimalPayload();
  payload.TESTIMONIALS_ALL[1] = { ...payload.TESTIMONIALS_ALL[1], id: payload.TESTIMONIALS_ALL[0].id };
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /duplicate id/.test(e)));
});

// --- 10. Invalid testimonial payload -------------------------------------------
test('validateManifestPayload rejects an entry that is not active:true', () => {
  const payload = minimalPayload();
  payload.TESTIMONIALS_ALL[0] = { ...payload.TESTIMONIALS_ALL[0], active: false };
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /not active:true/.test(e)));
});

// --- 11. Incorrect Homepage or Featured mapping -------------------------------
test('validateManifestPayload rejects a HOME_TESTIMONIALS id absent from TESTIMONIALS_ALL', () => {
  const payload = minimalPayload();
  payload.HOME_TESTIMONIALS[0] = { ...payload.HOME_TESTIMONIALS[0], id: 'not-in-all' };
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /HOME_TESTIMONIALS id "not-in-all" is not present/.test(e)));
});
test('validateManifestPayload rejects a TESTIMONIALS_FEATURED id absent from TESTIMONIALS_ALL', () => {
  const payload = minimalPayload();
  payload.TESTIMONIALS_FEATURED[0] = { ...payload.TESTIMONIALS_FEATURED[0], id: 'not-in-all' };
  const { errors } = validateManifestPayload(payload);
  assert.ok(errors.some((e) => /TESTIMONIALS_FEATURED id "not-in-all" is not present/.test(e)));
});

// --- 22. Exact task-only field update scope -----------------------------------
test('buildIntendedMediaData preserves every unrelated key and replaces only the two testimonial fields', () => {
  const current = { NEWSLETTER_LATEST: { x: 1 }, GALLERY_ALBUMS: [1, 2], TESTIMONIALS_ALL: ['old'], TESTIMONIALS_FEATURED: ['old-f'] };
  const next = buildIntendedMediaData(current, { TESTIMONIALS_ALL: ['new'], TESTIMONIALS_FEATURED: ['new-f'] });
  assert.deepEqual(next.NEWSLETTER_LATEST, { x: 1 });
  assert.deepEqual(next.GALLERY_ALBUMS, [1, 2]);
  assert.deepEqual(next.TESTIMONIALS_ALL, ['new']);
  assert.deepEqual(next.TESTIMONIALS_FEATURED, ['new-f']);
});
test('buildIntendedHomeData preserves every unrelated key and replaces only HOME_TESTIMONIALS', () => {
  const current = { HERO_TITLE: 'x', STATS: [1], HOME_TESTIMONIALS: ['old'] };
  const next = buildIntendedHomeData(current, { HOME_TESTIMONIALS: ['new'] });
  assert.equal(next.HERO_TITLE, 'x');
  assert.deepEqual(next.STATS, [1]);
  assert.deepEqual(next.HOME_TESTIMONIALS, ['new']);
});
test('buildIntendedMediaData tolerates a null/undefined current data (fresh document)', () => {
  const next = buildIntendedMediaData(null, { TESTIMONIALS_ALL: ['a'], TESTIMONIALS_FEATURED: ['b'] });
  assert.deepEqual(next, { TESTIMONIALS_ALL: ['a'], TESTIMONIALS_FEATURED: ['b'] });
});

// --- fixtures for assessBaseline ---------------------------------------------
// Uses the REAL known/reviewed demo baseline (not an arbitrary placeholder)
// so these fixtures exercise the actual "unexpected existing content" guard
// the same way the real script does, rather than accidentally relying on a
// baseline the guard would itself reject.
function freshDocs() {
  const mediaData = {
    NEWS: 'x',
    TESTIMONIALS_ALL: EXPECTED_DEMO_TESTIMONIALS_ALL,
    TESTIMONIALS_FEATURED: EXPECTED_DEMO_TESTIMONIALS_FEATURED,
  };
  return {
    pagesMediaDoc: { _id: 'm1', __v: 0, updatedAt: new Date('2026-01-01T00:00:00.000Z'), data: mediaData, draftData: null, status: 'published' },
    mediaDoc: { _id: 'm2', __v: 0, updatedAt: new Date('2026-01-01T00:00:00.000Z'), data: { ...mediaData }, draftData: null, status: 'published' },
    pagesHomeDoc: { _id: 'h1', __v: 0, updatedAt: new Date('2026-01-01T00:00:00.000Z'), data: { HERO: 'x', HOME_TESTIMONIALS: EXPECTED_DEMO_HOME_TESTIMONIALS }, draftData: null, status: 'published' },
  };
}

// --- 12. Missing destination document -----------------------------------------
test('assessBaseline blocks when a destination document is missing', () => {
  const docs = freshDocs();
  docs.pagesHomeDoc = null;
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /Missing destination document for type "pages\/home"/.test(e)));
});

// --- 14. Pending draft rejection -----------------------------------------------
test('assessBaseline blocks when any destination document has a pending draft', () => {
  const docs = freshDocs();
  docs.mediaDoc.draftData = { something: true };
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /pending unpublished draft/.test(e)));
});

// --- 15. Conflicting media twin contents ---------------------------------------
test('assessBaseline blocks when pages/media and media currently disagree with each other', () => {
  const docs = freshDocs();
  docs.mediaDoc.data = { ...docs.mediaDoc.data, NEWS: 'DIFFERENT' };
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /DIFFERENT data/.test(e)));
});

// --- 23. Successful planned replacement -----------------------------------------
test('assessBaseline reports "fresh" for an ordinary not-yet-migrated baseline, with correct intended payloads', () => {
  const docs = freshDocs();
  const payload = minimalPayload();
  const result = assessBaseline(docs, payload);
  assert.equal(result.state, 'fresh');
  assert.deepEqual(result.intendedMedia.TESTIMONIALS_ALL, payload.TESTIMONIALS_ALL);
  assert.deepEqual(result.intendedMedia.TESTIMONIALS_FEATURED, payload.TESTIMONIALS_FEATURED);
  assert.equal(result.intendedMedia.NEWS, 'x'); // unrelated key preserved
  assert.deepEqual(result.intendedHome.HOME_TESTIMONIALS, payload.HOME_TESTIMONIALS);
  assert.equal(result.intendedHome.HERO, 'x');
});

// --- 24. Already-migrated no-op --------------------------------------------------
test('assessBaseline reports an explicit "noop" when all three documents already match the payload', () => {
  const payload = minimalPayload();
  const docs = freshDocs();
  const mediaData = { NEWS: 'x', TESTIMONIALS_ALL: payload.TESTIMONIALS_ALL, TESTIMONIALS_FEATURED: payload.TESTIMONIALS_FEATURED };
  docs.pagesMediaDoc.data = mediaData;
  docs.mediaDoc.data = { ...mediaData };
  docs.pagesHomeDoc.data = { HERO: 'x', HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS };
  const result = assessBaseline(docs, payload);
  assert.equal(result.state, 'noop');
});

// --- 25. Partial migration rejection ----------------------------------------------
test('assessBaseline blocks a partial migration state (home migrated, media not) rather than silently finishing it', () => {
  const payload = minimalPayload();
  const docs = freshDocs();
  docs.pagesHomeDoc.data = { HERO: 'x', HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS }; // already migrated
  // pagesMediaDoc/mediaDoc left at "demo" (not migrated)
  const result = assessBaseline(docs, payload);
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /Partial migration state detected/.test(e)));
});

// --- Unexpected existing content protection (not just "not yet migrated") -------
test('assessBaseline blocks when the live content contains an unexpected GENUINE entry not in the known demo baseline', () => {
  const docs = freshDocs();
  docs.pagesMediaDoc.data.TESTIMONIALS_ALL = [...EXPECTED_DEMO_TESTIMONIALS_ALL, { type: 'text', quote: 'A real one someone added.', name: 'Someone Real' }];
  docs.mediaDoc.data.TESTIMONIALS_ALL = docs.pagesMediaDoc.data.TESTIMONIALS_ALL; // keep twins matching each other so this hits the demo check, not the twin-mismatch check
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /Unexpected existing content/.test(e)));
});
test('assessBaseline blocks when a demo entry has been modified from the known reviewed baseline', () => {
  const docs = freshDocs();
  const modified = EXPECTED_DEMO_TESTIMONIALS_FEATURED.map((t, i) => (i === 0 ? { ...t, quote: 'Someone edited this demo quote.' } : t));
  docs.pagesMediaDoc.data.TESTIMONIALS_FEATURED = modified;
  docs.mediaDoc.data.TESTIMONIALS_FEATURED = modified;
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /Unexpected existing content/.test(e)));
});
test('assessBaseline blocks when there are unexpected additional entries beyond the known demo baseline on HOME_TESTIMONIALS', () => {
  const docs = freshDocs();
  docs.pagesHomeDoc.data.HOME_TESTIMONIALS = [...EXPECTED_DEMO_HOME_TESTIMONIALS, { name: 'Extra', role: '', quote: 'Unexpected extra entry.', image: null, active: true }];
  const result = assessBaseline(docs, minimalPayload());
  assert.equal(result.state, 'blocked');
  assert.ok(result.errors.some((e) => /Unexpected existing content/.test(e)));
});
test('assessBaseline accepts the exact known reviewed demo baseline as "fresh" (sanity check that the guard is not over-strict)', () => {
  const result = assessBaseline(freshDocs(), minimalPayload());
  assert.equal(result.state, 'fresh');
});

// --- 13. Duplicate destination document -----------------------------------------
test('assertNoDuplicateDocuments passes when every type has exactly one document', () => {
  const result = assertNoDuplicateDocuments({ 'pages/media': 1, media: 1, 'pages/home': 1 });
  assert.equal(result.ok, true);
});
test('assertNoDuplicateDocuments blocks when a type has more than one document', () => {
  const result = assertNoDuplicateDocuments({ 'pages/media': 2, media: 1, 'pages/home': 1 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /Found 2 Content documents for type "pages\/media"/.test(e)));
});

// --- computeBaselineFingerprint / 16 + 20. Unexpected/stale baseline -------------
test('computeBaselineFingerprint changes when any relevant field changes', () => {
  const docs = freshDocs();
  const fp1 = computeBaselineFingerprint(docs);
  docs.pagesHomeDoc.data = { ...docs.pagesHomeDoc.data, HOME_TESTIMONIALS: ['changed'] };
  const fp2 = computeBaselineFingerprint(docs);
  assert.notEqual(fp1, fp2);
});
test('computeBaselineFingerprint is identical for identical input (deterministic)', () => {
  const docs = freshDocs();
  assert.equal(computeBaselineFingerprint(docs), computeBaselineFingerprint(freshDocs()));
});

// --- Section 1.A: the fingerprint must cover identity/metadata, not just `data` ---
test('computeBaselineFingerprint changes when document IDENTITY (_id) changes, even though content is byte-identical', () => {
  const a = freshDocs();
  const b = freshDocs();
  b.pagesMediaDoc._id = 'a-different-id-entirely';
  assert.notEqual(computeBaselineFingerprint(a), computeBaselineFingerprint(b));
});
test('computeBaselineFingerprint changes when METADATA (updatedAt) changes, even though content is byte-identical', () => {
  const a = freshDocs();
  const b = freshDocs();
  b.mediaDoc.updatedAt = new Date('2099-01-01T00:00:00.000Z');
  assert.notEqual(computeBaselineFingerprint(a), computeBaselineFingerprint(b));
});
test('computeBaselineFingerprint changes when METADATA (__v) changes, even though content is byte-identical', () => {
  const a = freshDocs();
  const b = freshDocs();
  b.pagesHomeDoc.__v = 7;
  assert.notEqual(computeBaselineFingerprint(a), computeBaselineFingerprint(b));
});

// --- Helper: builds a fully correct, internally-consistent evidence object,
// backed by REAL temp files (a 2-file mongodump-shaped backup inventory, a
// restore-check report, a dry-run report whose CONTENT genuinely contains
// the expected markers) so "accepts a fully correct evidence object" is a
// true end-to-end check, and every "rejects X" test below starts from a
// known-good object and breaks exactly one thing. ---------------------------
// A small but COMPLETE 2-collection backup inventory (collection count is
// deliberately not 1 — proving the "every listed collection" rule, not just
// "at least one file somewhere"). Collection names/count are NOT meant to
// represent any real fixed list — see validateBackupCollectionsShape's own
// comment on why a fresh backup's actual collection count is never hardcoded.
function buildFullEvidenceFixture({ manifestSha256 = 'manifest-hash', baselineFingerprint = 'fingerprint-value' } = {}) {
  const dumpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-backup-'));
  const write = (name, content) => {
    const p = path.join(dumpDir, name);
    fs.writeFileSync(p, content);
    return p;
  };
  const collectionFiles = {
    contents: { bson: write('contents.bson', 'fake contents bson'), metadata: write('contents.metadata.json', '{}') },
    contentrevisions: { bson: write('contentrevisions.bson', 'fake contentrevisions bson'), metadata: write('contentrevisions.metadata.json', '{}') },
  };
  const collections = Object.entries(collectionFiles).map(([name, f]) => ({
    name,
    bsonFile: { path: path.basename(f.bson), sha256: sha256File(f.bson) },
    metadataFile: { path: path.basename(f.metadata), sha256: sha256File(f.metadata) },
  }));
  const restoreReportFile = write('restore-report.txt', 'Restore verification: SUCCESS');
  const dryRunReportFile = write(
    'dryrun-report.txt',
    `DRY-RUN complete: no writes were made.\nmanifestSha256=${manifestSha256}\nbaselineFingerprint=${baselineFingerprint}\n`
  );
  const t0 = new Date('2026-01-01T00:00:00.000Z').toISOString();
  const t1 = new Date('2026-01-01T01:00:00.000Z').toISOString();
  const t2 = new Date('2026-01-01T02:00:00.000Z').toISOString();
  const evidence = {
    manifestSha256,
    baselineFingerprint,
    operatorConfirmation: COMMIT_CONFIRMATION_PHRASE,
    target: { dbName: EXPECTED_TARGET_DB_NAME, clusterHost: EXPECTED_ATLAS_CLUSTER_HOST },
    backup: { completedAt: t0, dbName: EXPECTED_TARGET_DB_NAME, dumpDir, collections },
    restoreCheck: {
      completedAt: t1,
      outcome: 'success',
      databaseName: EXPECTED_RESTORE_CHECK_DB_NAME,
      backupIdentityUsed: dumpDir,
      verifiedCollections: collections.map((c) => c.name),
      reportPath: restoreReportFile,
      reportSha256: sha256File(restoreReportFile),
    },
    dryRun: {
      completedAt: t2,
      result: 'PASS',
      reportPath: dryRunReportFile,
      reportSha256: sha256File(dryRunReportFile),
    },
  };
  const cleanup = () => fs.rmSync(dumpDir, { recursive: true, force: true });
  return { evidence, cleanup };
}

test('verifyCommitEvidence accepts a fully correct, internally-consistent evidence object', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  cleanup();
});

// --- 18. Commit without required safety evidence ---------------------------------
test('verifyCommitEvidence rejects when evidence is entirely absent', () => {
  const result = verifyCommitEvidence(null, { expectedManifestSha256: 'a', expectedBaselineFingerprint: 'b' });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].includes('missing or not a JSON object'));
});
test('verifyCommitEvidence rejects a manifest hash mismatch', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.manifestSha256 = 'wrong';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /manifestSha256 does not match/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a wrong operatorConfirmation phrase', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.operatorConfirmation = 'yes please';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /operatorConfirmation must be exactly/.test(e)));
  cleanup();
});

// --- Expected TEST database and cluster identity binding --------------------------
test('verifyCommitEvidence rejects evidence whose target database/cluster does not match the expected identity', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.target = { dbName: 'some_other_db', clusterHost: EXPECTED_ATLAS_CLUSTER_HOST };
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /target identity must be exactly/.test(e)));
  cleanup();
});

// --- 20. Stale baseline / concurrent update rejection (evidence-side) -------------
test('verifyCommitEvidence rejects a stale baselineFingerprint (DB changed since evidence was prepared)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'current-value' });
  assert.ok(result.errors.some((e) => /baseline has changed since this evidence was prepared/.test(e)));
  cleanup();
});

// --- 19. Failed pre-change (fresh full) backup verification -----------------------
test('verifyCommitEvidence rejects a malformed backup record (missing fields)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.backup = { completedAt: 'x' };
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /well-formed backup record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects an empty backup.collections inventory', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.backup.collections = [];
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /non-empty array/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a backup.collections entry missing its metadataFile (incomplete, not just "no files at all")', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  delete evidence.backup.collections[0].metadataFile;
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /missing a well-formed metadataFile/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a backup.collections entry missing its bsonFile', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  delete evidence.backup.collections[1].bsonFile;
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /missing a well-formed bsonFile/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a duplicate collection name in backup.collections', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.backup.collections.push({ ...evidence.backup.collections[0] });
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /lists "contents" more than once/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a backup record whose collection file hash does not match (an arbitrary unrelated file is not sufficient)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.backup.collections[0].bsonFile.sha256 = '0'.repeat(64);
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /does not match the sha256 recorded in the evidence/.test(e)));
  cleanup();
});
test('verifyCommitEvidence accepts a backup inventory with MORE collections than any previous run (count is never hardcoded)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const extraPath = path.join(evidence.backup.dumpDir, 'auditlogs.bson');
  const extraMetaPath = path.join(evidence.backup.dumpDir, 'auditlogs.metadata.json');
  fs.writeFileSync(extraPath, 'fake auditlogs bson');
  fs.writeFileSync(extraMetaPath, '{}');
  evidence.backup.collections.push({ name: 'auditlogs', bsonFile: { path: 'auditlogs.bson', sha256: sha256File(extraPath) }, metadataFile: { path: 'auditlogs.metadata.json', sha256: sha256File(extraMetaPath) } });
  evidence.restoreCheck.verifiedCollections.push('auditlogs');
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.deepEqual(result.errors, []);
  cleanup();
});

// --- Restore-check database identity + linkage to the SAME backup AND collection set ---
test('verifyCommitEvidence rejects a restoreCheck whose databaseName is the real TEST target (must be the one exact disposable name)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.databaseName = EXPECTED_TARGET_DB_NAME;
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e) && new RegExp(EXPECTED_RESTORE_CHECK_DB_NAME).test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck whose databaseName is the protected dryrun database', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.databaseName = 'vyoma_migration_dryrun';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck whose databaseName is any other disposable-sounding name (must be the one exact name, not merely "not disallowed")', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.databaseName = 'some_other_disposable_name';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck whose verifiedCollections is missing an entry from backup.collections', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.verifiedCollections = ['contents']; // missing "contentrevisions"
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck whose verifiedCollections has an EXTRA entry not in backup.collections', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.verifiedCollections = [...evidence.restoreCheck.verifiedCollections, 'somethingUnbacked'];
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck that references a DIFFERENT backup than the one in evidence.backup', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.backupIdentityUsed = '/some/unrelated/dump/dir';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a missing/unsuccessful restoreCheck (clearly noting it is operator-attested)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.outcome = 'failed';
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /restoreCheck record/.test(e) && /operator attestation/.test(e)));
  cleanup();
});
test('verifyCommitEvidence rejects a restoreCheck report whose hash does not match', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.restoreCheck.reportSha256 = '0'.repeat(64);
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /Restore-check report/.test(e)));
  cleanup();
});

// --- Dry-run report CONTENT verification (not merely its file hash) --------------
test('verifyCommitEvidence rejects a dry-run report whose hash matches but whose CONTENT lacks the required markers', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const fakeReport = tmpFile('this file says nothing relevant');
  evidence.dryRun.reportPath = fakeReport;
  evidence.dryRun.reportSha256 = sha256File(fakeReport);
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /DRY-RUN complete: no writes were made/.test(e)));
  cleanup();
  fs.unlinkSync(fakeReport);
});
test('verifyCommitEvidence rejects a dry-run report that does not reference the approved manifest hash', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const staleReport = tmpFile('DRY-RUN complete: no writes were made.\nmanifestSha256=some-other-hash\nbaselineFingerprint=fingerprint-value\n');
  evidence.dryRun.reportPath = staleReport;
  evidence.dryRun.reportSha256 = sha256File(staleReport);
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /does not reference the approved manifest SHA256/.test(e)));
  cleanup();
  fs.unlinkSync(staleReport);
});
test('verifyCommitEvidence rejects a dry-run report that does not reference the current baseline fingerprint', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  const staleReport = tmpFile('DRY-RUN complete: no writes were made.\nmanifestSha256=manifest-hash\nbaselineFingerprint=some-other-fingerprint\n');
  evidence.dryRun.reportPath = staleReport;
  evidence.dryRun.reportSha256 = sha256File(staleReport);
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /does not reference the current baseline fingerprint/.test(e)));
  cleanup();
  fs.unlinkSync(staleReport);
});

// --- Required chronological ordering ----------------------------------------------
test('verifyCommitEvidence rejects out-of-order evidence timestamps (dry run dated before the backup it supposedly verifies)', () => {
  const { evidence, cleanup } = buildFullEvidenceFixture();
  evidence.dryRun.completedAt = new Date('2020-01-01T00:00:00.000Z').toISOString(); // before backup.completedAt
  const result = verifyCommitEvidence(evidence, { expectedManifestSha256: 'manifest-hash', expectedBaselineFingerprint: 'fingerprint-value' });
  assert.ok(result.errors.some((e) => /chronological order/.test(e)));
  cleanup();
});

// --- 3. Wrong cluster hostname ----------------------------------------------------
test('assertExpectedClusterHost accepts the exact expected Atlas cluster host', () => {
  const host = assertExpectedClusterHost(`mongodb+srv://user:pass@${EXPECTED_ATLAS_CLUSTER_HOST}/vyoma_2_0_test`);
  assert.equal(host, EXPECTED_ATLAS_CLUSTER_HOST);
});
test('assertExpectedClusterHost rejects a different cluster host', () => {
  assert.throws(
    () => assertExpectedClusterHost('mongodb+srv://user:pass@some-other-cluster.abc123.mongodb.net/vyoma_2_0_test'),
    /resolves to cluster host "some-other-cluster\.abc123\.mongodb\.net"/
  );
});
test('assertExpectedClusterHost rejects an unparseable URI', () => {
  assert.throws(() => assertExpectedClusterHost('not a url'), /could not be parsed/);
});

// =====================================================================
// 2. Immediate pre-change document snapshot (write, read-back, hash,
// baseline-match) — section 2 of the Stage 7 focused corrections.
// Write/read-back failures are simulated with an injected fake `fsImpl`,
// never the real filesystem; the success-path tests use real (tmpdir) files.
// =====================================================================
test('bsonSafeTransform tags a Date as {$date: isoString} (JSON.stringify cannot do this via a replacer -- Date.toJSON runs first)', () => {
  const d = new Date('2026-01-01T00:00:00.000Z');
  assert.deepEqual(bsonSafeTransform({ when: d }), { when: { $date: '2026-01-01T00:00:00.000Z' } });
});
test('bsonSafeTransform tags an ObjectId-shaped value (toHexString) as {$oid: hex}', () => {
  const fakeObjectId = { toHexString: () => 'deadbeefdeadbeefdeadbeef' };
  assert.deepEqual(bsonSafeTransform({ _id: fakeObjectId }), { _id: { $oid: 'deadbeefdeadbeefdeadbeef' } });
});
test('bsonSafeTransform leaves ordinary values untouched, recursing through arrays and nested objects', () => {
  const out = bsonSafeTransform({ a: 1, b: 'x', c: null, d: [1, { e: new Date('2026-01-01T00:00:00.000Z') }] });
  assert.deepEqual(out, { a: 1, b: 'x', c: null, d: [1, { e: { $date: '2026-01-01T00:00:00.000Z' } }] });
});

// --- Section 1.D: unsupported BSON values must FAIL CLOSED, never be silently converted ---
test('bsonSafeTransform throws (fails closed) on a raw Buffer rather than silently losing its value', () => {
  assert.throws(() => bsonSafeTransform({ x: Buffer.from('binary data') }), /Unsupported BSON value encountered.*Buffer\/Binary/);
});
test('bsonSafeTransform throws (fails closed) on an unrecognized _bsontype-tagged value (e.g. Decimal128/Long) rather than silently converting it', () => {
  const fakeDecimal128 = { _bsontype: 'Decimal128', toString: () => '12.34' };
  assert.throws(() => bsonSafeTransform({ price: fakeDecimal128 }), /Unsupported BSON value encountered: _bsontype "Decimal128"/);
});
test('bsonSafeTransform still correctly tags a real ObjectId-shaped value even though it ALSO carries a recognized _bsontype (toHexString wins, not the fail-closed branch)', () => {
  const fakeObjectId = { _bsontype: 'ObjectID', toHexString: () => 'deadbeefdeadbeefdeadbeef' };
  assert.deepEqual(bsonSafeTransform({ _id: fakeObjectId }), { _id: { $oid: 'deadbeefdeadbeefdeadbeef' } });
});
test('bsonSafeTransform fails closed on an unsupported value nested inside an array', () => {
  assert.throws(() => bsonSafeTransform([1, 2, Buffer.from('x')]), /Unsupported BSON value encountered/);
});

test('serializeDocForSnapshot picks exactly the complete-document fields this migration cares about', () => {
  const doc = { _id: 'id1', type: 'pages/media', data: { x: 1 }, draftData: null, status: 'published', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), __v: 3, somethingIrrelevant: 'drop me' };
  const out = serializeDocForSnapshot(doc);
  assert.deepEqual(Object.keys(out).sort(), ['_id', 'createdAt', 'data', 'draftData', 'status', 'type', 'updatedAt', '__v'].sort());
  assert.ok(!('somethingIrrelevant' in out));
});

function fakeDocs() {
  return {
    pagesMediaDoc: { _id: 'm1', type: 'pages/media', data: { TESTIMONIALS_ALL: [1] }, draftData: null, status: 'published', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), __v: 1 },
    mediaDoc: { _id: 'm2', type: 'media', data: { TESTIMONIALS_ALL: [1] }, draftData: null, status: 'published', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), __v: 1 },
    pagesHomeDoc: { _id: 'h1', type: 'pages/home', data: { HOME_TESTIMONIALS: [2] }, draftData: null, status: 'published', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), __v: 1 },
  };
}

test('writePreChangeSnapshot writes, reads back, and SHA256-verifies successfully with the real filesystem', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-snapshot-'));
  const payload = buildPreChangeSnapshotPayload(fakeDocs());
  const result = writePreChangeSnapshot({ dir, filename: 'snap.json', payload });
  assert.ok(fs.existsSync(result.path));
  assert.equal(sha256File(result.path), result.sha256);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('writePreChangeSnapshot refuses to overwrite an existing snapshot file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-snapshot-'));
  const payload = buildPreChangeSnapshotPayload(fakeDocs());
  writePreChangeSnapshot({ dir, filename: 'snap.json', payload });
  assert.throws(() => writePreChangeSnapshot({ dir, filename: 'snap.json', payload }), /Refusing to overwrite an existing pre-change snapshot/);
  fs.rmSync(dir, { recursive: true, force: true });
});
test('writePreChangeSnapshot requires an explicit, non-empty directory', () => {
  assert.throws(() => writePreChangeSnapshot({ dir: '', filename: 'snap.json', payload: {} }), /must be supplied explicitly/);
});

// --- Section 1.D: the snapshot path must never be inside the repository ---------
test('writePreChangeSnapshot rejects a directory that is inside the given repoRoot', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-fakerepo-'));
  const insideRepo = path.join(repoRoot, 'Backend', 'scripts', 'reports');
  assert.throws(
    () => writePreChangeSnapshot({ dir: insideRepo, filename: 'snap.json', payload: {}, repoRoot }),
    /Refusing to write a pre-change snapshot inside the repository/
  );
  fs.rmSync(repoRoot, { recursive: true, force: true });
});
test('writePreChangeSnapshot rejects the repoRoot directory itself', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-fakerepo-'));
  assert.throws(() => writePreChangeSnapshot({ dir: repoRoot, filename: 'snap.json', payload: {}, repoRoot }), /Refusing to write a pre-change snapshot inside the repository/);
  fs.rmSync(repoRoot, { recursive: true, force: true });
});
test('writePreChangeSnapshot accepts a directory OUTSIDE the given repoRoot', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-fakerepo-'));
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tml-outside-'));
  const result = writePreChangeSnapshot({ dir: outsideDir, filename: 'snap.json', payload: buildPreChangeSnapshotPayload(fakeDocs()), repoRoot });
  assert.ok(fs.existsSync(result.path));
  fs.rmSync(repoRoot, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

// --- Simulated write failure (injected fake fs, never the real filesystem) ---
test('writePreChangeSnapshot propagates a write failure rather than reporting success', () => {
  const fakeFs = {
    mkdirSync: () => {},
    existsSync: () => false,
    writeFileSync: () => { throw new Error('simulated disk-full write failure'); },
    readFileSync: () => { throw new Error('should never be reached'); },
  };
  assert.throws(() => writePreChangeSnapshot({ dir: '/fake/dir', filename: 'snap.json', payload: {}, fsImpl: fakeFs }), /simulated disk-full write failure/);
});
// --- Simulated read-back failure ---
test('writePreChangeSnapshot propagates a read-back failure rather than reporting success', () => {
  const fakeFs = {
    mkdirSync: () => {},
    existsSync: () => false,
    writeFileSync: () => {},
    readFileSync: () => { throw new Error('simulated read-back failure'); },
  };
  assert.throws(() => writePreChangeSnapshot({ dir: '/fake/dir', filename: 'snap.json', payload: {}, fsImpl: fakeFs }), /read-back FAILED/);
});
// --- Simulated hash/content mismatch on read-back ---
test('writePreChangeSnapshot rejects a read-back whose content does not match what was written', () => {
  let written = null;
  const fakeFs = {
    mkdirSync: () => {},
    existsSync: () => false,
    writeFileSync: (p, text) => { written = text; },
    readFileSync: () => written + ' TAMPERED',
  };
  assert.throws(() => writePreChangeSnapshot({ dir: '/fake/dir', filename: 'snap.json', payload: {}, fsImpl: fakeFs }), /read-back content does not match/);
});

// --- Baseline-mismatch detection ---
test('verifyPreChangeSnapshotMatchesBaseline is true when the snapshot was built from the exact same docs', () => {
  const docs = fakeDocs();
  const payload = buildPreChangeSnapshotPayload(docs);
  const roundTripped = JSON.parse(serializeSnapshotToText(payload));
  assert.equal(verifyPreChangeSnapshotMatchesBaseline(roundTripped, docs), true);
});
test('verifyPreChangeSnapshotMatchesBaseline is false when the current docs have since changed (baseline mismatch)', () => {
  const docs = fakeDocs();
  const payload = buildPreChangeSnapshotPayload(docs);
  const roundTripped = JSON.parse(serializeSnapshotToText(payload));
  const changedDocs = fakeDocs();
  changedDocs.pagesHomeDoc.data = { HOME_TESTIMONIALS: ['CHANGED'] };
  assert.equal(verifyPreChangeSnapshotMatchesBaseline(roundTripped, changedDocs), false);
});

// --- 26. Post-write verification failure -------------------------------------------
test('verifyPostWrite passes when both media twins and home match the intended payload exactly', () => {
  const intendedMedia = { TESTIMONIALS_ALL: ['a'] };
  const intendedHome = { HOME_TESTIMONIALS: ['b'] };
  const result = verifyPostWrite(
    { pagesMediaAfter: { data: intendedMedia }, mediaAfter: { data: intendedMedia }, pagesHomeAfter: { data: intendedHome } },
    { intendedMedia, intendedHome }
  );
  assert.equal(result.ok, true);
});
test('verifyPostWrite fails and must never be reported as success when pages/media does not match', () => {
  const intendedMedia = { TESTIMONIALS_ALL: ['a'] };
  const intendedHome = { HOME_TESTIMONIALS: ['b'] };
  const result = verifyPostWrite(
    { pagesMediaAfter: { data: { TESTIMONIALS_ALL: ['WRONG'] } }, mediaAfter: { data: intendedMedia }, pagesHomeAfter: { data: intendedHome } },
    { intendedMedia, intendedHome }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /"pages\/media" data does not match/.test(e)));
});
test('verifyPostWrite fails when the two media twins no longer match each other', () => {
  const intendedMedia = { TESTIMONIALS_ALL: ['a'] };
  const intendedHome = { HOME_TESTIMONIALS: ['b'] };
  const result = verifyPostWrite(
    { pagesMediaAfter: { data: intendedMedia }, mediaAfter: { data: { TESTIMONIALS_ALL: ['DIFFERENT'] } }, pagesHomeAfter: { data: intendedHome } },
    { intendedMedia, intendedHome }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /no longer match each other/.test(e)));
});

// --- 27. Credential redaction --------------------------------------------------------
test('redactUri removes every occurrence of the real URI from a message', () => {
  const uri = 'mongodb+srv://realuser:realpass@cluster.example.mongodb.net/vyoma_2_0_test';
  const message = `Connection failed: ${uri} (timeout) -- retry with ${uri}`;
  const redacted = redactUri(message, uri);
  assert.ok(!redacted.includes('realuser'));
  assert.ok(!redacted.includes('realpass'));
  assert.ok(redacted.includes('<REDACTED_URI>'));
});
test('redactUri is a safe no-op when there is no uri to redact', () => {
  assert.equal(redactUri('plain message', undefined), 'plain message');
  assert.equal(redactUri('', 'uri'), '');
});

// --- 17. Dry-run zero-write behavior (proxy: commit-mode detection) ------------------
test('shouldCommit defaults to false (dry-run) with no --commit flag', () => {
  assert.equal(shouldCommit(['node', 'script.mjs']), false);
});
test('shouldCommit is true only when --commit is explicitly present', () => {
  assert.equal(shouldCommit(['node', 'script.mjs', '--commit']), true);
});

// --- deepEqual / sha256String sanity (used throughout the module) -------------------
test('deepEqual is a structural (not referential) comparison', () => {
  assert.equal(deepEqual({ a: [1, 2] }, { a: [1, 2] }), true);
  assert.equal(deepEqual({ a: [1, 2] }, { a: [1, 3] }), false);
});
test('sha256String is deterministic', () => {
  assert.equal(sha256String('hello'), sha256String('hello'));
  assert.notEqual(sha256String('hello'), sha256String('hello2'));
});
