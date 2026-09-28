'use client';

import Link from 'next/link';

// Deliberately shows only formKey/name/email/status/date in the list row —
// the full submitted message/values only render on the detail page, so
// scanning the list doesn't surface more of a submitter's data than needed.
export function SubmissionList({ items }) {
  if (!items.length) {
    return <p className="font-sans text-sm text-charcoal/60">No submissions match these filters.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((s) => (
        <Link
          key={s._id}
          href={`/admin/forms/${s._id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border-subtle)] px-3.5 py-2.5 hover:bg-sky-mist"
        >
          <div className="font-sans text-sm text-charcoal">
            <span className="font-bold text-vyoma-blue">{s.formKey}</span> — {s.values?.name || '(no name)'} ·{' '}
            {s.values?.email || '(no email)'}
          </div>
          <div className="flex items-center gap-3 font-sans text-xs text-charcoal/60">
            <span
              className={`rounded-pill px-2 py-0.5 font-semibold ${
                s.status === 'handled' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {s.status}
            </span>
            <span>{new Date(s.submittedAt).toLocaleDateString()}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
