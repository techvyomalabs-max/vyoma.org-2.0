import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './htmlEscape.js';

test('normal text is returned unchanged', () => {
  assert.equal(escapeHtml('John Doe'), 'John Doe');
  assert.equal(escapeHtml('Hello, how can I help?'), 'Hello, how can I help?');
});

test('HTML tags are escaped, not rendered as markup', () => {
  assert.equal(escapeHtml('<b>bold</b>'), '&lt;b&gt;bold&lt;/b&gt;');
});

test('script-like markup is escaped to inert text', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

test('ampersands and quotation marks are escaped', () => {
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(escapeHtml(`She said "hi" and it's fine`), 'She said &quot;hi&quot; and it&#39;s fine');
});

test('an ampersand introduced by escaping is never re-escaped (no double-escaping)', () => {
  // A single combined pass must map '<' -> '&lt;' once, not turn the new '&'
  // into '&amp;lt;' on a second pass.
  assert.equal(escapeHtml('<'), '&lt;');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;'); // the literal input "&lt;" has its own & escaped, once
});

test('Unicode and Sanskrit (Devanagari/IAST) text passes through unchanged', () => {
  assert.equal(escapeHtml('नमस्ते जगत्'), 'नमस्ते जगत्');
  assert.equal(escapeHtml('Gītā and Śāstra'), 'Gītā and Śāstra');
});

test('non-string input is coerced to a string safely', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(null), 'null');
});
