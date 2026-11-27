// QA Bug 18 — Mobile Number validation (CSR Partner Enquiry only).
// Pure, synchronous unit coverage of the real exported functions
// (isValidMobileNumber, validate) from forms.controller.js -- no mongoose
// connection, no MongoMemoryServer, no HTTP server, no network I/O at
// all, so this file is unaffected by the ambient database configuration
// blocker this project's other backend test suites hit in this
// environment. Uses the exact same valid/invalid vectors the Frontend's
// CSRProjectsBoard.validation.test.mjs uses, to prevent the two
// implementations from drifting apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidMobileNumber, validate } from './forms.controller.js';

const VALID_MOBILE_NUMBERS = [
  '9876543210',
  '+91 98765 43210',
  '+1-202-555-0143',
  '(555) 123-4567',
  '+44 (20) 7946 0958', // QA Bug 18 follow-up: UK-style, parentheses NOT at the start
  '1234567',
  '+123456789012345',
  '  9876543210  ', // surrounding ordinary whitespace
];

const INVALID_MOBILE_NUMBERS = [
  'abcdefgh',
  '98765abc',
  '123',
  '1234567890123456',
  '++919876543210',
  '98765+43210',
  '98765@43210',
  '-----', // separator-only
  '   ', // separator-only (whitespace only, no digits)
  '(555 123-4567', // malformed: unbalanced, missing close paren
  '555)123(4567', // malformed: close before open
  '98765😀43210', // emoji
  '987\t6543210', // embedded tab
  '9876\n543210', // embedded newline
  '987 6543210', // embedded unsupported Unicode (non-breaking space)
  // QA Bug 18 follow-up — malformed separator usage, confirmed defects
  // from the final focused review, now corrected:
  '()9876543210', // empty parentheses
  '9876543210()', // empty parentheses, trailing
  '123()4567890', // empty parentheses, in the middle
  '(---)9876543210', // parentheses containing only separators
  '---9876543210', // leading hyphens
  '9876543210---', // trailing hyphens
  '+ 9876543210', // a leading + not immediately followed by a digit
  '+91+9876543210', // a second, interior + (in addition to the existing ++/interior-+ vectors above)
];

test('every mandatory valid mobile number is accepted', () => {
  for (const value of VALID_MOBILE_NUMBERS) {
    assert.equal(isValidMobileNumber(value), true, `expected "${value}" to be valid`);
  }
});

test('every mandatory invalid mobile number is rejected', () => {
  for (const value of INVALID_MOBILE_NUMBERS) {
    assert.equal(isValidMobileNumber(value), false, `expected "${value}" to be rejected`);
  }
});

