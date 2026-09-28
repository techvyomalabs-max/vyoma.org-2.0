'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { submitForm } from '@/services/formService';

const field =
  'w-full font-sans text-base px-3.5 py-2.5 rounded-sm border border-[var(--border-subtle)] text-charcoal box-border';
const label = 'font-sans text-base font-semibold text-charcoal mb-1.5 block';

export function ContactForm({ subject = 'General inquiry' }) {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    const values = Object.fromEntries(new FormData(e.target).entries());
    try {
      await submitForm('contact', { values: { ...values, subject } });
      setSubmitted(true);
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="font-sans text-base text-charcoal text-center py-5">
        Thanks for reaching out — our team will follow up by email.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="modal-contact-org" className={label}>Organization</label>
        <input id="modal-contact-org" name="organization" className={field} placeholder="Company / Foundation name" />
      </div>
      <div>
        <label htmlFor="modal-contact-name" className={label}>Full name</label>
        <input id="modal-contact-name" name="name" required className={field} placeholder="Jane Doe" />
      </div>
      <div>
        <label htmlFor="modal-contact-email" className={label}>Email</label>
        <input id="modal-contact-email" name="email" required type="email" className={field} placeholder="jane@example.com" />
      </div>
      <div>
        <label htmlFor="modal-contact-message" className={label}>Message</label>
        <textarea
          id="modal-contact-message"
          name="message"
          required
          className={`${field} min-h-[90px] resize-y`}
          placeholder={`Tell us about your ${subject.toLowerCase()}...`}
        />
      </div>
      <Button type="submit" variant="solid" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
