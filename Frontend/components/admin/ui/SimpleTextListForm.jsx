'use client';

import { RepeatableList } from './RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// For plain-string repeatable lists (e.g. Internship reasons) — no
// active/visible toggle here since these are undifferentiated bullet points,
// not individually-identifiable items a visitor would notice being hidden.
export function SimpleTextListForm({ value, onChange, placeholder = 'Text' }) {
  return (
    <RepeatableList
      items={value.map((text) => ({ text }))}
      onChange={(items) => onChange(items.map((i) => i.text))}
      newItemTemplate={{ text: '' }}
      itemLabel={(item, i) => `Item ${i + 1}`}
      renderItem={(item, onItemChange) => (
        <textarea
          value={item.text}
          onChange={(e) => onItemChange({ text: e.target.value })}
          placeholder={placeholder}
          rows={2}
          className={inputClass}
        />
      )}
    />
  );
}
