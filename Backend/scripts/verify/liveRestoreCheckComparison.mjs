// QA Bug 19 — Stage 9.8B.1: a read-only, offline-by-default tool that
// compares the LIVE `vyoma_2_0_test_restore_check` database against its
// verified preservation backup, before any destructive restore drill is
// permitted to reuse that database. This is NOT a generic database-diff
// tool: both the approved target database and the approved username are
// hardcoded, the connection is read-only by construction (every database
// call goes through the native driver handle, never a compiled Mongoose
// Model, so Mongoose's own autoIndex/autoCreate behavior can never be
// triggered regardless of role), and the default invocation NEVER
// connects to anything -- a real live comparison requires BOTH
// `--execute-live-readonly` AND `--confirm-no-concurrent-writes` together.
//
// A successful comparison here never, by itself, authorizes an actual
// restore -- see the fixed RESULT/ACTUAL RESTORE AUTHORIZATION output
// strings below, printed verbatim regardless of outcome.
//
// Usage:
//   node scripts/verify/liveRestoreCheckComparison.mjs \
//     --preservation-backup <restorable-dir> --fresh-test-backup <restorable-dir>
//                                                         (offline validation only -- default, no connection)
//   node scripts/verify/liveRestoreCheckComparison.mjs \
//     --preservation-backup <dir> --fresh-test-backup <dir> \
//     --execute-live-readonly --confirm-no-concurrent-writes
//                                                         (the only way this tool ever connects)
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { deserialize, EJSON } from 'bson';
import {
  assertNotProtectedDbUri,
  assertAllowedRestoreTargetUri,
  assertExpectedRestoreClusterHost,
} from '../backup/protectedDbGuard.mjs';
import { resolveBackupUri, MONGODB_URI_ENV_VAR, validateTestBackupManifestForRestore } from '../backup/backupDatabase.mjs';
import { splitCredentialsFromUri } from '../backup/restoreDatabase.mjs';
import { validateManifestForRecovery, PRESERVATION_SOURCE_DB_NAME } from '../backup/restoreCheckPreservationBackup.mjs';

// ============================================================================
// Approved, hardcoded configuration -- never a CLI flag or env var override,
// same convention as every other narrowly-scoped tool in this project
// (restoreCheckSelfRecovery.mjs, restoreCheckPreservationBackup.mjs).
// ============================================================================
export const APPROVED_LIVE_TARGET_USERNAME = 'vyoma_restore_check';

// Passed BOTH to mongoose.connect() (so every connection-level read uses
// this BSON decode behavior by default) and explicitly to each
// db.collection(name, options) call below (defense in depth, in case a
// future Mongoose/driver version ever stops forwarding unrecognized
// connect options) -- promoteValues:false is the master switch that keeps
// Int32/Double/Decimal128/Long as their own distinct wrapper types rather
// than silently collapsing them into native JS numbers, which would hide
// exactly the kind of numeric-type difference this tool is required to
// detect.
export const BSON_PRESERVING_OPTIONS = { promoteValues: false, promoteLongs: false, promoteBuffers: false };

function parseArgs(argv) {
  const args = { executeLive: false, confirmNoConcurrentWrites: false, postRestore: false, postRecovery: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--uri') args.uri = argv[++i];
    else if (a === '--preservation-backup') args.preservationBackup = argv[++i];
    else if (a === '--fresh-test-backup') args.freshTestBackup = argv[++i];
    else if (a === '--execute-live-readonly') args.executeLive = true;
    else if (a === '--confirm-no-concurrent-writes') args.confirmNoConcurrentWrites = true;
    // QA Bug 19 — Stage 9.9A/9.9A.1: switches this SAME tool into
    // post-restore or post-recovery mode (see runPostRestoreVerification()/
    // runPostRecoveryVerification() below) -- both compare the live target
    // against a backup with UUID treated as informational only (never
    // blocking), since mongorestore is expected to assign the destination
    // collection a brand-new UUID in either case. The pre-restore mode
    // (runLiveRestoreCheckComparison) is completely unchanged by either flag.
    else if (a === '--post-restore') args.postRestore = true;
    else if (a === '--post-recovery') args.postRecovery = true;
  }
  return args;
}

// ============================================================================
// 1. Pre-connection configuration validation -- pure string/URL parsing,
//    no network activity of any kind. Reuses the EXISTING guards unchanged
//    (never a second, divergent implementation of protected-db / target-
//    allowlist / cluster-host checking), adding only the one new check
//    those guards don't already cover: the exact approved username.
// ============================================================================
export function assertApprovedLiveTargetConfiguration(uri) {
  assertNotProtectedDbUri(uri, { label: 'live restore-check target' });
  assertAllowedRestoreTargetUri(uri, { label: 'live restore-check target' });
  assertExpectedRestoreClusterHost(uri, { label: 'live restore-check target' });
  const { username } = splitCredentialsFromUri(uri);
  if (username !== APPROVED_LIVE_TARGET_USERNAME) {
    throw new Error(
      `Refusing to proceed: the configured username ("${username || '(none)'}") does not match the one approved live-` +
        `verification credential ("${APPROVED_LIVE_TARGET_USERNAME}"). Note: that credential has scoped Atlas ` +
        `readWrite permissions -- it is NOT an IAM-enforced read-only credential. This tool only ever ISSUES read ` +
        `operations (see "Connection safety" in this file's header), but the restriction is enforced here in code, not by Atlas.`
    );
  }
  return { username };
}

// ============================================================================
// 2. Mandatory offline backup verification -- reuses the EXISTING,
//    already-tested strengthened validators unchanged. Must pass before
//    any connection is even considered.
// ============================================================================
export function validateBackupsOffline({ preservationRestorePath, freshTestRestorePath }) {
  const preservation = validateManifestForRecovery(preservationRestorePath, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME });
  const freshTest = validateTestBackupManifestForRestore(freshTestRestorePath);
  return { ok: Boolean(preservation.ok && freshTest.ok), preservation, freshTest };
}

// ============================================================================
// 3. BSON-aware full-document backup parsing. Reuses the SAME iterative,
//    length-prefixed chunking logic dumpIntegrity.mjs's parseBsonFileDocCount
//    already uses and already tests -- but keeps each document (deserialized
//    with BSON_PRESERVING_OPTIONS) instead of discarding it, since THIS tool
//    (unlike the backup-integrity tooling) needs real content to compare.
//    This is deliberately a LOCAL function, not an addition to
//    dumpIntegrity.mjs -- parseBsonFileDocCount's own "content intentionally
//    discarded, never logged" behavior is a correct, separate safety choice
//    for that module's own purpose and must not be changed.
// ============================================================================
export function parseBsonFileDocuments(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 0;
  const docs = [];
  while (offset < buf.length) {
    if (offset + 4 > buf.length) throw new Error(`Truncated document length header at byte offset ${offset} in ${filePath}.`);
    const size = buf.readInt32LE(offset);
    if (size < 5 || offset + size > buf.length) {
      throw new Error(`Invalid/truncated BSON document at byte offset ${offset} in ${filePath}.`);
    }
    docs.push(deserialize(buf.subarray(offset, offset + size), BSON_PRESERVING_OPTIONS));
    offset += size;
  }
  if (offset !== buf.length) throw new Error(`File not fully consumed: ${filePath} stopped at byte ${offset} of ${buf.length}.`);
  return docs;
}

