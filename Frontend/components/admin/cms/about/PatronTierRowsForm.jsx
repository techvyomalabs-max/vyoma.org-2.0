'use client';

import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const TIERS = ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'];
const FIELDS = [
  { key: 'name', type: 'text', label: 'Patron name' },
  { key: 'place', type: 'text', label: 'Place' },
  { key: 'product', type: 'text', label: 'Product sponsored' },
];

// PATRON_TIER_ROWS is keyed by a fixed 6-tier taxonomy (matching
// PatronTiersForm's sanskrit names) — the tiers themselves aren't
// addable/removable here, only the named-patron rows inside each one.
export function PatronTierRowsForm({ value, onChange }) {
  return (
    <div className="space-y-6">
      {TIERS.map((tier) => (
        <div key={tier}>
          <h3 className="mb-2 font-sans text-sm font-bold text-vyoma-blue">{tier}</h3>
          <SimpleRepeatableForm
            value={value[tier] || []}
            onChange={(rows) => onChange({ ...value, [tier]: rows })}
            fields={FIELDS}
            labelKey="name"
            newItemTemplate={{ name: '', place: '', product: '', active: true }}
          />
        </div>
      ))}
    </div>
  );
}
