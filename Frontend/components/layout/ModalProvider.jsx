'use client';

import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';

// Contact modal is mounted once at the (public) layout level and triggered
// from anywhere (nav, page CTAs) via this context — replacing the source
// design system's prop-drilled onContact passed through every page
// component.
//
// Week 4 Decision W4-3: `openDonate` no longer opens a modal. Correction
// found during the Week 4 final checkpoint: the removed modal's "general-
// donation" slug was NOT actually invalid — it is a real, seeded scheme
// (Backend/scripts/seedData/donate.js, 9th entry) — the earlier Week 4
// analysis that called it nonexistent was wrong. The modal (DonateForm.jsx,
// removed) was still genuinely broken independent of that: it sent `amount`
// as a display string ("₹2,500") rather than a number, and never read the
// name/email fields it rendered — either one alone would have failed at the
// backend. Routing a scheme-less "Donate" CTA to /donate (pick a real
// scheme, including "General Donation" itself) remains a reasonable choice
// on those grounds, but whether the CTA should instead jump straight to
// /donate/general-donation is a product call, not a technical one — flagged
// to the user, not decided here. Callers (Header.jsx, CtaButtons.jsx,
// HeroCarousel.jsx) are unchanged either way, since `openDonate`'s signature
// is the same, only its behavior.
const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const router = useRouter();
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState('General inquiry');

  const value = {
    openDonate: () => router.push('/donate'),
    contactOpen,
    contactSubject,
    openContact: (subject) => {
      setContactSubject(subject || 'General inquiry');
      setContactOpen(true);
    },
    closeContact: () => setContactOpen(false),
  };

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
