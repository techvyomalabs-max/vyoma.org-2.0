// Validates that an uploaded file's actual bytes match its declared MIME
// type, closing the gap where ALLOWED_MIME only ever checked the
// client-supplied Content-Type string (trivially spoofable -- confirmed via
// a disposable-DB probe that HTML/script bytes declared as image/png pass
// every existing check unmodified). This is deliberately a small, dependency
// -free set of fixed byte-signature checks, not a general-purpose file-type
// detection library: every signature below is a long-stable, standardized
// magic number for its format, so a hand-written table carries low
// maintenance risk and avoids pulling in a library (e.g. `file-type`) built
// for detecting dozens of formats this project doesn't use.
//
// text/plain and text/csv are deliberately NOT checked here (left
// unchanged, per this task's scope) -- plain text has no reliable magic
// bytes to validate against in the first place.

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87A = Buffer.from('GIF87a', 'ascii');
const GIF89A = Buffer.from('GIF89a', 'ascii');
const PDF = Buffer.from('%PDF-', 'ascii');
const RIFF = Buffer.from('RIFF', 'ascii');
const WEBP = Buffer.from('WEBP', 'ascii');
// Legacy Office (.doc/.xls): the OLE2/Compound File Binary signature. Shared
// by both formats -- this check can confirm "this is a genuine OLE2
// compound file," not which specific Office application produced it,
// exactly as a bare PK prefix can't distinguish .docx from .xlsx below.
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
// OOXML (.docx/.xlsx): both are ZIP containers, sharing the same PK local-
// file-header signature. A bare PK prefix is NOT treated as sufficient on
// its own (any ZIP of anything would match it) -- the OOXML package spec
// requires a "[Content_Types].xml" part, which every real .docx/.xlsx (from
// Word, Excel, LibreOffice, Google's exporters, etc.) carries as one of its
// entries.
//
// That entry's position in the archive is a near-universal convention, not a
// spec guarantee -- an earlier version of this check scanned a fixed 8KB
// window of the file's lead bytes for the literal entry name, which turned
// out to falsely reject legitimate files where enough preceding ZIP entries
// (e.g. several embedded images) pushed the name past that window. The fix
// below reads the ZIP's End Of Central Directory (EOCD) record and walks the
// Central Directory File Headers it points to, to get every entry's name
// from the format's own metadata instead of guessing how far into the file
// to look.
//
// This deliberately parses ONLY the central directory, never local file
// headers: central directory entries are a flat, back-to-back array of
// fixed-layout metadata records whose name/extra/comment field lengths are
// explicit at known offsets, so walking them is unambiguous. Local file
// headers, by contrast, can defer the compressed/uncompressed size to a
// trailing "data descriptor" record when a certain flag bit is set, making
// it unsafe to compute each entry's length -- and thus the offset of the
// next header -- without handling that case; this parser avoids that
// problem entirely by never walking local headers. No file content is ever
// decompressed or read here, only entry names.
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OOXML_MARKER = '[Content_Types].xml';
const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const EOCD_MIN_SIZE = 22;
const EOCD_MAX_COMMENT = 65535; // ZIP spec: comment length field is 16 bits
const CENTRAL_DIR_SIGNATURE = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
const CENTRAL_DIR_HEADER_SIZE = 46;
// Caps iteration even if a crafted EOCD declares an absurd entry count --
// real Office documents have at most a few dozen parts.
const MAX_CENTRAL_DIR_ENTRIES = 5000;

function startsWith(buffer, signature) {
  return buffer.length >= signature.length && buffer.subarray(0, signature.length).equals(signature);
}

function isWebp(buffer) {
  return buffer.length >= 12 && startsWith(buffer, RIFF) && buffer.subarray(8, 12).equals(WEBP);
}

// Locates the EOCD record by scanning backward from the end of the file,
// bounded by the ZIP spec's max comment length -- not an arbitrary heuristic
// window, since the EOCD is, by format definition, never farther from the
// end than EOCD_MIN_SIZE + EOCD_MAX_COMMENT bytes.
function findEndOfCentralDirectory(buffer) {
  const searchFloor = Math.max(0, buffer.length - (EOCD_MIN_SIZE + EOCD_MAX_COMMENT));
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= searchFloor; offset -= 1) {
    if (startsWith(buffer.subarray(offset), EOCD_SIGNATURE)) return offset;
  }
  return -1;
}

// Returns the set of entry names from the ZIP central directory, or null if
// the buffer isn't a well-formed-enough ZIP to read one from. Any failure
// mode here (missing EOCD, an offset/length that runs past the buffer, a
// bad signature) is treated as "can't confirm this is OOXML" rather than
// thrown, so a malformed or truncated upload is simply rejected, never a
// crash.
function readCentralDirectoryEntryNames(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1 || eocdOffset + EOCD_MIN_SIZE > buffer.length) return null;

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (centralDirOffset < 0 || centralDirOffset >= buffer.length) return null;

  const names = new Set();
  let pos = centralDirOffset;
  const entriesToRead = Math.min(totalEntries, MAX_CENTRAL_DIR_ENTRIES);
  for (let i = 0; i < entriesToRead; i += 1) {
    if (pos + CENTRAL_DIR_HEADER_SIZE > buffer.length) break;
    if (!startsWith(buffer.subarray(pos), CENTRAL_DIR_SIGNATURE)) break;

    const nameLength = buffer.readUInt16LE(pos + 28);
    const extraLength = buffer.readUInt16LE(pos + 30);
    const commentLength = buffer.readUInt16LE(pos + 32);
    const nameStart = pos + CENTRAL_DIR_HEADER_SIZE;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;

    names.add(buffer.subarray(nameStart, nameEnd).toString('ascii'));
    pos = nameEnd + extraLength + commentLength;
  }
  return names;
}

function isOoxml(buffer) {
  if (!startsWith(buffer, ZIP_LOCAL_HEADER)) return false;
  try {
    const names = readCentralDirectoryEntryNames(buffer);
    return names != null && names.has(OOXML_MARKER);
  } catch {
    // Any unexpected read failure (e.g. a value that technically fits the
    // bounds checks above but still can't be interpreted) means "not
    // confirmed as OOXML" -- fail closed, never crash the request.
    return false;
  }
}

// mimeType -> (buffer) => boolean. Any mimeType not listed here is not
// signature-checked at all (validateFileSignature returns true unchecked) --
// this is the explicit, intentional pass-through for text/plain and
// text/csv, which have no reliable magic bytes to validate.
const SIGNATURE_CHECKS = {
  'image/jpeg': (buf) => startsWith(buf, JPEG),
  'image/png': (buf) => startsWith(buf, PNG),
  'image/gif': (buf) => startsWith(buf, GIF87A) || startsWith(buf, GIF89A),
  'image/webp': isWebp,
  'application/pdf': (buf) => startsWith(buf, PDF),
  'application/msword': (buf) => startsWith(buf, OLE2),
  'application/vnd.ms-excel': (buf) => startsWith(buf, OLE2),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': isOoxml,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': isOoxml,
};

// Returns true when `buffer`'s actual content matches what `mimeType`
// claims, or when `mimeType` isn't one this module checks at all (so
// callers can apply it unconditionally, after the existing ALLOWED_MIME
// allowlist check, without special-casing untracked types themselves).
export function matchesDeclaredFileType(mimeType, buffer) {
  const check = SIGNATURE_CHECKS[mimeType];
  if (!check) return true;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
  return check(buffer);
}
