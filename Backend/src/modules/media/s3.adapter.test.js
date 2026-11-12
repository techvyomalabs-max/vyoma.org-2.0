// Focused coverage for s3.adapter.js's Content-Disposition support, added so
// TXT/CSV media uploads download instead of rendering inline when a user
// navigates directly to their S3 URL.
//
// This file deliberately mocks S3Client.prototype.send via node:test's
// built-in mock API (stable since Node 20; this project runs Node 22) --
// unlike the rest of this codebase's tests (see
// donations.controller.currencyValidation.test.js), which avoid mocking by
// relying on isS3Configured()/isRazorpayConfigured() being false so the real
// SDK call site is never reached. That pattern works for "was the request
// accepted or rejected" assertions, but it architecturally cannot observe
// what's actually passed to PutObjectCommand -- which is exactly what this
// file needs to verify. No network call is ever made: the mock replaces
// send() entirely, and fake AWS_* values only need to satisfy
// isS3Configured()'s truthiness check, never a real credential check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../../config/env.js';
import { uploadObject, buildContentDisposition } from './s3.adapter.js';

function withFakeS3Config(fn) {
  const original = { ...env.s3 };
  env.s3.region = 'us-test-1';
  env.s3.bucket = 'vyoma-test-bucket';
  env.s3.accessKeyId = 'fake-access-key-id';
  env.s3.secretAccessKey = 'fake-secret-access-key';
  try {
    return fn();
  } finally {
    Object.assign(env.s3, original);
  }
}

// Installs a mocked S3Client.prototype.send (auto-restored by t.mock at the
// end of the test), returning the array of PutObjectCommand instances it was
// called with -- never issues a real network call.
function mockSend(t) {
  const calls = [];
  t.mock.method(S3Client.prototype, 'send', async (command) => {
    calls.push(command);
    return {};
  });
  return calls;
}

// --- buildContentDisposition: pure, no S3/mocking needed ---

test('buildContentDisposition returns undefined for non-TXT/CSV MIME types', () => {
  for (const mimeType of [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ]) {
    assert.equal(buildContentDisposition(mimeType, 'report.bin'), undefined, `expected undefined for ${mimeType}`);
  }
});

test('buildContentDisposition returns an attachment disposition for text/plain', () => {
  const value = buildContentDisposition('text/plain', 'notes.txt');
  assert.match(value, /^attachment; filename="notes\.txt"; filename\*=UTF-8''notes\.txt$/);
});

test('buildContentDisposition returns an attachment disposition for text/csv', () => {
  const value = buildContentDisposition('text/csv', 'data.csv');
  assert.match(value, /^attachment; filename="data\.csv"; filename\*=UTF-8''data\.csv$/);
});

test('buildContentDisposition strips double quotes from the filename', () => {
  const value = buildContentDisposition('text/plain', 'evil".txt');
  assert.ok(!value.includes('evil".txt'), 'raw quote must not survive into the header value');
  assert.match(value, /^attachment; filename="evil_\.txt"/);
});

test('buildContentDisposition strips CR and LF from the filename (header-injection prevention)', () => {
  const value = buildContentDisposition('text/plain', 'evil\r\nX-Injected: true.txt');
  assert.ok(!value.includes('\r') && !value.includes('\n'), 'no raw CR/LF may reach the header value');
});

test('buildContentDisposition strips forward- and back-slash path separators', () => {
  const value = buildContentDisposition('text/plain', '../../etc/passwd.txt');
  assert.ok(!value.includes('/'), 'no raw "/" may reach the header value');
  const value2 = buildContentDisposition('text/plain', 'C:\\Windows\\win.ini.txt');
  assert.ok(!value2.includes('\\') && !value2.includes(':'), 'no raw "\\" or ":" may reach the header value');
});

test('buildContentDisposition strips control characters', () => {
  const value = buildContentDisposition('text/plain', 'bell\x07name\x1ftest.txt');
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\x00-\x1f\x7f]/.test(value), 'no raw control character may reach the header value');
});

test('buildContentDisposition falls back to a safe generic filename for an empty original name', () => {
  assert.match(buildContentDisposition('text/plain', ''), /^attachment; filename="download\.txt"; filename\*=UTF-8''download\.txt$/);
  assert.match(buildContentDisposition('text/csv', '   '), /^attachment; filename="download\.csv"/);
});

test('buildContentDisposition falls back to a safe generic filename for a null/undefined/non-string original name', () => {
  assert.match(buildContentDisposition('text/plain', null), /filename="download\.txt"/);
  assert.match(buildContentDisposition('text/plain', undefined), /filename="download\.txt"/);
  assert.match(buildContentDisposition('text/csv', 42), /filename="download\.csv"/);
});

test('buildContentDisposition falls back to a safe generic filename when every character is unsafe', () => {
  const value = buildContentDisposition('text/plain', '////\\\\::::');
  assert.match(value, /^attachment; filename="download\.txt"; filename\*=UTF-8''download\.txt$/);
});