// QA Bug 19 — Stage 9.8B.2A correction: mongodump's own `.metadata.json`
// files are NOT plain JSON -- confirmed by direct inspection of this
// project's real preservation backup, every numeric value (index `v`, key
// directions, etc.) is written as canonical Extended JSON, e.g.
// `{"$numberInt":"2"}`. Plain `JSON.parse()` (used nowhere in this file,
// by design) would leave those as inert `{$numberInt: "2"}` plain objects
// instead of actual numbers, silently breaking every index-key/version
// comparison. `EJSON.parse(..., { relaxed: false })` (canonical mode) is
// used instead, specifically so the resulting values are BSON-wrapped
// (Int32, etc.) -- the SAME representation the live side returns under
// BSON_PRESERVING_OPTIONS -- so both sides are comparable via
// compareBsonValues() without a representation mismatch in either direction.
export function parseBackupMetadata(filePath) {
  return EJSON.parse(fs.readFileSync(filePath, 'utf8'), { relaxed: false });
}

// ============================================================================
// 4. Canonical, type-tagged document-identity keying. The tag prefix is
//    what prevents an ObjectId and a same-looking plain string from ever
//    being treated as the same identity (a type-unaware key, e.g. a bare
//    hex string, could not tell them apart).
// ============================================================================
export function canonicalIdKey(id) {
  if (id === null || typeof id === 'undefined') return { key: null, supported: false };
  if (typeof id === 'string') return { key: `string:${id}`, supported: true };
  if (typeof id === 'number') return { key: `number:${id}`, supported: true };
  if (id instanceof Date) return { key: `Date:${id.getTime()}`, supported: true };
  if (typeof id === 'object' && id._bsontype === 'ObjectId') return { key: `ObjectId:${id.toHexString()}`, supported: true };
  if (typeof id === 'object' && id._bsontype === 'Int32') return { key: `Int32:${id.value}`, supported: true };
  if (typeof id === 'object' && id._bsontype === 'Long') return { key: `Long:${id.toString()}`, supported: true };
  if (typeof id === 'object' && id._bsontype === 'Binary') return { key: `Binary:${id.sub_type}:${id.buffer.toString('hex')}`, supported: true };
  return { key: null, supported: false };
}

// Builds a Map<canonicalKey, document> from a list of documents, separately
// reporting any _id this tool cannot canonicalize (`unsupported`) and any
// canonical key that collides within this SAME list (`duplicates`) -- both
// are signals a comparison here cannot be trusted, never silently ignored.
export function buildDocumentInventory(docs) {
  const map = new Map();
  const duplicates = [];
  const unsupported = [];
  for (const doc of docs) {
    const { key, supported } = canonicalIdKey(doc && doc._id);
    if (!supported) {
      unsupported.push(doc && doc._id);
      continue;
    }
    if (map.has(key)) {
      duplicates.push(key);
      continue;
    }
    map.set(key, doc);
  }
  return { map, duplicates, unsupported };
}

// ============================================================================
// 5. BSON-type-aware value/document comparator. Never promotes/collapses a
//    value before comparing; never sorts object keys or array elements.
//    Returns { equal, unsupported } -- `unsupported` means a BSON type or
//    representation this function does not know how to compare reliably
//    was encountered, and the CALLER must treat the whole result as
//    INCOMPLETE, never as a PASS or a confident FAIL.
// ============================================================================
const KNOWN_WRAPPER_COMPARATORS = {
  ObjectId: (a, b) => a.equals(b),
  Int32: (a, b) => a.value === b.value,
  Double: (a, b) => a.value === b.value,
  Long: (a, b) => a.equals(b),
  Decimal128: (a, b) => a.toString() === b.toString(),
  Binary: (a, b) => a.sub_type === b.sub_type && Buffer.compare(a.buffer, b.buffer) === 0,
  Timestamp: (a, b) => a.low === b.low && a.high === b.high,
};

export function compareBsonValues(a, b) {
  const aIsNull = a === null;
  const bIsNull = b === null;
  if (aIsNull || bIsNull) return { equal: aIsNull === bIsNull, unsupported: false };

  const aDate = a instanceof Date;
  const bDate = b instanceof Date;
  if (aDate || bDate) {
    if (!aDate || !bDate) return { equal: false, unsupported: false };
    return { equal: a.getTime() === b.getTime(), unsupported: false };
  }

  const aTag = a && typeof a === 'object' ? a._bsontype : undefined;
  const bTag = b && typeof b === 'object' ? b._bsontype : undefined;
  if (aTag || bTag) {
    if (aTag !== bTag) return { equal: false, unsupported: false }; // a type difference IS a difference, e.g. Int32(5) vs Double(5)
    const comparator = KNOWN_WRAPPER_COMPARATORS[aTag];
    if (!comparator) return { equal: false, unsupported: true }; // e.g. BSONRegExp, MinKey, MaxKey, Code, DBRef
    return { equal: comparator(a, b), unsupported: false };
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return { equal: false, unsupported: false };
    if (a.length !== b.length) return { equal: false, unsupported: false };
    for (let i = 0; i < a.length; i += 1) {
      // Index-by-index, in order -- array element order is never ignored.
      const r = compareBsonValues(a[i], b[i]);
      if (r.unsupported) return r;
      if (!r.equal) return { equal: false, unsupported: false };
    }
    return { equal: true, unsupported: false };
  }

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return compareDocuments(a, b);
  }

  if (typeof a !== typeof b) return { equal: false, unsupported: false };
  return { equal: a === b, unsupported: false };
}

// Documents are equal only when every key matches, IN THE SAME ORDER, and
// every value is deep-equal -- key order is treated as significant (never
// globally sorted away), so a field-ordering difference is reported as a
// mismatch, not silently ignored. A key present with value null in one
// document and genuinely ABSENT (not just null) in the other is correctly
// caught here too, since Object.keys() never includes an absent property.
export function compareDocuments(a, b) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return { equal: false, unsupported: false };
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return { equal: false, unsupported: false };
  }
  for (const key of aKeys) {
    const r = compareBsonValues(a[key], b[key]);
    if (r.unsupported) return r;
    if (!r.equal) return { equal: false, unsupported: false };
  }
  return { equal: true, unsupported: false };
}

