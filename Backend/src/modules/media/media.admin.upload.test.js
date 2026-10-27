// Regression coverage for the multer 2.4.0 -> 2.5.0 upgrade (resolved
// GHSA-q7qp-rjg7-q26m) and the existing media-upload endpoint's behavior.
// Exercises the real Express app (createApp()) and the real multer/busboy
// multipart parsing path (via Node's native FormData/Blob + fetch, not a
// hand-rolled or mocked multipart body) against a disposable in-memory
// MongoDB -- reuses auth/authTestHelpers.js, the same infrastructure the
// auth/RBAC test suite already uses.
//
// S3 is deliberately left unconfigured (no AWS_* env vars are set anywhere
// in this file) -- uploadObject() then returns null and createMedia()
// responds 503 MEDIA_NOT_CONFIGURED, exactly as it does today for any real
// admin running this server without AWS credentials configured. For an
// otherwise-fully-valid request (authorized, correct MIME type, under the
// size limit), reaching that 503 -- rather than 401/403/422/413 -- is what
// "passed every validation this endpoint performs" looks like without
// AWS credentials. This is NOT a claim that the file was actually stored:
// no S3 write ever happens, and no test in this file asserts a 201 or
// inspects a stored object's contents. Testing a genuine end-to-end 201
// would require either real AWS credentials (forbidden here) or adding an
// injectable seam to s3.adapter.js/media.admin.controller.js, which this
// task's scope explicitly excludes ("do not modify media upload controller
// logic", "do not modify S3 configuration"). That gap is called out
// explicitly in this task's report rather than papered over.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnv, teardownTestEnv, createTestUser } from '../auth/authTestHelpers.js';
import { signAccessToken } from '../auth/auth.service.js';
import { RoleModel } from '../auth/role.model.js';

let env;
let adminRole;
let noMediaPermsRole;
let MediaModel;

before(async () => {
  env = await setupTestEnv();
  adminRole = await RoleModel.findOne({ key: 'admin' });
  noMediaPermsRole = await RoleModel.create({
    key: 'no_media_perms_role',
    name: 'No Media Perms',
    permissions: ['content:read', 'content:write'], // has *some* permissions, just not media:*
    mfaRequired: false,
  });
  ({ MediaModel } = await import('./media.model.js'));
});

after(async () => {
  await teardownTestEnv(env);
});

function authHeader(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Genuine magic-byte fixtures for the new file-signature validation. The
// default `bytes` below used to be arbitrary placeholder text -- now that
// createMedia() verifies actual content against the declared MIME type,
// the default must be real PNG bytes, or every test that relies on "a
// supported MIME type passes validation" would start failing the new
// content check instead of reaching the S3-unconfigured stage it's meant
// to exercise.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const GIF_BYTES = Buffer.from('GIF89a' + '\x00\x00\x00\x00', 'ascii');
const WEBP_BYTES = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([0x20, 0x00, 0x00, 0x00]), Buffer.from('WEBP', 'ascii')]);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< >>\nendobj\n', 'ascii');
const OLE2_BYTES = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]);

// Byte-accurate ZIP builder -- fileSignature.js's OOXML check now reads the
// ZIP central directory (not a fixed-size scan of the file's lead bytes), so
// its tests need genuinely well-formed archives (real local file headers,
// real central directory headers, a real End Of Central Directory record
// with correct offsets), not a simplified byte sequence that merely "looks
// ZIP-ish". Entries are stored (uncompressed); CRC-32 is left as 0 since
// nothing in this codebase's validator reads it.
function buildLocalFileHeader(name, content) {
  const nameBuf = Buffer.from(name, 'ascii');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // signature
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0, 6); // general purpose flag
  header.writeUInt16LE(0, 8); // compression method (0 = stored)
  header.writeUInt16LE(0, 10); // last mod time
  header.writeUInt16LE(0x21, 12); // last mod date
  header.writeUInt32LE(0, 14); // crc-32
  header.writeUInt32LE(content.length, 18); // compressed size
  header.writeUInt32LE(content.length, 22); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 26); // filename length
  header.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([header, nameBuf, content]);
}

