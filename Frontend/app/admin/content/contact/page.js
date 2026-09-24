'use client';

import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ContentEditorShell } from '@/components/admin/cms/ContentEditorShell';
import { SeoForm } from '@/components/admin/cms/SeoForm';
import { SimpleTextListForm } from '@/components/admin/ui/SimpleTextListForm';

const TYPE = 'pages/contact';
const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

function HeroForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Title</label>
        <input type="text" value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Body</label>
        <textarea value={value.body} onChange={(e) => onChange({ ...value, body: e.target.value })} rows={2} className={inputClass} />
      </div>
    </div>
  );
}

function ReasonsForm({ value, onChange }) {
  return <SimpleTextListForm value={value} onChange={onChange} placeholder="Contact reason (dropdown option)" />;
}

function AddressForm({ value, onChange }) {
  return (
    <div className="max-w-lg space-y-3">
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Registered office</label>
        <textarea value={value.registeredOffice} onChange={(e) => onChange({ ...value, registeredOffice: e.target.value })} rows={3} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Working office</label>
        <textarea value={value.workingOffice} onChange={(e) => onChange({ ...value, workingOffice: e.target.value })} rows={3} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Map embed URL</label>
        <input type="text" value={value.mapUrl} onChange={(e) => onChange({ ...value, mapUrl: e.target.value })} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">"View on Google Maps" link</label>
        <input type="text" value={value.mapLink} onChange={(e) => onChange({ ...value, mapLink: e.target.value })} className={inputClass} />
      </div>
    </div>
  );
}

function SimpleTextForm({ value, onChange }) {
  return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={`max-w-lg ${inputClass}`} />;
}

const SECTIONS = [
  { key: 'HERO', label: 'Hero', description: 'Title/body at the top of the Contact page.', publicPath: '/contact', Form: HeroForm },
  { key: 'CONTACT_REASONS', label: 'Contact reasons', description: 'Dropdown options on the contact form.', publicPath: '/contact', Form: ReasonsForm },
  { key: 'ADDRESS', label: 'Address & map', description: 'Office addresses and the embedded map.', publicPath: '/contact', Form: AddressForm },
  { key: 'OFFICE_HOURS', label: 'Office hours', description: 'Shown under the phone number.', publicPath: '/contact', Form: SimpleTextForm },
  { key: 'PHONE', label: 'Phone', description: 'Call/SMS/WhatsApp number.', publicPath: '/contact', Form: SimpleTextForm },
  { key: 'REGISTRATION_NOTE', label: 'Registration note', description: 'Compliance line under the address.', publicPath: '/contact', Form: SimpleTextForm },
  { key: 'CLOSING_LINE', label: 'Closing line', description: 'Text before the sanskritfromhome.org link (link itself is fixed).', publicPath: '/contact', Form: SimpleTextForm },
  { key: 'SEO', label: 'SEO', description: 'Title, meta description, canonical, social image.', publicPath: '/contact', Form: SeoForm },
];

function ContactCmsContent() {
  return <ContentEditorShell pageLabel="Contact" type={TYPE} sections={SECTIONS} />;
}

export default function ContactCmsPage() {
  return (
    <RequireAdminAuth>
      <ContactCmsContent />
    </RequireAdminAuth>
  );
}
