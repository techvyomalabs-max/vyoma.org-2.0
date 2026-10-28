// Regression coverage for GET /api/v1/public/documents/download
// (documents.controller.js) -- a public, unauthenticated route protected only
// by its hostname allowlist/SSRF guards, no database involved at all, so this
// file uses a minimal createApp() + app.listen(0) harness with no
// mongodb-memory-server (none of this route's behavior touches Mongo).
//
// Validation/rejection paths (missing/invalid url, unsupported protocol,
// disallowed hostname) are exercised via real HTTP requests to the real app
// -- none of them ever reach fetch(), so nothing needs mocking for those.
// The ALLOWED_HOSTNAMES success/failure paths that DO reach fetch() mock
// globalThis.fetch with node:test's built-in mock API (the same technique
// already established by s3.adapter.test.js for S3Client.prototype.send) so
// no real external request is ever made.
//
// IMPORTANT: globalThis.fetch is a single process-wide binding, so mocking it
// intercepts BOTH the controller's own internal upstream fetch AND this
// test's outer HTTP call to its own local server -- there's no way to tell
// them apart by identity. `realFetch` is captured once, before any mocking,
// specifically so every outer "make a request to our own test server" call
// below always uses the real implementation, leaving only the controller's
// internal call to be seen by whatever mock a given test installs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../app.js';

const realFetch = globalThis.fetch;

let server;
let baseUrl;

test.before(async () => {
  const app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function download(query) {
  const res = await realFetch(`${baseUrl}/api/v1/public/documents/download${query}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

// --- Validation paths: never reach fetch(), no mocking needed ---

test('rejects a missing url query parameter with 400', async () => {
  const { res, body } = await download('');
  assert.equal(res.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.message, 'Missing url query parameter.');
});

test('rejects an empty url query parameter with 400', async () => {
  const { res, body } = await download('?url=');
  assert.equal(res.status, 400);
  assert.equal(body.message, 'Missing url query parameter.');
});

test('rejects a malformed url with 400', async () => {
  const { res, body } = await download('?url=not-a-valid-url');
  assert.equal(res.status, 400);
  assert.equal(body.message, 'Invalid url.');
});

test('rejects a non-http(s) protocol (e.g. file:) with 400', async () => {
  const { res, body } = await download(`?url=${encodeURIComponent('file:///etc/passwd')}`);
  assert.equal(res.status, 400);
  assert.equal(body.message, 'Only http(s) URLs are supported.');
});

test('rejects a disallowed hostname with 403, closing off SSRF to arbitrary hosts', async () => {
  const { res, body } = await download(`?url=${encodeURIComponent('https://evil.example.com/file.pdf')}`);
  assert.equal(res.status, 403);
  assert.equal(body.message, 'This host is not an approved document source.');
});

test('rejects an internal/private-network host disguised as a normal URL, before any fetch is attempted', async () => {
  const { res, body } = await download(`?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
  assert.equal(res.status, 403);
  assert.equal(body.message, 'This host is not an approved document source.');
});

// --- Allowed-hostname paths: reach fetch(), mocked -- no real network call ---

test('streams a successful upstream response with the correct headers, from an allowlisted hostname', async (t) => {
  const upstreamBytes = Buffer.from('%PDF-1.4 fake pdf content');
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://vyoma.org/wp-content/uploads/newsletter.pdf');
    return new Response(upstreamBytes, {
      status: 200,
      headers: { 'content-type': 'application/pdf', 'content-length': String(upstreamBytes.length) },
    });
  });

  const res = await realFetch(`${baseUrl}/api/v1/public/documents/download?url=${encodeURIComponent('https://vyoma.org/wp-content/uploads/newsletter.pdf')}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="newsletter.pdf"');
  assert.equal(res.headers.get('content-length'), String(upstreamBytes.length));
  const bodyBuffer = Buffer.from(await res.arrayBuffer());
  assert.ok(bodyBuffer.equals(upstreamBytes));
});

test('allows the second allowlisted hostname (vyomalabs-lms.b-cdn.net)', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('ok'), { status: 200, headers: { 'content-type': 'application/pdf' } }));

  const res = await realFetch(`${baseUrl}/api/v1/public/documents/download?url=${encodeURIComponent('https://vyomalabs-lms.b-cdn.net/course/syllabus.pdf')}`);
  assert.equal(res.status, 200);
});

test('sanitizes a filename containing a quote/CR/LF before placing it in Content-Disposition', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('ok'), { status: 200, headers: { 'content-type': 'application/pdf' } }));

  const maliciousPath = encodeURIComponent('evil".pdf');
  const res = await realFetch(`${baseUrl}/api/v1/public/documents/download?url=https://vyoma.org/${maliciousPath}`);
  assert.equal(res.status, 200);
  const disposition = res.headers.get('content-disposition');
  assert.ok(!disposition.includes('evil".pdf'), 'a raw double quote must not survive into the header value');
  assert.match(disposition, /^attachment; filename="evil_\.pdf"$/);
});

test('returns 502 when the upstream responds with a non-ok status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('not found'), { status: 404 }));

  const { res, body } = await download(`?url=${encodeURIComponent('https://vyoma.org/missing.pdf')}`);
  assert.equal(res.status, 502);
  assert.equal(body.message, 'Document source responded with 404.');
});

test('returns 502 when the upstream fetch itself fails (network error/timeout)', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('simulated network failure');
  });

  const { res, body } = await download(`?url=${encodeURIComponent('https://vyoma.org/unreachable.pdf')}`);
  assert.equal(res.status, 502);
  assert.equal(body.message, 'Could not reach the document source.');
});

test('falls back to application/pdf when the upstream omits a content-type header', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(Buffer.from('ok'), { status: 200 }));

  const res = await realFetch(`${baseUrl}/api/v1/public/documents/download?url=${encodeURIComponent('https://vyoma.org/no-content-type.pdf')}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/pdf');
});

test('a stream error after headers are sent destroys the response instead of crashing the process', async (t) => {
  // Build a ReadableStream whose body errors out partway through, exercising
  // the documented 'error' listener that was added specifically because an
  // unhandled stream error previously crashed the whole backend process.
  const erroringBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      queueMicrotask(() => controller.error(new Error('simulated mid-stream failure')));
    },
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(erroringBody, { status: 200, headers: { 'content-type': 'application/pdf' } }));

  // The request must settle (either a partial body or a connection reset),
  // not hang, and -- the real regression this guards -- must not take the
  // whole test process down with it.
  await assert.doesNotReject(async () => {
    try {
      const res = await realFetch(`${baseUrl}/api/v1/public/documents/download?url=${encodeURIComponent('https://vyoma.org/flaky.pdf')}`);
      await res.arrayBuffer().catch(() => null);
    } catch {
      // A reset/aborted connection surfacing as a fetch-level rejection is an
      // acceptable outcome here too -- the only unacceptable outcome is the
      // server process itself crashing, which a subsequent request proves.
    }
  });

  // The server must still be alive and serving normally afterward.
  const healthy = await realFetch(`${baseUrl}/api/v1/health`);
  assert.equal(healthy.status, 200);
});
