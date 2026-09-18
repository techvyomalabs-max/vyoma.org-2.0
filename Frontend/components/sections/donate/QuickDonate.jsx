'use client';

import { useState } from 'react';
import { Button } from '@/components/common/Button';

const PRESETS = [1000, 2500, 5000, 10000];

export function QuickDonate() {
  const [path, setPath] = useState('india');
  const [amount, setAmount] = useState(2500);
  const sym = path === 'india' ? '₹' : '$';

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
          <Button variant="solid" size="lg" className="w-full">
            Donate Now
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
