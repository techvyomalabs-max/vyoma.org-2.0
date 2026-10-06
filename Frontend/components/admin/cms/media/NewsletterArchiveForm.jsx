'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
// Matches NEWSLETTER_ARCHIVE — {year, issues: [{label, title, url?}]}, a
// nested list (each year groups several issues). `url` is optional — a
// blank value is safe and simply hides that issue's Download action on the
// public page rather than rendering a dead link.
const NEW_YEAR = { year: '', issues: [] };
const NEW_ISSUE = { label: '', title: '', url: '' };

export function NewsletterArchiveForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_YEAR}
      itemLabel={(item) => item.year || 'New year'}
      renderItem={(item, onItemChange) => (
        <div className="space-y-3">
          <input type="text" value={item.year} onChange={(e) => onItemChange({ ...item, year: e.target.value })} placeholder="Year" className={`max-w-[140px] ${inputClass}`} />
          <div className="rounded-md border border-[var(--border-subtle)] p-3">
            <div className="mb-2 font-sans text-xs font-bold text-charcoal/60">Issues for {item.year || 'this year'}</div>
            <RepeatableList
              items={item.issues}
              onChange={(issues) => onItemChange({ ...item, issues })}
              newItemTemplate={NEW_ISSUE}
              itemLabel={(issue) => issue.title || 'New issue'}
              renderItem={(issue, onIssueChange) => (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" value={issue.label} onChange={(e) => onIssueChange({ ...issue, label: e.target.value })} placeholder="Label (e.g. Dec 2025 · Vol. 8, Issue 2)" className={inputClass} />
                    <input type="text" value={issue.title} onChange={(e) => onIssueChange({ ...issue, title: e.target.value })} placeholder="Title" className={inputClass} />
                  </div>
                  <input
                    type="text"
                    value={issue.url || ''}
                    onChange={(e) => onIssueChange({ ...issue, url: e.target.value })}
                    placeholder="Destination URL (PDF or flipbook — optional)"
                    className={inputClass}
                  />
                </div>
              )}
            />
          </div>
        </div>
      )}
    />
  );
}