// ============================================================================
// 6. Complete document-inventory comparison (backup vs. live) -- never
//    relies on fetching only the backup's own _id set from the live side
//    (which could never discover an unexpected EXTRA live document); both
//    full inventories are built independently and diffed both directions.
// ============================================================================
export function compareDocumentInventories(backupDocs, liveDocs) {
  const backupInv = buildDocumentInventory(backupDocs);
  const liveInv = buildDocumentInventory(liveDocs);

  if (backupInv.unsupported.length || liveInv.unsupported.length || backupInv.duplicates.length || liveInv.duplicates.length) {
    return {
      incomplete: true,
      reason:
        'Cannot reliably enumerate document identities -- ' +
        `unsupported _id types: backup=${backupInv.unsupported.length}, live=${liveInv.unsupported.length}; ` +
        `duplicate comparison identities: backup=${backupInv.duplicates.length}, live=${liveInv.duplicates.length}.`,
    };
  }

  const missing = [];
  const additional = [];
  const modified = [];
  let unsupportedContent = false;

  for (const [key, backupDoc] of backupInv.map) {
    if (!liveInv.map.has(key)) {
      missing.push(key);
      continue;
    }
    const result = compareDocuments(backupDoc, liveInv.map.get(key));
    if (result.unsupported) {
      unsupportedContent = true;
      continue;
    }
    if (!result.equal) modified.push(key);
  }
  for (const key of liveInv.map.keys()) {
    if (!backupInv.map.has(key)) additional.push(key);
  }

  if (unsupportedContent) {
    return { incomplete: true, reason: 'One or more documents contain a BSON type or representation that cannot be compared reliably.' };
  }

  return {
    incomplete: false,
    totalBackup: backupInv.map.size,
    totalLive: liveInv.map.size,
    missingCount: missing.length,
    additionalCount: additional.length,
    modifiedCount: modified.length,
    matches: missing.length === 0 && additional.length === 0 && modified.length === 0,
  };
}

// ============================================================================
// 7. Index and collection-metadata comparison, with documented, narrow
//    normalization rules for known server-generated fields only.
// ============================================================================
// `v` (index format version) and `ns` (namespace) are assigned/maintained
// by the server itself and are expected to legitimately differ between
// two otherwise-identical index definitions (e.g. across a server version
// upgrade) -- excluded here, and ONLY here, never from anything else.
const INDEX_SERVER_GENERATED_FIELDS = new Set(['v', 'ns']);
const INDEX_BOOLEAN_FLAGS = ['unique', 'sparse'];
const INDEX_OTHER_KNOWN_OPTIONS = ['expireAfterSeconds', 'partialFilterExpression', 'collation'];

// QA Bug 19 — Stage 9.8B.4A: `background` is a pre-MongoDB-4.2 index-build
// option. For this MongoDB 8.0 restore-check comparison it has no
// operational meaning -- mongodump still faithfully records whatever was
// set at the index's original creation time, while a live MongoDB 8.0
// server's `listIndexes()` does not report it at all. Recognized here as
// an explicitly documented LEGACY field, distinct from
// INDEX_SERVER_GENERATED_FIELDS (`v`/`ns`, which a difference in IS still
// reported as a blocking discrepancy): a `background` difference is
// reported separately but is explicitly NON-blocking. This is a narrowly
// scoped, single-field exception -- it does not introduce any general
// "ignore unknown options" mechanism, and every other unrecognized index
// option continues to block verification exactly as before.
const INDEX_BENIGN_LEGACY_FIELDS = new Set(['background']);

export function normalizeIndexDefinition(idx) {
  const known = new Set(['name', 'key', ...INDEX_BOOLEAN_FLAGS, ...INDEX_OTHER_KNOWN_OPTIONS, ...INDEX_SERVER_GENERATED_FIELDS, ...INDEX_BENIGN_LEGACY_FIELDS]);
  const unknownKeys = Object.keys(idx).filter((k) => !known.has(k));
  const normalized = { name: idx.name, key: { ...idx.key } };
  for (const flag of INDEX_BOOLEAN_FLAGS) normalized[flag] = Boolean(idx[flag]); // absent == false, explicit semantics
  for (const opt of INDEX_OTHER_KNOWN_OPTIONS) if (opt in idx) normalized[opt] = idx[opt];
  return { normalized, unknownKeys };
}

// `background` must be a plain boolean if present at all -- any other
// representation (a string, an object, a wrapped BSON type, etc.) is
// unsupported and must fail closed, never silently accepted as "no
// difference".
function validateBackgroundValue(raw) {
  if (typeof raw === 'undefined') return { present: false, supported: true, value: undefined };
  if (typeof raw === 'boolean') return { present: true, supported: true, value: raw };
  return { present: true, supported: false, value: undefined };
}

// QA Bug 19 — Stage 9.8B.2A: compares key VALUES with the BSON-type-aware
// compareBsonValues() rather than `!==` -- now that metadata.json is
// parsed via canonical EJSON (parseBackupMetadata()), key direction values
// are Int32 instances, not plain numbers, and two different Int32
// instances with the same `.value` are never `===`-equal by reference.
function indexKeyOrderEqual(a, b) {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);
  if (aEntries.length !== bEntries.length) return false;
  for (let i = 0; i < aEntries.length; i += 1) {
    if (aEntries[i][0] !== bEntries[i][0]) return false; // compound index KEY ORDER matters
    const r = compareBsonValues(aEntries[i][1], bEntries[i][1]);
    if (r.unsupported || !r.equal) return false;
  }
  return true;
}

// Compares two index-definition lists (backup `.metadata.json` vs. live
// `listIndexes()`), by `name` (unique per collection). Any unrecognized
// option key found on either side is reported, never silently discarded.
//
// QA Bug 19 — Stage 9.8B.2A: `v` (index version) is still excluded from
// the generic key/name/options equality check below (via
// normalizeIndexDefinition/INDEX_SERVER_GENERATED_FIELDS) since it is
// legitimately expected to differ across a server-version boundary alone
// -- but it is NEVER silently discarded. It is compared explicitly here,
// and for THIS same-database, pre-restore comparison, ANY difference is
// treated as a blocking discrepancy requiring human review (reported via
// `versionDifferences`, which makes `matches` false) -- there is no
// bypass flag for this.
export function compareIndexDefinitions(backupIndexes, liveIndexes) {
  const backupByName = new Map(backupIndexes.map((i) => [i.name, i]));
  const liveByName = new Map(liveIndexes.map((i) => [i.name, i]));
  const missing = [...backupByName.keys()].filter((n) => !liveByName.has(n));
  const additional = [...liveByName.keys()].filter((n) => !backupByName.has(n));
  const modified = [];
  const unrecognizedOptions = [];
  const versionDifferences = [];
  const backgroundDifferences = [];
  let unsupportedVersion = false;
  let unsupportedBackground = false;

  for (const [name, backupIdx] of backupByName) {
    const liveIdx = liveByName.get(name);
    if (!liveIdx) continue;
    const { normalized: nBackup, unknownKeys: uBackup } = normalizeIndexDefinition(backupIdx);
    const { normalized: nLive, unknownKeys: uLive } = normalizeIndexDefinition(liveIdx);
    if (uBackup.length) unrecognizedOptions.push(`${name} (backup): ${uBackup.join(', ')}`);
    if (uLive.length) unrecognizedOptions.push(`${name} (live): ${uLive.join(', ')}`);

    const vResult = compareBsonValues(backupIdx.v, liveIdx.v);
    if (vResult.unsupported) {
      unsupportedVersion = true;
    } else if (!vResult.equal) {
      versionDifferences.push(name);
    }

    // QA Bug 19 — Stage 9.8B.4A: `background` -- see INDEX_BENIGN_LEGACY_FIELDS's
    // own comment. Reported separately; NEVER included in `equal` below,
    // so it cannot block the match on its own. An invalid/unsupported
    // representation on either side still fails closed.
    const backupBg = validateBackgroundValue(backupIdx.background);
    const liveBg = validateBackgroundValue(liveIdx.background);
    if (!backupBg.supported || !liveBg.supported) {
      unsupportedBackground = true;
    } else if (backupBg.present !== liveBg.present || (backupBg.present && backupBg.value !== liveBg.value)) {
      backgroundDifferences.push(name);
    }

    let equal = indexKeyOrderEqual(nBackup.key, nLive.key) && nBackup.name === nLive.name;
    for (const flag of INDEX_BOOLEAN_FLAGS) equal = equal && nBackup[flag] === nLive[flag];
    if (equal) {
      const otherResult = compareDocuments(
        Object.fromEntries(INDEX_OTHER_KNOWN_OPTIONS.filter((o) => o in nBackup).map((o) => [o, nBackup[o]])),
        Object.fromEntries(INDEX_OTHER_KNOWN_OPTIONS.filter((o) => o in nLive).map((o) => [o, nLive[o]]))
      );
      equal = equal && !otherResult.unsupported && otherResult.equal;
    }
    if (!equal) modified.push(name);
  }

  return {
    missing,
    additional,
    modified,
    unrecognizedOptions,
    versionDifferences,
    unsupportedVersion,
    // Non-blocking by design -- see INDEX_BENIGN_LEGACY_FIELDS's comment.
    // Reported in every result (even a MATCH) so the difference is never
    // silently hidden, but deliberately excluded from `matches` below.
    backgroundDifferences,
    unsupportedBackground,
    matches:
      missing.length === 0 &&
      additional.length === 0 &&
      modified.length === 0 &&
      unrecognizedOptions.length === 0 &&
      versionDifferences.length === 0 &&
      !unsupportedVersion &&
      !unsupportedBackground,
  };
}

