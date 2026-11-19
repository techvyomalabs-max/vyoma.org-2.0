// QA Bug 1 fix regression coverage: validateDonor()/handleDonate() previously
// only checked `!name.trim() || !email.trim()` -- a non-blank, non-whitespace
// value like "0" passed with no error, since "0" is a truthy string, and
// there was no email-format check at all; both fields also shared one
// combined error message with no per-field attribution. QuickDonate.jsx is a
// client component with real JSX and no network/routing test double of its
// own, and this project has no React-rendering harness for a plain .jsx file
// (see components/layout/Header.a11y.test.mjs's own header comment for the
// same, already-established precedent) -- so this asserts the exact source
// text a future edit could otherwise silently regress, the same technique
// ContactForm.errorHandling.test.mjs/ContactPageForm.errorHandling.test.mjs
// already use for the sibling forms this fix mirrors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'QuickDonate.jsx'), 'utf8');

function functionBody(src, signature, endMarker) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end of ${signature} not found`);
  return src.slice(start, end);
}

test('NAME_RE/EMAIL_RE are the exact, already-reviewed patterns shared with ContactForm.jsx/ContactPageForm.jsx and the Backend\'s forms.controller.js', () => {
  assert.ok(source.includes("const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;"));
  assert.ok(source.includes("const NAME_RE = /^\\p{L}[\\p{L}\\s'’-]*$/u;"));
});

test('validateDonor trims before checking, and rejects an empty or whitespace-only name/email with its own required message', () => {
  const body = functionBody(source, 'function validateDonor({ name, email }) {', '\n}');
  assert.match(body, /const trimmedName = name\.trim\(\);/);
  assert.match(body, /if \(!trimmedName\) errors\.name = 'Name is required\.';/);
  assert.match(body, /const trimmedEmail = email\.trim\(\);/);
  assert.match(body, /if \(!trimmedEmail\) errors\.email = 'Email is required\.';/);
});

test('validateDonor rejects a non-blank name against NAME_RE -- "0" is a truthy string and must not pass on emptiness alone', () => {
  const body = functionBody(source, 'function validateDonor({ name, email }) {', '\n}');
  assert.match(body, /else if \(!NAME_RE\.test\(trimmedName\)\) errors\.name = /);
});

test('validateDonor rejects a non-blank email against EMAIL_RE -- a value like "0" or "abc" is truthy and must not pass on emptiness alone', () => {
  const body = functionBody(source, 'function validateDonor({ name, email }) {', '\n}');
  assert.match(body, /else if \(!EMAIL_RE\.test\(trimmedEmail\)\) errors\.email = /);
});

test('handleDonate clears both the combined error and the per-field errors at the start of every attempt', () => {
  const body = functionBody(source, 'const handleDonate = async () => {', '\n  };');
  assert.match(body, /setError\(null\);\s*\n\s*setFieldErrors\(\{\}\);/);
});

test('handleDonate runs validateDonor() before the amount check and before createDonationOrder(), storing errors per-field', () => {
  const body = functionBody(source, 'const handleDonate = async () => {', '\n  };');
  const donorCheckIndex = body.indexOf('validateDonor({ name, email })');
  const amountCheckIndex = body.indexOf('!Number.isFinite(amount)');
  const orderCallIndex = body.indexOf('await createDonationOrder(');
  assert.notEqual(donorCheckIndex, -1, 'expected validateDonor() to be called in handleDonate');
  assert.ok(donorCheckIndex < amountCheckIndex, 'donor validation must run before the amount check');
  assert.ok(amountCheckIndex < orderCallIndex, 'amount validation must still run before the API call (pre-existing order, unchanged)');
  assert.match(body, /setFieldErrors\(donorErrors\);\s*\n\s*return;/, 'an invalid donor must stop submission without calling the API');
});

test('the name and email inputs render an accessible, per-field error with aria-invalid', () => {
  assert.match(source, /aria-invalid=\{!!fieldErrors\.name\}/);
  assert.match(source, /aria-invalid=\{!!fieldErrors\.email\}/);
  assert.match(source, /\{fieldErrors\.name && <p className="mt-1 font-sans text-\[13px\] text-red-600">\{fieldErrors\.name\}<\/p>\}/);
  assert.match(source, /\{fieldErrors\.email && <p className="mt-1 font-sans text-\[13px\] text-red-600">\{fieldErrors\.email\}<\/p>\}/);
});

test('the existing amount validation, donation payload, and Razorpay prefill are unchanged', () => {
  assert.match(source, /if \(!Number\.isFinite\(amount\) \|\| amount <= 0\) \{/);
  assert.match(source, /donor: \{ name: name\.trim\(\), email: email\.trim\(\) \}/);
  assert.match(source, /prefill: \{ name: name\.trim\(\), email: email\.trim\(\) \}/);
});

test('the foreign/NRI bank-transfer path and the Razorpay-not-configured messages are unchanged', () => {
  assert.match(source, /router\.push\('\/donate#bank-transfer'\);/);
  assert.match(source, /'Online payment is not yet enabled for this site\. Please try again later or use a bank transfer\.'/);
  assert.match(source, /'Online payment is not yet fully configured\. Please try again later\.'/);
});
