// sanitizeLegalBody() had zero dedicated test coverage before this file.
// Covers both its normal allowlist behavior and the same sanitize-html
// 2.17.7 -> 2.18.1 security-advisory regressions already tested for
// sanitizeBlogBody (sanitizeBody.securityAdvisories.test.js) -- this
// sanitizer shares the same underlying engine and is reachable from the
// same admin content-editing surface (content.admin.controller.js, the
// Privacy/Terms pages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeLegalBody } from './sanitizeLegalBody.js';

// --- Allowed legal-document formatting ---

test('preserves every allowed tag (headings, paragraphs, lists, inline formatting, blockquote)', () => {
  const html =
    '<h1>Privacy Policy</h1><h2>Section</h2><h3>Sub-section</h3>' +
    '<p>Some text.</p><ol start="2"><li>One</li></ol><ul><li>Two</li></ul>' +
    '<strong>bold</strong><b>b</b><em>em</em><i>i</i><u>u</u>' +
    '<br><blockquote>A quote.</blockquote>';
  const out = sanitizeLegalBody(html);
  // <br> is a void element and is self-closed by sanitize-html's
  // serializer, same convention already used for <img> elsewhere.
  assert.equal(out, html.replace('<br>', '<br />'));
});

test('strips any tag not on the allowlist (e.g. img, table, div), keeping surrounding text', () => {
  const out = sanitizeLegalBody('<p>Before</p><img src="https://vyoma.org/x.png"><div>Nope</div><table><tr><td>No</td></tr></table><p>After</p>');
  // Only the disallowed TAGS are stripped -- any plain text they wrapped
  // (here "Nope" and "No") survives, same as "Nope" from the stripped div.
  assert.equal(out, '<p>Before</p>NopeNo<p>After</p>');
});

// --- Safe links ---

test('a link with no target is left exactly as-is (this sanitizer does not force target/rel like the blog one)', () => {
  const out = sanitizeLegalBody('<p><a href="https://vyoma.org/terms">Terms</a></p>');
  assert.equal(out, '<p><a href="https://vyoma.org/terms">Terms</a></p>');
});

test('a link with target="_blank" gets noopener/noreferrer added to its rel (tabnabbing guard)', () => {
  const out = sanitizeLegalBody('<p><a href="https://vyoma.org/terms" target="_blank">Terms</a></p>');
  assert.match(out, /rel="noopener noreferrer"/);
  assert.match(out, /target="_blank"/);
});

test('an existing rel value on a target="_blank" link is preserved, not overwritten, when adding noopener/noreferrer', () => {
  const out = sanitizeLegalBody('<p><a href="https://vyoma.org/terms" target="_blank" rel="nofollow">Terms</a></p>');
  assert.match(out, /rel="nofollow noopener noreferrer"/);
});

test('ol start attribute (real section numbering) is preserved', () => {
  const out = sanitizeLegalBody('<ol start="7"><li>Seventh section</li></ol>');
  assert.match(out, /<ol start="7">/);
});

// --- Script and event-handler removal ---

test('a <script> tag is removed entirely, including its content', () => {
  const out = sanitizeLegalBody('<p>Before</p><script>alert(1)</script><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('event-handler attributes are stripped from an allowed tag, keeping the tag and its text', () => {
  const out = sanitizeLegalBody('<p onclick="alert(1)">Click me</p>');
  assert.equal(out, '<p>Click me</p>');
});

// --- Dangerous URL schemes ---

test('a javascript: link href is stripped (link text survives as plain text)', () => {
  const out = sanitizeLegalBody('<p><a href="javascript:alert(1)">Click</a></p>');
  assert.doesNotMatch(out, /javascript:/);
  assert.match(out, /Click/);
});

test('a data: link href is stripped', () => {
  const out = sanitizeLegalBody('<p><a href="data:text/html,<script>alert(1)</script>">Click</a></p>');
  assert.doesNotMatch(out, /data:/);
});

// --- Unicode/Sanskrit text preservation ---

test('Sanskrit/Devanagari and IAST text is preserved exactly', () => {
  const html = '<p>नमस्ते जगत्। This policy follows the principles of Dharma and Ṛta.</p>';
  assert.equal(sanitizeLegalBody(html), html);
});

// --- Security-advisory regressions (same engine as sanitizeBlogBody) ---

test('GHSA-x3q4-9hxx-gx8m: <noscript> and its contents are stripped', () => {
  const out = sanitizeLegalBody('<p>Before</p><noscript><img src=x onerror=alert(1)></noscript><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('GHSA-374f-7chj-9948: a namespace-prefixed SMIL/SVG animation tag with a javascript: href is stripped', () => {
  const out = sanitizeLegalBody('<p>Before</p><svg:animate href="javascript:alert(1)"></svg:animate><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('GHSA-cv27-6wvh-8x7j: <meta http-equiv=refresh> is stripped entirely (meta is never in this allowlist)', () => {
  const out = sanitizeLegalBody('<p>Before</p><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

// --- Edge cases ---

test('non-string input returns an empty string', () => {
  assert.equal(sanitizeLegalBody(null), '');
  assert.equal(sanitizeLegalBody(undefined), '');
  assert.equal(sanitizeLegalBody(42), '');
});