// `uuid` is a server-assigned, per-creation-instance collection identifier
// -- expected to legitimately differ between any two independently
// created collections (even "the same" collection recreated later), so it
// is excluded here, and ONLY here, the same way `v`/`ns` are excluded from
// index comparison above. Every other key in `options` is compared as-is.
export function compareCollectionOptions(backupOptions = {}, liveOptions = {}) {
  const strip = (o) => {
    const { uuid, ...rest } = o || {};
    return rest;
  };
  return compareDocuments(strip(backupOptions), strip(liveOptions));
}

// ============================================================================
// Collection UUID comparison (QA Bug 19 Stage 9.8B.2A correction).
//
// A collection's uuid is assigned once at creation and changes if the
// collection is DROPPED AND RECREATED, even with an identical name and
// identical-looking data. For THIS tool's actual use -- comparing the SAME
// live database against its own preservation snapshot, not two
// independently created backups -- a uuid mismatch is exactly the
// "collection recreated" signal this check must not conceal, so it is
// compared explicitly here and never silently stripped or ignored. (A
// hypothetical FUTURE tool comparing a freshly-restored collection against
// its original source would have different, looser requirements --
// mongorestore always assigns a brand-new uuid, and that is expected, not
// a red flag -- but that is a different use case, out of scope here, and
// not implemented as a bypass on this one.)
//
// Handles every representation actually seen or reasonably expected:
//  - a plain lowercase/uppercase 32-hex-character string -- confirmed, by
//    direct read-only inspection of this project's own real preservation
//    backup, to be the ACTUAL format every one of its 17 collections'
//    `.metadata.json` files uses for `uuid`;
//  - a native BSON Binary instance (the live driver's listCollections()
//    `info.uuid` field, under BSON_PRESERVING_OPTIONS);
//  - a canonical Extended JSON `{$binary:{base64,subType}}` object, in
//    case a different mongodump version ever emits it this way instead.
// Any other representation is reported as unsupported, never guessed at.
export function normalizeUuidToHex(value) {
  if (value === null || typeof value === 'undefined') return { present: false, supported: true, hex: null };
  if (typeof value === 'string') {
    const hex = value.toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(hex)) return { present: true, supported: false, hex: null };
    return { present: true, supported: true, hex };
  }
  if (typeof value === 'object') {
    if (value._bsontype === 'Binary') {
      return { present: true, supported: true, hex: value.buffer.toString('hex').toLowerCase(), subType: value.sub_type };
    }
    if (value.$binary && typeof value.$binary.base64 === 'string') {
      return {
        present: true,
        supported: true,
        hex: Buffer.from(value.$binary.base64, 'base64').toString('hex').toLowerCase(),
        subType: value.$binary.subType,
      };
    }
  }
  return { present: true, supported: false, hex: null };
}

// UUID comparison is REQUIRED for this pre-restore check: evidence missing
// on either side, or an unsupported representation on either side, makes
// the comparison result `comparable: false` -- the caller must treat that
// as INCOMPLETE / NOT VERIFIED, never as a silent pass. Never returns or
// logs the actual UUID value itself -- only whether the two sides matched.
export function compareCollectionUuids(backupUuidRaw, liveUuidRaw) {
  const backup = normalizeUuidToHex(backupUuidRaw);
  const live = normalizeUuidToHex(liveUuidRaw);
  if (!backup.present || !live.present) {
    return {
      comparable: false,
      reason: `UUID evidence missing (backup present=${backup.present}, live present=${live.present}) -- required for this pre-restore comparison.`,
    };
  }
  if (!backup.supported || !live.supported) {
    return { comparable: false, reason: 'UUID representation could not be parsed reliably on one or both sides.' };
  }
  return { comparable: true, equal: backup.hex === live.hex };
}

// ============================================================================
// 8. Live fetch functions -- operate on an injected `db` handle (the native
//    driver's Db object, or a fake with the same method shapes in tests),
//    never on a compiled Mongoose Model, and never call any write method.
// ============================================================================
export async function fetchLiveCollectionsMetadata(db) {
  try {
    const collections = await db.listCollections().toArray();
    return { collections, incomplete: false };
  } catch (err) {
    return { collections: [], incomplete: true, reason: `listCollections() failed: ${err?.name || 'Unknown error'}` };
  }
}

export async function fetchLiveIndexes(db, collectionName) {
  try {
    const indexes = await db.collection(collectionName, BSON_PRESERVING_OPTIONS).listIndexes().toArray();
    return { indexes, incomplete: false };
  } catch (err) {
    return { indexes: [], incomplete: true, reason: `listIndexes() failed for "${collectionName}": ${err?.name || 'Unknown error'}` };
  }
}

