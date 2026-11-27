'use client';

import { useModal } from '@/components/layout/ModalProvider';
import { buildInternshipApplySubject } from './internshipApplyLogic.mjs';

// Same pattern CareersBoard.jsx's own ApplyButton already established and
// shipped for per-role Careers applications: call useModal().openContact()
// directly with a dynamically-built, CMS-driven subject, reusing the exact
// same shared Contact modal/form/formKey pipeline every other ContactCta
// uses -- never a new form, never a new formKey. A dedicated client
// component (not the plain <span> the Internship page's own async Server
// Component can't attach an onClick to) is needed here for the same reason
// ContactCta itself exists: only a 'use client' component can call
// useModal().
//
// Deliberately NOT <ContactCta> (components/sections/CtaButtons.jsx): that
// renders through the shared <Button> component's padded/bordered variants,
// which would require fragile CSS-override classes to force back into this
// plain "text + arrow" look -- this renders a real <button> with the exact
// same classes the previous inert <span> used, so visual/typography parity
// is exact, not approximated.
export function InternshipApplyButton({ role }) {
  const { openContact } = useModal();
  return (
    <button
      type="button"
      onClick={() => openContact(buildInternshipApplySubject(role), { showRoleBanner: true, role })}
      className="flex-shrink-0 cursor-pointer border-0 bg-transparent p-0 font-sans text-sm font-bold text-vyoma-blue"
    >
      Apply →
    </button>
  );
}
