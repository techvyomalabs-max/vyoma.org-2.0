// Genuine execution coverage for validateJoinUs's Internship Role/Skill
// required-field validation (and a re-confirmation that the pre-existing
// CAREER_ROLES/VOLUNTEER_APPLY_URL checks are unaffected). This is a client
// component file (`'use client'`, JSX elsewhere in it) with no
// loader/transform registered for plain `node --test` in this project
// (confirmed via package.json's test script) -- the same established
// limitation as every other JSX-returning admin page in this codebase (see
// Frontend/app/admin/forms/page.category.test.mjs's own header comment for
// the identical situation and the same resolution: extract the pure,
// JSX-free function's exact source text and execute it for real via
// `new Function(...)`, rather than re-typing a duplicate copy or only
// asserting against the source text).
//
// validateJoinUs itself is intentionally NOT extracted into its own module
// here -- it has no React/JSX dependency and needs none, so the existing
// extraction technique is sufficient without introducing a new production
// file (explicitly not approved for this task).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');

// Extracts APPLY_URL_RE + isBlankRequiredField + validateJoinUs verbatim
// (contiguous in the source, in that order) and executes the real
// validateJoinUs function it defines -- brace-depth matched, same technique
// page.category.test.mjs's own extractBalanced() already established, so a
// nested multi-line block inside validateJoinUs can never truncate the
// extraction early.
function extractValidateJoinUs(src) {
  const start = src.indexOf('const APPLY_URL_RE');
  assert.notEqual(start, -1, 'expected to find APPLY_URL_RE in page.js');
  const funcStart = src.indexOf('function validateJoinUs(data) {', start);
  assert.notEqual(funcStart, -1, 'expected to find function validateJoinUs(data) { in page.js');

  let depth = 0;
  let i = funcStart;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0 && i < src.length, 'expected validateJoinUs\'s braces to balance');

  const body = src.slice(start, i + 1);
  const factory = new Function(`${body}\nreturn validateJoinUs;`);
  return factory();
}

const validateJoinUs = extractValidateJoinUs(source);

function baseData(openings) {
  return { CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '', INTERNSHIP_OPENINGS: openings };
}

// --- Valid cases -------------------------------------------------------

test('a single valid opening (Role and Skill both present) passes', () => {
  assert.equal(validateJoinUs(baseData([{ role: 'Frontend Intern', skill: 'React', active: true }])), null);
});

test('zero openings is always valid', () => {
  assert.equal(validateJoinUs(baseData([])), null);
});

test('INTERNSHIP_OPENINGS entirely absent from data is valid (treated as zero openings)', () => {
  assert.equal(validateJoinUs({ CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '' }), null);
});

test('a valid INACTIVE opening is accepted (being inactive does not exempt it from needing valid content, but valid content is still fine)', () => {
  assert.equal(validateJoinUs(baseData([{ role: 'Hidden Intern', skill: 'Python', active: false }])), null);
});

// --- Missing / blank field cases ---------------------------------------

test('missing Role alone is rejected with a one-based position and the specific field name', () => {
  assert.equal(validateJoinUs(baseData([{ role: '', skill: 'Python', active: true }])), 'Internship opening 1: Role is required.');
});

test('missing Skill alone is rejected with a one-based position and the specific field name', () => {
  assert.equal(validateJoinUs(baseData([{ role: 'Backend Intern', skill: '', active: true }])), 'Internship opening 1: Skill is required.');
});

test('both Role and Skill missing identifies both fields in one message', () => {
  assert.equal(validateJoinUs(baseData([{ role: '', skill: '', active: true }])), 'Internship opening 1: Role and Skill are required.');
});

test('whitespace-only Role/Skill are rejected exactly like empty strings', () => {
  assert.equal(validateJoinUs(baseData([{ role: '   ', skill: 'Python', active: true }])), 'Internship opening 1: Role is required.');
  assert.equal(validateJoinUs(baseData([{ role: 'Backend Intern', skill: '\t\n ', active: true }])), 'Internship opening 1: Skill is required.');
});

