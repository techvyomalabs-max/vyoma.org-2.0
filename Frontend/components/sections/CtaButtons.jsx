'use client';

import { Button } from '@/components/common/Button';
import { useModal } from '@/components/layout/ModalProvider';

// Every CTA strip across the source pages calls onDonateClick / onContact(subject)
// against the app-shell-level modals. These wrap that same call against the
// ModalProvider context, so pages don't each re-derive the useModal() call.
export function DonateCta({ children = 'Donate', variant = 'outline-inverse', size = 'lg', className }) {
  const { openDonate } = useModal();
  return (
    <Button variant={variant} size={size} onClick={openDonate} className={className}>
      {children}
    </Button>
  );
}

export function ContactCta({ subject, children = 'Contact our team', variant = 'outline-inverse', size = 'lg', className }) {
  const { openContact } = useModal();
  return (
    <Button variant={variant} size={size} onClick={() => openContact(subject)} className={className}>
      {children}
    </Button>
  );
}
