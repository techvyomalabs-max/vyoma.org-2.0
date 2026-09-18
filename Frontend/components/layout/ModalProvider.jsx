'use client';

import { createContext, useContext, useState } from 'react';

// Donate/Contact modals are mounted once at the (public) layout level and
// triggered from anywhere (nav, page CTAs) via this context — replacing the
// source design system's prop-drilled onDonateClick/onContact passed through
// every page component.
const ModalContext = createContext(null);

export function ModalProvider({ children }) {
  const [donateOpen, setDonateOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactSubject, setContactSubject] = useState('General inquiry');

  const value = {
    donateOpen,
    contactOpen,
    contactSubject,
    openDonate: () => setDonateOpen(true),
    closeDonate: () => setDonateOpen(false),
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
