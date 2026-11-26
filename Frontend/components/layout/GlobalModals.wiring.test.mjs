// Source-assertion coverage for ModalProvider.jsx's and GlobalModals.jsx's
// new, optional role-banner plumbing. Both are 'use client' components --
// ModalProvider.jsx calls useRouter() (next/navigation), and this project
// has no loader/transform registered for plain `node --test` (confirmed via
// package.json's test script), so no .jsx file can be rendered here at all,
// regardless of hook dependencies -- same established limitation as every
// other JSX-returning file in this project. The actual decision logic both
// of these delegate to is fully covered, with genuine real execution, by
// modalContactState.test.mjs; this file only guards their wiring and is not
// itself claimed as proof of runtime rendering or interaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modalProviderSource = fs.readFileSync(path.join(__dirname, 'ModalProvider.jsx'), 'utf8');
const globalModalsSource = fs.readFileSync(path.join(__dirname, 'GlobalModals.jsx'), 'utf8');

test('new role-banner state defaults to false/"" (backward-compatible: pre-existing behavior for every caller that never opts in)', () => {
  assert.match(modalProviderSource, /const \[contactShowRoleBanner, setContactShowRoleBanner\] = useState\(false\);/);
  assert.match(modalProviderSource, /const \[contactRole, setContactRole\] = useState\(''\);/);
});

test('openContact() accepts an optional second argument, defaulting to {} -- every existing single-argument call site is unaffected', () => {
  assert.match(modalProviderSource, /openContact: \(subject, opts = \{\}\) => \{/);
});

test('the context value exposes contactShowRoleBanner/contactRole alongside the existing contactSubject', () => {
  assert.match(modalProviderSource, /contactShowRoleBanner,\s*\n\s*contactRole,/);
});

test('closeContact() resets the role-banner state (defensive, in addition to openContact\'s own fresh-every-call computation) -- closing and reopening cannot expose stale role context', () => {
  const closeContactBlock = modalProviderSource.slice(modalProviderSource.indexOf('closeContact: () => {'), modalProviderSource.indexOf('};', modalProviderSource.indexOf('closeContact: () => {')));
  assert.match(closeContactBlock, /setContactOpen\(false\);/);
  assert.match(closeContactBlock, /setContactShowRoleBanner\(CLOSED_CONTACT_ROLE_STATE\.showRoleBanner\);/);
  assert.match(closeContactBlock, /setContactRole\(CLOSED_CONTACT_ROLE_STATE\.role\);/);
});

test('GlobalModals preserves the existing modal layout and onClose behavior unchanged', () => {
  assert.match(globalModalsSource, /<Modal open=\{contactOpen\} title=\{modalTitle\} onClose=\{closeContact\}>/);
});

// QA Bug 19 follow-up: the modal title is now conditional on contactSubject
// (reused directly from context -- no change to ModalProvider.jsx or
// modalContactState.mjs was needed or made). Source-assertion coverage only
// -- GlobalModals.jsx is a 'use client' component with no rendering harness
// available in this project (see this file's own header comment); the
// ternary's two literal branches are pinned here so a future edit can't
// silently drop either one.
test('the modal title is "Submit your testimonial" when, and only when, contactSubject is exactly the testimonial-submission subject', () => {
  assert.match(
    globalModalsSource,
    /const modalTitle = contactSubject === TESTIMONIAL_SUBMISSION_SUBJECT \? 'Submit your testimonial' : 'Get in touch';/
  );
  assert.match(globalModalsSource, /const TESTIMONIAL_SUBMISSION_SUBJECT = 'Testimonial submission';/);
});

test('every other known contact subject keeps the original "Get in touch" title -- the ternary\'s else branch, not a lookup table that could miss an entry', () => {
  // A ternary's `else` is the exact logical complement of its one explicit
  // condition -- any subject other than the literal testimonial-submission
  // string (every entry in formCategoryFilter.js's KNOWN_CATEGORY_EXPRS:
  // Careers, Internships, CSR partnership, Press & media, Volunteering,
  // Institutional partnership, Corpus fund, General inquiry -- plus
  // undefined/empty/unrecognised, which ModalProvider.jsx's
  // computeContactModalState() already normalizes to 'General inquiry'
  // before this component ever sees it) falls through to 'Get in touch' by
  // construction, not by enumeration.
  assert.match(globalModalsSource, /\? 'Submit your testimonial' : 'Get in touch';/);
});

test('GlobalModals forwards showRoleBanner/roleLabel from context straight through to ContactForm, alongside the existing subject', () => {
  assert.match(
    globalModalsSource,
    /<ContactForm subject=\{contactSubject\} showRoleBanner=\{contactShowRoleBanner\} roleLabel=\{contactRole\} \/>/
  );
});
