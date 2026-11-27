// QA Bug 19 — Stage 7: pure, DB-free logic for the final testimonial
// migration (scripts/wordpress/import/testimonial-final-migration.mjs).
// Kept in its own module, separate from the CLI script, so every rule here
// is directly unit-testable with plain objects and no mongoose connection —
// mirrors how validateTestimonialContent.js is a pure module the controller
// calls, rather than logic embedded inline in the controller.
//
// Nothing in this file ever imports mongoose, fs-writes to the database, or
// reads process.env. It only reads local files (the manifest, a backup, a
// dry-run report) to verify their SHA256 against values already supplied by
// its caller.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TARGET_CONTENT_TYPES = ['pages/media', 'media', 'pages/home'];
export const MEDIA_TWIN_TYPES = ['pages/media', 'media'];
export const HOME_TYPE = 'pages/home';

// The exact literal an operator must type to authorize a commit — mirrors
// migrationTargetGuard.mjs's own MIGRATION_TARGET_CONFIRM pattern ("retype
// the exact expected value", not a boolean) for the same reason: a
// copy-pasted evidence file from a previous, unrelated run cannot
// accidentally satisfy this by construction.
export const COMMIT_CONFIRMATION_PHRASE = 'MIGRATE_TESTIMONIALS_vyoma_2_0_test';

// The one additional Atlas identity check this migration needs beyond what
// migrationTargetGuard.mjs already enforces (database name only). Applied
// as an EXTRA layer by the CLI script, never by editing the shared guard.
export const EXPECTED_ATLAS_CLUSTER_HOST = 'vyoma-test-cluster.ctnt2ww.mongodb.net';
export const EXPECTED_TARGET_DB_NAME = 'vyoma_2_0_test';

// A restore-verification drill must land in exactly this one disposable
// database — not merely "anything other than the real target or the
// protected dryrun database" (too permissive: an operator could point a
// restore-check at yet another unreviewed database by accident). Pinned
// exactly, mirroring EXPECTED_TARGET_DB_NAME's own precision.
export const EXPECTED_RESTORE_CHECK_DB_NAME = 'vyoma_2_0_test_restore_check';

// ---------------------------------------------------------------------------
// Expected, previously-reviewed demo/placeholder baseline — read verbatim
// from Backend/scripts/seedData/media.js (TESTIMONIALS_FEATURED,
// TESTIMONIALS_ALL) and Backend/scripts/seedData/home.js (HOME_TESTIMONIALS)
// during this engagement's own Stage 6C investigation. This is the ONLY
// existing content this migration is authorized to replace — a baseline
// fingerprint alone (which only proves "nothing changed between dry run and
// commit") says nothing about whether the ORIGINAL content was ever
// reviewed/approved for replacement. Any live content that is neither this
// exact known baseline nor the fully-migrated final payload is unexpected
// and must block, never be silently overwritten.
// ---------------------------------------------------------------------------
export const EXPECTED_DEMO_TESTIMONIALS_FEATURED = [
  { quote: 'Vyoma’s scholarship and pedagogy are of a rare quality. Learning here reshaped how I read our classical texts.', name: 'Dr Jaya Tyagi', role: 'Retd. Professor & HoD, Biotechnology, AIIMS New Delhi' },
  { quote: 'Namaste, I am so delighted with your classes and bowled out by your knowledge and presentation. I had a passion all my life to learn Sanskrit. The learning process itself is giving me so much joy, or ananda. Thank you!', name: 'Dr Ramakrishnarao Rebbapragada', role: 'Retired Doctor, Cambridge University Hospitals, UK' },
  { quote: 'The clarity and structure of the teaching is exceptional. It respects both the tradition and the learner.', name: 'Sri Siddhartha Jayanti', role: 'Boston, USA' },
];
export const EXPECTED_DEMO_TESTIMONIALS_ALL = [
  { type: 'text', quote: 'I started with no background at all, and within months I could read simple verses on my own.', name: 'Anjali Rao', role: 'Bengaluru, India' },
  { type: 'video', name: 'Ravi Menon', role: 'Chennai, India' },
  { type: 'text', quote: 'The teachers are patient and deeply knowledgeable. Every doubt was answered with care.', name: 'Meera Krishnan', role: 'Pune, India' },
  { type: 'text', quote: 'Vyoma made it possible for me to teach Sanskrit to my own students with real confidence.', name: 'Suresh Iyer', role: 'Coimbatore, India' },
  { type: 'video', name: 'Lakshmi Narayanan', role: 'Singapore' },
  { type: 'text', quote: 'A wonderful community of learners. I looked forward to every single class.', name: 'Priya Sharma', role: 'London, UK' },
];
export const EXPECTED_DEMO_HOME_TESTIMONIALS = [
  { name: 'Dr Jaya Tyagi', role: 'Retd. Professor & HoD, Biotechnology, AIIMS New Delhi', quote: 'Vyoma’s scholarship and pedagogy are of a rare quality. Learning here reshaped how I read our classical texts.', image: null, active: true },
  { name: 'Dr Ramakrishnarao Rebbapragada', role: 'Retired Doctor, Cambridge University Hospitals, UK', quote: 'Namaste, I am so delighted with your classes and bowled out by your knowledge and presentation. I had a passion all my life to learn Sanskrit. The learning process itself is giving me so much joy, or ananda. Thank you!', image: null, active: true },
  { name: 'Sri Siddhartha Jayanti', role: 'Boston, USA', quote: 'The clarity and structure of the teaching is exceptional. It respects both the tradition and the learner.', image: null, active: true },
];

