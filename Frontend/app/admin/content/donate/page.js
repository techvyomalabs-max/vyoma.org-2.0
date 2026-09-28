'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';

const TYPE = 'pages/donate';
const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const field = (label) => 'mb-1 block font-sans text-xs font-bold text-charcoal/60 ' + label;

function HeroForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      {['verse', 'citation', 'title', 'body', 'ctaLabel'].map((k) => (
        <div key={k}>
          <label className={field('')}>{k}</label>
          <input type="text" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} className={inputClass} />
        </div>
      ))}
    </div>
  );
}

function OtherWaysForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      {[
        ['subscriptionHeading', 'Subscription heading'],
        ['subscriptionBody', 'Subscription body'],
        ['subscriptionCtaLabel', 'Subscription button label'],
        ['csrHeading', 'CSR & Corpus heading'],
        ['csrBody', 'CSR & Corpus body'],
      ].map(([k, label]) => (
        <div key={k}>
          <label className={field('')}>{label}</label>
          <input type="text" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} className={inputClass} />
        </div>
      ))}
    </div>
  );
}

function BankTransferForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      <p className="font-sans text-xs text-charcoal/60">
        Account numbers/IFSC come from Settings → Donation bank details, not here — this is only the surrounding copy.
      </p>
      <div>
        <label className={field('')}>Heading</label>
        <input type="text" value={value.heading} onChange={(e) => onChange({ ...value, heading: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className={field('')}>Foreign-donor note</label>
        <textarea value={value.foreignNote} onChange={(e) => onChange({ ...value, foreignNote: e.target.value })} rows={2} className={inputClass} />
      </div>
    </div>
  );
}

function ComplianceStripForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      {value.items.map((item, i) => (
        <input
          key={i}
          type="text"
          value={item}
          onChange={(e) => onChange({ ...value, items: value.items.map((it, idx) => (idx === i ? e.target.value : it)) })}
          className={inputClass}
        />
      ))}
      <div>
        <label className={field('')}>Button label</label>
        <input type="text" value={value.ctaLabel} onChange={(e) => onChange({ ...value, ctaLabel: e.target.value })} className={inputClass} />
      </div>
    </div>
  );
}

function ClosingTaglineForm({ value, onChange }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={`max-w-lg ${inputClass}`} />;
}

const SECTIONS = [
  { key: 'HERO', label: 'Hero', description: 'The blue banner at the top of the Donate page.', publicPath: '/donate', Form: HeroForm },
  { key: 'OTHER_WAYS', label: 'Other ways to give', description: 'Subscription plan + CSR & Corpus cards.', publicPath: '/donate', Form: OtherWaysForm },
  { key: 'BANK_TRANSFER', label: 'Bank transfer', description: 'Copy around the bank-transfer section.', publicPath: '/donate#bank-transfer', Form: BankTransferForm },
  { key: 'COMPLIANCE_STRIP', label: 'Compliance strip', description: 'The blue strip near the bottom.', publicPath: '/donate', Form: ComplianceStripForm },
  { key: 'CLOSING_TAGLINE', label: 'Closing tagline', description: 'The final line on the page.', publicPath: '/donate', Form: ClosingTaglineForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/donate', Form: SeoForm },
];

function DonateCmsContent() {
  return <ContentEditorShell pageLabel="Donate" type={TYPE} sections={SECTIONS} />;
}

export default function DonateCmsPage() {
  return (
    <RequireAdminAuth>
      <DonateCmsContent />
    </RequireAdminAuth>
  );
}
