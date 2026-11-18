// Bug 1 fix regression coverage: submitForm() failing inside handleSubmit
// used to have no catch at all, so a network error/rate limit/etc. left the
// button quietly resetting with no feedback -- indistinguishable from the
// form simply not submitting. ContactForm.jsx is a client component with
// real JSX and no network/routing test double of its own, and this project
// has no React-rendering harness for a plain .jsx file (see
// components/layout/Header.a11y.test.mjs's own header comment for the same,
// already-established precedent) -- so this asserts the exact source text a
// future edit could otherwise silently regress, the same technique that
// file uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'ContactForm.jsx'), 'utf8');

function handleSubmitBody(src) {
  const start = src.indexOf('const handleSubmit = async (e) => {');
  const end = src.indexOf('\n  };', start);
  assert.notEqual(start, -1, 'handleSubmit not found');
  assert.notEqual(end, -1, 'end of handleSubmit not found');
  return src.slice(start, end);
}

test('handleSubmit catches a failed submitForm() call (no longer only try/finally)', () => {
  const body = handleSubmitBody(source);
  assert.match(body, /catch\s*\{/, 'expected a catch block around submitForm()');
  assert.match(body, /finally\s*\{\s*setPending\(false\);\s*\}/, 'the existing finally { setPending(false); } must be preserved unchanged');
});

test('a failed submission shows a fixed, generic message -- never the caught error\'s own .message (which may carry server/network detail)', () => {
  const body = handleSubmitBody(source);
  assert.match(body, /setSubmitError\('Something went wrong\. Please try again\.'\)/);
  assert.doesNotMatch(body, /err\.message|error\.message/, 'the caught error object\'s own .message must never be forwarded to the UI');
});

test('a previous submission error is cleared at the start of every retry', () => {
  const body = handleSubmitBody(source);
  const clearIndex = body.indexOf('setSubmitError(null);');
  const validateIndex = body.indexOf('validate(values)');
  assert.notEqual(clearIndex, -1, 'expected setSubmitError(null) in handleSubmit');
  assert.ok(clearIndex < validateIndex, 'the previous error must be cleared before validation runs, on every submit attempt');
});

test('the error message is rendered with role="alert" for an accessible announcement', () => {
  assert.match(source, /\{submitError && \(\s*<p role="alert"/);
});

test('the existing success path, payload, and validation are unchanged', () => {
  assert.match(source, /await submitForm\('contact', \{ values: \{ \.\.\.values, subject \} \}\);/);
  assert.match(source, /setSubmitted\(true\);/);
  assert.match(source, /if \(Object\.keys\(errors\)\.length > 0\) return;/);
});
