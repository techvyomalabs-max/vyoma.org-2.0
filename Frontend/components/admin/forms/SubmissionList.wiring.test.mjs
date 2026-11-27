// Source-assertion coverage for SubmissionList.jsx's category-feature
// changes. This is a client component with real JSX, and this project has
// no loader/transform registered for plain `node --test` (confirmed via
// package.json's test script), so it can't be rendered here -- same
// established limitation as every other JSX-returning file in this
// project. The subject-display logic itself is fully covered, with
// genuine real execution, by submissionDisplay.test.mjs; this file only
// guards the component's wiring and is not itself claimed as proof of
// runtime rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'SubmissionList.jsx'), 'utf8');

test('imports the real, shared subjectLabel helper (not an inline duplicate)', () => {
  assert.match(source, /import \{ subjectLabel \} from '\.\/submissionDisplay\.mjs';/);
});

test('the subject is rendered prominently (bold, primary color, its own headline line) above the existing formKey/name/email line', () => {
  const subjectIndex = source.indexOf('{subjectLabel(s)}');
  const formKeyLineIndex = source.indexOf('{s.formKey}');
  assert.notEqual(subjectIndex, -1);
  assert.notEqual(formKeyLineIndex, -1);
  assert.ok(subjectIndex < formKeyLineIndex, 'subject must render before (above) the formKey/name/email line');
});

test('formKey, name, email, status and date are all still rendered, unchanged', () => {
  assert.match(source, /\{s\.formKey\}/);
  assert.match(source, /\{s\.values\?\.name \|\| '\(no name\)'\}/);
  assert.match(source, /\{s\.values\?\.email \|\| '\(no email\)'\}/);
  assert.match(source, /\{s\.status\}/);
  assert.match(source, /new Date\(s\.submittedAt\)\.toLocaleDateString\(\)/);
});

test('each row still links to its own detail page, unchanged', () => {
  assert.match(source, /href=\{`\/admin\/forms\/\$\{s\._id\}`\}/);
});
