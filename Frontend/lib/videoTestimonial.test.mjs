// QA Bug 19 — dedicated regression coverage for videoTestimonial.js's URL
// safety correction. No dedicated test file existed for this module before
// this change (its logic was covered only indirectly, inside
// components/sections/media/TestimonialCard.test.mjs, alongside that
// component's own JSX source assertions) -- this file adds the much larger
// mandatory valid/invalid URL fixture matrix on its own, so the two files'
// concerns stay separate: TestimonialCard.test.mjs covers the component's
// JSX wiring, this file covers the resolver's own URL-validation logic.
//
// Every test here executes the real, production resolveVideoTestimonialMedia()
// against a real `item` object -- no mock, no reimplementation, no source-
// string assertion. The only consumer of this module (confirmed via a
// project-wide grep before this change) is TestimonialCard.jsx itself, so
// this coverage is the complete behavioral contract of the function as
// actually used in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVideoTestimonialMedia } from './videoTestimonial.js';

function resolve(url) {
  return resolveVideoTestimonialMedia({ url, name: 'Test' });
}

// --- Valid fixtures ---------------------------------------------------------

test('valid: a standard youtube.com watch URL is playable, with a real thumbnail, and the href equals the exact input', () => {
  const result = resolve('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('valid: a youtu.be short URL is playable, with a real thumbnail', () => {
  const result = resolve('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(result.url, 'https://youtu.be/dQw4w9WgXcQ');
});

test('valid: a non-YouTube https video URL is playable, with no thumbnail (existing, unchanged behavior)', () => {
  const result = resolve('https://example.com/video.mp4');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, null);
  assert.equal(result.url, 'https://example.com/video.mp4');
});

test('valid: a plain (non-TLS) http video URL is playable', () => {
  const result = resolve('http://example.com/video.mp4');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.thumbnail, null);
  assert.equal(result.url, 'http://example.com/video.mp4');
});

test('valid: surrounding ordinary spaces are trimmed from the returned url, and the value still resolves as playable', () => {
  const result = resolve('  https://example.com/video.mp4  ');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.url, 'https://example.com/video.mp4', 'surrounding ordinary spaces must be trimmed from the href actually used');
});

// --- Invalid fixtures --------------------------------------------------------

function assertRejected(url, label) {
  const result = resolve(url);
  assert.equal(result.hasPlayableVideo, false, `${label}: expected hasPlayableVideo to be false`);
  assert.equal(result.thumbnail, null, `${label}: expected no thumbnail`);
  assert.equal(result.url, null, `${label}: expected no href to ever be produced`);
}

test('invalid: a missing url field', () => {
  const result = resolveVideoTestimonialMedia({ name: 'Ravi Menon', role: 'Chennai, India' });
  assert.equal(result.hasPlayableVideo, false);
  assert.equal(result.thumbnail, null);
  assert.equal(result.url, null);
});

test('invalid: undefined', () => {
  assertRejected(undefined, 'undefined');
});

test('invalid: null', () => {
  assertRejected(null, 'null');
});

test('invalid: empty string', () => {
  assertRejected('', 'empty string');
});

test('invalid: whitespace-only string', () => {
  assertRejected('   ', 'whitespace-only string');
});

test('invalid: non-string values (number, array, object) are rejected without throwing', () => {
  for (const value of [12345, ['https://example.com/video.mp4'], { url: 'https://example.com/video.mp4' }, true]) {
    assert.doesNotThrow(() => resolve(value));
    assertRejected(value, `non-string value ${JSON.stringify(value)}`);
  }
});

test('invalid: a plain, schemeless garbage string', () => {
  assertRejected('not-a-url', 'schemeless garbage string');
});

test('invalid: a relative path', () => {
  assertRejected('/videos/test.mp4', 'relative path');
});

test('invalid: a protocol-relative URL', () => {
  assertRejected('//example.com/video.mp4', 'protocol-relative URL');
});

test('invalid: a scheme with no hostname/content', () => {
  assertRejected('https://', 'bare "https://" with no hostname');
});

test('invalid: a javascript: URL', () => {
  assertRejected('javascript:alert(1)', 'javascript: scheme');
});

test('invalid: a mixed-case javascript: scheme is still rejected (the URL parser normalizes scheme casing)', () => {
  assertRejected('JAVASCRIPT:alert(1)', 'mixed-case javascript: scheme');
});

test('invalid: a data: URL', () => {
  assertRejected('data:text/html,test', 'data: scheme');
});

test('invalid: a vbscript: URL', () => {
  assertRejected('vbscript:example', 'vbscript: scheme');
});

test('invalid: a file: URL', () => {
  assertRejected('file:///test.mp4', 'file: scheme');
});

