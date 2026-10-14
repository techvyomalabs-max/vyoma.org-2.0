'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { submitForm } from '@/services/formService';

const field =
  'w-full box-border font-sans text-[15px] text-charcoal border border-[var(--border-subtle)] rounded-md px-3.5 py-[11px] bg-white';
const label = 'block font-sans text-[13px] font-bold text-charcoal mb-1.5';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Unicode letters (any language/script) plus spaces, apostrophes (straight
// or curly), and hyphens — must start with a letter. Deliberately excludes
// digits and other punctuation.
const NAME_RE = /^\p{L}[\p{L}\s'’-]*$/u;
const MESSAGE_MAX_LENGTH = 2000;

export function ContactPageForm({ reasons }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // Tracks only the length, not the value — the message textarea stays an
  // uncontrolled field (read via FormData on submit, like every other field
  // here); this is purely to drive the live "x / 2000 characters" counter.
  const [messageLength, setMessageLength] = useState(0);

  // Validates every field at once (not one-at-a-time, which is all the
  // browser's native `required` popups show) and returns all the errors
  // found, so they can all be displayed together after a single submit.
  const validate = (values) => {
    const errors = {};
    const name = values.name?.trim();
    if (!name) errors.name = 'Name is required.';
    else if (!NAME_RE.test(name)) errors.name = 'Please enter a valid name without numbers or special characters.';
    if (!values.email?.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address.';
    if (!values.reason) errors.reason = 'Please select a reason.';
    if (!values.message?.trim()) errors.message = 'Message is required.';
    else if (values.message.length > MESSAGE_MAX_LENGTH) errors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.target).entries());
    values.name = values.name?.trim() ?? '';
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      await submitForm('contact', { values, sourceUrl: '/contact' });
      setSent(true);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="px-3 py-10 text-center">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-vyoma-blue/10">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-vyoma-blue)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="mb-1.5 font-sans text-[19px] font-bold text-vyoma-blue">
          Thank you — your message is on its way.
        </div>
        <p className="font-sans text-[15px] text-charcoal">We typically respond within 2 business days.</p>
      </div>
    );
  }

  const errorText = 'mt-1.5 font-sans text-[13px] text-red-600';

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="contact-name" className={label}>Name</label>
        <input id="contact-name" name="name" type="text" className={field} placeholder="Your name" aria-invalid={!!fieldErrors.name} />
        {fieldErrors.name && <p className={errorText}>{fieldErrors.name}</p>}
      </div>
      <div className="mb-4">
        <label htmlFor="contact-email" className={label}>Email</label>
        <input id="contact-email" name="email" type="email" className={field} placeholder="you@example.com" aria-invalid={!!fieldErrors.email} />
        {fieldErrors.email && <p className={errorText}>{fieldErrors.email}</p>}
      </div>
      <div className="mb-4">
        <label htmlFor="contact-reason" className={label}>Reason for contact</label>
        <select id="contact-reason" name="reason" className={field} defaultValue="" aria-invalid={!!fieldErrors.reason}>
          <option value="" disabled>
            Select a reason…
          </option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {fieldErrors.reason && <p className={errorText}>{fieldErrors.reason}</p>}
      </div>
      <div className="mb-5">
        <label htmlFor="contact-message" className={label}>Message</label>
        <textarea
          id="contact-message"
          name="message"
          rows={5}
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(e) => setMessageLength(e.target.value.length)}
          className={`${field} resize-y`}
          placeholder="How can we help?"
          aria-invalid={!!fieldErrors.message}
        />
        <p className="mt-1 font-sans text-xs text-charcoal/60">
          {messageLength} / {MESSAGE_MAX_LENGTH} characters
        </p>
        {fieldErrors.message && <p className={errorText}>{fieldErrors.message}</p>}
      </div>
      <Button type="submit" variant="solid" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send Message'}
      </Button>
      <p className="mt-3.5 text-center font-sans text-[13px] text-charcoal/75">
        We typically respond within 2 business days.
      </p>
    </form>
  );
}