// Manual cursor iteration (not a single .toArray() call) specifically so a
// failure partway through enumeration is caught and reported -- including
// how many documents were already fetched -- rather than silently losing
// partial progress or masking the failure.
export async function fetchAllDocumentsViaCursor(db, collectionName) {
  const collection = db.collection(collectionName, BSON_PRESERVING_OPTIONS);
  const cursor = collection.find({}, BSON_PRESERVING_OPTIONS);
  const docs = [];
  try {
    for (;;) {
      const hasNext = await cursor.hasNext();
      if (!hasNext) break;
      docs.push(await cursor.next());
    }
    return { docs, incomplete: false };
  } catch (err) {
    return {
      docs,
      incomplete: true,
      reason: `Cursor enumeration failed partway through "${collectionName}" (fetched ${docs.length} document(s) before the failure): ${err?.name || 'Unknown error'}`,
    };
  } finally {
    await cursor.close().catch(() => {});
  }
}

// ============================================================================
// 9. Connection management -- mirrors scripts/verify/atlasReadOnlyConnectionCheck.mjs's
//    established pattern exactly: connect via Mongoose, but perform every
//    operation through mongoose.connection.db (the native driver handle)
//    so no compiled Model is ever touched and autoIndex/autoCreate can
//    never fire, regardless of the connected role's actual privileges.
//    Never logs the resolved URI; a connection-step error exposes only
//    `.name`, never `.message` (which can embed connection details).
// ============================================================================
export async function connectReadOnly(uri) {
  await mongoose.connect(uri, BSON_PRESERVING_OPTIONS);
  return mongoose.connection.db;
}

export async function disconnectReadOnly() {
  await mongoose.disconnect().catch(() => {});
}

// ============================================================================
// 10. Orchestrator
// ============================================================================
const RESULT_MATCH = 'RESULT: LIVE TARGET MATCHES PRESERVATION BACKUP';
const RESULT_MISMATCH = 'RESULT: LIVE TARGET DIFFERS FROM PRESERVATION BACKUP';
const RESULT_INCOMPLETE = 'RESULT: INCOMPLETE -- NOT VERIFIED';
const AUTH_NOT_GRANTED = 'ACTUAL RESTORE AUTHORIZATION: NOT GRANTED';
const AUTH_BLOCKED = 'ACTUAL RESTORE AUTHORIZATION: BLOCKED';

export const EXIT_MATCH = 0;
export const EXIT_MISMATCH = 2;
export const EXIT_INCOMPLETE = 3;

// QA Bug 19 — Stage 9.8B.4A: targeted diagnostic enhancement. All of this
// data was already computed by compareIndexDefinitions() but never
// surfaced -- this only formats it for display. Names, field names, and
// counts (implicit in list length) only -- never an actual option value,
// partial-filter-expression content, collation detail, or document data.
export function formatBlockingIndexDiagnostics(indexDiff) {
  const parts = [];
  if (indexDiff.missing.length) parts.push(`missing=[${indexDiff.missing.join(', ')}]`);
  if (indexDiff.additional.length) parts.push(`additional=[${indexDiff.additional.join(', ')}]`);
  if (indexDiff.modified.length) parts.push(`key/option differences=[${indexDiff.modified.join(', ')}]`);
  if (indexDiff.versionDifferences.length) parts.push(`version differences=[${indexDiff.versionDifferences.join(', ')}]`);
  if (indexDiff.unrecognizedOptions.length) parts.push(`unrecognized options=[${indexDiff.unrecognizedOptions.join('; ')}]`);
  return parts.length ? `index discrepancy detail -- ${parts.join('; ')}` : 'index discrepancy detail -- (none further -- see unsupportedVersion/unsupportedBackground above)';
}

function listRestorableCollectionNames(restorePath) {
  return fs
    .readdirSync(restorePath)
    .filter((f) => f.endsWith('.bson'))
    .map((f) => f.replace(/\.bson$/, ''));
}

