'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'year', type: 'text', label: 'Year', placeholder: 'e.g. 2012–2015' },
  { key: 'text', type: 'textarea', label: 'What happened' },
];

export function TimelineForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="year"
      newItemTemplate={{ year: '', text: '', active: true }}
    />
  );
}
