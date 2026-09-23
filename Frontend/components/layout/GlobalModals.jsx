'use client';

import { Modal } from '@/components/forms/Modal';
import { ContactForm } from '@/components/forms/ContactForm';
import { useModal } from './ModalProvider';

// Donate no longer has a modal — see ModalProvider.jsx (Week 4 Decision
// W4-3): `openDonate` navigates to /donate instead.
export function GlobalModals() {
  const { contactOpen, closeContact, contactSubject } = useModal();
  return (
    <Modal open={contactOpen} title="Get in touch" onClose={closeContact}>
      <ContactForm subject={contactSubject} />
    </Modal>
  );
}
