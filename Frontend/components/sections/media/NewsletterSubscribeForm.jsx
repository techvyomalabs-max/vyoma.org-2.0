'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { submitForm } from '@/services/formService';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The original WordPress site's "Subscribe" widget (Ultimate Social Media
// Icons plugin) was a WordPress-admin-internal AJAX form — no portable
// external service or API key to migrate. This instead submits to our own
// already-built generic forms endpoint (the same one Contact/CSR forms
// use), which stores the email for follow-up — a real submission, not a
// fake success message.
export function NewsletterSubscribeForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | done | error
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!EMAIL_RE.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    try {
      await submitForm('newsletter', { values: { email: email.trim() }, sourceUrl: typeof window !== 'undefined' ? window.location.href : undefined });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not submit right now. Please try again.');
    }
  };

  if (status === 'done') {
    return <p className="font-sans text-[15px] font-bold text-vyoma-blue">Thank you — you're on the list.</p>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap justify-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          aria-label="Email"
          aria-invalid={!!error}
          className="w-full max-w-[320px] rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
        />
        <Button variant="solid" type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Submitting…' : 'Subscribe'}
        </Button>
      </div>
      {error && <p className="mt-2 font-sans text-[13px] text-red-600">{error}</p>}
    </form>
  );
}
