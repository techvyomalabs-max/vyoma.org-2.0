'use client';

// Blocking confirmation for destructive actions (delete a repeatable item,
// remove a file/image, replace a file that's currently live on a published
// page) — per the "safe editing workflow" requirement, these must not be
// one-click.
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-md bg-white p-5 shadow-lg">
        <h2 className="mb-2 font-sans text-base font-bold text-charcoal">{title}</h2>
        {message && <p className="mb-4 font-sans text-sm text-charcoal/70">{message}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[var(--border-subtle)] px-3.5 py-2 font-sans text-sm font-semibold text-charcoal"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3.5 py-2 font-sans text-sm font-semibold text-white ${
              danger ? 'bg-red-600' : 'bg-vyoma-blue'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
