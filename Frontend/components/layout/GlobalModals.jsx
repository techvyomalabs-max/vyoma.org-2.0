'use client';

import { Modal } from '@/components/forms/Modal';
import { DonateForm } from '@/components/forms/DonateForm';
import { ContactForm } from '@/components/forms/ContactForm';
import { useModal } from './ModalProvider';

export function GlobalModals() {
  const { donateOpen, closeDonate, contactOpen, closeContact, contactSubject } = useModal();
  return (
    <>
      <Modal open={donateOpen} title="Support Vyoma" onClose={closeDonate}>
        <DonateForm />
      </Modal>
      <Modal open={contactOpen} title="Get in touch" onClose={closeContact}>
        <ContactForm subject={contactSubject} />
      </Modal>
    </>
  );
}
