'use client';

import { useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOCIAL_FIELDS = ['linkedin', 'x', 'youtube', 'instagram', 'facebook'];
const BANK_FIELDS = [
  ['indiaAccountName', 'India account name'],
  ['indiaBankName', 'India bank name'],
  ['fcraAccountName', 'FCRA account name'],
  ['fcraBankName', 'FCRA bank name'],
];
const inputClass = 'w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal';

// One explicit field per allowlisted key (Backend/src/modules/settings/
// setting.model.js ALLOWED_TOP_LEVEL_KEYS) — structurally, there is no input
// anywhere in this form that could submit an unlisted key, a password, a
// JWT/SMTP/Razorpay/AWS/OAuth secret, or any other credential. This is a
// second layer of the same allowlist the backend already enforces, not a
// substitute for it.
export function SettingsForm({ initial, onSave, saving }) {
  const [values, setValues] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState({});

  const setField = (path, value) => {
    setValues((prev) => {
      if (path.startsWith('socialLinks.')) {
        return { ...prev, socialLinks: { ...prev.socialLinks, [path.split('.')[1]]: value } };
      }
      if (path.startsWith('donationBankDetails.')) {
        return { ...prev, donationBankDetails: { ...prev.donationBankDetails, [path.split('.')[1]]: value } };
      }
      return { ...prev, [path]: value };
    });
  };

  const validate = () => {
    const errors = {};
    if (values.contactInboxEmail && !EMAIL_RE.test(values.contactInboxEmail.trim())) {
      errors.contactInboxEmail = 'Must be a valid email.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    // Only send fields that actually changed — a true partial update,
    // matching the backend's own dot-path merge (Week 2/3-proven: an
    // untouched sibling field is never wiped by a partial PUT).
    const body = {};
    if (values.contactInboxEmail !== initial.contactInboxEmail) body.contactInboxEmail = values.contactInboxEmail || null;
    if (values.maintenanceMode !== initial.maintenanceMode) body.maintenanceMode = values.maintenanceMode;
    const changedSocial = Object.fromEntries(
      SOCIAL_FIELDS.filter((k) => values.socialLinks?.[k] !== initial.socialLinks?.[k]).map((k) => [k, values.socialLinks?.[k] || null])
    );
    if (Object.keys(changedSocial).length) body.socialLinks = changedSocial;
    const changedBank = Object.fromEntries(
      BANK_FIELDS.map(([k]) => k).filter((k) => values.donationBankDetails?.[k] !== initial.donationBankDetails?.[k]).map((k) => [k, values.donationBankDetails?.[k] || null])
    );
    if (Object.keys(changedBank).length) body.donationBankDetails = changedBank;

    if (Object.keys(body).length === 0) return;
    onSave(body);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Contact</h2>
        <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Contact inbox email</label>
        <input
          type="email"
          value={values.contactInboxEmail || ''}
          onChange={(e) => setField('contactInboxEmail', e.target.value)}
          className={inputClass}
        />
        {fieldErrors.contactInboxEmail && <p className="mt-1 font-sans text-xs text-red-600">{fieldErrors.contactInboxEmail}</p>}
      </div>

      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Social links</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOCIAL_FIELDS.map((key) => (
            <div key={key}>
              <label className="mb-1 block font-sans text-xs font-bold capitalize text-charcoal/60">{key}</label>
              <input
                type="text"
                value={values.socialLinks?.[key] || ''}
                onChange={(e) => setField(`socialLinks.${key}`, e.target.value)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Donation bank details</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BANK_FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">{label}</label>
              <input
                type="text"
                value={values.donationBankDetails?.[key] || ''}
                onChange={(e) => setField(`donationBankDetails.${key}`, e.target.value)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <label className="inline-flex items-center gap-2 font-sans text-sm text-charcoal">
          <input
            type="checkbox"
            checked={!!values.maintenanceMode}
            onChange={(e) => setField('maintenanceMode', e.target.checked)}
          />
          Maintenance mode
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-md bg-vyoma-blue px-5 py-2.5 font-sans text-sm font-semibold text-white disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  );
}
