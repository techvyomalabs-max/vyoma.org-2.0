'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'sanskrit', type: 'text', label: 'Sanskrit tier name' },
  { key: 'meaning', type: 'text', label: 'English meaning' },
  { key: 'note', type: 'textarea', label: 'Description' },
];

export function PatronTiersForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="sanskrit"
      newItemTemplate={{ sanskrit: '', meaning: '', note: '', active: true }}
    />
  );
}
