'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { submitForm } from '@/services/formService';

const field =
  'w-full font-sans text-base px-3.5 py-2.5 rounded-sm border border-[var(--border-subtle)] text-charcoal box-border';
const label = 'font-sans text-base font-semibold text-charcoal mb-1.5 block';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Unicode letters (any language/script) plus spaces, apostrophes (straight
// or curly), and hyphens — must start with a letter. Deliberately excludes
// digits and other punctuation.
const NAME_RE = /^\p{L}[\p{L}\s'’-]*$/u;
const MESSAGE_MAX_LENGTH = 2000;

// `showRoleBanner`/`roleLabel`: optional, default-off context for a
// specific CMS-driven role (e.g. an Internship vacancy) -- passed
// explicitly by the caller (see InternshipApplyButton.jsx/ModalProvider.jsx),
// never derived by parsing `subject` itself, so there's no fragile
// string-prefix logic to keep in sync with however `subject` happens to be
// built. Every other caller omits both, so this renders nothing extra and
// changes nothing about their existing appearance or behavior.
export function ContactForm({ subject = 'General inquiry', showRoleBanner = false, roleLabel = '' }) {
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  // Bug 1 fix (Task 7P-SEC16 follow-up): submitForm() previously had no
  // catch at all here -- a failed request (network error, rate limit,
  // validation, etc.) left the button resetting to "Send message" with no
  // indication anything went wrong, indistinguishable from the form simply
  // not submitting. A fixed, generic message is shown instead of the
  // thrown error's own `.message` -- that string can originate from a
  // network-level failure, a server response, or elsewhere, and is not
  // vetted for safe display here (see apiClient.js/formService.js), unlike
  // this component's own field-validation messages, which it writes itself.
  const [submitError, setSubmitError] = useState(null);
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
    if (!name) errors.name = 'Full name is required.';
    else if (!NAME_RE.test(name)) errors.name = 'Please enter a valid name without numbers or special characters.';
    if (!values.email?.trim()) errors.email = 'Email is required.';
    else if (!EMAIL_RE.test(values.email.trim())) errors.email = 'Enter a valid email address.';
    if (!values.message?.trim()) errors.message = 'Message is required.';
    else if (values.message.length > MESSAGE_MAX_LENGTH) errors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Clear any error from a previous attempt as soon as the user retries --
    // otherwise a stale failure message could still be showing next to a
    // brand-new, still-pending submission.
    setSubmitError(null);
    const values = Object.fromEntries(new FormData(e.target).entries());
    values.name = values.name?.trim() ?? '';
    const errors = validate(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    try {
      await submitForm('contact', { values: { ...values, subject } });
      setSubmitted(true);
    } catch {
      setSubmitError('Something went wrong. Please try again.');
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

  const errorText = 'mt-1 font-sans text-[13px] text-red-600';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {showRoleBanner && (
        <div className="rounded-md bg-sky-mist px-3.5 py-2.5 font-sans text-sm text-charcoal">
          <span className="font-bold text-vyoma-blue">Applying for:</span> {roleLabel}
        </div>
      )}
      <div>
        <label htmlFor="modal-contact-org" className={label}>Organization</label>
        <input id="modal-contact-org" name="organization" className={field} placeholder="Company / Foundation name" />
      </div>
      <div>
        <label htmlFor="modal-contact-name" className={label}>Full name</label>
        <input id="modal-contact-name" name="name" className={field} placeholder="Jane Doe" aria-invalid={!!fieldErrors.name} />
        {fieldErrors.name && <p className={errorText}>{fieldErrors.name}</p>}
      </div>
      <div>
        <label htmlFor="modal-contact-email" className={label}>Email</label>
        <input id="modal-contact-email" name="email" type="email" className={field} placeholder="jane@example.com" aria-invalid={!!fieldErrors.email} />
        {fieldErrors.email && <p className={errorText}>{fieldErrors.email}</p>}
      </div>
      <div>
        <label htmlFor="modal-contact-message" className={label}>Message</label>
        <textarea
          id="modal-contact-message"
          name="message"
          maxLength={MESSAGE_MAX_LENGTH}
          onChange={(e) => setMessageLength(e.target.value.length)}
          className={`${field} min-h-[90px] resize-y`}
          placeholder={`Tell us about your ${subject.toLowerCase()}...`}
          aria-invalid={!!fieldErrors.message}
        />
        <p className="mt-1 font-sans text-xs text-charcoal/60">
          {messageLength} / {MESSAGE_MAX_LENGTH} characters
        </p>
        {fieldErrors.message && <p className={errorText}>{fieldErrors.message}</p>}
      </div>
      {submitError && (
        <p role="alert" className={errorText}>
          {submitError}
        </p>
      )}
      <Button type="submit" variant="solid" className="w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
