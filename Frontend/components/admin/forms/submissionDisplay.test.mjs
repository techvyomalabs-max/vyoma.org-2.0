// Genuine runtime regression coverage for the Admin Forms list row's
// subject display -- real execution of the exact, unmodified function
// SubmissionList.jsx imports and calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subjectLabel } from './submissionDisplay.mjs';

test('displays an unknown but valid string subject as its actual text', () => {
  assert.equal(subjectLabel({ values: { subject: 'Internships - Data Analyst Intern' } }), 'Internships - Data Analyst Intern');
  assert.equal(subjectLabel({ values: { subject: 'Careers: Backend Engineer' } }), 'Careers: Backend Engineer');
  assert.equal(subjectLabel({ values: { subject: 'Press & media' } }), 'Press & media');
});

test('falls back to "No subject" when values.subject is missing entirely', () => {
  assert.equal(subjectLabel({ values: { name: 'N' } }), 'No subject');
  assert.equal(subjectLabel({ values: {} }), 'No subject');
});

test('falls back to "No subject" when values itself is missing', () => {
  assert.equal(subjectLabel({}), 'No subject');
  assert.equal(subjectLabel(null), 'No subject');
  assert.equal(subjectLabel(undefined), 'No subject');
});

test('falls back to "No subject" for null, empty, and whitespace-only subjects', () => {
  assert.equal(subjectLabel({ values: { subject: null } }), 'No subject');
  assert.equal(subjectLabel({ values: { subject: '' } }), 'No subject');
  assert.equal(subjectLabel({ values: { subject: '   ' } }), 'No subject');
});

test('falls back to "No subject" for a non-string subject (number, array, object) -- never crashes or renders "[object Object]"', () => {
  assert.equal(subjectLabel({ values: { subject: 42 } }), 'No subject');
  assert.equal(subjectLabel({ values: { subject: ['Careers'] } }), 'No subject');
  assert.equal(subjectLabel({ values: { subject: { nested: true } } }), 'No subject');
});
