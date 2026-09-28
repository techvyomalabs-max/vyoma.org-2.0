'use client';

// Consistent loading/error/empty rendering — replaces each admin page's own
// ad-hoc `{loading && <p>...}` handling as pages migrate to the new CMS forms.
// Existing pages are left as-is for now; this is additive, not a refactor.
export function StateBlock({ loading, error, empty, emptyMessage = 'Nothing here yet.', children }) {
  if (loading) return <p className="font-sans text-sm text-charcoal/60">Loading…</p>;
  if (error) return <p className="font-sans text-sm text-red-600">{error}</p>;
  if (empty) return <p className="font-sans text-sm text-charcoal/60">{emptyMessage}</p>;
  return children;
}
