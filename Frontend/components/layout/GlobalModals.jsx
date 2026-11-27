'use client';

import { Modal } from '@/components/forms/Modal';
import { ContactForm } from '@/components/forms/ContactForm';
import { useModal } from './ModalProvider';

// QA Bug 19 follow-up: the exact subject ContactCta's "Submit your
// testimonial" CTA passes to openContact() (see
// app/(public)/media/testimonials/page.js) -- matched literally, never
// derived by parsing contactSubject, so no other subject can accidentally
// pick up the testimonial-specific title.
const TESTIMONIAL_SUBMISSION_SUBJECT = 'Testimonial submission';

// Donate no longer has a modal — see ModalProvider.jsx (Week 4 Decision
// W4-3): `openDonate` navigates to /donate instead.
export function GlobalModals() {
  const { contactOpen, closeContact, contactSubject, contactShowRoleBanner, contactRole } = useModal();
  const modalTitle = contactSubject === TESTIMONIAL_SUBMISSION_SUBJECT ? 'Submit your testimonial' : 'Get in touch';
  return (
    <Modal open={contactOpen} title={modalTitle} onClose={closeContact}>
      <ContactForm subject={contactSubject} showRoleBanner={contactShowRoleBanner} roleLabel={contactRole} />
    </Modal>
  );
}