export async function runLiveRestoreCheckComparison({ uri, preservationBackup, freshTestBackup, executeLive, confirmNoConcurrentWrites }) {
  console.log('='.repeat(72));
  console.log('Live restore-check target comparison -- QA Bug 19 Stage 9.8B.1');
  console.log(`Mode: ${executeLive ? 'LIVE READ-ONLY COMPARISON' : 'OFFLINE VALIDATION ONLY (default -- no connection)'}`);
  console.log('A successful comparison never, by itself, authorizes an actual restore.');
  console.log('='.repeat(72));

  if (!preservationBackup || !freshTestBackup) {
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    console.log('--preservation-backup and --fresh-test-backup are both required.');
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete' };
  }

  // Step 1 -- mandatory offline backup verification, BEFORE anything else,
  // regardless of --execute-live-readonly.
  const backupCheck = validateBackupsOffline({ preservationRestorePath: preservationBackup, freshTestRestorePath: freshTestBackup });
  console.log(`\nPreservation backup manifest valid: ${backupCheck.preservation.ok ? 'yes' : `NO -- ${backupCheck.preservation.reason}`}`);
  console.log(`Fresh TEST backup manifest valid: ${backupCheck.freshTest.ok ? 'yes' : `NO -- ${backupCheck.freshTest.reason}`}`);
  if (!backupCheck.ok) {
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', backupCheck };
  }

  if (!executeLive) {
    console.log('\n--- OFFLINE VALIDATION complete: no database connection was attempted. ---');
    console.log('Re-run with --execute-live-readonly --confirm-no-concurrent-writes to perform the live comparison for real.');
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', backupCheck, ranLive: false };
  }

  if (!confirmNoConcurrentWrites) {
    console.log('\nRefusing to connect: --execute-live-readonly was given but --confirm-no-concurrent-writes was not. Both are required.');
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }

  const resolvedUri = resolveBackupUri({ uri });
  if (!resolvedUri) {
    console.log(`\nRefusing to connect: --uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }

  try {
    assertApprovedLiveTargetConfiguration(resolvedUri);
  } catch (err) {
    console.log(`\n${err.message}`);
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }

  const preservationNames = listRestorableCollectionNames(preservationBackup);
  const freshTestNames = listRestorableCollectionNames(freshTestBackup);

  let db;
  try {
    db = await connectReadOnly(resolvedUri);
  } catch (err) {
    console.log('\n--- CONNECTION FAILED ---');
    console.log(`Reason category: ${err?.name || 'Unknown error'}`);
    console.log('No further detail is printed here by design.');
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    await disconnectReadOnly();
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
  }

  try {
    const liveMeta = await fetchLiveCollectionsMetadata(db);
    if (liveMeta.incomplete) {
      console.log(`\n${liveMeta.reason}`);
      console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
      return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
    }
    const liveNames = liveMeta.collections.map((c) => c.name);

    const nameDiff = {
      missingFromLive: preservationNames.filter((n) => !liveNames.includes(n)),
      additionalInLive: liveNames.filter((n) => !preservationNames.includes(n)),
      preservationVsTestBackup: {
        onlyInPreservation: preservationNames.filter((n) => !freshTestNames.includes(n)),
        onlyInTestBackup: freshTestNames.filter((n) => !preservationNames.includes(n)),
      },
    };
    console.log(`\nLive collections: ${liveNames.length}, preservation backup: ${preservationNames.length}, fresh TEST backup (name cross-reference only): ${freshTestNames.length}`);
    console.log(`Missing from live (present in preservation backup only): ${nameDiff.missingFromLive.length ? nameDiff.missingFromLive.join(', ') : 'none'}`);
    console.log(`Additional in live (not in preservation backup): ${nameDiff.additionalInLive.length ? nameDiff.additionalInLive.join(', ') : 'none'}`);

    let overallIncomplete = nameDiff.missingFromLive.length > 0 || nameDiff.additionalInLive.length > 0;
    let overallMismatch = false;
    const perCollection = [];

    for (const name of preservationNames) {
      if (!liveNames.includes(name)) continue; // already reported above as missing
      const liveEntry = liveMeta.collections.find((c) => c.name === name);
      const backupMetaPath = path.join(preservationBackup, `${name}.metadata.json`);
      const backupMeta = parseBackupMetadata(backupMetaPath);

      // QA Bug 19 — Stage 9.8B.2A: UUID comparison is required, explicit,
      // and never silently skipped -- see compareCollectionUuids()'s own
      // header comment. `liveEntry.info.uuid` is the native MongoDB driver's
      // documented listCollections() field for a collection's uuid.
      const uuidResult = compareCollectionUuids(backupMeta.uuid, liveEntry.info && liveEntry.info.uuid);
      if (!uuidResult.comparable) {
        console.log(`  [${name}] collection UUID: ${uuidResult.reason}`);
        overallIncomplete = true;
        continue;
      }
      if (!uuidResult.equal) {
        console.log(`  [${name}] collection UUID MISMATCH -- this collection may have been dropped and recreated since the preservation backup was taken.`);
      }

      const optionsResult = compareCollectionOptions(backupMeta.options, liveEntry.options);
      if (optionsResult.unsupported) {
        console.log(`  [${name}] collection options: UNSUPPORTED representation -- treating as incomplete`);
        overallIncomplete = true;
        continue;
      }

      const indexResult = await fetchLiveIndexes(db, name);
      if (indexResult.incomplete) {
        console.log(`  [${name}] ${indexResult.reason}`);
        overallIncomplete = true;
        continue;
      }
      const indexDiff = compareIndexDefinitions(backupMeta.indexes || [], indexResult.indexes);
      if (indexDiff.unsupportedVersion) {
        console.log(`  [${name}] index version (v) comparison: UNSUPPORTED representation -- treating as incomplete`);
        overallIncomplete = true;
        continue;
      }
      if (indexDiff.unsupportedBackground) {
        console.log(`  [${name}] index 'background' field: UNSUPPORTED representation -- treating as incomplete`);
        overallIncomplete = true;
        continue;
      }
      if (indexDiff.versionDifferences.length) {
        console.log(`  [${name}] index version (v) MISMATCH on: ${indexDiff.versionDifferences.join(', ')} -- blocking discrepancy requiring human review.`);
      }
      if (indexDiff.backgroundDifferences.length) {
        console.log(`  [${name}] index 'background' field differs (non-blocking legacy field, informational only) on: ${indexDiff.backgroundDifferences.join(', ')}`);
      }
      if (!indexDiff.matches) {
        console.log(`  [${name}] ${formatBlockingIndexDiagnostics(indexDiff)}`);
      }

      const docResult = await fetchAllDocumentsViaCursor(db, name);
      if (docResult.incomplete) {
        console.log(`  [${name}] ${docResult.reason}`);
        overallIncomplete = true;
        continue;
      }
      const backupDocs = parseBsonFileDocuments(path.join(preservationBackup, `${name}.bson`));
      const docDiff = compareDocumentInventories(backupDocs, docResult.docs);
      if (docDiff.incomplete) {
        console.log(`  [${name}] ${docDiff.reason}`);
        overallIncomplete = true;
        continue;
      }

      const collectionMatches = uuidResult.equal && optionsResult.equal && indexDiff.matches && docDiff.matches;
      if (!collectionMatches) overallMismatch = true;
      console.log(
        `  [${name}] uuid match: ${uuidResult.equal}; options match: ${optionsResult.equal}; indexes match: ${indexDiff.matches}; ` +
          `documents: backup=${docDiff.totalBackup} live=${docDiff.totalLive} missing=${docDiff.missingCount} ` +
          `additional=${docDiff.additionalCount} modified=${docDiff.modifiedCount}`
      );
      perCollection.push({ name, uuidResult, optionsResult, indexDiff, docDiff });
    }

    if (overallIncomplete) {
      console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
      return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true, nameDiff, perCollection };
    }
    if (overallMismatch) {
      console.log(`\n${RESULT_MISMATCH}\n${AUTH_BLOCKED}`);
      return { exitCode: EXIT_MISMATCH, result: 'mismatch', ranLive: true, nameDiff, perCollection };
    }
    console.log(`\n${RESULT_MATCH}\n${AUTH_NOT_GRANTED}`);
    return { exitCode: EXIT_MATCH, result: 'match', ranLive: true, nameDiff, perCollection };
  } catch (err) {
    console.log('\n--- READ OPERATION FAILED ---');
    console.log(`Reason category: ${err?.name || 'Unknown error'}`);
    console.log(`\n${RESULT_INCOMPLETE}\n${AUTH_BLOCKED}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
  } finally {
    await disconnectReadOnly();
  }
}

// ============================================================================
// 11. Post-restore verification (QA Bug 19 Stage 9.9A) -- a separate,
//     additive entry point. Deliberately NOT merged into
//     runLiveRestoreCheckComparison() above, so that function's already-
//     verified, already-approved pre-restore behavior (including its
//     STRICT, blocking UUID requirement) is never touched or put at risk.
//     Reuses every lower-level comparison helper unchanged
//     (fetchLiveCollectionsMetadata, fetchLiveIndexes,
//     fetchAllDocumentsViaCursor, compareCollectionOptions,
//     compareIndexDefinitions, compareDocumentInventories,
//     parseBsonFileDocuments, parseBackupMetadata, connectReadOnly,
//     disconnectReadOnly, assertApprovedLiveTargetConfiguration) -- only
//     the orchestration and the UUID policy differ.
//
// UUID handling is DELIBERATELY DIFFERENT from the pre-restore path, and
// this is correct, not a weakening: `mongorestore` (this project's
// restoreDatabase.mjs does not pass --preserveUUID, and the source/
// destination namespaces differ -- vyoma_2_0_test -> vyoma_2_0_test_restore_check
// -- so --preserveUUID would not apply even if it were used) assigns the
// destination collection a BRAND-NEW uuid; it does not and cannot carry
// over the TEST backup's own recorded source uuid. Expecting them to
// match post-restore would be factually wrong, not merely lenient. UUID
// is therefore reported here purely as an OBSERVATION (changed/unchanged/
// not comparable) and never factored into the match/mismatch/incomplete
// verdict. The existing pre-restore comparison's strict, blocking UUID
// requirement (compareCollectionUuids(), used by runLiveRestoreCheckComparison
// above) is completely unmodified by this function's existence.
const RESULT_POST_RESTORE_MATCH = 'RESULT: LIVE TARGET MATCHES FRESH TEST BACKUP (POST-RESTORE)';
const RESULT_POST_RESTORE_MISMATCH = 'RESULT: LIVE TARGET DIFFERS FROM FRESH TEST BACKUP (POST-RESTORE)';
const RESULT_POST_RESTORE_INCOMPLETE = 'RESULT: INCOMPLETE -- NOT VERIFIED (POST-RESTORE)';
const POST_RESTORE_CONFIRMED = 'POST-RESTORE DATA INTEGRITY: CONFIRMED';
const POST_RESTORE_FAILED = 'POST-RESTORE DATA INTEGRITY: FAILED';
const POST_RESTORE_INCOMPLETE = 'POST-RESTORE DATA INTEGRITY: INCOMPLETE -- NOT VERIFIED';

// QA Bug 19 — Stage 9.9A.1: a second, analogous non-blocking-UUID use case
// was found -- `restoreCheckSelfRecovery.mjs` (the preservation-recovery
// tool) reuses the SAME `buildMongorestoreArgs()` as the normal restore
// path, confirmed by direct source inspection to never pass
// `--preserveUUID` either. A recovery restore therefore assigns the
// recovered collection a brand-new UUID too, EVEN THOUGH source and
// destination are the same database name (`vyoma_2_0_test_restore_check`)
// -- using the STRICT, UUID-blocking pre-restore comparator
// (runLiveRestoreCheckComparison) to verify a successful recovery would
// therefore incorrectly report it as a MISMATCH/INCOMPLETE. Rather than
// duplicate the entire orchestration a second time, both this and
// runPostRestoreVerification() below now share one internal
// implementation, parameterized only by which backup/manifest validator
// to use and the display strings -- the UUID-observational POLICY itself
// is identical in both and is NOT configurable (no generic UUID bypass
// exists anywhere in this shared implementation).
const RESULT_POST_RECOVERY_MATCH = 'RESULT: LIVE TARGET MATCHES PRESERVATION BACKUP (POST-RECOVERY)';
const RESULT_POST_RECOVERY_MISMATCH = 'RESULT: LIVE TARGET DIFFERS FROM PRESERVATION BACKUP (POST-RECOVERY)';
const RESULT_POST_RECOVERY_INCOMPLETE = 'RESULT: INCOMPLETE -- NOT VERIFIED (POST-RECOVERY)';
const POST_RECOVERY_CONFIRMED = 'POST-RECOVERY DATA INTEGRITY: CONFIRMED';
const POST_RECOVERY_FAILED = 'POST-RECOVERY DATA INTEGRITY: FAILED';
const POST_RECOVERY_INCOMPLETE = 'POST-RECOVERY DATA INTEGRITY: INCOMPLETE -- NOT VERIFIED';

async function runNonBlockingUuidVerification({
  uri,
  backupPath,
  executeLive,
  confirmNoConcurrentWrites,
  validateManifest,
  manifestLabel,
  backupFlagName,
  backupNoun,
  verificationTitle,
  verificationModeNoun,
  descriptionLine,
  resultMatch,
  resultMismatch,
  resultIncomplete,
  integrityConfirmed,
  integrityFailed,
  integrityIncomplete,
  uuidUnchangedCaveat,
}) {
  console.log('='.repeat(72));
  console.log(`${verificationTitle} -- QA Bug 19 Stage 9.9A.1`);
  console.log(`Mode: ${executeLive ? 'LIVE READ-ONLY VERIFICATION' : 'OFFLINE VALIDATION ONLY (default -- no connection)'}`);
  console.log(descriptionLine);
  console.log('='.repeat(72));

  if (!backupPath) {
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    console.log(`${backupFlagName} is required.`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete' };
  }

  const backupCheck = validateManifest(backupPath);
  console.log(`\n${manifestLabel} manifest valid: ${backupCheck.ok ? 'yes' : `NO -- ${backupCheck.reason}`}`);
  if (!backupCheck.ok) {
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', backupCheck };
  }

  if (!executeLive) {
    console.log('\n--- OFFLINE VALIDATION complete: no database connection was attempted. ---');
    console.log(`Re-run with --execute-live-readonly --confirm-no-concurrent-writes to perform the ${verificationModeNoun} verification for real.`);
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', backupCheck, ranLive: false };
  }
  if (!confirmNoConcurrentWrites) {
    console.log('\nRefusing to connect: --execute-live-readonly was given but --confirm-no-concurrent-writes was not. Both are required.');
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }

  const resolvedUri = resolveBackupUri({ uri });
  if (!resolvedUri) {
    console.log(`\nRefusing to connect: --uri is required, or set the ${MONGODB_URI_ENV_VAR} environment variable.`);
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }
  try {
    assertApprovedLiveTargetConfiguration(resolvedUri);
  } catch (err) {
    console.log(`\n${err.message}`);
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: false };
  }

  const backupNames = listRestorableCollectionNames(backupPath);

  let db;
  try {
    db = await connectReadOnly(resolvedUri);
  } catch (err) {
    console.log('\n--- CONNECTION FAILED ---');
    console.log(`Reason category: ${err?.name || 'Unknown error'}`);
    console.log('No further detail is printed here by design.');
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    await disconnectReadOnly();
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
  }

  try {
    const liveMeta = await fetchLiveCollectionsMetadata(db);
    if (liveMeta.incomplete) {
      console.log(`\n${liveMeta.reason}`);
      console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
      return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
    }
    const liveNames = liveMeta.collections.map((c) => c.name);

    const nameDiff = {
      missingFromLive: backupNames.filter((n) => !liveNames.includes(n)),
      additionalInLive: liveNames.filter((n) => !backupNames.includes(n)),
    };
    console.log(`\nLive collections: ${liveNames.length}, ${backupNoun}: ${backupNames.length}`);
    console.log(`Missing from live (present in ${backupNoun} only): ${nameDiff.missingFromLive.length ? nameDiff.missingFromLive.join(', ') : 'none'}`);
    console.log(`Additional in live (not in ${backupNoun}): ${nameDiff.additionalInLive.length ? nameDiff.additionalInLive.join(', ') : 'none'}`);

    let overallIncomplete = nameDiff.missingFromLive.length > 0 || nameDiff.additionalInLive.length > 0;
    let overallMismatch = false;
    const perCollection = [];

    for (const name of backupNames) {
      if (!liveNames.includes(name)) continue;
      const liveEntry = liveMeta.collections.find((c) => c.name === name);
      const backupMetaPath = path.join(backupPath, `${name}.metadata.json`);
      const backupMeta = parseBackupMetadata(backupMetaPath);

      // UUID: OBSERVATION ONLY -- see this function's own header comment.
      // Never affects overallIncomplete/overallMismatch below. Identical,
      // non-configurable policy for both post-restore and post-recovery.
      const uuidObservation = compareCollectionUuids(backupMeta.uuid, liveEntry.info && liveEntry.info.uuid);
      const uuidSummary = !uuidObservation.comparable
        ? `not comparable (${uuidObservation.reason})`
        : uuidObservation.equal
          ? `UNCHANGED (${uuidUnchangedCaveat})`
          : 'changed (expected: mongorestore assigns the destination a new UUID)';

      const optionsResult = compareCollectionOptions(backupMeta.options, liveEntry.options);
      if (optionsResult.unsupported) {
        console.log(`  [${name}] collection options: UNSUPPORTED representation -- treating as incomplete`);
        overallIncomplete = true;
        continue;
      }

      const indexResult = await fetchLiveIndexes(db, name);
      if (indexResult.incomplete) {
        console.log(`  [${name}] ${indexResult.reason}`);
        overallIncomplete = true;
        continue;
      }
      const indexDiff = compareIndexDefinitions(backupMeta.indexes || [], indexResult.indexes);
      if (indexDiff.unsupportedVersion || indexDiff.unsupportedBackground) {
        console.log(`  [${name}] index version/background comparison: UNSUPPORTED representation -- treating as incomplete`);
        overallIncomplete = true;
        continue;
      }
      if (!indexDiff.matches) console.log(`  [${name}] ${formatBlockingIndexDiagnostics(indexDiff)}`);
      if (indexDiff.backgroundDifferences.length) {
        console.log(`  [${name}] index 'background' field differs (non-blocking legacy field, informational only) on: ${indexDiff.backgroundDifferences.join(', ')}`);
      }

      const docResult = await fetchAllDocumentsViaCursor(db, name);
      if (docResult.incomplete) {
        console.log(`  [${name}] ${docResult.reason}`);
        overallIncomplete = true;
        continue;
      }
      const backupDocs = parseBsonFileDocuments(path.join(backupPath, `${name}.bson`));
      const docDiff = compareDocumentInventories(backupDocs, docResult.docs);
      if (docDiff.incomplete) {
        console.log(`  [${name}] ${docDiff.reason}`);
        overallIncomplete = true;
        continue;
      }

      // NOTE: uuidObservation is deliberately excluded from collectionMatches.
      const collectionMatches = optionsResult.equal && indexDiff.matches && docDiff.matches;
      if (!collectionMatches) overallMismatch = true;
      console.log(
        `  [${name}] uuid: ${uuidSummary}; options match: ${optionsResult.equal}; indexes match: ${indexDiff.matches}; ` +
          `documents: backup=${docDiff.totalBackup} live=${docDiff.totalLive} missing=${docDiff.missingCount} ` +
          `additional=${docDiff.additionalCount} modified=${docDiff.modifiedCount}`
      );
      perCollection.push({ name, uuidObservation, optionsResult, indexDiff, docDiff });
    }

    if (overallIncomplete) {
      console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
      return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true, nameDiff, perCollection };
    }
    if (overallMismatch) {
      console.log(`\n${resultMismatch}\n${integrityFailed}`);
      return { exitCode: EXIT_MISMATCH, result: 'mismatch', ranLive: true, nameDiff, perCollection };
    }
    console.log(`\n${resultMatch}\n${integrityConfirmed}`);
    return { exitCode: EXIT_MATCH, result: 'match', ranLive: true, nameDiff, perCollection };
  } catch (err) {
    console.log('\n--- READ OPERATION FAILED ---');
    console.log(`Reason category: ${err?.name || 'Unknown error'}`);
    console.log(`\n${resultIncomplete}\n${integrityIncomplete}`);
    return { exitCode: EXIT_INCOMPLETE, result: 'incomplete', ranLive: true };
  } finally {
    await disconnectReadOnly();
  }
}