test('null Role/Skill are rejected', () => {
  assert.equal(validateJoinUs(baseData([{ role: null, skill: 'Python', active: true }])), 'Internship opening 1: Role is required.');
  assert.equal(validateJoinUs(baseData([{ role: 'Backend Intern', skill: null, active: true }])), 'Internship opening 1: Skill is required.');
});

test('a completely absent field (key never set on the opening object) is rejected the same as an empty string', () => {
  assert.equal(validateJoinUs(baseData([{ active: true }])), 'Internship opening 1: Role and Skill are required.');
});

test('non-string Role/Skill values (number, boolean, object, array) are all rejected', () => {
  for (const bad of [42, true, {}, [], ['Python']]) {
    assert.equal(
      validateJoinUs(baseData([{ role: bad, skill: 'Python', active: true }])),
      'Internship opening 1: Role is required.',
      `expected rejection for role=${JSON.stringify(bad)}`
    );
  }
});

// --- Malformed entries/containers: rejected outright, never silently
// tolerated, ignored or normalized -- and never throw while rejecting ----

test('a malformed individual opening (null, string, number, boolean, array) is REJECTED by its own one-based position, not treated as "both fields missing" and not tolerated', () => {
  for (const bad of [null, 'not-an-opening', 42, true, ['role', 'skill']]) {
    assert.doesNotThrow(() => validateJoinUs(baseData([bad])));
    assert.equal(validateJoinUs(baseData([bad])), 'Internship opening 1 is malformed.', `expected rejection for opening=${JSON.stringify(bad)}`);
  }
});

test('an explicit non-array INTERNSHIP_OPENINGS container (null, string, number, boolean, object) is REJECTED with a clear validation message, never silently treated as "no openings"', () => {
  for (const bad of [null, 'not-an-array', 42, true, { role: 'x' }]) {
    assert.doesNotThrow(() => validateJoinUs({ CAREER_ROLES: [], INTERNSHIP_OPENINGS: bad }));
    assert.equal(
      validateJoinUs({ CAREER_ROLES: [], INTERNSHIP_OPENINGS: bad }),
      'INTERNSHIP_OPENINGS must be an array of internship openings.',
      `expected rejection for INTERNSHIP_OPENINGS=${JSON.stringify(bad)}`
    );
  }
});

test('an ABSENT INTERNSHIP_OPENINGS field (key never set) is still valid -- this is the one tolerated case, distinct from an explicit malformed value', () => {
  assert.equal(validateJoinUs({ CAREER_ROLES: [], VOLUNTEER_APPLY_URL: '' }), null);
});

test('frontend and backend malformed-container/entry rejection wording matches exactly, for consistency', () => {
  assert.equal(
    validateJoinUs({ INTERNSHIP_OPENINGS: 'not-an-array' }),
    'INTERNSHIP_OPENINGS must be an array of internship openings.'
  );
  assert.equal(validateJoinUs(baseData([42])), 'Internship opening 1 is malformed.');
});

test('validateJoinUs never throws even when called with null/undefined data entirely', () => {
  assert.doesNotThrow(() => validateJoinUs(undefined));
  assert.doesNotThrow(() => validateJoinUs(null));
});

// --- Multiple openings, first-invalid reporting --------------------------

test('with multiple openings, the FIRST invalid one is reported by its own one-based position, not the last or a generic message', () => {
  const result = validateJoinUs(
    baseData([
      { role: 'Valid Intern', skill: 'Sanskrit', active: true },
      { role: '', skill: 'Linguistics', active: true },
      { role: 'Also Invalid', skill: '', active: true },
    ])
  );
  assert.equal(result, 'Internship opening 2: Role is required.');
});

test('a valid opening after an earlier invalid one does not mask the earlier error', () => {
  const result = validateJoinUs(
    baseData([
      { role: '', skill: 'Sanskrit', active: true },
      { role: 'Valid Intern', skill: 'Linguistics', active: true },
    ])
  );
  assert.equal(result, 'Internship opening 1: Role is required.');
});

