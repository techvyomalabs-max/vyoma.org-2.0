import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env, isS3Configured } from '../../config/env.js';

// Same lazy-client pattern as razorpay.adapter.js: the real SDK is always
// imported, but never constructed (let alone called) until AWS_* env vars
// are actually set. Every function below returns null when unconfigured —
// callers turn that into a clear "not configured" error, never a fake success.
let client = null;
function getClient() {
  if (!isS3Configured()) return null;
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
    });
  }
  return client;
}

export function buildStorageKey(originalFilename) {
  const dot = originalFilename.lastIndexOf('.');
  const ext = dot >= 0 ? originalFilename.slice(dot) : '';
  return `media/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

// text/plain and text/csv are the only ALLOWED_MIME types a browser renders
// inline by default when navigated to directly (PDFs get a native browser
// viewer; Office formats already trigger a download/open-with prompt since
// browsers have no inline renderer for them) -- these two are singled out so
// the direct S3 URL downloads instead of displaying raw (and, for CSV,
// potentially confusing) content inline.
const DISPOSITION_MIME_TYPES = new Set(['text/plain', 'text/csv']);

// Strips everything that could break out of the Content-Disposition header's
// quoted-string syntax (", CR, LF), suggest an unintended path (/, \), hit
// Windows' reserved drive/ADS separator (:), or otherwise isn't a plain
// printable/control-free character.
const UNSAFE_FILENAME_CHARS = /[\x00-\x1f\x7f"\\/:]/g;

function fallbackFilename(mimeType) {
  return mimeType === 'text/csv' ? 'download.csv' : 'download.txt';
}

function expectedExtension(mimeType) {
  return mimeType === 'text/csv' ? '.csv' : '.txt';
}

// A real OS filesystem caps an individual filename at roughly 255 bytes
// (macOS/Linux) or ~255 UTF-16 code units (Windows) -- nothing in HTTP
// multipart parsing enforces anything close to that for the `filename` value
// of a file part, since it is just a client-supplied string, not something
// read back off a real filesystem. An authenticated admin (media:write is
// required to reach this at all) using a non-browser client could otherwise
// supply an arbitrarily long filename, producing a proportionally oversized
// Content-Disposition header once that object is served back from S3 --
// confirmed to risk exceeding the ~4-8KB per-header-line ceilings commonly
// enforced by HTTP infrastructure (e.g. nginx's large_client_header_buffers
// default) well before reaching any realistic legitimate filename length.
// 200 UTF-8 bytes comfortably covers genuine filenames while keeping the
// worst case (a name that is pure non-ASCII, which triples in size under
// percent-encoding in the filename* parameter below) well under those
// ceilings.
const MAX_FILENAME_BYTES = 200;

function utf8ByteLength(str) {
  return Buffer.byteLength(str, 'utf8');
}

// Truncates `name` to at most `maxBytes` UTF-8 bytes, walking one Unicode
// code point at a time (`for...of` over a string iterates by code point, not
// UTF-16 code unit, so a surrogate pair is always kept or dropped as a whole
// -- never split) so a multi-byte character is never cut in half. When
// `name` already ends with `extension` and the extension itself fits inside
// the budget, the extension's bytes are reserved first and re-appended after
// truncating only the base portion, so a recognizable .txt/.csv suffix
// survives truncation instead of being chopped off arbitrarily. Returns ''
// if nothing can be kept safely (e.g. the extension alone exceeds the
// budget) -- callers fall back to a generic name in that case.
function truncateToUtf8ByteLimit(name, maxBytes, extension) {
  if (utf8ByteLength(name) <= maxBytes) return name;

  const hasExpectedExt = name.toLowerCase().endsWith(extension);
  const extBytes = hasExpectedExt ? utf8ByteLength(extension) : 0;
  const budget = maxBytes - extBytes;
  if (budget <= 0) return '';

  const base = hasExpectedExt ? name.slice(0, name.length - extension.length) : name;

  let truncated = '';
  let bytes = 0;
  for (const ch of base) {
    const chBytes = utf8ByteLength(ch);
    if (bytes + chBytes > budget) break;
    truncated += ch;
    bytes += chBytes;
  }

  return hasExpectedExt ? truncated + extension : truncated;
}

// encodeURIComponent already percent-encodes everything outside
// A-Za-z0-9-_.!~*'(), but RFC 5987's ext-value grammar additionally reserves
// the four characters it leaves unescaped (', (, ), *), since they carry
// syntactic meaning (e.g. ' delimits the language tag) -- those are encoded
// on top of encodeURIComponent's own escaping.
function rfc5987Encode(value) {
  return encodeURIComponent(value).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// Returns a full Content-Disposition header value for text/plain and
// text/csv uploads, or undefined for every other MIME type (callers treat
// undefined as "do not set this header at all", leaving existing inline-PDF
// and Office-document download behavior untouched). Includes both a plain
// ASCII `filename` (understood by every client) and an RFC 5987 `filename*`
// (so a non-ASCII original name -- IAST/Devanagari filenames are a real,
// expected case for this project -- is preserved rather than collapsed to
// underscores, for the large majority of browsers that already support it).
export function buildContentDisposition(mimeType, originalFilename) {
  if (!DISPOSITION_MIME_TYPES.has(mimeType)) return undefined;

  const raw = typeof originalFilename === 'string' ? originalFilename.trim() : '';
  const sanitized = raw.replace(UNSAFE_FILENAME_CHARS, '_').trim();
  // A result that's empty, or made up entirely of substituted underscores
  // (every character was unsafe), carries no real information from the
  // original name -- treated the same as "invalid" rather than exposed as a
  // meaningless string of underscores.
  const meaningfulSanitized = /^_*$/.test(sanitized) ? '' : sanitized;
  const lengthLimited = meaningfulSanitized
    ? truncateToUtf8ByteLimit(meaningfulSanitized, MAX_FILENAME_BYTES, expectedExtension(mimeType))
    : '';
  const safeName = lengthLimited || fallbackFilename(mimeType);
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_') || fallbackFilename(mimeType);

  return `attachment; filename="${asciiName}"; filename*=UTF-8''${rfc5987Encode(safeName)}`;
}

export async function uploadObject({ key, buffer, mimeType, contentDisposition }) {
  const s3 = getClient();
  if (!s3) return null;
  await s3.send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    })
  );
  return { url: `https://${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com/${key}` };
}

export async function deleteObject({ key }) {
  const s3 = getClient();
  if (!s3) return null;
  await s3.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  return true;
}
