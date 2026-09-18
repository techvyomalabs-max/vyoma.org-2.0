'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';
import { createDonationOrder } from '@/services/donationService';

const field =
  'font-sans text-base px-3.5 py-2.5 rounded-sm border border-[var(--border-subtle)] w-full box-border text-charcoal';
const label = 'font-sans text-base font-semibold text-charcoal mb-1.5 block';
const AMOUNTS = ['₹1,000', '₹2,500', '₹5,000', '₹10,000'];

export function DonateForm({ onSubmit }) {
  const [amount, setAmount] = useState(AMOUNTS[1]);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPending(true);
    // Razorpay checkout + server-side verification (LLD Section 9) are not
    // wired up yet — this only creates the placeholder order record.
    try {
      await createDonationOrder({ schemeSlug: 'general-donation', amount, currency: 'INR' });
      setSubmitted(true);
      onSubmit?.(amount);
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="font-sans text-base text-charcoal text-center py-5">
        <div className="text-lg font-bold text-vyoma-blue mb-2.5">Namaste — thank you.</div>
        Your {amount} contribution has been recorded. A receipt will follow once payment is
        verified.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <span className={label}>Choose an amount</span>
        <div className="flex gap-2 flex-wrap">
          {AMOUNTS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => setAmount(a)}
              className={`${field} w-auto flex-1 cursor-pointer font-semibold ${
                amount === a
                  ? 'bg-vyoma-blue text-white border-vyoma-blue'
                  : 'bg-white text-vyoma-blue'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="modal-donate-name" className={label}>Full name</label>
        <input id="modal-donate-name" name="name" required className={field} placeholder="Jane Doe" />
      </div>
      <div>
        <label htmlFor="modal-donate-email" className={label}>Email</label>
        <input id="modal-donate-email" name="email" required type="email" className={field} placeholder="jane@example.com" />
      </div>
      <Button type="submit" variant="solid" className="w-full rounded-pill" disabled={pending}>
        {pending ? 'Processing…' : `Donate ${amount}`}
      </Button>
    </form>
  );
}