test('invalid: a blob: URL', () => {
  assertRejected('blob:https://example.com/test', 'blob: scheme');
});

test('invalid: an ftp: URL (a real, resolvable scheme, but not an accepted one)', () => {
  assertRejected('ftp://example.com/video.mp4', 'ftp: scheme');
});

test('invalid: an embedded tab character is rejected, never silently stripped by the URL parser', () => {
  // Confirmed directly: the WHATWG URL parser itself silently strips a tab
  // during parsing, so this value would otherwise parse "successfully" as
  // if the tab had never been there -- the resolver's own control-character
  // check (run on the raw string, before any parsing) is what actually
  // catches this.
  assertRejected('https://example.com/\tvideo.mp4', 'embedded tab character');
});

test('invalid: an embedded newline character is rejected', () => {
  assertRejected('https://example.com/\nvideo.mp4', 'embedded newline character');
});

test('invalid: an embedded carriage return is rejected', () => {
  assertRejected('https://example.com/\rvideo.mp4', 'embedded carriage return');
});

test('invalid: an embedded NUL / other C0 control character is rejected', () => {
  assertRejected('https://example.com/\x00video.mp4', 'embedded NUL control character');
});

test('invalid: a URL containing embedded username/password credentials', () => {
  assertRejected('https://user:pass@example.com/video.mp4', 'embedded userinfo credentials');
});

// --- QA Bug 19 follow-up #2: WHATWG URL-parser normalization edge cases ---
// The standard URL parser is deliberately lenient for "special" schemes
// like http/https and silently normalizes each of these malformed forms
// into a well-formed absolute URL rather than throwing -- confirmed
// directly in Node before this correction. Each must still be rejected.

test('invalid: "https:example.com/video.mp4" (missing both slashes) is rejected, not silently normalized to "https://example.com/..."', () => {
  assertRejected('https:example.com/video.mp4', 'missing both slashes');
});

test('invalid: "https:/example.com/video.mp4" (only one slash) is rejected', () => {
  assertRejected('https:/example.com/video.mp4', 'only one slash');
});

test('invalid: "https:///example.com/video.mp4" (one extra slash) is rejected, not silently collapsed', () => {
  assertRejected('https:///example.com/video.mp4', 'one extra slash');
});

test('invalid: "http:example.com/video.mp4" (missing both slashes, http) is rejected', () => {
  assertRejected('http:example.com/video.mp4', 'missing both slashes, http');
});

test('invalid: a literal backslash immediately after the scheme colon is rejected, not silently treated as a forward slash', () => {
  assertRejected('https:\\\\example.com\\video.mp4', 'backslash scheme separator');
});

test('invalid: a literal backslash inside the authority portion is rejected, even with an otherwise well-formed "https://" prefix', () => {
  assertRejected('https://example.com\\@evil.com/video.mp4', 'backslash inside authority');
});

test('valid: an explicit "https://" prefix with a real double slash remains valid (regression guard for the stricter scheme check above)', () => {
  const result = resolve('https://example.com/video.mp4');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.url, 'https://example.com/video.mp4');
});

test('valid: an uppercase "HTTPS://" scheme remains valid', () => {
  const result = resolve('HTTPS://example.com/video.mp4');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.url, 'HTTPS://example.com/video.mp4');
});

test('valid: a lowercase "http://" scheme remains valid', () => {
  const result = resolve('http://example.com/video.mp4');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.url, 'http://example.com/video.mp4');
});

test('valid: a well-formed https URL with surrounding ordinary ASCII spaces remains valid and trimmed', () => {
  const result = resolve('   https://example.com/video.mp4   ');
  assert.equal(result.hasPlayableVideo, true);
  assert.equal(result.url, 'https://example.com/video.mp4');
});

test('every invalid fixture above never throws, regardless of shape', () => {
  const fixtures = [
    undefined,
    null,
    '',
    '   ',
    'not-a-url',
    '/videos/test.mp4',
    '//example.com/video.mp4',
    'https://',
    'javascript:alert(1)',
    'data:text/html,test',
    'vbscript:example',
    'file:///test.mp4',
    'blob:https://example.com/test',
    'ftp://example.com/video.mp4',
    'https://user:pass@example.com/video.mp4',
    'https:example.com/video.mp4',
    'https:/example.com/video.mp4',
    'https:///example.com/video.mp4',
    'http:example.com/video.mp4',
    'https:\\\\example.com\\video.mp4',
    'https://example.com\\@evil.com/video.mp4',
    12345,
    ['https://example.com/video.mp4'],
    { url: 'https://example.com/video.mp4' },
  ];
  for (const url of fixtures) {
    assert.doesNotThrow(() => resolve(url), `must not throw for ${JSON.stringify(url)}`);
  }
});
