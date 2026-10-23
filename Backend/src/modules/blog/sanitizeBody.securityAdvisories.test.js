// Security regression coverage for the sanitize-html 2.17.7 -> 2.18.1
// upgrade, which resolved three advisories (all CWE-79/XSS-class):
//   - GHSA-x3q4-9hxx-gx8m (CVE-2026-113654): nonTextTags discard region
//     ends early on htmlparser2's synthetic implied close, letting
//     <noscript> content render.
//   - GHSA-374f-7chj-9948 (CVE-2026-113657): SMIL animation namespace-
//     prefix bypass (e.g. svg:animate) allows javascript: URI injection.
//   - GHSA-cv27-6wvh-8x7j (CVE-2026-113661): <meta http-equiv=refresh>
//     content= still shipped javascript:/data: URLs (not applicable to
//     this allowlist, which never permits <meta> -- tested anyway as a
//     defense-in-depth regression guard).
// None of noscript/svg/animate/meta are in ALLOWED_TAGS, so every case
// below exercises sanitize-html's "strip a disallowed tag and its content"
// path -- exactly the path each advisory's bug affected.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBlogBody } from './sanitizeBody.js';

test('GHSA-x3q4-9hxx-gx8m: <noscript> and its entire contents are stripped, even with nested dangerous markup', () => {
  const out = sanitizeBlogBody('<p>Before</p><noscript><img src=x onerror=alert(1)></noscript><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
  assert.doesNotMatch(out, /noscript|onerror|alert/i);
});

test('GHSA-x3q4-9hxx-gx8m: a malformed/unclosed tag sequence around <noscript> still fully discards its contents', () => {
  // A deliberately irregular structure, closer to the kind of input that
  // can trigger htmlparser2's synthetic "implied close" event.
  const out = sanitizeBlogBody('<p>A<noscript><title>x</title><img src=x onerror=alert(2)></noscript>B</p>');
  assert.doesNotMatch(out, /onerror|alert\(2\)|<title>/i);
});

test('GHSA-374f-7chj-9948: a namespace-prefixed SMIL/SVG animation tag is stripped, including a javascript: href', () => {
  const out = sanitizeBlogBody('<p>Before</p><svg:animate href="javascript:alert(1)"></svg:animate><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
  assert.doesNotMatch(out, /animate|javascript:/i);
});

test('GHSA-374f-7chj-9948: a bare (non-prefixed) animate tag with a javascript: href is also stripped', () => {
  const out = sanitizeBlogBody('<p>Before</p><animate href="javascript:alert(1)"></animate><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('GHSA-cv27-6wvh-8x7j: <meta http-equiv=refresh> is stripped entirely (meta is never in this allowlist)', () => {
  const out = sanitizeBlogBody('<p>Before</p><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
  assert.doesNotMatch(out, /meta|javascript:/i);
});

test('a <script> tag combined with inline event-handler attributes in the same body is fully neutralized', () => {
  const out = sanitizeBlogBody('<p onclick="alert(1)">Click</p><script>alert(2)</script><img src="https://vyoma.org/a.png" onerror="alert(3)" alt="x">');
  assert.doesNotMatch(out, /onclick|onerror|<script>|alert/i);
  assert.match(out, /<p>Click<\/p>/);
  assert.match(out, /<img src="https:\/\/vyoma.org\/a.png" alt="x" \/>/);
});

test('a disallowed CVE-relevant tag nested inside an allowed wrapper is still fully removed', () => {
  const out = sanitizeBlogBody('<div><noscript><img src=x onerror=alert(1)></noscript><p>Safe text</p></div>');
  assert.doesNotMatch(out, /noscript|onerror/i);
  assert.match(out, /<div><p>Safe text<\/p><\/div>/);
});

test('safe links and images together still render correctly after the upgrade (happy-path sanity check)', () => {
  const out = sanitizeBlogBody(
    '<p>See <a href="https://vyoma.org/about">our story</a></p><img src="https://vyoma.org/wp-content/uploads/x.png" alt="A photo">'
  );
  assert.match(out, /<a href="https:\/\/vyoma.org\/about" rel="noopener noreferrer" target="_blank">our story<\/a>/);
  assert.match(out, /<img src="https:\/\/vyoma.org\/wp-content\/uploads\/x.png" alt="A photo" \/>/);
});
