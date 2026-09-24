'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'label', type: 'text', label: 'Card title' },
  { key: 'href', type: 'text', label: 'Internal path (e.g. /about/our-story)' },
  { key: 'text', type: 'textarea', label: 'Card body' },
];

export function ExploreMoreLinksForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="label"
      newItemTemplate={{ label: '', href: '', text: '', active: true }}
    />
  );
}
