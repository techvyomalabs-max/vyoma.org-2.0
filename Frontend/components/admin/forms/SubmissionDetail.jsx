'use client';

import { useState } from 'react';

export function SubmissionDetail({ submission, onUpdate, saving }) {
  const [status, setStatus] = useState(submission.status);
  const [note, setNote] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const body = {};
    if (status !== submission.status) body.status = status;
    if (note.trim()) body.note = note.trim();
    if (Object.keys(body).length === 0) return;
    onUpdate(body).then(() => setNote(''));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h2 className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{submission.formKey}</h2>
        <p className="font-sans text-sm text-charcoal/60">
          Submitted {new Date(submission.submittedAt).toLocaleString()} · handled by {submission.handledBy || '—'}
        </p>
        <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {Object.entries(submission.values || {}).map(([key, val]) => (
            <div key={key}>
              <dt className="font-sans text-xs font-bold uppercase text-charcoal/60">{key}</dt>
              <dd className="font-sans text-sm text-charcoal">{String(val)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-md border border-[var(--border-subtle)] p-4">
        <h3 className="mb-2 font-sans text-sm font-bold text-charcoal">Notes</h3>
        <pre className="whitespace-pre-wrap font-sans text-sm text-charcoal">{submission.notes || 'No notes yet.'}</pre>
      </div>

      <form onSubmit={handleSubmit} className="rounded-md border border-[var(--border-subtle)] p-4">
        <h3 className="mb-3 font-sans text-sm font-bold text-charcoal">Update</h3>
        <div className="mb-3">
          <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
          >
            <option value="new">New</option>
            <option value="handled">Handled</option>
          </select>
        </div>
        <div className="mb-3">
          <label className="mb-1 block font-sans text-xs font-bold text-charcoal/60">Add a note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal"
            placeholder="Internal note — appended, existing notes are never overwritten."
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
