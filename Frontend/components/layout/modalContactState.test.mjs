// Genuine runtime regression coverage for ModalProvider.jsx's
// openContact()/closeContact() decision logic -- real execution of the
// exact, unmodified function those handlers call, not a re-typed duplicate.
// ModalProvider.jsx itself still can't be rendered here (it calls
// useRouter(), same established no-harness limitation as every other
// component wired to next/navigation in this project), so this is what
// actually proves the "no stale role" guarantees: computeContactModalState()
// is a pure function with no internal state of its own, so calling it
// repeatedly with different arguments can never leak a result from a
// previous call into the next one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeContactModalState, CLOSED_CONTACT_ROLE_STATE } from './modalContactState.mjs';

test('default-off: a call with only a subject (every pre-existing <ContactCta subject="..."> caller) resolves showRoleBanner/role to false/"", unchanged from before this feature existed', () => {
  assert.deepEqual(computeContactModalState('Institutional partnership'), {
    subject: 'Institutional partnership',
    showRoleBanner: false,
    role: '',
  });
});

test('existing single-argument openContact callers (e.g. CareersBoard.jsx\'s openContact(`Careers: ${role.title}`)) continue to resolve identically -- opts defaults to {}', () => {
  assert.deepEqual(computeContactModalState('Careers: Backend Engineer'), {
    subject: 'Careers: Backend Engineer',
    showRoleBanner: false,
    role: '',
  });
});

test('a missing/falsy subject still falls back to "General inquiry", exactly as before', () => {
  assert.equal(computeContactModalState(undefined).subject, 'General inquiry');
  assert.equal(computeContactModalState('').subject, 'General inquiry');
});

test('explicit role-banner opt-in resolves subject/showRoleBanner/role exactly as given', () => {
  assert.deepEqual(computeContactModalState('Internships - Developer', { showRoleBanner: true, role: 'Developer' }), {
    subject: 'Internships - Developer',
    showRoleBanner: true,
    role: 'Developer',
  });
});

test('switching from Developer to Senior Developer: two sequential calls each resolve correctly, with no leakage from the first into the second', () => {
  const first = computeContactModalState('Internships - Developer', { showRoleBanner: true, role: 'Developer' });
  const second = computeContactModalState('Internships - Senior Developer', { showRoleBanner: true, role: 'Senior Developer' });
  assert.deepEqual(first, { subject: 'Internships - Developer', showRoleBanner: true, role: 'Developer' });
  assert.deepEqual(second, { subject: 'Internships - Senior Developer', showRoleBanner: true, role: 'Senior Developer' });
});

test('switching from a role-specific application to the general Apply Now (subject="Internships", no opts): the role/banner from the previous call is not retained', () => {
  computeContactModalState('Internships - Developer', { showRoleBanner: true, role: 'Developer' });
  const afterGeneral = computeContactModalState('Internships');
  assert.deepEqual(afterGeneral, { subject: 'Internships', showRoleBanner: false, role: '' });
});

test('switching from a role-specific application to an unrelated contact modal (e.g. "Press & media"): no stale role leaks across', () => {
  computeContactModalState('Internships - Senior Developer', { showRoleBanner: true, role: 'Senior Developer' });
  const afterUnrelated = computeContactModalState('Press & media');
  assert.deepEqual(afterUnrelated, { subject: 'Press & media', showRoleBanner: false, role: '' });
});

test('closing the modal resets to the same "banner off" shape a subject-only call already produces -- closing and reopening cannot expose a stale role', () => {
  assert.deepEqual(CLOSED_CONTACT_ROLE_STATE, { showRoleBanner: false, role: '' });
});

test('a role is only ever returned when showRoleBanner is explicitly true -- passing opts.role without opts.showRoleBanner does not leak it', () => {
  const result = computeContactModalState('Something', { role: 'Accidental' });
  assert.equal(result.showRoleBanner, false);
  assert.equal(result.role, '');
});

test('works for an arbitrary, never-hardcoded future CMS-created role', () => {
  assert.deepEqual(computeContactModalState('Internships - Data Analyst Intern', { showRoleBanner: true, role: 'Data Analyst Intern' }), {
    subject: 'Internships - Data Analyst Intern',
    showRoleBanner: true,
    role: 'Data Analyst Intern',
  });
});