export function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function sha256String(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Manifest loading + integrity pin
// ---------------------------------------------------------------------------

// Never defaults to any machine-specific path (no scratchpad/session path is
// ever hardcoded here) — the caller (the CLI script) must supply exactly
// where the approved manifest JSON currently lives on whatever machine runs
// this, and this function proves that file is byte-identical to the one
// approved, before a single field of it is ever read as data.
export function loadManifest(manifestPath, expectedSha256) {
  if (!manifestPath || !String(manifestPath).trim()) {
    throw new Error(
      'A manifest path must be supplied explicitly (TESTIMONIAL_MIGRATION_MANIFEST_PATH) — this never defaults to any machine-specific path.'
    );
  }
  if (!expectedSha256 || !String(expectedSha256).trim()) {
    throw new Error('An expected manifest SHA256 must be supplied — refusing to accept any manifest unpinned.');
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at: ${manifestPath}`);
  }
  const actualSha256 = sha256File(manifestPath);
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Manifest integrity check FAILED: expected SHA256 ${expectedSha256}, got ${actualSha256}. ` +
        'Refusing to proceed with an unverified/modified manifest.'
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('Manifest file is not valid JSON.');
  }
  return { manifest: parsed, sha256: actualSha256 };
}

// Strips the manifest's internal-only `_provenance` field (research
// traceability, never part of the live CMS document shape) and returns
// exactly the three arrays this migration writes.
export function extractManifestPayload(manifest) {
  const dest = manifest?.proposedDestinations;
  if (
    !dest ||
    !Array.isArray(dest.TESTIMONIALS_ALL) ||
    !Array.isArray(dest.HOME_TESTIMONIALS) ||
    !Array.isArray(dest.TESTIMONIALS_FEATURED)
  ) {
    throw new Error(
      'Manifest is missing one or more required destination arrays (TESTIMONIALS_ALL, HOME_TESTIMONIALS, TESTIMONIALS_FEATURED).'
    );
  }
  const strip = (items) => items.map(({ _provenance, ...rest }) => rest);
  return {
    TESTIMONIALS_ALL: strip(dest.TESTIMONIALS_ALL),
    HOME_TESTIMONIALS: strip(dest.HOME_TESTIMONIALS),
    TESTIMONIALS_FEATURED: strip(dest.TESTIMONIALS_FEATURED),
  };
}

// ---------------------------------------------------------------------------
// Manifest self-validation (no DB) — exact approved counts/shape
// ---------------------------------------------------------------------------
export function validateManifestPayload(payload) {
  const errors = [];
  const { TESTIMONIALS_ALL, HOME_TESTIMONIALS, TESTIMONIALS_FEATURED } = payload;

  if (TESTIMONIALS_ALL.length !== 86) errors.push(`Expected exactly 86 TESTIMONIALS_ALL entries, found ${TESTIMONIALS_ALL.length}.`);
  if (HOME_TESTIMONIALS.length !== 7) errors.push(`Expected exactly 7 HOME_TESTIMONIALS entries, found ${HOME_TESTIMONIALS.length}.`);
  if (TESTIMONIALS_FEATURED.length !== 3) errors.push(`Expected exactly 3 TESTIMONIALS_FEATURED entries, found ${TESTIMONIALS_FEATURED.length}.`);

  const byType = {};
  const byCategory = {};
  for (const t of TESTIMONIALS_ALL) {
    if (!t || typeof t !== 'object') { errors.push('TESTIMONIALS_ALL contains a non-object entry.'); continue; }
    byType[t.type] = (byType[t.type] || 0) + 1;
    byCategory[t.category || '(none)'] = (byCategory[t.category || '(none)'] || 0) + 1;
    if (t.active !== true) errors.push(`"${t.id}" is not active:true — every migrated testimonial must be publicly visible.`);
  }
  if (byType.text !== 65) errors.push(`Expected 65 text entries, found ${byType.text || 0}.`);
  if (byType.video !== 2) errors.push(`Expected 2 video entries, found ${byType.video || 0}.`);
  if (byType.image !== 19) errors.push(`Expected 19 image entries, found ${byType.image || 0}.`);

  for (const [arrName, arr] of Object.entries({ TESTIMONIALS_ALL, HOME_TESTIMONIALS, TESTIMONIALS_FEATURED })) {
    const seen = new Set();
    for (const item of arr) {
      if (!item?.id) { errors.push(`${arrName}: an item is missing a stable id.`); continue; }
      if (seen.has(item.id)) errors.push(`${arrName}: duplicate id "${item.id}".`);
      seen.add(item.id);
    }
  }

  const allIds = new Set(TESTIMONIALS_ALL.map((i) => i.id));
  for (const item of HOME_TESTIMONIALS) {
    if (!allIds.has(item.id)) errors.push(`HOME_TESTIMONIALS id "${item.id}" is not present in TESTIMONIALS_ALL.`);
  }
  for (const item of TESTIMONIALS_FEATURED) {
    if (!allIds.has(item.id)) errors.push(`TESTIMONIALS_FEATURED id "${item.id}" is not present in TESTIMONIALS_ALL.`);
  }

  return { errors, byType, byCategory };
}

// ---------------------------------------------------------------------------
// Narrow, non-destructive field updates — never replace a whole `data`
// object; always spread the current object and only replace the exact
// testimonial keys this migration owns.
// ---------------------------------------------------------------------------
export function buildIntendedMediaData(currentData, payload) {
  return {
    ...(currentData && typeof currentData === 'object' ? currentData : {}),
    TESTIMONIALS_ALL: payload.TESTIMONIALS_ALL,
    TESTIMONIALS_FEATURED: payload.TESTIMONIALS_FEATURED,
  };
}
export function buildIntendedHomeData(currentData, payload) {
  return {
    ...(currentData && typeof currentData === 'object' ? currentData : {}),
    HOME_TESTIMONIALS: payload.HOME_TESTIMONIALS,
  };
}

// ---------------------------------------------------------------------------
// Baseline assessment — existence, pending drafts, twin-consistency,
// idempotency (no-op), and partial-migration detection. Pure: takes already-
// fetched plain doc objects ({ data, draftData, status } per type), never
// touches a database itself.
// ---------------------------------------------------------------------------
// Pure CLI-arg parsing, kept as its own tiny function so dry-run-by-default
// behavior is directly assertable without invoking main() against any
// database at all.
export function shouldCommit(argv = process.argv) {
  return Array.isArray(argv) && argv.includes('--commit');
}

// ContentModel.type has a unique index, so two documents sharing a type
// should be structurally impossible — but this migration checks for it
// anyway (defense in depth against a unique-index violation that somehow
// occurred, e.g. a restored backup or a direct database edit) rather than
// assuming the index was never bypassed.
export function assertNoDuplicateDocuments(countsByType) {
  const dupes = Object.entries(countsByType || {}).filter(([, count]) => count > 1);
  if (dupes.length) {
    return {
      ok: false,
      errors: dupes.map(([type, count]) => `Found ${count} Content documents for type "${type}" — expected exactly one. Refusing to proceed.`),
    };
  }
  return { ok: true, errors: [] };
}

export function assessBaseline({ pagesMediaDoc, mediaDoc, pagesHomeDoc }, payload) {
  const docs = { 'pages/media': pagesMediaDoc, media: mediaDoc, 'pages/home': pagesHomeDoc };

  const missing = Object.entries(docs).filter(([, doc]) => !doc).map(([type]) => type);
  if (missing.length) {
    return { state: 'blocked', errors: missing.map((type) => `Missing destination document for type "${type}".`) };
  }

  const draftErrors = Object.entries(docs)
    .filter(([, doc]) => doc.draftData != null)
    .map(([type]) => `Content "${type}" has a pending unpublished draft (draftData is non-null) — aborting rather than risk a later publish overwriting this migration.`);
  if (draftErrors.length) return { state: 'blocked', errors: draftErrors };

  if (!deepEqual(pagesMediaDoc.data, mediaDoc.data)) {
    return {
      state: 'blocked',
      errors: [
        '"pages/media" and "media" currently hold DIFFERENT data — these two types are expected to always be kept ' +
          'identical (see Frontend/app/admin/content/testimonials/page.js). This drift must be investigated before ' +
          'this migration can safely write to both.',
      ],
    };
  }

  const intendedMedia = buildIntendedMediaData(pagesMediaDoc.data, payload);
  const intendedHome = buildIntendedHomeData(pagesHomeDoc.data, payload);

  const mediaMigrated =
    deepEqual(pagesMediaDoc.data?.TESTIMONIALS_ALL, payload.TESTIMONIALS_ALL) &&
    deepEqual(pagesMediaDoc.data?.TESTIMONIALS_FEATURED, payload.TESTIMONIALS_FEATURED);
  const mediaTwinMigrated =
    deepEqual(mediaDoc.data?.TESTIMONIALS_ALL, payload.TESTIMONIALS_ALL) &&
    deepEqual(mediaDoc.data?.TESTIMONIALS_FEATURED, payload.TESTIMONIALS_FEATURED);
  const homeMigrated = deepEqual(pagesHomeDoc.data?.HOME_TESTIMONIALS, payload.HOME_TESTIMONIALS);

  const allMigrated = mediaMigrated && mediaTwinMigrated && homeMigrated;
  const noneMigrated = !mediaMigrated && !mediaTwinMigrated && !homeMigrated;

  if (allMigrated) {
    return { state: 'noop', errors: [], intendedMedia, intendedHome };
  }
  if (!noneMigrated) {
    return {
      state: 'blocked',
      errors: [
        `Partial migration state detected: pages/media migrated=${mediaMigrated}, media migrated=${mediaTwinMigrated}, ` +
          `pages/home migrated=${homeMigrated}. Refusing to proceed automatically — this needs a separately reviewed ` +
          'recovery procedure, not a blind re-write.',
      ],
    };
  }

  // A baseline fingerprint (computed later, see computeBaselineFingerprint)
  // only proves "nothing changed between dry run and commit" — it says
  // nothing about whether the content THIS MIGRATION IS ABOUT TO REPLACE is
  // the known, previously-reviewed demo/placeholder content, as opposed to
  // some genuine testimonial someone added since, or a since-modified demo
  // entry. Require an exact match to the known reviewed baseline before
  // calling this state "fresh" — anything else blocks, unconditionally.
  const mediaIsExpectedDemo =
    deepEqual(pagesMediaDoc.data?.TESTIMONIALS_ALL, EXPECTED_DEMO_TESTIMONIALS_ALL) &&
    deepEqual(pagesMediaDoc.data?.TESTIMONIALS_FEATURED, EXPECTED_DEMO_TESTIMONIALS_FEATURED);
  const mediaTwinIsExpectedDemo =
    deepEqual(mediaDoc.data?.TESTIMONIALS_ALL, EXPECTED_DEMO_TESTIMONIALS_ALL) &&
    deepEqual(mediaDoc.data?.TESTIMONIALS_FEATURED, EXPECTED_DEMO_TESTIMONIALS_FEATURED);
  const homeIsExpectedDemo = deepEqual(pagesHomeDoc.data?.HOME_TESTIMONIALS, EXPECTED_DEMO_HOME_TESTIMONIALS);

  if (!mediaIsExpectedDemo || !mediaTwinIsExpectedDemo || !homeIsExpectedDemo) {
    return {
      state: 'blocked',
      errors: [
        'Unexpected existing content: the current TESTIMONIALS_ALL/TESTIMONIALS_FEATURED/HOME_TESTIMONIALS content does ' +
          'not exactly match the known, previously-reviewed demo/placeholder baseline (Backend/scripts/seedData/media.js ' +
          'and home.js) — it may contain a genuine testimonial added since, a modified demo entry, or unexpected ' +
          'additional entries. Refusing to overwrite unreviewed content automatically; this requires separate review ' +
          `before proceeding. (mediaMatchesDemo=${mediaIsExpectedDemo}, mediaTwinMatchesDemo=${mediaTwinIsExpectedDemo}, homeMatchesDemo=${homeIsExpectedDemo})`,
      ],
    };
  }

  return { state: 'fresh', errors: [], intendedMedia, intendedHome };
}

// A deterministic fingerprint covering everything this migration's safety
// checks actually depend on: content (`data`), draft state (`draftData`,
// `status`), document IDENTITY (`_id`), and relevant METADATA (`updatedAt`,
// `__v`) — not content alone, and not identity/metadata alone. Embedded in
// commit evidence so a commit can detect "the baseline changed since this
// evidence was prepared" (content OR identity OR metadata) without needing a
// live diff at the evidence-authoring moment, and re-used by the CLI script
// to re-verify the SAME fingerprint from WITHIN the open transaction,
// immediately before the guarded writes — so this is deliberately not just
// "rely on updatedAt/__v": a mismatch in content, draft state, identity, or
// metadata is caught the same way.
export function computeBaselineFingerprint({ pagesMediaDoc, mediaDoc, pagesHomeDoc }) {
  const pick = (doc) => ({
    _id: doc?._id ?? null,
    data: doc?.data ?? null,
    draftData: doc?.draftData ?? null,
    status: doc?.status ?? null,
    updatedAt: doc?.updatedAt ?? null,
    __v: doc?.__v ?? null,
  });
  const tagged = bsonSafeTransform({ pagesMedia: pick(pagesMediaDoc), media: pick(mediaDoc), pagesHome: pick(pagesHomeDoc) });
  return sha256String(JSON.stringify(tagged));
}

// ---------------------------------------------------------------------------
// Immediate pre-change document snapshot (distinct from, and in addition to,
// a fresh full TEST database backup and a restore-verification drill — see
// this module's header comment / the CLI script's comments for how all
// three relate). Captures the THREE exact destination documents, complete
// with metadata, immediately before any mutation in the same script run.
// ---------------------------------------------------------------------------

// MongoDB Extended JSON's own tagged-literal convention for the two
// BSON-specific types this schema actually contains (ObjectId, Date) —
// applied by hand (not via the `bson` package) so this stays a plain
// `mongoose`-only dependency.
//
// Deliberately NOT a `JSON.stringify` replacer function: both `Date` and
// `bson`'s `ObjectId` define their OWN `toJSON()`, which `JSON.stringify`
// always calls FIRST, before a replacer ever sees the value — a replacer
// would only ever receive the already-collapsed plain string, never the
// original typed instance, silently losing the BSON type tag. This is
// instead a recursive pre-transform: walk the value tree ourselves and
// replace every Date/ObjectId-like instance with its tagged literal BEFORE
// handing the result to an ordinary `JSON.stringify` (see
// serializeSnapshotToText below).
// The only BSON-specific types this schema's actual fields can hold:
// ObjectId (`_id`) and Date (`createdAt`/`updatedAt`). `data`/`draftData`
// are Mixed but are always built from this migration's own plain JS
// (string/number/boolean/null/array/object) manifest payload — never
// anything BSON-typed. Recognized and tagged below; anything else that
// LOOKS BSON-specific (a `_bsontype`-tagged value from the `bson` package
// this project doesn't otherwise recognize, e.g. Decimal128/Long/Binary, or
// a raw Node Buffer) is explicitly UNSUPPORTED here and fails closed with a
// thrown error — never silently flattened to `{}` or stringified, which
// would be a silent, undetectable loss of the real stored value.
export function bsonSafeTransform(value) {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (value && typeof value === 'object' && typeof value.toHexString === 'function') {
    return { $oid: value.toHexString() };
  }
  if (Buffer.isBuffer(value)) {
    throw new Error('Unsupported BSON value encountered: a raw Buffer/Binary value is not handled by this snapshot serializer — refusing to silently convert it.');
  }
  if (value && typeof value === 'object' && typeof value._bsontype === 'string') {
    throw new Error(`Unsupported BSON value encountered: _bsontype "${value._bsontype}" is not handled by this snapshot serializer — refusing to silently convert it.`);
  }
  if (Array.isArray(value)) return value.map(bsonSafeTransform);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = bsonSafeTransform(v);
    return out;
  }
  return value;
}

