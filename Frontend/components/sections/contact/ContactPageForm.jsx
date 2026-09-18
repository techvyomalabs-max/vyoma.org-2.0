'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { submitForm } from '@/services/formService';

const field =
  'w-full box-border font-sans text-[15px] text-charcoal border border-[var(--border-subtle)] rounded-md px-3.5 py-[11px] bg-white';
const label = 'block font-sans text-[13px] font-bold text-charcoal mb-1.5';

export function ContactPageForm({ reasons }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    const values = Object.fromEntries(new FormData(e.target).entries());
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

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-4">
        <label className={label}>Name</label>
        <input name="name" required type="text" className={field} placeholder="Your name" />
      </div>
      <div className="mb-4">
        <label className={label}>Email</label>
        <input name="email" required type="email" className={field} placeholder="you@example.com" />
      </div>
      <div className="mb-4">
        <label className={label}>Reason for contact</label>
        <select name="reason" required className={field} defaultValue="">
          <option value="" disabled>
            Select a reason…
          </option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-5">
        <label className={label}>Message</label>
        <textarea name="message" required rows={5} className={`${field} resize-y`} placeholder="How can we help?" />
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
