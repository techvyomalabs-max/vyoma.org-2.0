// QA Bug 19 — Stage 9.6C: shared, generic mongodump-output integrity
// helpers, extracted from restoreCheckPreservationBackup.mjs (Stage 9.3C/
// 9.4B) so backupDatabase.mjs can reach the same fail-closed completion-
// evidence standard without duplicating this logic or creating a circular
// import (restoreCheckPreservationBackup.mjs already imports several things
// FROM backupDatabase.mjs, so backupDatabase.mjs cannot import from it back).
//
// Nothing in this file is specific to any one database, backup tool, or
// marker-filename convention -- it only ever operates on a plain directory
// path and a plain JS evidence object the caller supplies. No import from
// any other file in this directory, by design, so it can never itself be
// part of a future circular-import chain.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { deserialize } from 'bson';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

// Iteratively parses a mongodump .bson file -- each document is prefixed by
// its own little-endian int32 total length. Throws on any truncation or
// structural invalidity; returns the document count on success.
export function parseBsonFileDocCount(filePath) {
  const buf = fs.readFileSync(filePath);
  let offset = 0;
  let count = 0;
  while (offset < buf.length) {
    if (offset + 4 > buf.length) throw new Error(`Truncated document length header at byte offset ${offset} in ${filePath}.`);
    const size = buf.readInt32LE(offset);
    if (size < 5 || offset + size > buf.length) {
      throw new Error(`Invalid/truncated BSON document at byte offset ${offset} in ${filePath}.`);
    }
    deserialize(buf.subarray(offset, offset + size)); // validates structure; content intentionally discarded, never logged
    count += 1;
    offset += size;
  }
  if (offset !== buf.length) throw new Error(`File not fully consumed: ${filePath} stopped at byte ${offset} of ${buf.length}.`);
  return count;
}

// Deep structural verification of a mongodump output directory: every
// *.bson file must parse completely and validly, every matching
// *.metadata.json must parse as JSON, and a SHA256 + size is recorded for
// every file. Returns a summary object and a (possibly empty) errors array
// -- never throws itself, so the caller can decide what to do with a
// non-empty errors array (e.g. mark INCOMPLETE and refuse to finalize).
export function verifyDumpIntegrity(restorePath) {
  const errors = [];
  if (!fs.existsSync(restorePath) || !fs.statSync(restorePath).isDirectory()) {
    return { errors: [`Restorable directory does not exist: ${restorePath}`], collections: [], totalDocuments: 0, totalIndexes: 0, totalFiles: 0, totalSizeBytes: 0 };
  }
  const allFiles = fs.readdirSync(restorePath).filter((f) => f !== 'INCOMPLETE_BACKUP.txt' && f !== 'INCOMPLETE');
  const bsonFiles = allFiles.filter((f) => f.endsWith('.bson'));
  const collections = [];
  let totalDocuments = 0;
  let totalIndexes = 0;
  let totalSizeBytes = 0;

  for (const bsonFile of bsonFiles) {
    const name = bsonFile.replace(/\.bson$/, '');
    const bsonPath = path.join(restorePath, bsonFile);
    const metaPath = path.join(restorePath, `${name}.metadata.json`);
    const entry = { name };
    if (!fs.existsSync(metaPath)) {
      errors.push(`Collection "${name}" is missing its .metadata.json file.`);
      continue;
    }
    try {
      entry.documentCount = parseBsonFileDocCount(bsonPath);
    } catch (e) {
      errors.push(`Collection "${name}": BSON parse FAILED -- ${e.message}`);
      continue;
    }
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      entry.indexCount = Array.isArray(meta.indexes) ? meta.indexes.length : 0;
    } catch (e) {
      errors.push(`Collection "${name}": metadata.json parse FAILED -- ${e.message}`);
      continue;
    }
    entry.bsonSha256 = sha256File(bsonPath);
    entry.metaSha256 = sha256File(metaPath);
    entry.bsonSizeBytes = fs.statSync(bsonPath).size;
    entry.metaSizeBytes = fs.statSync(metaPath).size;
    totalDocuments += entry.documentCount;
    totalIndexes += entry.indexCount;
    totalSizeBytes += entry.bsonSizeBytes + entry.metaSizeBytes;
    collections.push(entry);
  }

  const preludePath = path.join(restorePath, 'prelude.json');
  let prelude = null;
  if (fs.existsSync(preludePath)) {
    try {
      JSON.parse(fs.readFileSync(preludePath, 'utf8'));
      prelude = { path: 'prelude.json', sha256: sha256File(preludePath), sizeBytes: fs.statSync(preludePath).size };
      totalSizeBytes += prelude.sizeBytes;
    } catch (e) {
      errors.push(`prelude.json parse FAILED -- ${e.message}`);
    }
  }

  if (bsonFiles.length === 0) {
    errors.push('No .bson files found at all -- an empty or missing dump cannot be verified as complete.');
  }

  return { errors, collections, prelude, totalDocuments, totalIndexes, totalFiles: collections.length * 2 + (prelude ? 1 : 0), totalSizeBytes };
}

