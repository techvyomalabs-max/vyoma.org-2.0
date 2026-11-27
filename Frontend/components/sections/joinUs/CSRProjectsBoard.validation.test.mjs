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
  assert.match(body, /setMobileRejected\(false\);/, 'the successful-submission reset must also clear the rejected-input state (QA Bug 18 follow-up)');
  assert.match(body, /catch \{\s*\n\s*setStatus\('error'\);/);
});

// --- QA Bug 18: Mobile Number validation --------------------------------
//
// isValidMobileNumber/MOBILE_INPUT_ALLOWED_RE/NAME_RE/EMAIL_RE/
// COMMENT_MAX_LENGTH are plain, non-JSX top-level declarations, so (unlike
// the rest of this 'use client' component) their exact source text can be
// sliced out and turned into real, callable values via the Function
// constructor. setMobile and validate are also plain (non-JSX) arrow
// function expressions assigned to component-local consts; this file goes
// further for them than a simple slice-and-match: extractBalancedExpression
// brace-counts to find their TRUE end, producing a complete, syntactically
// valid function expression that is then actually CALLED (through a tiny,
// generic useState stand-in below) rather than merely pattern-matched as
// text. This is what distinguishes the tests in this section from pure
// source-string assertions: the REAL extracted logic runs, with no
// hand-copied reimplementation of setMobile/validate's own behaviour
// anywhere in this file. The one thing this project still cannot do for a
// .jsx file is mount it in an actual DOM/React renderer -- no such harness
// exists here (see this file's header comment) -- so real cursor position,
// real paste events, and actual visual rendering remain unverified by any
// test in this file or elsewhere in this project; see the implementation
// report for that limitation stated plainly.
function extractTopLevelFunction(src, signature, endMarker) {
  const start = src.indexOf(signature);
  assert.notEqual(start, -1, `${signature} not found`);
  const end = src.indexOf(endMarker, start);
  assert.notEqual(end, -1, `end of ${signature} not found`);
  return src.slice(start, end).trim();
}

function extractConst(src, name) {
  const marker = `const ${name} = `;
  const start = src.indexOf(marker);
  assert.notEqual(start, -1, `${marker} not found`);
  const end = src.indexOf(';', start);
  assert.notEqual(end, -1, `terminating ";" for ${marker} not found`);
  return src.slice(start + marker.length, end);
}

// Brace-counts from just after `afterText` to find the TRUE matching
// closing brace, so the result is a complete, syntactically valid
// function expression (e.g. "(e) => { ... }") -- not merely a fragment
// ending at the first literal string that happens to look like an end
// marker (which is all functionBody() above guarantees, and is why its
// output is only ever used for text pattern-matching, never execution).
function extractBalancedExpression(src, afterText) {
  const markerIndex = src.indexOf(afterText);
  assert.notEqual(markerIndex, -1, `${afterText} not found`);
  const exprStart = markerIndex + afterText.length;
  const braceStart = src.indexOf('{', exprStart);
  assert.notEqual(braceStart, -1, 'opening brace not found');
  let depth = 0;
  let i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  assert.equal(depth, 0, `did not find a matching closing brace after "${afterText}"`);
  return src.slice(exprStart, i);
}

const MOBILE_INPUT_ALLOWED_RE = new Function(`return (${extractConst(source, 'MOBILE_INPUT_ALLOWED_RE')});`)();
const NAME_RE = new Function(`return (${extractConst(source, 'NAME_RE')});`)();
const EMAIL_RE = new Function(`return (${extractConst(source, 'EMAIL_RE')});`)();
const COMMENT_MAX_LENGTH = new Function(`return (${extractConst(source, 'COMMENT_MAX_LENGTH')});`)();

const isValidMobileNumberSource = extractTopLevelFunction(
  source,
  'function isValidMobileNumber(raw) {',
  '\nexport function CSRProjectsBoard'
);
const isValidMobileNumber = new Function(
  'MOBILE_INPUT_ALLOWED_RE',
  `return (${isValidMobileNumberSource});`
)(MOBILE_INPUT_ALLOWED_RE);

const setMobileExprSrc = extractBalancedExpression(source, 'const setMobile = ');
const validateExprSrc = extractBalancedExpression(source, 'const validate = ');

