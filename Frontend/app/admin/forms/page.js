'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { SubmissionFilters } from '@/components/admin/forms/SubmissionFilters';
import { SubmissionList } from '@/components/admin/forms/SubmissionList';

function buildQuery(filters) {
  const params = new URLSearchParams();
  if (filters.formKey.trim()) params.set('formKey', filters.formKey.trim());
  if (filters.status) params.set('status', filters.status);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return params.toString();
}

function FormsListContent() {
  const { apiFetch } = useAdminAuth();
  const [filters, setFilters] = useState({ formKey: '', status: '', dateFrom: '', dateTo: '' });
  const [state, setState] = useState({ loading: true, error: null, items: [], total: 0 });

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const qs = buildQuery(filters);
    apiFetch(`/admin/forms${qs ? `?${qs}` : ''}`)
      .then((items) => setState({ loading: false, error: null, items, total: items.length }))
      .catch((err) => setState({ loading: false, error: err.message, items: [], total: 0 }));
  }, [apiFetch, filters]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto mt-10 max-w-[800px] px-4">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Forms</h1>
      <SubmissionFilters filters={filters} onChange={setFilters} />
      {state.loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {state.error && <p className="font-sans text-sm text-red-600">{state.error}</p>}
      {!state.loading && !state.error && <SubmissionList items={state.items} />}
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
