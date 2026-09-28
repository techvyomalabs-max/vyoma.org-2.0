'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const ITEM_FIELDS = [
  { key: 'q', type: 'text', label: 'Question' },
  { key: 'a', type: 'textarea', label: 'Answer' },
  { key: 'note', type: 'text', label: 'Internal note (optional)' },
];

// FAQ_GROUPS is a list of groups, each with its own list of Q&A items —
// same nested-RepeatableList pattern as About's CoreTeamsForm.
export function FaqGroupsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={{ group: 'New group', active: true, items: [] }}
      itemLabel={(item) => item.group || 'New group'}
      renderItem={(group, onGroupChange) => (
        <div className="space-y-3">
          <input
            type="text"
            value={group.group}
            onChange={(e) => onGroupChange({ ...group, group: e.target.value })}
            placeholder="Group name"
            className={inputClass}
          />
          <SimpleRepeatableForm
            value={group.items}
            onChange={(items) => onGroupChange({ ...group, items })}
            fields={ITEM_FIELDS}
            labelKey="q"
            newItemTemplate={{ q: '', a: '', note: null, active: true }}
          />
        </div>
      )}
    />
  );
}