// Minimal, generic useState-equivalent for driving the REAL extracted
// setMobile/validate closures outside React (no rendering harness exists
// in this project for a plain .jsx file). This reimplements only React's
// generic setState mechanics (a direct value, or an updater function) --
// never any of setMobile/validate's OWN business logic, which always
// comes from the real, freshly extracted source text above.
function createStateRef(initial) {
  let value = initial;
  return {
    get: () => value,
    set: (updaterOrValue) => {
      value = typeof updaterOrValue === 'function' ? updaterOrValue(value) : updaterOrValue;
    },
  };
}

function makeMobileHarness() {
  const fieldsRef = createStateRef({ name: 'A Person', email: 'a@b.com', organisation: 'Org', mobile: '', comment: 'hi' });
  const fieldErrorsRef = createStateRef({});
  const mobileRejectedRef = createStateRef(false);

  const setMobile = new Function(
    'MOBILE_INPUT_ALLOWED_RE',
    'isValidMobileNumber',
    'setFieldErrors',
    'setFields',
    'setMobileRejected',
    `return (${setMobileExprSrc});`
  )(MOBILE_INPUT_ALLOWED_RE, isValidMobileNumber, fieldErrorsRef.set, fieldsRef.set, mobileRejectedRef.set);

  return {
    change: (value) => setMobile({ target: { value } }),
    fields: () => fieldsRef.get(),
    fieldErrors: () => fieldErrorsRef.get(),
    mobileRejected: () => mobileRejectedRef.get(),
    setFieldErrorsDirect: fieldErrorsRef.set,
  };
}

// Calls the REAL extracted validate() body with a given state snapshot --
// mirrors how a fresh React render creates a fresh validate() closure
// over that render's current state.
function runValidate({ fields, selected = 'Some Project', mobileRejected = false }) {
  const validateFn = new Function(
    'NAME_RE',
    'EMAIL_RE',
    'COMMENT_MAX_LENGTH',
    'isValidMobileNumber',
    'fields',
    'selected',
    'mobileRejected',
    `return (${validateExprSrc});`
  )(NAME_RE, EMAIL_RE, COMMENT_MAX_LENGTH, isValidMobileNumber, fields, selected, mobileRejected);
  return validateFn();
}

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
  '(555 123-4567', // malformed: unbalanced, missing close paren
  '555)123(4567', // malformed: close before open
  '98765😀43210', // emoji
  '987\t6543210', // embedded tab
  '9876\n543210', // embedded newline
  '987 6543210', // embedded unsupported Unicode (non-breaking space)
  // QA Bug 18 follow-up — malformed separator usage, confirmed defects
  // from the final focused review, now corrected:
  '()9876543210',
  '9876543210()',
  '123()4567890',
  '(---)9876543210',
  '---9876543210',
  '9876543210---',
  '+ 9876543210',
  '+91+9876543210',
];

test('isValidMobileNumber (the real function in the file) accepts every mandatory valid example, including the parenthesised formats the earlier draft regexes wrongly rejected', () => {
  for (const value of VALID_MOBILE_NUMBERS) {
    assert.equal(isValidMobileNumber(value), true, `expected "${value}" to be valid`);
  }
});

test('isValidMobileNumber (the real function in the file) rejects every mandatory invalid example, including every malformed-separator case identified in the final focused review', () => {
  for (const value of INVALID_MOBILE_NUMBERS) {
    assert.equal(isValidMobileNumber(value), false, `expected "${value}" to be rejected`);
  }
});

test('isValidMobileNumber rejects non-string input without throwing', () => {
  for (const value of [undefined, null, 9876543210, ['9876543210'], { number: '9876543210' }]) {
    assert.doesNotThrow(() => isValidMobileNumber(value));
    assert.equal(isValidMobileNumber(value), false);
  }
});

test('the frontend and backend isValidMobileNumber implementations produce identical results for every mandatory vector (no drift between the two mirrored copies)', () => {
  const backendSource = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'Backend', 'src', 'modules', 'forms', 'forms.controller.js'),
    'utf8'
  );
  const backendIsValidMobileNumberSource = extractBalancedExpression(backendSource, 'export function isValidMobileNumber');
  const backendIsValidMobileNumber = new Function(`return (function isValidMobileNumber${backendIsValidMobileNumberSource});`)();

  for (const value of [...VALID_MOBILE_NUMBERS, ...INVALID_MOBILE_NUMBERS]) {
    assert.equal(
      isValidMobileNumber(value),
      backendIsValidMobileNumber(value),
      `frontend/backend disagree on "${value}"`
    );
  }
});