test('buildContentDisposition preserves an international filename via the RFC 5987 filename* parameter', () => {
  const value = buildContentDisposition('text/csv', 'परिणाम.csv');
  // ASCII fallback: non-ASCII characters replaced, extension preserved.
  assert.match(value, /filename="_+\.csv"/);
  // filename*: the real UTF-8 name, percent-encoded.
  const expected = encodeURIComponent('परिणाम.csv').replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  assert.ok(value.includes(`filename*=UTF-8''${expected}`), 'filename* must carry the real international name');
});

// --- buildContentDisposition: filename-length bounding (regression coverage
// for the oversized-header finding caught in final review) ---

// A real OS filesystem caps an individual filename at roughly this many
// bytes -- used below as "a realistic legitimate filename", distinct from
// the arbitrarily-long values a non-browser client could otherwise supply.
const REALISTIC_FILESYSTEM_MAX_BYTES = 255;
// s3.adapter.js's own internal budget -- not exported, so tests assert
// against the resulting header's bounded size/shape rather than reimporting
// the constant, matching how the rest of this file treats buildContentDisposition
// as a black box.
const MAX_REASONABLE_HEADER_BYTES = 1024;

test('a 255-character ASCII filename (realistic filesystem ceiling) produces an unmodified, bounded header', () => {
  const filename = 'a'.repeat(REALISTIC_FILESYSTEM_MAX_BYTES - 4) + '.txt';
  const value = buildContentDisposition('text/plain', filename);
  assert.match(value, /^attachment; filename="a+\.txt"; filename\*=UTF-8''a+\.txt$/);
  assert.ok(Buffer.byteLength(value, 'utf8') < MAX_REASONABLE_HEADER_BYTES);
});

