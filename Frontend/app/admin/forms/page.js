'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { SubmissionFilters } from '@/components/admin/forms/SubmissionFilters';
import { SubmissionList } from '@/components/admin/forms/SubmissionList';

// Existing, unchanged backend default (forms.admin.controller.js's own
// `Number(req.query.limit) || 50`) -- sent explicitly here (not implicitly
// relied upon) so the frontend's own range/page-count math always matches
// exactly what was actually requested.
const PAGE_SIZE = 50;

function buildQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.formKey.trim()) params.set('formKey', filters.formKey.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  params.set('page', String(page));
  params.set('limit', String(PAGE_SIZE));
  return params.toString();
}

function FormsListContent() {
  const { apiFetchWithMeta } = useAdminAuth();
  const [filters, setFilters] = useState({ category: '', formKey: '', status: '', dateFrom: '', dateTo: '' });
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0, limit: PAGE_SIZE });

  // SubmissionFilters' onChange always replaces the whole filters object in
  // one call (category/formKey/status/dateFrom/dateTo alike), so resetting
  // page to 1 unconditionally here on every filter change is both correct
  // and simpler than inspecting which specific field changed.
  const handleFiltersChange = (nextFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  // Same stale-response guard pattern already established in
  // app/admin/content/page.js: a local `cancelled` flag, set in this
  // effect's own cleanup, which React runs before starting a new effect
  // whenever `filters`/`page` changes -- so a slower, now-superseded
  // request can never overwrite the UI with results for a filter/page
  // combination the admin has since navigated away from.
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    const qs = buildQuery(filters, page);
    apiFetchWithMeta(`/admin/forms?${qs}`)
      .then(({ data, meta }) => {
        if (cancelled) return;
        setState({ loading: false, error: null, items: data, total: meta.total, limit: meta.limit });
        // Out-of-range page safety: if the real total (e.g. after a filter
        // narrowed the result set while on a later page) means the
        // requested page no longer exists, clamp down to the last real
        // page -- this state change re-triggers this same effect for the
        // corrected page. Always decreases page, so this can only ever
        // fire once per occurrence (never loops).
        const totalPages = Math.max(1, Math.ceil(meta.total / meta.limit));
        if (meta.page > totalPages) setPage(totalPages);
      })
      .catch((err) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: err.message, items: [], total: 0 }));
      });
    return () => {
      cancelled = true;
    };
  }, [apiFetchWithMeta, filters, page]);

  const totalPages = Math.max(1, Math.ceil(state.total / state.limit));
  const rangeStart = state.total === 0 ? 0 : (page - 1) * state.limit + 1;
  const rangeEnd = Math.min(page * state.limit, state.total);

  return (
    <div className="mx-auto mt-10 max-w-[800px] px-4">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Forms</h1>
      <SubmissionFilters filters={filters} onChange={handleFiltersChange} />
      {state.loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {state.error && <p className="font-sans text-sm text-red-600">{state.error}</p>}
      {!state.loading && !state.error && (
        <>
          <SubmissionList items={state.items} />
          {state.total > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 font-sans text-sm text-charcoal">
              <span className="text-charcoal/60">
                Showing {rangeStart}–{rangeEnd} of {state.total} applications
              </span>
              {totalPages > 1 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-semibold disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminFormsPage() {
  return (
    <RequireAdminAuth>
      <FormsListContent />
    </RequireAdminAuth>
  );
}