test('MOBILE_INPUT_ALLOWED_RE (the live typing/paste gate) rejects multiple or interior plus signs, matching the corrected setMobile behaviour', () => {
  for (const value of ['++919876543210', '98765+43210', '+91+9876543210']) {
    assert.ok(!MOBILE_INPUT_ALLOWED_RE.test(value), `expected "${value}" to be rejected at the input level`);
  }
});

test('MOBILE_INPUT_ALLOWED_RE still allows normal intermediate editing states (empty, a lone leading +, a partially entered parenthesis, alphabetic/unsupported characters still rejected)', () => {
  for (const value of ['', '+', '(', '(5', '+91', '+91 9', '9876543210', '+91 98765 43210', '(555) 123-4567']) {
    assert.ok(MOBILE_INPUT_ALLOWED_RE.test(value), `expected "${value}" to be an allowed in-progress value`);
  }
  for (const value of ['abc', '98765abc43210', '98765@43210', '😀', '987\t6543210', '9876\n543210']) {
    assert.ok(!MOBILE_INPUT_ALLOWED_RE.test(value), `expected "${value}" to be rejected at the input level`);
  }
});

test('the Mobile Number input uses type="tel" and inputMode="tel", not type="number"', () => {
  const inputBlock = functionBody(source, 'placeholder="Mobile Number"', '/>');
  assert.match(inputBlock, /type="tel"/);
  assert.match(inputBlock, /inputMode="tel"/);
  assert.doesNotMatch(inputBlock, /type="number"/);
  assert.match(inputBlock, /onChange=\{setMobile\}/, 'expected the dedicated setMobile handler, not the generic setField');
});

