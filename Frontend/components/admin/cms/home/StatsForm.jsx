'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const NEW_STAT = { value: '', label: '', active: true };

export function StatsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_STAT}
      itemLabel={(item) => item.label || 'New stat'}
      renderItem={(item, onItemChange) => (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={item.value}
            onChange={(e) => onItemChange({ ...item, value: e.target.value })}
            placeholder="Value (e.g. 124,193)"
            className={inputClass}
          />
          <input
            type="text"
            value={item.label}
            onChange={(e) => onItemChange({ ...item, label: e.target.value })}
            placeholder="Label"
            className={inputClass}
          />
        </div>
      )}
    />
  );
}