test('a 10,000-character ASCII filename produces a bounded Content-Disposition header', () => {
  const value = buildContentDisposition('text/plain', 'a'.repeat(9996) + '.txt');
  assert.ok(Buffer.byteLength(value, 'utf8') < MAX_REASONABLE_HEADER_BYTES, `expected a bounded header, got ${value.length} chars`);
  assert.match(value, /\.txt"/, 'extension should still be preserved after truncation');
});

test('a 100,000-character ASCII filename produces the same bounded Content-Disposition header as 10,000 characters', () => {
  const value10k = buildContentDisposition('text/plain', 'a'.repeat(9996) + '.txt');
  const value100k = buildContentDisposition('text/plain', 'a'.repeat(99996) + '.txt');
  assert.ok(Buffer.byteLength(value100k, 'utf8') < MAX_REASONABLE_HEADER_BYTES);
  assert.equal(value100k, value10k, 'truncation to the same byte budget should produce an identical result regardless of how much longer the input is');
});

test('a 10,000-character Devanagari filename produces a bounded Content-Disposition header', () => {
  const value = buildContentDisposition('text/csv', 'अ'.repeat(10000) + '.csv');
  assert.ok(
    Buffer.byteLength(value, 'utf8') < MAX_REASONABLE_HEADER_BYTES,
    `expected a bounded header even with percent-encoding expansion, got ${Buffer.byteLength(value, 'utf8')} bytes`
  );
  assert.match(value, /\.csv/, 'extension should still be preserved after truncation');
});

test('truncation never splits a multi-byte character or surrogate pair (filename* decodes cleanly)', () => {
  const value = buildContentDisposition('text/csv', 'अ'.repeat(10000) + '.csv');
  const match = value.match(/filename\*=UTF-8''([^;]+)/);
  assert.ok(match, 'filename* parameter must be present');
  const decoded = decodeURIComponent(match[1]); // throws on malformed percent-encoding from a split multi-byte char
  assert.ok(!decoded.includes('�'), 'decoded value must not contain a Unicode replacement character');
});

test('truncation never splits a surrogate pair (astral-plane characters, e.g. emoji)', () => {
  const value = buildContentDisposition('text/plain', '\u{1F600}'.repeat(5000) + '.txt'); // U+1F600 is a surrogate pair in UTF-16
  const match = value.match(/filename\*=UTF-8''([^;]+)/);
  const decoded = decodeURIComponent(match[1]);
  assert.ok(!decoded.includes('�'), 'decoded value must not contain a Unicode replacement character');
  assert.ok(Buffer.byteLength(value, 'utf8') < MAX_REASONABLE_HEADER_BYTES);
});

test('the .txt/.csv extension is preserved after truncating an overly long filename', () => {
  assert.match(buildContentDisposition('text/plain', 'a'.repeat(9996) + '.txt'), /filename="[^"]*\.txt"/);
  assert.match(buildContentDisposition('text/csv', 'a'.repeat(9996) + '.csv'), /filename="[^"]*\.csv"/);
});

test('an empty/invalid filename still falls back correctly alongside the new length limit', () => {
  assert.match(buildContentDisposition('text/plain', ''), /^attachment; filename="download\.txt"; filename\*=UTF-8''download\.txt$/);
  assert.match(buildContentDisposition('text/csv', null), /^attachment; filename="download\.csv"; filename\*=UTF-8''download\.csv$/);
});

test('a short, legitimate international filename is unaffected by the length limit', () => {
  const value = buildContentDisposition('text/csv', 'परिणाम.csv');
  assert.match(value, /filename="_+\.csv"/);
  const expected = encodeURIComponent('परिणाम.csv').replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  assert.ok(value.includes(`filename*=UTF-8''${expected}`), 'a short name must round-trip exactly, unmodified by truncation');
});

// --- uploadObject -> PutObjectCommand: verifies the header actually reaches S3's API shape ---

test('a TXT upload sends ContentDisposition: attachment to PutObjectCommand', async (t) => {
  const calls = mockSend(t);
  await withFakeS3Config(async () => {
    const contentDisposition = buildContentDisposition('text/plain', 'notes.txt');
    const result = await uploadObject({ key: 'media/abc.txt', buffer: Buffer.from('hello'), mimeType: 'text/plain', contentDisposition });
    assert.ok(result, 'upload must succeed against the mocked client');
  });

  assert.equal(calls.length, 1);
  assert.ok(calls[0] instanceof PutObjectCommand);
  assert.equal(calls[0].input.Bucket, 'vyoma-test-bucket');
  assert.equal(calls[0].input.Key, 'media/abc.txt');
  assert.equal(calls[0].input.Body.toString(), 'hello');
  assert.equal(calls[0].input.ContentType, 'text/plain');
  assert.match(calls[0].input.ContentDisposition, /^attachment; filename="notes\.txt"/);
});

test('a CSV upload sends ContentDisposition: attachment to PutObjectCommand', async (t) => {
  const calls = mockSend(t);
  await withFakeS3Config(async () => {
    const contentDisposition = buildContentDisposition('text/csv', 'data.csv');
    await uploadObject({ key: 'media/abc.csv', buffer: Buffer.from('a,b,c'), mimeType: 'text/csv', contentDisposition });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.ContentType, 'text/csv');
  assert.match(calls[0].input.ContentDisposition, /^attachment; filename="data\.csv"/);
});

test('ContentDisposition is absent from PutObjectCommand for PNG, JPEG, PDF, DOCX, and XLSX uploads', async (t) => {
  const cases = [
    { mimeType: 'image/png', filename: 'photo.png' },
    { mimeType: 'image/jpeg', filename: 'photo.jpg' },
    { mimeType: 'application/pdf', filename: 'report.pdf' },
    { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'report.docx' },
    { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'sheet.xlsx' },
  ];

  for (const { mimeType, filename } of cases) {
    const calls = mockSend(t);
    await withFakeS3Config(async () => {
      const contentDisposition = buildContentDisposition(mimeType, filename);
      await uploadObject({ key: `media/x.${filename.split('.').pop()}`, buffer: Buffer.from('data'), mimeType, contentDisposition });
    });
    assert.equal(calls[0].input.ContentDisposition, undefined, `expected no ContentDisposition for ${mimeType}`);
    assert.equal(calls[0].input.ContentType, mimeType);
    t.mock.restoreAll();
  }
});

test('an unsafe filename (quotes, CR/LF, path separators, control characters) is sanitized before reaching PutObjectCommand', async (t) => {
  const calls = mockSend(t);
  await withFakeS3Config(async () => {
    const unsafeName = 'evil"\r\n../../etc/passwd\x07.txt';
    const contentDisposition = buildContentDisposition('text/plain', unsafeName);
    await uploadObject({ key: 'media/abc.txt', buffer: Buffer.from('hi'), mimeType: 'text/plain', contentDisposition });
  });

  const disposition = calls[0].input.ContentDisposition;
  assert.ok(disposition, 'ContentDisposition must still be set for text/plain even with an unsafe original name');
  assert.ok(!disposition.includes('"evil"'), 'raw quote must not survive into the header value');
  assert.ok(!disposition.includes('\r') && !disposition.includes('\n'), 'no raw CR/LF in the header value');
  assert.ok(!disposition.includes('../'), 'no raw path-traversal sequence in the header value');
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\x00-\x1f\x7f]/.test(disposition), 'no raw control character in the header value');
});

test('an empty original filename still gets a safe fallback ContentDisposition for TXT uploads', async (t) => {
  const calls = mockSend(t);
  await withFakeS3Config(async () => {
    const contentDisposition = buildContentDisposition('text/plain', '');
    await uploadObject({ key: 'media/abc.txt', buffer: Buffer.from('hi'), mimeType: 'text/plain', contentDisposition });
  });
  assert.match(calls[0].input.ContentDisposition, /filename="download\.txt"/);
});

test('an international filename survives into PutObjectCommand via filename*', async (t) => {
  const calls = mockSend(t);
  await withFakeS3Config(async () => {
    const contentDisposition = buildContentDisposition('text/csv', 'परिणाम.csv');
    await uploadObject({ key: 'media/abc.csv', buffer: Buffer.from('a,b'), mimeType: 'text/csv', contentDisposition });
  });
  const expected = encodeURIComponent('परिणाम.csv').replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  assert.ok(calls[0].input.ContentDisposition.includes(`filename*=UTF-8''${expected}`));
});
