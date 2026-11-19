// QA Bug 4 fix regression coverage: fieldErrors was only ever set in
// handleSubmit and never cleared when the CSR "project of interest"
// selection changed (via pick(), used by every "Partner on this" button, or
// the Partner Enquiry dropdown's onChange) -- every error from a prior
// submit attempt stayed visible after switching options, even the Email
// error, which has nothing to do with the selection itself. CSRProjectsBoard
// is a client component with real JSX and no React-rendering harness exists
// for a plain .jsx file in this project (see Header.a11y.test.mjs's own
// precedent comment) -- this asserts the exact source text, the same
// technique QuickDonate.validation.test.mjs already uses for its sibling fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'CSRProjectsBoard.jsx'), 'utf8');

function functionBody(src, signature, endMarker) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end of ${signature} not found`);
  return src.slice(start, end);
}

test('pick() clears all fieldErrors (not just `selected`) when the option actually changes, and leaves `fields` untouched', () => {
  const body = functionBody(source, 'const pick = (name) => {', '\n  };');
  assert.match(body, /if \(name !== selected\) setFieldErrors\(\{\}\);/, 'expected an unconditional clear of every fieldErrors key, guarded on an actual change');
  assert.ok(!body.includes('setFields'), 'pick() must never clear or touch user-entered field values');
});

test('the Partner Enquiry dropdown clears all fieldErrors the same way, guarded on an actual change', () => {
  const body = functionBody(source, 'onChange={(e) => {', 'aria-label="Project of interest"');
  assert.match(body, /if \(value !== selected\) setFieldErrors\(\{\}\);/);
  assert.match(body, /setSelected\(value\);/, 'expected setSelected(value) to still run');
  assert.ok(!body.includes('setFields'), 'the dropdown onChange must never clear or touch user-entered field values');
});

test('re-selecting the currently-selected option does not clear fieldErrors -- both change sites compare against the current value first', () => {
  assert.match(source, /if \(name !== selected\) setFieldErrors\(\{\}\);\s*\n\s*setSelected\(name\);/, 'pick() must compare before clearing');
  assert.match(source, /if \(value !== selected\) setFieldErrors\(\{\}\);\s*\n\s*setSelected\(value\);/, 'the dropdown must compare before clearing');
});

test('validate() rules are unchanged -- same required fields, same NAME_RE/EMAIL_RE/comment-length checks', () => {
  const body = functionBody(source, 'const validate = () => {', '\n  };');
  assert.match(body, /if \(!name\) errors\.name = 'Name is required\.';/);
  assert.match(body, /else if \(!NAME_RE\.test\(name\)\) errors\.name = /);
  assert.match(body, /if \(!fields\.email\.trim\(\)\) errors\.email = 'Email is required\.';/);
  assert.match(body, /else if \(!EMAIL_RE\.test\(fields\.email\.trim\(\)\)\) errors\.email = /);
  assert.match(body, /if \(!selected\) errors\.selected = 'Please choose a project of interest\.';/);
  assert.match(body, /else if \(fields\.comment\.length > COMMENT_MAX_LENGTH\) errors\.comment = /);
});

test('handleSubmit is unchanged -- still re-validates and sets fieldErrors from scratch on every submit, and the existing success/error/reset flow is intact', () => {
  const body = functionBody(source, 'const handleSubmit = async (e) => {', '\n  };');
  assert.match(body, /const errors = validate\(\);/);
  assert.match(body, /setFieldErrors\(errors\);/);
  assert.match(body, /if \(Object\.keys\(errors\)\.length > 0\) return;/, 'a failing validation must still block submission, same as before this fix');
  assert.match(body, /setStatus\('sent'\);/);
  assert.match(body, /setFields\(\{ name: '', email: '', organisation: '', mobile: '', comment: '' \}\);/);
  assert.match(body, /setSelected\(''\);/);
  assert.match(body, /catch \{\s*\n\s*setStatus\('error'\);/);
});
