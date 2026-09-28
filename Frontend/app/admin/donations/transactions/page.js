'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { Table } from '@/components/admin/ui/Table';
import { StateBlock } from '@/components/admin/ui/StateBlock';
import { Pagination } from '@/components/admin/ui/Pagination';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const LIMIT = 20;
const STATUSES = ['initiated', 'order_created', 'paid_verified', 'receipt_sent', 'failed', 'cancelled', 'verification_failed'];

function StatusBadge({ status }) {
  const tone =
    status === 'paid_verified' || status === 'receipt_sent'
      ? 'bg-green-100 text-green-700'
      : status === 'failed' || status === 'cancelled' || status === 'verification_failed'
        ? 'bg-red-100 text-red-700'
        : 'bg-charcoal/10 text-charcoal';
  return <span className={`rounded-pill px-2 py-0.5 font-sans text-xs font-semibold ${tone}`}>{status}</span>;
}

// Read-only — no mutation control anywhere on this page, by design (Phase F
// scope explicitly excludes refund/capture/manual-override/delete).
function DonationsTransactionsContent() {
  const { apiFetch, apiFetchWithMeta } = useAdminAuth();
  const router = useRouter();
  const [donations, setDonations] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: LIMIT, total: 0 });
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: '', schemeSlug: '', email: '', dateFrom: '', dateTo: '' });

  useEffect(() => {
    // The admin scheme list (not the public one) so an already-archived
    // scheme still shows up as a filter option for historical donations.
    apiFetch('/admin/donations/schemes')
      .then(setSchemes)
      .catch(() => {});
  }, [apiFetch]);

  const load = useCallback(
    async (page = 1) => {
      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
        if (filters.status) qs.set('status', filters.status);
        if (filters.schemeSlug) qs.set('schemeSlug', filters.schemeSlug);
        if (filters.email.trim()) qs.set('email', filters.email.trim());
        if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) qs.set('dateTo', filters.dateTo);
        const { data, meta: m } = await apiFetchWithMeta(`/admin/donations?${qs.toString()}`);
        setDonations(data);
        setMeta(m);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiFetchWithMeta, filters.status, filters.schemeSlug, filters.email, filters.dateFrom, filters.dateTo]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="mx-auto mt-8 max-w-[1000px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Donations</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">
        Read-only transaction records. No refund, capture, or manual payment-status controls exist here.
      </p>

      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className={inputClass}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.schemeSlug}
          onChange={(e) => setFilters((f) => ({ ...f, schemeSlug: e.target.value }))}
          className={inputClass}
        >
          <option value="">All schemes</option>
          {schemes.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={filters.email}
          onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
          placeholder="Donor email"
          className={inputClass}
        />
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className={inputClass} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className={inputClass} />
      </div>

      <StateBlock loading={!donations && !error} error={error} empty={donations && !donations.length} emptyMessage="No donations found.">
        <Table
          columns={[
            { key: 'donor', label: 'Donor', render: (d) => `${d.donor?.name || '—'} (${d.donor?.email || '—'})` },
            { key: 'schemeSlug', label: 'Scheme' },
            { key: 'amount', label: 'Amount', render: (d) => `${d.currency} ${d.amount}` },
            { key: 'status', label: 'Status', render: (d) => <StatusBadge status={d.status} /> },
            { key: 'receipt', label: 'Receipt', render: (d) => d.receipt?.status || 'pending' },
            { key: 'createdAt', label: 'Created', render: (d) => new Date(d.createdAt).toLocaleString() },
          ]}
          rows={donations || []}
          rowKey={(d) => d._id}
          onRowClick={(d) => router.push(`/admin/donations/transactions/${d._id}`)}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPageChange={load} />
      </StateBlock>
    </div>
  );
}

export default function DonationsTransactionsPage() {
  return (
    <RequireAdminAuth>
      <DonationsTransactionsContent />
    </RequireAdminAuth>
  );
}