test('missing, null, undefined and non-string values (number, array, object) are rejected without throwing', () => {
  const nonStringValues = [undefined, null, 9876543210, ['9876543210'], { number: '9876543210' }, true, NaN];
  for (const value of nonStringValues) {
    assert.doesNotThrow(() => isValidMobileNumber(value));
    assert.equal(isValidMobileNumber(value), false, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('an empty string and a whitespace-only string are both rejected by isValidMobileNumber itself (the required-vs-invalid message split happens one level up, in validate())', () => {
  assert.equal(isValidMobileNumber(''), false);
  assert.equal(isValidMobileNumber('   '), false);
});

// --- QA Bug 18 follow-up: the specific malformed-format defects confirmed
// by the final focused review, each isolated to its own named test -----

test('empty parentheses are rejected, whether leading, trailing, or in the middle', () => {
  assert.equal(isValidMobileNumber('()9876543210'), false);
  assert.equal(isValidMobileNumber('9876543210()'), false);
  assert.equal(isValidMobileNumber('123()4567890'), false);
});

test('parentheses containing only separator characters (no digit) are rejected', () => {
  assert.equal(isValidMobileNumber('(---)9876543210'), false);
});

test('leading or trailing hyphens are rejected', () => {
  assert.equal(isValidMobileNumber('---9876543210'), false);
  assert.equal(isValidMobileNumber('9876543210---'), false);
});

test('a leading + not immediately followed by a digit is rejected', () => {
  assert.equal(isValidMobileNumber('+ 9876543210'), false);
});

test('a non-nested, properly balanced parenthesis that DOES contain a digit is still valid, even when it is not at the very start of the number', () => {
  assert.equal(isValidMobileNumber('+44 (20) 7946 0958'), true);
});

// --- validate(values, 'csr-enquiry') -- the real submission-time gate ---

function baseCsrValues(overrides = {}) {
  return {
    name: 'Partner Org Contact',
    email: 'partner@example.test',
    organisation: 'Example Foundation',
    message: 'Interested in partnering.',
    mobile: '9876543210',
    ...overrides,
  };
}

test('validate() accepts a csr-enquiry submission with a valid mobile number (no mobile field error)', () => {
  for (const mobile of VALID_MOBILE_NUMBERS) {
    const fieldErrors = validate(baseCsrValues({ mobile }), 'csr-enquiry');
    assert.equal(fieldErrors?.mobile, undefined, `expected "${mobile}" to produce no mobile error`);
  }
});

test('validate() rejects a csr-enquiry submission with an invalid mobile number, using the invalid-format message', () => {
  // Excludes the whitespace-only vector from INVALID_MOBILE_NUMBERS: that
  // one is correctly handled by validate()'s earlier required-field
  // check (see the dedicated test for that below), not this one -- it
  // never reaches the format check at all.
  for (const mobile of INVALID_MOBILE_NUMBERS.filter((value) => value.trim() !== '')) {
    const fieldErrors = validate(baseCsrValues({ mobile }), 'csr-enquiry');
    assert.equal(fieldErrors?.mobile, 'Enter a valid mobile number.', `expected "${mobile}" to be flagged invalid`);
  }
});

test('validate() uses the required-field message, not the invalid-format message, for an empty or whitespace-only mobile value', () => {
  for (const mobile of ['', '   ', '\t\t', '\n']) {
    const fieldErrors = validate(baseCsrValues({ mobile }), 'csr-enquiry');
    assert.equal(fieldErrors?.mobile, 'Mobile number is required.');
  }
});

test('validate() uses the required-field message for a missing, null, or non-string mobile value, checking the type before calling any string method', () => {
  for (const mobile of [undefined, null, 9876543210, ['9876543210'], { number: '9876543210' }]) {
    const values = baseCsrValues({ mobile });
    assert.doesNotThrow(() => validate(values, 'csr-enquiry'));
    const fieldErrors = validate(values, 'csr-enquiry');
    assert.equal(fieldErrors?.mobile, 'Mobile number is required.');
  }
});

test('validate() with no mobile key at all on a csr-enquiry submission is rejected as required (missing field)', () => {
  const values = baseCsrValues();
  delete values.mobile;
  const fieldErrors = validate(values, 'csr-enquiry');
  assert.equal(fieldErrors?.mobile, 'Mobile number is required.');
});

test('validate() never checks mobile for any formKey other than csr-enquiry, even with a garbage mobile value', () => {
  for (const formKey of ['contact', 'newsletter', 'volunteer', 'internship']) {
    const values = { name: 'A Person', email: 'person@example.test', message: 'hello', mobile: 'abcdefgh' };
    const fieldErrors = validate(values, formKey);
    assert.equal(fieldErrors?.mobile, undefined, `expected formKey "${formKey}" to ignore the mobile field entirely`);
  }
});

test('validate() for csr-enquiry still enforces every pre-existing requirement (name, email, message) unchanged, alongside the new mobile check', () => {
  const fieldErrors = validate({ mobile: 'abcdefgh' }, 'csr-enquiry');
  assert.ok(fieldErrors.name, 'name is still required');
  assert.ok(fieldErrors.email, 'email is still required');
  assert.ok(fieldErrors.message, 'message is still required');
  assert.equal(fieldErrors.mobile, 'Enter a valid mobile number.');
});

test('validate() returns null (no errors) for a fully valid csr-enquiry submission', () => {
  assert.equal(validate(baseCsrValues(), 'csr-enquiry'), null);
});
