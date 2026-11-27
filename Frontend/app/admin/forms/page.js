'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { SubmissionFilters } from '@/components/admin/forms/SubmissionFilters';
import { SubmissionList } from '@/components/admin/forms/SubmissionList';
import { startOfLocalDayIso, startOfNextLocalDayIso } from './dateRangeBoundary.mjs';

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
  // Both boundaries are computed in the browser's own local timezone, at
  // the specific calendar date selected -- never a bare "YYYY-MM-DD"
  // parsed as UTC (which is what the old, broken dateTo behavior did).
  // dateFrom keeps its existing name/contract (a full ISO timestamp is
  // just as valid an input to the backend's existing $gte handling as a
  // bare date always was). dateToExclusive is a new, explicit parameter
  // (see forms.admin.controller.js) -- the exclusive start of the day
  // *after* the selected one, so the entire selected local day is
  // included without ambiguity.
  //
  // A non-empty filter value that fails to convert (startOf*DayIso
  // returning null) throws here instead of silently omitting the
  // parameter -- an admin who explicitly chose a date must never have it
  // silently dropped into an unintentionally broader, unfiltered request.
  // An empty value (no date chosen) is not an error -- it simply means
  // "no filter on this boundary", exactly as before.
  if (filters.dateFrom) {
    const dateFromIso = startOfLocalDayIso(filters.dateFrom);
    if (!dateFromIso) throw new Error('The From Date is not a valid date.');
    params.set('dateFrom', dateFromIso);
  }
  if (filters.dateTo) {
    const dateToExclusiveIso = startOfNextLocalDayIso(filters.dateTo);
    if (!dateToExclusiveIso) throw new Error('The To Date is not a valid date.');
    params.set('dateToExclusive', dateToExclusiveIso);
  }
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
    // buildQuery throws (rather than silently dropping the filter) when a
    // selected date fails to convert -- caught here, using the exact same
    // error-display convention as a failed fetch below, so an invalid date
    // never results in an unintended unfiltered request being sent at all.
    let qs;
    try {
      qs = buildQuery(filters, page);
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message, items: [], total: 0 }));
      return () => {
        cancelled = true;
      };
    }
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