// Reads back and JSON-parses a manifest file (temp or final) and confirms
// its content matches what was actually written, rather than merely
// confirming the write call itself didn't throw. A filesystem can report a
// "successful" write that is later unreadable or truncated (e.g. on a
// crash right after close); this is the one check that would catch that.
function readAndValidateManifestFile(filePath, expectedEvidence, stage) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error(`Completion manifest (${stage}) could not be read back after writing: ${e.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Completion manifest (${stage}) failed read-back validation -- not valid JSON: ${e.message}`);
  }
  if (
    parsed.classification !== expectedEvidence.classification ||
    parsed.sourceDatabase !== expectedEvidence.sourceDatabase ||
    parsed.clusterHost !== expectedEvidence.clusterHost
  ) {
    throw new Error(`Completion manifest (${stage}) failed read-back validation -- content did not match what was just written.`);
  }
  return parsed;
}

// Durable, fail-closed manifest write: temp file in the SAME directory (so
// the later rename is same-volume and therefore atomic on both POSIX and
// NTFS) -> write -> fsync -> read back + validate the temp file -> atomic
// rename into place -> read back + validate the FINAL file too. Any
// failure at any step throws, and the temp file (if it still exists) is
// removed on the way out -- the caller is responsible for leaving its own
// INCOMPLETE marker untouched until AFTER this function returns
// successfully. Refuses to silently overwrite an existing completion
// manifest at `manifestFilename`, which should never happen in normal
// operation (each backup gets its own brand-new directory) and would
// otherwise indicate this function being invoked twice against the same
// directory.
//
// `manifestFilename` is a REQUIRED argument (no default) precisely because
// this module is shared by more than one backup tool, each with its own
// manifest name (e.g. "PRESERVATION_BACKUP_COMPLETE.json" vs.
// "BACKUP_COMPLETE.json") -- baking either one in as a default here would
// make this "shared" module quietly favor one caller over the other.
export function writeAndVerifyManifest(backupPath, evidence, manifestFilename) {
  if (!manifestFilename) {
    throw new Error('writeAndVerifyManifest() requires an explicit manifestFilename -- this module is shared by more than one backup tool.');
  }
  const finalManifestPath = path.join(backupPath, manifestFilename);
  if (fs.existsSync(finalManifestPath)) {
    throw new Error(`Refusing to overwrite an existing completion manifest: ${finalManifestPath}`);
  }

  const serialized = JSON.stringify(evidence, null, 2) + '\n';
  const tmpManifestPath = path.join(backupPath, `.${manifestFilename}.tmp-${process.pid}-${crypto.randomUUID()}`);

  try {
    let fd;
    try {
      fd = fs.openSync(tmpManifestPath, 'w');
      fs.writeSync(fd, serialized);
      fs.fsyncSync(fd); // flush to the OS -- see restoreCheckPreservationBackup.mjs's header comment on Windows durability limits
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          // Best-effort: the write/fsync outcome above already determines success or failure.
        }
      }
    }

    readAndValidateManifestFile(tmpManifestPath, evidence, 'temp');
    fs.renameSync(tmpManifestPath, finalManifestPath); // same-directory rename -- atomic on NTFS and POSIX
    return readAndValidateManifestFile(finalManifestPath, evidence, 'final');
  } catch (err) {
    try {
      if (fs.existsSync(tmpManifestPath)) fs.rmSync(tmpManifestPath);
    } catch {
      // Best-effort cleanup only -- never mask the original failure below.
    }
    throw err;
  }
}
