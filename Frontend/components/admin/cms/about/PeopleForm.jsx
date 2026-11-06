'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

// These two "Associates In Our Journey" entries are company logos, not
// photos of a person (confirmed by direct visual inspection) — background
// removal must never be offered for them, regardless of what any future
// entry in this list might be.
const NON_PERSON_NAMES = new Set(['Vishnu Daya & Co (Chartered Accountants)', 'Artha Viveka']);

const FIELDS = [
  { key: 'name', type: 'text', label: 'Name' },
  { key: 'role', type: 'text', label: 'Role' },
  { key: 'bio', type: 'textarea', label: 'Bio (optional)' },
  {
    key: 'image',
    type: 'image',
    label: 'Photo',
    enableBackgroundRemoval: true,
    backgroundRemovalDisabledFor: (item) => NON_PERSON_NAMES.has(item.name),
  },
];

// Shared by Board, Advisors, and Committee — all three are the exact same
// {name, role, bio?, image?} shape.
export function PeopleForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="name"
      newItemTemplate={{ name: '', role: '', bio: null, image: null, active: true }}
    />
  );
}