test('setMobile source still shows no keydown-only handler and still discards a rejected change via a fresh object reference (structural source check, complementing the executable harness tests below)', () => {
  const body = functionBody(source, 'const setMobile = (e) => {', '\n  };');
  assert.match(body, /if \(!MOBILE_INPUT_ALLOWED_RE\.test\(next\)\) \{/);
  assert.match(body, /setMobileRejected\(true\);/);
  assert.match(body, /setFields\(\(f\) => \(\{ \.\.\.f \}\)\);/);
  assert.doesNotMatch(source, /onKeyDown=/, 'this component must not rely on a keydown handler for the mobile field');
});

test('validate() source checks mobileRejected first, independently of the retained value\'s own format (structural source check, complementing the executable harness tests below)', () => {
  const body = functionBody(source, 'const validate = () => {', '\n  };');
  assert.match(body, /if \(mobileRejected\) errors\.mobile = 'Enter a valid mobile number\.';/);
  assert.match(body, /else if \(!fields\.mobile\.trim\(\)\) errors\.mobile = 'Mobile number is required\.';/);
  assert.match(body, /else if \(!isValidMobileNumber\(fields\.mobile\)\) errors\.mobile = 'Enter a valid mobile number\.';/);
});

// --- Executable harness tests: real setMobile + real validate(), driven
// through the minimal useState stand-in above, not a hand-copied
// simulation of their logic. ---------------------------------------------

test('an invalid paste into an already-empty field is rejected: the field stays empty, the inline error is shown, and the rejected-input state is set', () => {
  const h = makeMobileHarness();
  h.change('xyz#@!');
  assert.equal(h.fields().mobile, '');
  assert.equal(h.fieldErrors().mobile, 'Enter a valid mobile number.');
  assert.equal(h.mobileRejected(), true);
});

test('an invalid paste over an existing valid number retains the previous valid value, shows the inline error, and sets the rejected-input state', () => {
  const h = makeMobileHarness();
  h.change('9876543210');
  assert.equal(h.mobileRejected(), false, 'a valid value must not leave the rejected-input state set');
  h.change('abc123xyz');
  assert.equal(h.fields().mobile, '9876543210', 'the previously accepted valid value must be retained, not overwritten or stripped');
  assert.equal(h.fieldErrors().mobile, 'Enter a valid mobile number.');
  assert.equal(h.mobileRejected(), true);
});

test('submitting immediately after a rejected paste is blocked, even though the retained mobile value is itself fully valid, and remains blocked across repeated attempts until corrected', () => {
  const h = makeMobileHarness();
  h.change('9876543210');
  h.change('abc123xyz'); // rejected; '9876543210' retained

  for (let attempt = 0; attempt < 3; attempt++) {
    const errors = runValidate({ fields: h.fields(), mobileRejected: h.mobileRejected() });
    assert.equal(errors.mobile, 'Enter a valid mobile number.', `attempt ${attempt + 1} must still be blocked`);
  }
});

test('a fully valid correction after a rejected paste clears both the rejected-input state and the inline error, and validate() then accepts the mobile field', () => {
  const h = makeMobileHarness();
  h.change('9876543210');
  h.change('abc123xyz'); // rejected
  h.change('9123456780'); // a different, but itself fully valid, number

  assert.equal(h.mobileRejected(), false);
  assert.equal(h.fieldErrors().mobile, undefined);
  const errors = runValidate({ fields: h.fields(), mobileRejected: h.mobileRejected() });
  assert.equal(errors.mobile, undefined);
});

test('an incomplete correction (allowed characters, but not yet a fully valid number) does NOT clear the rejected-input state, and submission remains blocked', () => {
  const h = makeMobileHarness();
  h.change('9876543210');
  h.change('abc123xyz'); // rejected
  h.change('123'); // allowed characters, but too short to be fully valid

  assert.equal(h.mobileRejected(), true, 'must remain unresolved');
  assert.equal(h.fieldErrors().mobile, 'Enter a valid mobile number.');
  const errors = runValidate({ fields: h.fields(), mobileRejected: h.mobileRejected() });
  assert.equal(errors.mobile, 'Enter a valid mobile number.', 'submission must still be blocked');
});

test('clearing the field after a rejected paste resolves the rejected-input state, and validate() then falls back to the required-field message, not the invalid-format message', () => {
  const h = makeMobileHarness();
  h.change('9876543210');
  h.change('abc123xyz'); // rejected
  h.change(''); // field cleared

  assert.equal(h.mobileRejected(), false);
  const errors = runValidate({ fields: h.fields(), mobileRejected: h.mobileRejected() });
  assert.equal(errors.mobile, 'Mobile number is required.');
});

test('rejecting a mobile input change preserves every other already-set field error untouched', () => {
  const h = makeMobileHarness();
  h.setFieldErrorsDirect({ name: 'Name is required.', email: 'Enter a valid email address.' });
  h.change('abc');
  assert.deepEqual(h.fieldErrors(), {
    name: 'Name is required.',
    email: 'Enter a valid email address.',
    mobile: 'Enter a valid mobile number.',
  });
});

// The success-reset snippet (handleSubmit's post-submission reset) is
// executed directly too, not just source-matched -- the exact literal
// text is sliced straight from the file and run with harness setters,
// without touching the preceding `await submitForm(...)` network call at
// all (that line is never included in or executed by this snippet).
const resetSnippetSrc = (() => {
  const startText = "setStatus('sent');";
  const endTextInclusive = "setMobileRejected(false);";
  const start = source.indexOf(startText);
  assert.notEqual(start, -1, `${startText} not found`);
  const endOfEndText = source.indexOf(endTextInclusive, start);
  assert.notEqual(endOfEndText, -1, `${endTextInclusive} not found after ${startText}`);
  return source.slice(start, endOfEndText + endTextInclusive.length);
})();

test('the real success-reset snippet (handleSubmit, on a successful submission) resets the rejected-input state back to false, alongside the pre-existing field/selection reset -- executed directly, not source-matched, and without touching the network submission call it normally follows', () => {
  let status;
  let fields;
  let selected;
  let mobileRejected = true;
  const runReset = new Function(
    'setStatus',
    'setFields',
    'setSelected',
    'setMobileRejected',
    resetSnippetSrc
  );
  runReset(
    (v) => {
      status = v;
    },
    (v) => {
      fields = v;
    },
    (v) => {
      selected = v;
    },
    (v) => {
      mobileRejected = v;
    }
  );
  assert.equal(status, 'sent');
  assert.deepEqual(fields, { name: '', email: '', organisation: '', mobile: '', comment: '' });
  assert.equal(selected, '');
  assert.equal(mobileRejected, false);
});
