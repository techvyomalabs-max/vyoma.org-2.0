'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'name', type: 'text', label: 'Company name' },
  { key: 'logo', type: 'image', label: 'Logo' },
];

// "Our Matching Patrons" — companies whose employee matching-gift
// programmes multiply donor gifts. Real company names + logos (Batch 5),
// replacing 3 hardcoded placeholder boxes that weren't stored in the CMS
// at all.
export function PatronMatchingPartnersForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="name"
      newItemTemplate={{ name: '', logo: null, active: true }}
    />
  );
}
