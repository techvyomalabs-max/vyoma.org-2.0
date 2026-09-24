'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const NEW_TOPIC = { label: '', active: true };

export function TopicsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_TOPIC}
      itemLabel={(item) => item.label || 'New topic'}
      renderItem={(item, onItemChange) => (
        <input
          type="text"
          value={item.label}
          onChange={(e) => onItemChange({ ...item, label: e.target.value })}
          placeholder="Topic label"
          className={inputClass}
        />
      )}
    />
  );
}
