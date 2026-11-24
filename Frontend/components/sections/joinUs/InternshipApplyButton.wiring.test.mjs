// Source-assertion coverage for InternshipApplyButton.jsx's wiring.
// This is a 'use client' component calling useModal() (itself wired to
// next/navigation's useRouter), so it isn't rendered here -- no
// React-rendering harness exists in this project for a full component
// wired to Next.js routing (same established limitation as Header.jsx,
// CareersBoard.jsx's own ApplyButton, etc. -- see
// lib/testSupport/reactTestEnv.mjs's own header comment). The dynamic
// subject-building logic itself is fully covered, with genuine real
// execution, by internshipApplyLogic.test.mjs; this file only guards the
// component's wiring and is not itself claimed as proof of runtime
// interaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'InternshipApplyButton.jsx'), 'utf8');

test('is a client component (required to call useModal())', () => {
  assert.match(source, /^'use client';/);
});

test('imports useModal from the shared ModalProvider, and the real buildInternshipApplySubject logic (not an inline duplicate)', () => {
  assert.match(source, /import \{ useModal \} from '@\/components\/layout\/ModalProvider';/);
  assert.match(source, /import \{ buildInternshipApplySubject \} from '\.\/internshipApplyLogic\.mjs';/);
});

test('clicking calls openContact with the subject run through the shared builder, and explicitly opts in to the role banner with the real CMS role -- not hardcoded, not inline-duplicated', () => {
  assert.match(source, /onClick=\{\(\) => openContact\(buildInternshipApplySubject\(role\), \{ showRoleBanner: true, role \}\)\}/);
  assert.doesNotMatch(source, /openContact\(`Internships - \$\{role\}`\)/, 'must use the shared, tested builder, not a re-inlined template literal');
});

test('renders a real, native <button type="button">, not a <span>, <a>, or a div with a click handler', () => {
  assert.match(source, /<button\s*\n\s*type="button"/);
  assert.doesNotMatch(source, /<span[^>]*onClick/);
});

test('preserves the exact original visual classes from the dead <span> it replaces, plus only the minimal native-button reset needed', () => {
  assert.match(source, /className="flex-shrink-0 cursor-pointer border-0 bg-transparent p-0 font-sans text-sm font-bold text-vyoma-blue"/);
});

test('renders the same "Apply →" label text as before', () => {
  assert.match(source, />\s*Apply →\s*</);
});

// ModalProvider.jsx's openContact() now delegates its actual decision logic
// to the pure, genuinely-executed computeContactModalState() (see
// modalContactState.test.mjs for the real runtime proof of "no stale role"
// behavior across role switches, general Apply Now, and unrelated contact
// CTAs) -- this just guards that ModalProvider.jsx is still wired to call it.
test('ModalProvider.openContact delegates to computeContactModalState (the genuinely-tested decision logic), not ad hoc inline state updates', () => {
  const modalProviderSource = fs.readFileSync(path.join(__dirname, '../../layout/ModalProvider.jsx'), 'utf8');
  assert.match(modalProviderSource, /const next = computeContactModalState\(subject, opts\);/);
  assert.match(modalProviderSource, /setContactSubject\(next\.subject\);/);
  assert.match(modalProviderSource, /setContactShowRoleBanner\(next\.showRoleBanner\);/);
  assert.match(modalProviderSource, /setContactRole\(next\.role\);/);
});
