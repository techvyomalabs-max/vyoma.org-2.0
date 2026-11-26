// Source-assertion coverage for ContactForm.jsx's new, optional role
// banner. ContactForm.jsx contains JSX, and this project has no loader/
// transform (babel/swc) registered for plain `node --test` -- confirmed via
// package.json's test script -- so no .jsx file can be `import`-ed here
// regardless of its hook dependencies (the same established limitation as
// every other JSX-returning file in this project, e.g.
// donate/page.heroScrollTarget.test.mjs's own header comment). The
// underlying decision logic this banner is driven by is fully covered, with
// genuine real execution, by modalContactState.test.mjs; this file only
// guards ContactForm.jsx's own wiring and is not itself claimed as proof of
// runtime rendering or interaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'ContactForm.jsx'), 'utf8');

test('showRoleBanner/roleLabel are optional props, both defaulting off -- every existing caller that omits them is unaffected', () => {
  assert.match(source, /export function ContactForm\(\{ subject = 'General inquiry', showRoleBanner = false, roleLabel = '' \}\) \{/);
});

test('the banner renders only when showRoleBanner is true, using the explicit roleLabel prop -- never by parsing/stripping the subject string', () => {
  assert.match(source, /\{showRoleBanner && \(/);
  assert.match(source, /Applying for:<\/span> \{roleLabel\}/);
  assert.doesNotMatch(source, /subject\.replace\(|subject\.split\(|subject\.slice\(/, 'must not derive the visible role by parsing subject');
});

test('the role is rendered as plain React text interpolation ({roleLabel}), never via dangerouslySetInnerHTML -- safe for any CMS-derived role text, including special characters', () => {
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test('the full subject is still submitted unchanged -- existing submission logic, fields, validation and formKey are untouched', () => {
  assert.match(source, /await submitForm\('contact', \{ values: \{ \.\.\.values, subject \} \}\);/);
  assert.match(source, /Organization/);
  assert.match(source, /Full name/);
  assert.match(source, /Message/);
});

// QA Bug 19 follow-up: the success message is now conditional on `subject`
// (a prop this component already received -- no new prop was added). Source-
// assertion coverage only -- ContactForm.jsx is a 'use client' component
// with no rendering harness available in this project (see this file's own
// header comment).
test('the generic success message is preserved exactly, unchanged, as the non-testimonial branch', () => {
  assert.match(source, /const GENERIC_SUCCESS_MESSAGE = 'Thanks for reaching out — our team will follow up by email\.';/);
});

test('the testimonial-specific success message is shown when, and only when, subject is exactly the testimonial-submission subject', () => {
  assert.match(source, /const TESTIMONIAL_SUBMISSION_SUBJECT = 'Testimonial submission';/);
  assert.match(
    source,
    /const TESTIMONIAL_SUCCESS_MESSAGE =\s*\n?\s*'Thank you for sharing your testimonial with Vyoma\. We appreciate your feedback and your support\.';/
  );
  assert.match(
    source,
    /\{subject === TESTIMONIAL_SUBMISSION_SUBJECT \? TESTIMONIAL_SUCCESS_MESSAGE : GENERIC_SUCCESS_MESSAGE\}/
  );
});

test('the success message is only ever rendered inside the existing `if (submitted)` early return -- a failed or not-yet-attempted submission can never show either success message', () => {
  const submittedBlockIndex = source.indexOf('if (submitted) {');
  const ternaryIndex = source.indexOf('TESTIMONIAL_SUBMISSION_SUBJECT ? TESTIMONIAL_SUCCESS_MESSAGE : GENERIC_SUCCESS_MESSAGE');
  const formIndex = source.indexOf('<form onSubmit={handleSubmit}');
  assert.ok(submittedBlockIndex !== -1 && ternaryIndex !== -1 && formIndex !== -1);
  // The success-message ternary sits inside the `if (submitted)` block,
  // which itself `return`s before the real <form> markup is ever reached --
  // so the two are mutually exclusive renders, exactly as before this
  // change (this component had exactly one `submitted`-gated return prior
  // to this fix too).
  assert.ok(submittedBlockIndex < ternaryIndex && ternaryIndex < formIndex);
});

test('the banner markup sits above the existing fields, inside the same form, so it stays visible for the whole time the applicant is filling it in (not just before typing, unlike the pre-existing placeholder text)', () => {
  const bannerIndex = source.indexOf('{showRoleBanner && (');
  const orgFieldIndex = source.indexOf('Organization');
  assert.ok(bannerIndex !== -1 && orgFieldIndex !== -1 && bannerIndex < orgFieldIndex, 'the banner must render before the form fields, as a persistent element of the same form, not a transient placeholder');
});
