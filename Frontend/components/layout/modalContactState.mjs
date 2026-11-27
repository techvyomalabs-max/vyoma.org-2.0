// Pure, framework-free state computation for ModalProvider.jsx's
// openContact()/closeContact() -- extracted so the actual decision logic
// (what the next subject/role-banner/role state should be, given a call's
// arguments) is genuinely, directly testable with node:test, no rendering,
// no hooks, no next/navigation needed. Same extraction pattern as
// resourcesTableLogic.mjs/navActiveLogic.mjs/internshipApplyLogic.mjs.
//
// `opts.showRoleBanner`/`opts.role` are read fresh on every call and never
// merged with any previous state -- an existing single-argument caller
// (e.g. CareersBoard.jsx's openContact(`Careers: ${role.title}`)) always
// gets `opts = {}`, so showRoleBanner/role resolve to false/'' exactly as
// before this feature existed. This is what guarantees a role-specific open
// followed by any other open (general Apply Now, an unrelated contact CTA,
// or Careers) can never show/carry a stale previous role: the new state is
// always computed from scratch from that call's own arguments alone.
export function computeContactModalState(subject, opts = {}) {
  const showRoleBanner = !!opts.showRoleBanner;
  return {
    subject: subject || 'General inquiry',
    showRoleBanner,
    // Only ever set when the banner itself is explicitly on -- so a caller
    // that passes a role but not showRoleBanner (a mistake, not a supported
    // combination) still can't leak a role into the UI with no banner to
    // explain it.
    role: showRoleBanner ? opts.role || '' : '',
  };
}

// The state closeContact() resets to -- matches computeContactModalState's
// own "banner off" shape exactly, so closing and reopening the modal (even
// without a fresh openContact call in between, e.g. a stray re-render)
// never exposes a previous role.
export const CLOSED_CONTACT_ROLE_STATE = { showRoleBanner: false, role: '' };
