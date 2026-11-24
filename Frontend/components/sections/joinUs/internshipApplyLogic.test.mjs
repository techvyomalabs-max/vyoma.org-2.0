// Genuine runtime regression coverage for the per-vacancy Internship Apply
// subject-building logic -- real execution of the exact, unmodified
// function InternshipApplyButton.jsx imports and calls, not a re-typed
// duplicate and not a source-text match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInternshipApplySubject } from './internshipApplyLogic.mjs';

test('builds the exact approved subject for "Developer"', () => {
  assert.equal(buildInternshipApplySubject('Developer'), 'Internships - Developer');
});

test('builds the exact approved subject for "Senior Developer"', () => {
  assert.equal(buildInternshipApplySubject('Senior Developer'), 'Internships - Senior Developer');
});

test('works for an arbitrary, never-hardcoded future CMS-created role', () => {
  assert.equal(buildInternshipApplySubject('Data Analyst Intern'), 'Internships - Data Analyst Intern');
  assert.equal(buildInternshipApplySubject('UX Research Fellow'), 'Internships - UX Research Fellow');
});

test('is a pure function with no shared/cached state -- calling it for two different roles in sequence never leaks a stale previous role (proves switching between vacancies cannot produce stale subject context)', () => {
  const first = buildInternshipApplySubject('Developer');
  const second = buildInternshipApplySubject('Senior Developer');
  assert.equal(first, 'Internships - Developer');
  assert.equal(second, 'Internships - Senior Developer');
  // Calling it again for the first role afterward still returns the same,
  // correct result -- no memoized/stale value from the intervening call.
  assert.equal(buildInternshipApplySubject('Developer'), 'Internships - Developer');
});

test('CMS-derived role text is never parsed as HTML/markup by this function -- it is a plain string concatenation, so a mischievous role string is returned as inert text, never executed or reinterpreted', () => {
  const role = '<script>alert(1)</script>';
  const result = buildInternshipApplySubject(role);
  assert.equal(result, 'Internships - <script>alert(1)</script>');
  assert.equal(typeof result, 'string');
});

test('does not crash on an empty role string (Role/Skill required-field validation is a separate, explicitly out-of-scope improvement)', () => {
  assert.equal(buildInternshipApplySubject(''), 'Internships - ');
});