function buildCentralDirectoryHeader(name, content, localHeaderOffset) {
  const nameBuf = Buffer.from(name, 'ascii');
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0); // signature
  header.writeUInt16LE(20, 4); // version made by
  header.writeUInt16LE(20, 6); // version needed
  header.writeUInt16LE(0, 8); // general purpose flag
  header.writeUInt16LE(0, 10); // compression method
  header.writeUInt16LE(0, 12); // last mod time
  header.writeUInt16LE(0x21, 14); // last mod date
  header.writeUInt32LE(0, 16); // crc-32
  header.writeUInt32LE(content.length, 20); // compressed size
  header.writeUInt32LE(content.length, 24); // uncompressed size
  header.writeUInt16LE(nameBuf.length, 28); // filename length
  header.writeUInt16LE(0, 30); // extra field length
  header.writeUInt16LE(0, 32); // comment length
  header.writeUInt16LE(0, 34); // disk number start
  header.writeUInt16LE(0, 36); // internal attributes
  header.writeUInt32LE(0, 38); // external attributes
  header.writeUInt32LE(localHeaderOffset, 42); // offset of local header
  return Buffer.concat([header, nameBuf]);
}

// entries: [{ name, content }] -- content may be a Buffer or an ascii string.
function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, content } of entries) {
    const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'ascii');
    const local = buildLocalFileHeader(name, buf);
    localParts.push(local);
    centralParts.push(buildCentralDirectoryHeader(name, buf, offset));
    offset += local.length;
  }
  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir start
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralSection.length, 12); // size of central directory
  eocd.writeUInt32LE(localSection.length, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([localSection, centralSection, eocd]);
}

function paddingEntries(count, sizeEach) {
  return Array.from({ length: count }, (_, i) => ({
    name: `media/image${i}.bin`,
    content: Buffer.alloc(sizeEach, 0x41),
  }));
}

// A genuine, well-formed OOXML package shape: [Content_Types].xml as the
// first entry, exactly the near-universal convention real Word/Excel/
// LibreOffice output follows.
const OOXML_BYTES = buildZip([
  { name: '[Content_Types].xml', content: '<?xml version="1.0"?><Types/>' },
  { name: 'word/document.xml', content: '<document/>' },
]);

// Same package, but [Content_Types].xml is NOT the first entry -- proves the
// central-directory-based check doesn't depend on entry order.
const OOXML_MARKER_LATER_BYTES = buildZip([
  { name: '_rels/.rels', content: '<rels/>' },
  { name: '[Content_Types].xml', content: '<?xml version="1.0"?><Types/>' },
  { name: 'word/document.xml', content: '<document/>' },
]);

// 50 padding entries (~200 bytes each, ~12KB total) precede the marker, so
// its local file header lands well past the 8192-byte window the previous
// (now-removed) implementation scanned -- this is the exact shape of file
// that implementation incorrectly rejected.
const OOXML_MARKER_BEYOND_OLD_WINDOW_BYTES = buildZip([
  ...paddingEntries(50, 200),
  { name: '[Content_Types].xml', content: '<?xml version="1.0"?><Types/>' },
  { name: 'word/document.xml', content: '<document/>' },
]);

// A structurally real ZIP archive (valid local headers, central directory,
// and EOCD) that simply isn't an OOXML package -- no [Content_Types].xml
// entry anywhere in it.
const ORDINARY_ZIP_BYTES = buildZip([{ name: 'readme.txt', content: 'just some notes, not an office document' }]);

// A ZIP local file header signature followed by bytes that never form a
// valid central directory or EOCD record at all.
const MALFORMED_ZIP_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('this is garbage that never contains a real central directory or EOCD record', 'ascii'),
]);