export async function runPostRestoreVerification({ uri, freshTestBackup, executeLive, confirmNoConcurrentWrites }) {
  return runNonBlockingUuidVerification({
    uri,
    backupPath: freshTestBackup,
    executeLive,
    confirmNoConcurrentWrites,
    validateManifest: validateTestBackupManifestForRestore,
    manifestLabel: 'Fresh TEST backup',
    backupFlagName: '--fresh-test-backup',
    backupNoun: 'fresh TEST backup',
    verificationTitle: 'Post-restore live target verification',
    verificationModeNoun: 'post-restore',
    descriptionLine:
      'Compares the live restore-check target against the fresh TEST backup AFTER a restore. Collection UUIDs are reported as an observation only -- a changed UUID is the EXPECTED, normal outcome of a restore, never a failure by itself.',
    resultMatch: RESULT_POST_RESTORE_MATCH,
    resultMismatch: RESULT_POST_RESTORE_MISMATCH,
    resultIncomplete: RESULT_POST_RESTORE_INCOMPLETE,
    integrityConfirmed: POST_RESTORE_CONFIRMED,
    integrityFailed: POST_RESTORE_FAILED,
    integrityIncomplete: POST_RESTORE_INCOMPLETE,
    uuidUnchangedCaveat: 'unexpected for a fresh restore into a different namespace -- investigate',
  });
}

