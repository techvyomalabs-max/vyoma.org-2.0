'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'name', type: 'text', label: 'Name' },
  { key: 'role', type: 'text', label: 'Role' },
  { key: 'bio', type: 'textarea', label: 'Bio (optional)' },
  { key: 'image', type: 'image', label: 'Photo' },
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