// A real, well-formed ZIP with its final bytes (the EOCD record) cut off --
// simulates an upload that was truncated in transit.
const TRUNCATED_ZIP_BYTES = OOXML_BYTES.subarray(0, OOXML_BYTES.length - 10);

async function uploadFile({ token, filename = 'test.png', mimeType = 'image/png', bytes = PNG_BYTES } = {}) {
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: mimeType }), filename);
  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, {
    method: 'POST',
    headers: authHeader(token),
    body: form,
  });
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function mediaCount() {
  return MediaModel.countDocuments();
}

test('an unauthenticated upload request is rejected with 401', async () => {
  const before = await mediaCount();
  const { res, body } = await uploadFile({ token: undefined });
  assert.equal(res.status, 401);
  assert.equal(body.code, 'UNAUTHENTICATED');
  assert.equal(await mediaCount(), before, 'no Media record may be created for a rejected request');
});

test('an authenticated user without media:write permission is rejected with 403', async () => {
  const user = await createTestUser({ email: 'media-no-perms@example.test', roleKey: 'no_media_perms_role' });
  const token = signAccessToken(user, noMediaPermsRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token });
  assert.equal(res.status, 403);
  assert.equal(body.code, 'FORBIDDEN');
  assert.equal(await mediaCount(), before);
});

