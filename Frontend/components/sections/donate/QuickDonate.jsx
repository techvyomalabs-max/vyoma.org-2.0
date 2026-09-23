'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/common/Button';
import { createDonationOrder, verifyDonation } from '@/services/donationService';
import { loadRazorpayScript } from '@/lib/loadRazorpayScript';

const PRESETS = [1000, 2500, 5000, 10000];
const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || null;

// Week 4 Decision W4-3: this component only ever attempts a real checkout
// when it's given a real `schemeSlug` (i.e. rendered on
// /donate/[schemeSlug], which always has one — see that page). Rendered on
// the generic /donate page with no scheme context, "Donate Now" links to the
// real scheme picker below (#schemes) instead of guessing a default.
export function QuickDonate({ schemeSlug = null }) {
  const router = useRouter();
  const [path, setPath] = useState('india');
  const [amount, setAmount] = useState(2500);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('idle'); // idle | creating_order | awaiting_checkout | verifying | verified | error | cancelled
  const [error, setError] = useState(null);
  const sym = path === 'india' ? '₹' : '$';

  const busy = stage === 'creating_order' || stage === 'awaiting_checkout' || stage === 'verifying';

  const handleDonate = async () => {
    setError(null);

    if (!schemeSlug) {
      document.getElementById('schemes')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (path !== 'india') {
      // FCRA / foreign donations are bank-transfer only (LLD 9.4) — never a
      // Razorpay order. The bank-transfer details live only on the generic
      // /donate page (the per-scheme page this component also renders on
      // has no such section) — navigate there rather than scroll in-page,
      // which would silently no-op wherever that id doesn't exist.
      router.push('/donate#bank-transfer');
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError('Please enter your name and email.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Please enter a valid donation amount.');
      return;
    }

    setStage('creating_order');
    let order;
    try {
      order = await createDonationOrder({ schemeSlug, amount, currency: 'INR', donor: { name: name.trim(), email: email.trim() } });
    } catch (err) {
      setStage('error');
      setError(
        err.code === 'RAZORPAY_NOT_CONFIGURED'
          ? 'Online payment is not yet enabled for this site. Please try again later or use a bank transfer.'
          : err.message || 'Could not start the donation. Please try again.'
      );
      return;
    }

    if (!RAZORPAY_KEY_ID) {
      setStage('error');
      setError('Online payment is not yet fully configured. Please try again later.');
      return;
    }

    setStage('awaiting_checkout');
    let Razorpay;
    try {
      Razorpay = await loadRazorpayScript();
    } catch (err) {
      setStage('error');
      setError(err.message);
      return;
    }

    const checkout = new Razorpay({
      key: RAZORPAY_KEY_ID,
      order_id: order.orderId,
      amount: Math.round(order.amount * 100),
      currency: order.currency,
      name: 'Vyoma Linguistic Labs Foundation',
      description: schemeSlug,
      prefill: { name: name.trim(), email: email.trim() },
      handler: async (response) => {
        setStage('verifying');
        try {
          await verifyDonation({
            donationId: order.donationId,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          // Verified server-side — this is the only path that ever shows
          // success. The Checkout `handler` firing is not itself proof of
          // payment; /donations/verify is authoritative (LLD 9.3).
          setStage('verified');
        } catch (err) {
          setStage('error');
          setError(err.message || 'We could not verify this payment. If you were charged, please contact us.');
        }
      },
      modal: {
        ondismiss: () => {
          if (stage === 'awaiting_checkout') {
            setStage('cancelled');
          }
        },
      },
    });

    checkout.open();
  };

  if (stage === 'verified') {
    return (
      <section className="bg-white px-8 py-14 text-center">
        <div className="mx-auto max-w-[460px] rounded-md border border-green-600 bg-green-50 px-6 py-8">
          <div className="mb-2 font-sans text-lg font-bold text-green-700">Namaste — thank you.</div>
          <p className="font-sans text-sm text-charcoal">
            Your {sym}
            {amount.toLocaleString('en-IN')} donation has been verified. A receipt will be emailed to {email}.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white px-8 py-14">
      <div className="mx-auto max-w-[1000px]">
        <h2 className="mb-2 text-center font-sans text-h2 font-bold text-vyoma-blue">Quick & Easy Donate</h2>
        <p className="mx-auto mb-7 max-w-[560px] text-center font-sans text-[15px] text-charcoal/75">
          Two paths — the FCRA account for foreign gifts is kept separate from our Indian 80G account.
        </p>
        <div className="mx-auto mb-6 flex max-w-[460px] justify-center gap-1 rounded-pill bg-sky-mist p-1">
          {[
            ['india', 'Indian citizen (80G)'],
            ['foreign', 'Foreign / NRI (FCRA)'],
          ].map(([key, l]) => (
            <button
              key={key}
              onClick={() => setPath(key)}
              className={`flex-1 rounded-pill px-3.5 py-2.5 font-sans text-sm font-bold ${
                path === key ? 'bg-vyoma-blue text-white' : 'bg-transparent text-vyoma-blue'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="mx-auto max-w-[460px] rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-sky-mist px-6 py-[26px]">
          <div className="mb-4 grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`rounded-md py-2.5 font-sans text-sm font-bold text-vyoma-blue ${
                  amount === p ? 'border-2 border-vyoma-blue bg-vyoma-blue/[0.08]' : 'border border-[var(--border-subtle)] bg-white'
                }`}
              >
                {sym}
                {p.toLocaleString('en-IN')}
              </button>
            ))}
          </div>
          <div className="mb-[18px] flex items-center rounded-md border border-[var(--border-subtle)] bg-white px-3.5">
            <span className="font-sans text-xl font-bold text-vyoma-blue">{sym}</span>
            <input
              type="number"
              min="0"
              aria-label="Donation amount"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="flex-1 border-none bg-transparent px-2 py-3 text-center font-sans text-xl font-bold text-vyoma-blue outline-none"
            />
          </div>

          {schemeSlug && path === 'india' && (
            <div className="mb-[18px] flex flex-col gap-2.5">
              <input
                type="text"
                aria-label="Full name"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
              />
              <input
                type="email"
                aria-label="Email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
              />
            </div>
          )}

          {error && <p className="mb-3 font-sans text-[13px] text-red-600">{error}</p>}
          {stage === 'cancelled' && <p className="mb-3 font-sans text-[13px] text-charcoal/70">Payment was not completed. You can try again.</p>}

          <Button variant="solid" size="lg" className="w-full" disabled={busy} onClick={handleDonate}>
            {stage === 'creating_order' && 'Starting…'}
            {stage === 'awaiting_checkout' && 'Waiting for payment…'}
            {stage === 'verifying' && 'Verifying…'}
            {(stage === 'idle' || stage === 'error' || stage === 'cancelled') && (schemeSlug ? 'Donate Now' : 'Choose a scheme to donate')}
          </Button>

          {path === 'india' && (
            <div className="mt-3 text-center font-sans text-[13px] text-charcoal">
              <strong>80G tax benefit</strong> on eligible donations
            </div>
          )}
          {path === 'foreign' && (
            <div className="mt-3 text-center font-sans text-[13px] text-charcoal">
              Processed via our <strong>FCRA-registered</strong> account
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
