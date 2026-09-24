'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'name', type: 'text', label: 'Patron name' },
  { key: 'location', type: 'text', label: 'Location' },
  { key: 'quote', type: 'textarea', label: 'Quote' },
];

export function PatronTestimonialsForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="name"
      newItemTemplate={{ name: '', location: '', quote: '', active: true }}
    />
  );
}
