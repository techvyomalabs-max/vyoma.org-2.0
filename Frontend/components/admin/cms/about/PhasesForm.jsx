'use client';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const FIELDS = [
  { key: 'phase', type: 'text', label: 'Phase name', placeholder: 'e.g. Phase 1' },
  { key: 'time', type: 'text', label: 'Time range', placeholder: 'e.g. 2026–2027' },
  { key: 'text', type: 'textarea', label: 'Description' },
];

export function PhasesForm({ value, onChange }) {
  return (
    <SimpleRepeatableForm
      value={value}
      onChange={onChange}
      fields={FIELDS}
      labelKey="phase"
      newItemTemplate={{ phase: '', time: '', text: '', active: true }}
    />
  );
}
