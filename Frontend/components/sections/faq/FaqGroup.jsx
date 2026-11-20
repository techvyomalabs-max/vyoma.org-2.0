'use client';

import { useState } from 'react';
import { getPublicFaqItemFields } from './faqPublicFields.mjs';

// `note` is intentionally never accepted/rendered here — it's an
// internal-only content-ops annotation (see FaqGroupsForm.jsx's "Internal
// note (optional)" field), never meant for a public visitor. It was
// previously rendered as a "Handoff note:" box whenever a question was
// expanded; this component now only ever reads `q`/`a`/`active` from a FAQ
// item, so there is no code path here that could leak it again.
function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className="border-b border-[var(--border-subtle)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-1 py-[18px] text-left font-sans text-[17px] font-semibold text-vyoma-blue"
      >
        <span>{q}</span>
        <span
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center text-2xl font-normal text-amber-gold transition-transform duration-200 ease-[var(--ease-standard)] ${
            open ? 'rotate-45' : ''
          }`}
        >
          +
        </span>
      </button>
      {open && (
        <div className="mx-1 pb-5">
          {a && <p className="font-sans text-base leading-normal text-charcoal">{a}</p>}
        </div>
      )}
    </div>
  );
}

export function FaqGroup({ group, items }) {
  const [openIdx, setOpenIdx] = useState(null);
  const active = items.map(getPublicFaqItemFields).filter((it) => it.active);
  return (
    <div className="mb-5 rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold px-[26px] pb-3 pt-2.5">
      <h2 className="mx-1 mb-1.5 mt-4 font-sans text-xl font-bold text-vyoma-blue">{group}</h2>
      {active.map((it, i) => (
        <FaqItem key={i} q={it.q} a={it.a} open={openIdx === i} onToggle={() => setOpenIdx(openIdx === i ? null : i)} />
      ))}
    </div>
  );
}
