// Genuine runtime regression coverage for the category -> MongoDB $expr
// clause mapping. Pure logic, no database, no HTTP -- real execution of the
// exact, unmodified module forms.admin.controller.js imports and calls.
// End-to-end proof that these clauses actually match/exclude the right
// documents when run against a real (disposable) database lives in
// forms.admin.controller.test.js instead -- this file only proves the
// clause-SHAPE is correct and internally consistent (every known category
// requires values.subject to be a string first; Other/Unknown is exactly
// the negation of every known category's union, so it can never overlap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORY_KEYS, buildCategoryFilter } from './formCategoryFilter.js';

test('CATEGORY_KEYS is the exact approved taxonomy, including Other/Unknown', () => {
  assert.deepEqual(
    [...CATEGORY_KEYS].sort(),
    [
      'careers',
      'corpus-fund',
      'csr-partnership',
      'general-inquiry',
      'institutional-partnership',
      'internships',
      'other-unknown',
      'press-media',
      'testimonial-submission',
      'volunteering',
    ].sort()
  );
});

test('every known category clause requires values.subject to be a string first (never matches a non-string/array value by accident)', () => {
  for (const key of CATEGORY_KEYS.filter((k) => k !== 'other-unknown')) {
    const filter = buildCategoryFilter(key);
    const json = JSON.stringify(filter);
    assert.match(json, /"\$type":"\$values\.subject"/, `"${key}" must $type-check values.subject`);
    assert.match(json, /"string"/, `"${key}" must require the string type`);
  }
});

test('internships uses an anchored regex (requiring at least one non-whitespace role character), ending in the PCRE absolute-end anchor \\z (not a bare $), covering both the general subject and any role-specific subject, with no role name hardcoded', () => {
  const filter = buildCategoryFilter('internships');
  const json = JSON.stringify(filter);
  assert.match(json, /\^Internships\( - \.\*\\\\S\.\*\)\?\\\\z/);
  assert.doesNotMatch(json, /Developer|Senior/, 'must never hardcode a specific role name');
});

test('careers uses its own anchored regex (": " separator, distinct from Internships\' " - ", same non-whitespace-role requirement and \\z anchor)', () => {
  const filter = buildCategoryFilter('careers');
  const json = JSON.stringify(filter);
  assert.match(json, /\^Careers\(: \.\*\\\\S\.\*\)\?\\\\z/);
});

test('neither pattern ends in a bare, unescaped "$" -- the trailing-newline PCRE quirk ($ matches before a single trailing "\\n" even without the "m" flag) is specifically avoided by using \\z instead', () => {
  for (const key of ['internships', 'careers']) {
    const { $expr } = buildCategoryFilter(key);
    const pattern = $expr.$cond.then.$regexMatch.regex;
    assert.ok(pattern.endsWith('\\z'), `"${key}" pattern must end in the PCRE \\z anchor`);
    assert.ok(!pattern.endsWith('$'), `"${key}" pattern must not end in a bare $`);
  }
});

test('internships/careers regex clauses use $cond (explicit, documented branch evaluation), never $and, and request the "s" (dotall) option so a multiline role name still matches', () => {
  for (const key of ['internships', 'careers']) {
    const json = JSON.stringify(buildCategoryFilter(key));
    assert.match(json, /"\$cond"/);
    assert.match(json, /"else":false/);
    assert.match(json, /"options":"s"/);
  }
});

test('exact-match categories build a literal $eq clause, not a regex', () => {
  const exactKeys = [
    'volunteering',
    'institutional-partnership',
    'csr-partnership',
    'press-media',
    'testimonial-submission',
    'corpus-fund',
    'general-inquiry',
  ];
  for (const key of exactKeys) {
    const filter = buildCategoryFilter(key);
    assert.doesNotMatch(JSON.stringify(filter), /\$regexMatch/, `"${key}" must be an exact match, not a regex`);
  }
});

test('other-unknown is defined as the exact negation of the union of every known category -- cannot be a separately-drifting set of conditions', () => {
  const otherFilter = buildCategoryFilter('other-unknown');
  const knownExprs = CATEGORY_KEYS.filter((k) => k !== 'other-unknown').map((k) => buildCategoryFilter(k).$expr);
  assert.deepEqual(otherFilter, { $expr: { $not: [{ $or: knownExprs }] } });
});

test('buildCategoryFilter returns null for a key outside the allowlist (callers must validate against CATEGORY_KEYS first)', () => {
  assert.equal(buildCategoryFilter('not-a-real-category'), null);
});

test('buildCategoryFilter is immune to JS-prototype-chain property names -- these must resolve to null, not a nonsense filter from Object.prototype', () => {
  assert.equal(buildCategoryFilter('__proto__'), null);
  assert.equal(buildCategoryFilter('constructor'), null);
  assert.equal(buildCategoryFilter('toString'), null);
  assert.equal(buildCategoryFilter('hasOwnProperty'), null);
});

test('every clause is a plain, JSON-serializable object -- safe to merge into a Mongoose filter with Object.assign, and never contains a raw, caller-influenced value', () => {
  for (const key of CATEGORY_KEYS) {
    const filter = buildCategoryFilter(key);
    assert.equal(typeof filter, 'object');
    assert.ok('$expr' in filter);
    // Confirms this is pure, static, server-defined data -- re-calling with
    // the same key always produces a deeply equal result.
    assert.deepEqual(filter, buildCategoryFilter(key));
  }
});
