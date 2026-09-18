'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';

const CURRENCIES = [
  { code: 'INR', sym: '₹', label: 'Indian Rupee', flag: '🇮🇳' },
  { code: 'USD', sym: '$', label: 'US Dollar', flag: '🇺🇸' },
  { code: 'GBP', sym: '£', label: 'British Pound', flag: '🇬🇧' },
  { code: 'EUR', sym: '€', label: 'Euro', flag: '🇪🇺' },
  { code: 'AUD', sym: '$', label: 'Australian Dollar', flag: '🇦🇺' },
  { code: 'CAD', sym: '$', label: 'Canadian Dollar', flag: '🇨🇦' },
  { code: 'HKD', sym: 'HK$', label: 'Hong Kong Dollar', flag: '🇭🇰' },
  { code: 'JPY', sym: '¥', label: 'Japanese Yen', flag: '🇯🇵' },
  { code: 'MYR', sym: 'RM', label: 'Malaysian Ringgit', flag: '🇲🇾' },
  { code: 'NZD', sym: '$', label: 'New Zealand Dollar', flag: '🇳🇿' },
  { code: 'SAR', sym: '﷼', label: 'Saudi Riyal', flag: '🇸🇦' },
  { code: 'SGD', sym: '$', label: 'Singapore Dollar', flag: '🇸🇬' },
  { code: 'CHF', sym: 'CHF', label: 'Swiss Franc', flag: '🇨🇭' },
  { code: 'AED', sym: 'د.إ', label: 'UAE Dirham', flag: '🇦🇪' },
];

const PRESETS = [2500, 5000, 10000, 25000];

const TRUST_BADGES = ['Online payment', 'Scan & pay', "Int'l gateway", 'Instant 80G receipt', 'SSL secured'];

export function CorpusDonateWidget() {
  const [cur, setCur] = useState(CURRENCIES[0]);
  const [curOpen, setCurOpen] = useState(false);
  const [mode, setMode] = useState('once');
  const [amount, setAmount] = useState(5000);
  const [gift, setGift] = useState(false);

  const fmt = (n) => `${cur.sym} ${n.toLocaleString('en-IN')}`;
  const step = (d) => setAmount((a) => Math.max(0, a + d));

  return (
    <div className="w-full max-w-[460px] overflow-hidden rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white shadow-sm">
      <div className="relative border-b border-[var(--border-subtle)] bg-sky-mist px-5 py-4">
        <button
          onClick={() => setCurOpen((o) => !o)}
          className="flex w-full items-center gap-2.5 rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-base font-bold text-vyoma-blue"
        >
          <span className="text-lg">{cur.flag}</span>
          <span className="flex-1 text-left">
            ({cur.sym}) {cur.label}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {curOpen && (
          <div className="absolute left-5 right-5 top-full z-10 mt-1 max-h-[280px] overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-white shadow-hover">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => {
                  setCur(c);
                  setCurOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-sans text-[15px] font-semibold text-charcoal ${
                  c.code === cur.code ? 'bg-sky-mist' : 'bg-white'
                }`}
              >
                <span className="text-[17px]">{c.flag}</span>
                <span>
                  ({c.sym}) {c.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex">
        {[
          ['once', 'Donate Once'],
          ['monthly', 'Donate Monthly'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 border-0 border-b-[3px] py-4 font-sans text-lg font-bold ${
              mode === key ? 'border-b-amber-gold bg-vyoma-blue text-white' : 'border-b-transparent bg-white text-vyoma-blue'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-5 py-6">
        <div className="mb-[18px] flex items-center gap-3.5">
          <div className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-md bg-sky-mist">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--color-vyoma-blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V8M12 8a4 4 0 0 1 4-4 4 4 0 0 1 0 8h-4M12 8A4 4 0 0 0 8 4a4 4 0 0 0 0 8h4" />
            </svg>
          </div>
          <div>
            <div className="font-sans text-lg font-bold text-vyoma-blue">Corpus Fund</div>
            <div className="mt-1 font-sans text-sm font-bold text-[#9a6a00]">Tax Benefit: 50% (80G)</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2.5">
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p)}
              className={`rounded-md py-3 font-sans text-base font-bold text-vyoma-blue ${
                amount === p ? 'border-2 border-vyoma-blue bg-vyoma-blue/[0.08]' : 'border border-[var(--border-subtle)] bg-white'
              }`}
            >
              {fmt(p)}
            </button>
          ))}
        </div>

        <label htmlFor="corpus-amount" className="mb-1.5 block font-sans text-[13px] font-semibold text-charcoal">
          Enter an amount
        </label>
        <div className="mb-[18px] flex items-stretch gap-2">
          <button
            onClick={() => step(-500)}
            className="w-11 rounded-md border border-[var(--border-subtle)] bg-white font-sans text-2xl font-bold text-vyoma-blue"
          >
            −
          </button>
          <div className="flex flex-1 items-center rounded-md border border-[var(--border-subtle)] bg-white px-3.5">
            <span className="font-sans text-xl font-bold text-vyoma-blue">{cur.sym}</span>
            <input
              id="corpus-amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="flex-1 border-none bg-transparent px-2 py-3 text-center font-sans text-xl font-bold text-vyoma-blue outline-none"
            />
          </div>
          <button
            onClick={() => step(500)}
            className="w-11 rounded-md border border-[var(--border-subtle)] bg-white font-sans text-2xl font-bold text-vyoma-blue"
          >
            +
          </button>
        </div>

        <div className="mb-4 flex items-baseline justify-between border-y border-[var(--border-subtle)] py-3.5 font-sans">
          <span className="text-lg font-bold text-charcoal">Total{mode === 'monthly' ? ' / month' : ''}</span>
          <span className="text-2xl font-bold text-vyoma-blue">{fmt(amount)}</span>
        </div>

        <label className="mb-4 flex items-center gap-2 font-sans text-[15px] text-charcoal">
          <input
            type="checkbox"
            checked={gift}
            onChange={(e) => setGift(e.target.checked)}
            className="h-4 w-4 accent-vyoma-blue"
          />
          Gift a Donation
        </label>

        {/* No real payment integration yet (Razorpay / international gateway is a
            future HLD item) — visually complete but inert, matching the source. */}
        <Button variant="solid" size="lg" className="w-full">
          Donate Now
        </Button>

        <div className="mt-[18px] flex flex-wrap justify-center gap-3.5 font-sans text-xs text-charcoal/80">
          {TRUST_BADGES.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-gold)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