// Exactly the fields that matter for this migration's own safety guarantees
// — the complete document, not just `data`.
export function serializeDocForSnapshot(doc) {
  return {
    _id: doc?._id,
    type: doc?.type,
    data: doc?.data ?? null,
    draftData: doc?.draftData ?? null,
    status: doc?.status ?? null,
    createdAt: doc?.createdAt,
    updatedAt: doc?.updatedAt,
    __v: doc?.__v,
  };
}

export function buildPreChangeSnapshotPayload({ pagesMediaDoc, mediaDoc, pagesHomeDoc }) {
  return {
    capturedAt: new Date().toISOString(),
    documents: {
      'pages/media': serializeDocForSnapshot(pagesMediaDoc),
      media: serializeDocForSnapshot(mediaDoc),
      'pages/home': serializeDocForSnapshot(pagesHomeDoc),
    },
  };
}

export function serializeSnapshotToText(payload) {
  return JSON.stringify(bsonSafeTransform(payload), null, 2) + '\n';
}

// Writes the snapshot to a NON-conflicting path (refuses to overwrite an
// existing file), reads it back, and SHA256-verifies the read-back content
// against what was just written — all three must succeed, in this order,
// before this function returns, and BEFORE the caller is allowed to mutate
// anything. `fsImpl` is injectable (defaults to the real `node:fs`) purely
// so isolated tests can simulate a write/read failure without touching the
// real filesystem.
export function writePreChangeSnapshot({ dir, filename, payload, fsImpl = fs, repoRoot }) {
  if (!dir || !String(dir).trim()) {
    throw new Error('A pre-change snapshot directory must be supplied explicitly (outside the repository) — this never defaults to any machine-specific path.');
  }
  if (repoRoot) {
    const resolvedDir = path.resolve(dir);
    const resolvedRoot = path.resolve(repoRoot);
    if (resolvedDir === resolvedRoot || resolvedDir.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Refusing to write a pre-change snapshot inside the repository ("${resolvedDir}" is under "${resolvedRoot}") — it must be written outside the repo.`);
    }
  }
  const fullPath = path.join(dir, filename);
  fsImpl.mkdirSync(dir, { recursive: true });
  if (fsImpl.existsSync(fullPath)) {
    throw new Error(`Refusing to overwrite an existing pre-change snapshot at: ${fullPath}`);
  }
  const text = serializeSnapshotToText(payload);
  fsImpl.writeFileSync(fullPath, text);

  let readBack;
  try {
    readBack = fsImpl.readFileSync(fullPath, 'utf8');
  } catch (e) {
    throw new Error(`Pre-change snapshot read-back FAILED at "${fullPath}": ${e.message}. Refusing to proceed without a verified snapshot.`);
  }
  if (readBack !== text) {
    throw new Error(`Pre-change snapshot read-back content does not match what was written at "${fullPath}". Refusing to proceed.`);
  }
  const sha256 = sha256String(readBack);
  return { path: fullPath, sha256, text };
}

// Re-serializes BOTH sides (the on-disk snapshot payload and a freshly-built
// payload from the current live documents) through the identical BSON-safe
// transform before comparing, so the comparison is apples-to-apples
// regardless of which one came from a round-tripped JSON file.
export function verifyPreChangeSnapshotMatchesBaseline(snapshotPayload, currentDocs) {
  const currentPayload = buildPreChangeSnapshotPayload(currentDocs);
  const normalize = (p) => JSON.parse(serializeSnapshotToText({ documents: p.documents }));
  return deepEqual(normalize(snapshotPayload), normalize(currentPayload));
}

// ---------------------------------------------------------------------------
// Commit-mode evidence verification. Distinguishes what this function CAN
// verify by itself (file hashes, string equality, shape) from what it
// cannot (whether a restore drill genuinely happened) — see each branch's
// comment.
// ---------------------------------------------------------------------------
// A COMPLETE per-collection backup inventory — not merely "at least one
// .bson and one .metadata.json somewhere" (too weak: that could be
// satisfied by a single collection while every other collection's dump is
// silently missing or incomplete). Every entry must name a collection and
// supply BOTH its .bson and its .metadata.json file, each with a hash. The
// NUMBER of collections is deliberately not checked against any fixed
// count — a fresh TEST backup may legitimately contain more data than any
// previous one; only structural completeness (every listed collection has
// both its files, every hash verifies) is required.
function validateBackupCollectionsShape(collections) {
  if (!Array.isArray(collections) || collections.length === 0) {
    return { ok: false, errors: ['backup.collections must be a non-empty array.'] };
  }
  const errors = [];
  const names = new Set();
  for (const c of collections) {
    if (!c || typeof c.name !== 'string' || !c.name) {
      errors.push('A backup.collections entry is missing a collection name.');
      continue;
    }
    if (names.has(c.name)) errors.push(`backup.collections lists "${c.name}" more than once.`);
    names.add(c.name);
    for (const fileKey of ['bsonFile', 'metadataFile']) {
      const f = c[fileKey];
      if (!f || typeof f.path !== 'string' || !f.path || typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(f.sha256)) {
        errors.push(`Collection "${c.name}" is missing a well-formed ${fileKey} (path + 64-hex-character sha256) — incomplete backup entry.`);
      }
    }
  }
  return { ok: errors.length === 0, errors, names };
}

function parseTimestamp(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

export function verifyCommitEvidence(evidence, { expectedManifestSha256, expectedBaselineFingerprint }) {
  const errors = [];
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, errors: ['Commit evidence is missing or not a JSON object.'] };
  }

  // Auto-verifiable: exact string/hash comparison.
  if (evidence.manifestSha256 !== expectedManifestSha256) {
    errors.push(`Evidence manifestSha256 does not match the approved manifest (expected ${expectedManifestSha256}, got ${evidence.manifestSha256 || '(missing)'}).`);
  }
  // Auto-verifiable: recomputed from the CURRENT destination documents at
  // commit time — this is what catches a stale-evidence/concurrent-update
  // scenario (the fingerprint in the evidence file was computed against an
  // earlier snapshot that no longer matches the live documents).
  if (evidence.baselineFingerprint !== expectedBaselineFingerprint) {
    errors.push(
      'Evidence baselineFingerprint does not match the CURRENT destination documents — the baseline has changed since ' +
        'this evidence was prepared (stale evidence, or a concurrent update). Refusing to proceed.'
    );
  }
  // Auto-verifiable: exact literal match.
  if (evidence.operatorConfirmation !== COMMIT_CONFIRMATION_PHRASE) {
    errors.push(`operatorConfirmation must be exactly "${COMMIT_CONFIRMATION_PHRASE}".`);
  }

  // Auto-verifiable: binds the evidence to the exact expected TEST database
  // and cluster — the same two values the pre-connection target guard
  // itself requires, re-asserted here so a commit's evidence cannot
  // reference a different environment than the one actually connected to.
  const target = evidence.target;
  if (!target || target.dbName !== EXPECTED_TARGET_DB_NAME || target.clusterHost !== EXPECTED_ATLAS_CLUSTER_HOST) {
    errors.push(
      `Evidence target identity must be exactly {dbName: "${EXPECTED_TARGET_DB_NAME}", clusterHost: "${EXPECTED_ATLAS_CLUSTER_HOST}"} ` +
        `(got ${JSON.stringify(target) || '(missing)'}).`
    );
  }

  // Fresh full backup identity + COMPLETE per-collection artifact hashes.
  // Auto-verifiable: every listed collection has both its files, under
  // dumpDir, each with the exact recorded hash. NOT auto-verifiable: that
  // the dump is actually restorable, or that "completedAt" is honest —
  // operator-attested.
  const backup = evidence.backup;
  let backupOk = false;
  let backupCollectionNames = null;
  if (!backup || typeof backup.completedAt !== 'string' || backup.dbName !== EXPECTED_TARGET_DB_NAME || typeof backup.dumpDir !== 'string' || !backup.dumpDir) {
    errors.push(`Evidence is missing a well-formed backup record (completedAt, dbName: "${EXPECTED_TARGET_DB_NAME}", dumpDir, collections[]).`);
  } else {
    const shape = validateBackupCollectionsShape(backup.collections);
    if (!shape.ok) {
      errors.push(
        'Evidence backup.collections is not a complete per-collection inventory (every collection needs both a bsonFile ' +
          'and a metadataFile, each with path+sha256; an arbitrary unrelated file is not sufficient backup evidence):'
      );
      errors.push(...shape.errors);
    } else {
      const fileErrors = [];
      for (const c of backup.collections) {
        for (const fileKey of ['bsonFile', 'metadataFile']) {
          const f = c[fileKey];
          const fullPath = path.join(backup.dumpDir, f.path);
          try {
            const actual = sha256File(fullPath);
            if (actual !== f.sha256.toLowerCase()) fileErrors.push(`Collection "${c.name}" ${fileKey} "${fullPath}" does not match the sha256 recorded in the evidence.`);
          } catch (e) {
            fileErrors.push(`Could not read collection "${c.name}" ${fileKey} "${fullPath}" to verify its hash: ${e.message}`);
          }
        }
      }
      errors.push(...fileErrors);
      backupOk = fileErrors.length === 0;
      if (backupOk) backupCollectionNames = shape.names;
    }
  }

  // Restore-check database identity (exactly one approved disposable name,
  // not merely "anything but the real target") + the specific backup
  // identity AND collection set it claims to have restored FROM (must
  // reference the same dumpDir, and verifiedCollections must be the exact
  // same SET of collection names as backup.collections — not a subset, not
  // a superset — so a partial or unrelated restore drill cannot satisfy
  // this). Auto-verifiable: all of the above, plus report file hash +
  // content. NOT auto-verifiable: whether the restore drill genuinely
  // happened — operator-attested (outcome: "success" is taken on trust).
  const restoreCheck = evidence.restoreCheck;
  const verifiedSet = new Set(Array.isArray(restoreCheck?.verifiedCollections) ? restoreCheck.verifiedCollections : []);
  const collectionsSetMatches =
    backupCollectionNames != null &&
    verifiedSet.size === backupCollectionNames.size &&
    [...backupCollectionNames].every((n) => verifiedSet.has(n));
  if (
    !restoreCheck ||
    restoreCheck.outcome !== 'success' ||
    typeof restoreCheck.completedAt !== 'string' ||
    restoreCheck.databaseName !== EXPECTED_RESTORE_CHECK_DB_NAME ||
    !backup ||
    restoreCheck.backupIdentityUsed !== backup.dumpDir ||
    !collectionsSetMatches
  ) {
    errors.push(
      `Evidence is missing a successful restoreCheck record (completedAt, outcome: "success", databaseName exactly ` +
        `"${EXPECTED_RESTORE_CHECK_DB_NAME}", backupIdentityUsed matching the SAME backup.dumpDir, and verifiedCollections ` +
        'matching EXACTLY the same set of collection names as backup.collections). NOTE: the restore outcome itself is ' +
        'accepted on operator attestation only.'
    );
  } else if (typeof restoreCheck.reportPath !== 'string' || typeof restoreCheck.reportSha256 !== 'string') {
    errors.push('Evidence restoreCheck is missing its report (reportPath, reportSha256).');
  } else {
    try {
      const actual = sha256File(restoreCheck.reportPath);
      if (actual !== restoreCheck.reportSha256.toLowerCase()) {
        errors.push(`Restore-check report at "${restoreCheck.reportPath}" does not match the sha256 recorded in the evidence.`);
      }
    } catch (e) {
      errors.push(`Could not read the restore-check report at "${restoreCheck.reportPath}" to verify its hash: ${e.message}`);
    }
  }

  // Auto-verifiable: the dry-run report is a local file this script (or a
  // prior dry-run invocation) produced — both its hash AND its actual
  // content are checked (a matching hash alone does not prove the file
  // SAYS what the evidence claims; the content markers below do).
  const dryRun = evidence.dryRun;
  if (!dryRun || dryRun.result !== 'PASS' || typeof dryRun.reportPath !== 'string' || typeof dryRun.reportSha256 !== 'string' || typeof dryRun.completedAt !== 'string') {
    errors.push('Evidence is missing a successful dryRun record (result: "PASS", completedAt, reportPath, reportSha256).');
  } else {
    try {
      const reportText = fs.readFileSync(dryRun.reportPath, 'utf8');
      const actual = sha256String(reportText);
      if (actual !== dryRun.reportSha256.toLowerCase()) {
        errors.push(`Dry-run report at "${dryRun.reportPath}" does not match the sha256 recorded in the evidence.`);
      } else {
        if (!reportText.includes('DRY-RUN complete: no writes were made')) {
          errors.push('Dry-run report content does not contain the expected "DRY-RUN complete: no writes were made" marker — a matching hash alone is not accepted as proof of a real, passing dry run.');
        }
        if (expectedManifestSha256 && !reportText.includes(expectedManifestSha256)) {
          errors.push('Dry-run report content does not reference the approved manifest SHA256 — it may be from an unrelated or outdated run.');
        }
        if (expectedBaselineFingerprint && !reportText.includes(expectedBaselineFingerprint)) {
          errors.push('Dry-run report content does not reference the current baseline fingerprint — it may predate the current baseline.');
        }
      }
    } catch (e) {
      errors.push(`Could not read the dry-run report at "${dryRun.reportPath}" to verify its content: ${e.message}`);
    }
  }

  // Required chronological ordering: backup -> restore-check -> dry-run,
  // all at or before "now". An evidence file whose steps are out of order
  // (e.g. a dry run dated before the backup it supposedly verified) cannot
  // represent a coherent, honestly-sequenced safety process.
  if (backupOk && restoreCheck?.completedAt && dryRun?.result === 'PASS') {
    const tBackup = parseTimestamp(backup.completedAt);
    const tRestore = parseTimestamp(restoreCheck.completedAt);
    const tDryRun = parseTimestamp(dryRun.completedAt);
    if (tBackup == null || tRestore == null || tDryRun == null) {
      errors.push('Evidence timestamps (backup.completedAt, restoreCheck.completedAt, dryRun.completedAt) must each be a parseable date/time.');
    } else if (!(tBackup <= tRestore && tRestore <= tDryRun && tDryRun <= Date.now())) {
      errors.push(
        'Evidence timestamps are not in the required chronological order (backup completedAt <= restoreCheck completedAt ' +
          '<= dryRun completedAt <= now).'
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Extra Atlas cluster-host guard — ADDITIONAL to migrationTargetGuard.mjs's
// own database-name allowlist (never edits that shared module). Pure string
// parsing, no network activity, matching that module's own pre-connection
// validation style.
// ---------------------------------------------------------------------------
export function assertExpectedClusterHost(uri, expectedHost = EXPECTED_ATLAS_CLUSTER_HOST) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('Refusing to proceed: the migration target URI could not be parsed to verify its cluster host.');
  }
  const host = parsed.hostname;
  if (host !== expectedHost) {
    throw new Error(
      `Refusing to proceed: the migration target resolves to cluster host "${host}", not the expected "${expectedHost}". ` +
        'Aborting before any connection.'
    );
  }
  return host;
}

// Never includes the URI itself in any log line — mirrors
// scripts/backup/backupDatabase.mjs's redact().
export function redactUri(text, uri) {
  if (!text) return text;
  return uri ? text.split(uri).join('<REDACTED_URI>') : text;
}

// ---------------------------------------------------------------------------
// Post-write verification — used identically after a real commit to prove
// (not just assume) the write actually landed as intended, and that nothing
// else drifted.
// ---------------------------------------------------------------------------
export function verifyPostWrite({ pagesMediaAfter, mediaAfter, pagesHomeAfter }, { intendedMedia, intendedHome }) {
  const errors = [];
  if (!deepEqual(pagesMediaAfter?.data, intendedMedia)) errors.push('"pages/media" data does not match the intended post-write payload.');
  if (!deepEqual(mediaAfter?.data, intendedMedia)) errors.push('"media" data does not match the intended post-write payload.');
  if (!deepEqual(pagesHomeAfter?.data, intendedHome)) errors.push('"pages/home" data does not match the intended post-write payload.');
  if (!deepEqual(pagesMediaAfter?.data, mediaAfter?.data)) errors.push('"pages/media" and "media" no longer match each other after the write.');
  return { ok: errors.length === 0, errors };
}