// --- Active/inactive ------------------------------------------------------

test('an INACTIVE opening with missing Role/Skill is still rejected -- being invisible today does not exempt it, since it can be made visible later with no further edit', () => {
  assert.equal(validateJoinUs(baseData([{ role: '', skill: 'Python', active: false }])), 'Internship opening 1: Role is required.');
});

test('a mix of a valid active opening and an invalid inactive opening still reports the invalid one', () => {
  const result = validateJoinUs(
    baseData([
      { role: 'Visible Intern', skill: 'Sanskrit', active: true },
      { role: 'Hidden Intern', skill: '', active: false },
    ])
  );
  assert.equal(result, 'Internship opening 2: Skill is required.');
});

// --- Existing CAREER_ROLES / VOLUNTEER_APPLY_URL validation preserved ----

test('existing CAREER_ROLES applyUrl validation is unaffected by the new Internship checks', () => {
  const data = { CAREER_ROLES: [{ title: 'Engineer', applyUrl: 'javascript:alert(1)' }], INTERNSHIP_OPENINGS: [] };
  assert.equal(validateJoinUs(data), 'Apply URL for "Engineer" must start with http:// or https:// (or be left blank).');
});

test('existing CAREER_ROLES applyUrl validation still passes for a valid https URL, falling through to a valid (empty) INTERNSHIP_OPENINGS check', () => {
  const data = { CAREER_ROLES: [{ title: 'Engineer', applyUrl: 'https://example.test/apply' }], INTERNSHIP_OPENINGS: [] };
  assert.equal(validateJoinUs(data), null);
});

test('existing VOLUNTEER_APPLY_URL validation is unaffected by the new Internship checks', () => {
  const data = { CAREER_ROLES: [], VOLUNTEER_APPLY_URL: 'not-a-url', INTERNSHIP_OPENINGS: [] };
  assert.equal(validateJoinUs(data), 'Volunteer Apply URL must start with http:// or https:// (or be left blank).');
});

test('a CAREER_ROLES error is still reported BEFORE an Internship Openings error, preserving existing check order', () => {
  const data = {
    CAREER_ROLES: [{ title: 'Engineer', applyUrl: 'ftp://bad' }],
    INTERNSHIP_OPENINGS: [{ role: '', skill: '', active: true }],
  };
  assert.equal(validateJoinUs(data), 'Apply URL for "Engineer" must start with http:// or https:// (or be left blank).');
});

// --- Save Draft / Publish wiring still intact ---------------------------

test('ContentEditorShell still receives validateJoinUs as its validate prop, applied to both Save Draft and Publish', () => {
  assert.match(source, /<ContentEditorShell pageLabel="Join Us" type=\{TYPE\} sections=\{SECTIONS\} validate=\{validateJoinUs\} \/>/);
});

test('the Role and Skill fields are marked required via their placeholder text (existing UI convention, no shared-component change)', () => {
  assert.match(source, /\{ key: 'role', type: 'text', label: 'Role', placeholder: 'Role \(required\)' \}/);
  assert.match(source, /\{ key: 'skill', type: 'text', label: 'Skill required', placeholder: 'Skill \(required\)' \}/);
});

test('the Visible checkbox, add/remove/reorder mechanics and InternshipOpeningsForm wiring are otherwise unchanged', () => {
  assert.match(source, /newItemTemplate=\{\{ role: '', skill: '', active: true \}\}/);
  assert.match(source, /labelKey="role"/);
  const formStart = source.indexOf('function InternshipOpeningsForm({ value, onChange }) {');
  assert.notEqual(formStart, -1);
  const formEnd = source.indexOf('\n}', formStart);
  const formBody = source.slice(formStart, formEnd);
  assert.match(formBody, /<SimpleRepeatableForm/, 'InternshipOpeningsForm must still use the shared SimpleRepeatableForm, not a direct RepeatableList (no shared-component/architecture change)');
  assert.doesNotMatch(formBody, /<RepeatableList/);
});