// QA Bug 19 — Stage 9.9A.1: verifies a preservation-recovery restore
// (restoreCheckSelfRecovery.mjs) succeeded, WITHOUT incorrectly treating
// the recovered collection's new UUID as a failure -- see this section's
// own header comment above for exactly why that would otherwise happen.
// Validates against the PRESERVATION backup's manifest (reusing
// validateManifestForRecovery() unchanged, the same strengthened
// validator the pre-restore path already uses) and its recorded 17
// collections / 95 documents / 39 indexes -- never hardcoded here, always
// derived from the actual backup files, exactly like every other mode.
export async function runPostRecoveryVerification({ uri, preservationBackup, executeLive, confirmNoConcurrentWrites }) {
  return runNonBlockingUuidVerification({
    uri,
    backupPath: preservationBackup,
    executeLive,
    confirmNoConcurrentWrites,
    validateManifest: (p) => validateManifestForRecovery(p, { expectedSourceDbName: PRESERVATION_SOURCE_DB_NAME }),
    manifestLabel: 'Preservation backup',
    backupFlagName: '--preservation-backup',
    backupNoun: 'preservation backup',
    verificationTitle: 'Post-recovery live target verification',
    verificationModeNoun: 'post-recovery',
    descriptionLine:
      'Compares the live restore-check target against the preservation backup AFTER a recovery restore. Collection UUIDs are reported as an observation only -- a changed UUID is the EXPECTED, normal outcome of mongorestore reassigning a new UUID even within the same database name, never a failure by itself.',
    resultMatch: RESULT_POST_RECOVERY_MATCH,
    resultMismatch: RESULT_POST_RECOVERY_MISMATCH,
    resultIncomplete: RESULT_POST_RECOVERY_INCOMPLETE,
    integrityConfirmed: POST_RECOVERY_CONFIRMED,
    integrityFailed: POST_RECOVERY_FAILED,
    integrityIncomplete: POST_RECOVERY_INCOMPLETE,
    uuidUnchangedCaveat: 'unexpected for a recovery restore -- investigate',
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { exitCode } = args.postRecovery
    ? await runPostRecoveryVerification(args)
    : args.postRestore
      ? await runPostRestoreVerification(args)
      : await runLiveRestoreCheckComparison(args);
  process.exitCode = exitCode;
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nFATAL:', err?.name || 'Unknown error');
    process.exitCode = 1;
  });
}