test('an authorized upload of a supported MIME type passes validation (reaches the S3-unconfigured stage, not a MIME rejection)', async () => {
  const user = await createTestUser({ email: 'media-admin-ok@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token, mimeType: 'image/png' });
  assert.equal(res.status, 503, 'must NOT be rejected as an unsupported file type');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
  assert.equal(await mediaCount(), before, 'no Media record is created either way, since S3 remains unconfigured in this test environment');
});

test('an unsupported MIME type is rejected with 422, before the S3-configuration check is ever reached', async () => {
  const user = await createTestUser({ email: 'media-admin-badtype@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({ token, mimeType: 'application/x-msdownload', filename: 'evil.exe' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before);
});

// --- File-signature (magic-byte) content validation ---

test('a genuine JPEG signature passes validation', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-jpeg@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'image/jpeg', bytes: JPEG_BYTES, filename: 'photo.jpg' });
  assert.equal(res.status, 503, 'a genuine JPEG must not be rejected as a content mismatch');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine GIF signature passes validation', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-gif@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'image/gif', bytes: GIF_BYTES, filename: 'anim.gif' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine WebP signature passes validation', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-webp@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'image/webp', bytes: WEBP_BYTES, filename: 'photo.webp' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine PDF signature passes validation', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-pdf@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'application/pdf', bytes: PDF_BYTES, filename: 'doc.pdf' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine legacy-Office (OLE2) signature passes validation for .doc', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-doc@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'application/msword', bytes: OLE2_BYTES, filename: 'report.doc' });
  assert.equal(res.status, 503, 'a genuine OLE2 compound file must not be rejected as a content mismatch');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine legacy-Office (OLE2) signature passes validation for .xls', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-xls@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'application/vnd.ms-excel', bytes: OLE2_BYTES, filename: 'sheet.xls' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine OOXML package (with the [Content_Types].xml marker) passes validation for .docx', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-docx@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: OOXML_BYTES,
    filename: 'report.docx',
  });
  assert.equal(res.status, 503, 'a genuine-shaped OOXML package must not be incorrectly rejected');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine OOXML package (with the [Content_Types].xml marker) passes validation for .xlsx', async () => {
  const user = await createTestUser({ email: 'media-admin-sig-xlsx@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: OOXML_BYTES,
    filename: 'sheet.xlsx',
  });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a TXT upload passes controller validation (reaches the S3-unconfigured stage), unaffected by Content-Disposition support', async () => {
  const user = await createTestUser({ email: 'media-admin-txt@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'text/plain', bytes: Buffer.from('just some plain notes'), filename: 'notes.txt' });
  assert.equal(res.status, 503, 'a genuine TXT upload must not be rejected as a content mismatch or unsupported type');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a CSV upload passes controller validation (reaches the S3-unconfigured stage), unaffected by Content-Disposition support', async () => {
  const user = await createTestUser({ email: 'media-admin-csv@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({ token, mimeType: 'text/csv', bytes: Buffer.from('a,b,c\n1,2,3'), filename: 'data.csv' });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('HTML content declared as text/plain still passes controller validation (text/plain has no content-signature check; unaffected by Content-Disposition support)', async () => {
  const user = await createTestUser({ email: 'media-admin-html-as-txt@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'text/plain',
    bytes: Buffer.from('<html><body><script>alert(document.domain)</script></body></html>'),
    filename: 'fake.txt',
  });
  assert.equal(res.status, 503, 'text/plain intentionally has no content-signature check -- this task only changes delivery headers, not content validation');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('HTML content declared as text/csv still passes controller validation (text/csv has no content-signature check; unaffected by Content-Disposition support)', async () => {
  const user = await createTestUser({ email: 'media-admin-html-as-csv@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'text/csv',
    bytes: Buffer.from('<html><body><script>alert(document.domain)</script></body></html>'),
    filename: 'fake.csv',
  });
  assert.equal(res.status, 503);
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('HTML/script content declared as image/png is rejected with 422 FILE_CONTENT_MISMATCH', async () => {
  const user = await createTestUser({ email: 'media-admin-spoof-html@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const htmlPayload = Buffer.from('<html><body><script>alert(document.domain)</script></body></html>');
  const { res, body } = await uploadFile({ token, mimeType: 'image/png', bytes: htmlPayload, filename: 'fake.png' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before, 'no Media record may be created for mismatched content');
});

test('SVG content declared as image/png is rejected with 422 FILE_CONTENT_MISMATCH (not just when declared as image/svg+xml)', async () => {
  const user = await createTestUser({ email: 'media-admin-spoof-svg-as-png@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const svgPayload = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const { res, body } = await uploadFile({ token, mimeType: 'image/png', bytes: svgPayload, filename: 'disguised.png' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('a corrupted PDF signature (missing the %PDF- header) is rejected with 422 FILE_CONTENT_MISMATCH', async () => {
  const user = await createTestUser({ email: 'media-admin-corrupt-pdf@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const corrupted = Buffer.from('this is not actually a pdf file');
  const { res, body } = await uploadFile({ token, mimeType: 'application/pdf', bytes: corrupted, filename: 'fake.pdf' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('arbitrary non-ZIP bytes declared as .docx are rejected with 422 FILE_CONTENT_MISMATCH', async () => {
  const user = await createTestUser({ email: 'media-admin-fake-docx@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const notAZip = Buffer.from('this is plain text, not a zip container at all');
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: notAZip,
    filename: 'fake.docx',
  });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('a well-formed ZIP without the OOXML [Content_Types].xml entry is rejected for .xlsx (a generic ZIP is not treated as proof)', async () => {
  const user = await createTestUser({ email: 'media-admin-generic-zip-xlsx@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  // A real, structurally valid ZIP archive (real local headers, central
  // directory, EOCD) for some unrelated content -- this must NOT be
  // accepted just because it "looks like a ZIP file".
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: ORDINARY_ZIP_BYTES,
    filename: 'fake.xlsx',
  });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('a genuine OOXML package with [Content_Types].xml as a later (not first) entry passes validation', async () => {
  const user = await createTestUser({ email: 'media-admin-ooxml-marker-later@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: OOXML_MARKER_LATER_BYTES,
    filename: 'report.docx',
  });
  assert.equal(res.status, 503, 'entry order must not affect whether a genuine OOXML package is recognized');
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a genuine OOXML package with [Content_Types].xml beyond the previous 8KB scan window passes validation (regression test)', async () => {
  const user = await createTestUser({ email: 'media-admin-ooxml-beyond-window@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: OOXML_MARKER_BEYOND_OLD_WINDOW_BYTES,
    filename: 'sheet.xlsx',
  });
  assert.equal(
    res.status,
    503,
    'a legitimate OOXML file must not be rejected just because preceding entries push [Content_Types].xml past an arbitrary byte offset'
  );
  assert.equal(body.code, 'MEDIA_NOT_CONFIGURED');
});

test('a malformed ZIP (no valid central directory or EOCD) fails safely with 422, not a crash', async () => {
  const user = await createTestUser({ email: 'media-admin-malformed-zip@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: MALFORMED_ZIP_BYTES,
    filename: 'malformed.docx',
  });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('a truncated ZIP (valid header, missing central directory/EOCD) fails safely with 422, not a crash', async () => {
  const user = await createTestUser({ email: 'media-admin-truncated-zip@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const { res, body } = await uploadFile({
    token,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: TRUNCATED_ZIP_BYTES,
    filename: 'truncated.docx',
  });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'FILE_CONTENT_MISMATCH');
  assert.equal(await mediaCount(), before);
});

test('a plain SVG upload is rejected with 422 (image/svg+xml is no longer in ALLOWED_MIME)', async () => {
  const user = await createTestUser({ email: 'media-admin-svg-plain@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const plainSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');
  const { res, body } = await uploadFile({ token, bytes: plainSvg, mimeType: 'image/svg+xml', filename: 'icon.svg' });
  assert.equal(res.status, 422);
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before, 'no Media record may be created for a rejected SVG upload');
});

test('an SVG containing a <script> tag and an onload handler is rejected with 422, identically to a benign SVG', async () => {
  const user = await createTestUser({ email: 'media-admin-svg-malicious@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const maliciousSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)"><script>alert(document.domain)</script></svg>'
  );
  const { res, body } = await uploadFile({ token, bytes: maliciousSvg, mimeType: 'image/svg+xml', filename: 'malicious.svg' });
  assert.equal(res.status, 422, 'rejection happens at the MIME-type check, before any file content is ever inspected');
  assert.equal(body.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(await mediaCount(), before, 'the malicious SVG must never reach Media creation or S3');
});

test('an oversized file is rejected with the existing 413 FILE_TOO_LARGE response', async () => {
  const user = await createTestUser({ email: 'media-admin-oversized@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  const oversized = Buffer.alloc(16 * 1024 * 1024); // > the existing 15MB limit
  const { res, body } = await uploadFile({ token, bytes: oversized, mimeType: 'image/png' });
  assert.equal(res.status, 413);
  assert.equal(body.code, 'FILE_TOO_LARGE');
  assert.equal(await mediaCount(), before);
});

test('a malformed multipart request fails safely (a clean error response, not a crash or hang)', async () => {
  const user = await createTestUser({ email: 'media-admin-malformed@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);
  const before = await mediaCount();

  // A Content-Type claiming multipart/form-data with a boundary that never
  // actually appears in the body -- busboy can never find a complete part,
  // so no req.file is ever populated.
  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, {
    method: 'POST',
    headers: {
      ...authHeader(token),
      'Content-Type': 'multipart/form-data; boundary=----ThisBoundaryNeverAppearsInTheBody',
    },
    body: 'this is not a valid multipart body at all',
  });
  assert.ok(res.status >= 400 && res.status < 500, `expected a clean 4xx, got ${res.status}`);
  assert.equal(await mediaCount(), before, 'a malformed request must never create a Media record');
});

test('existing media listing behavior is unaffected by the multer upgrade', async () => {
  const user = await createTestUser({ email: 'media-admin-list@example.test', roleKey: 'admin' });
  const token = signAccessToken(user, adminRole);

  const res = await fetch(`${env.baseUrl}/api/v1/admin/media`, { headers: authHeader(token) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.data));
});
