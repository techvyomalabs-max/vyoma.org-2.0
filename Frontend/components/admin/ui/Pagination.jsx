'use client';

// Matches the { page, limit, total } shape every existing paginated admin
// endpoint already returns as `meta` (Users/Donations/Audit/Redirects) —
// built now so Phase F's pages don't each reinvent this.
export function Pagination({ page, limit, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 pt-3 font-sans text-sm text-charcoal">
      <span className="text-charcoal/60">
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-semibold disabled:opacity-40"
        >
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-semibold disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
