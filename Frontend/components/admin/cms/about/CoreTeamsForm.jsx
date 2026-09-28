'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { PeopleForm } from './PeopleForm';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// CORE_TEAMS is a list of groups, each containing its own list of people —
// a group is a RepeatableList item whose body is itself another
// RepeatableList (via PeopleForm). Nesting two of the same generic control
// works because RepeatableList only cares about {items, onChange}.
export function CoreTeamsForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={{ heading: 'New group', active: true, people: [] }}
      itemLabel={(item) => item.heading || 'New group'}
      renderItem={(group, onGroupChange) => (
        <div className="space-y-3">
          <input
            type="text"
            value={group.heading}
            onChange={(e) => onGroupChange({ ...group, heading: e.target.value })}
            placeholder="Group heading"
            className={inputClass}
          />
          <PeopleForm value={group.people} onChange={(people) => onGroupChange({ ...group, people })} />
        </div>
      )}
    />
  );
}
