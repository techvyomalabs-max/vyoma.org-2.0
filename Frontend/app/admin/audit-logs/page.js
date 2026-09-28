'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { Table } from '@/components/admin/ui/Table';
import { StateBlock } from '@/components/admin/ui/StateBlock';
import { Pagination } from '@/components/admin/ui/Pagination';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const LIMIT = 25;

function DetailsCell({ details }) {
  const [open, setOpen] = useState(false);
  if (details == null) return <span className="text-charcoal/40">—</span>;
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="font-sans text-xs font-semibold text-vyoma-blue">
        {open ? 'Hide' : 'View'}
      </button>
      {open && <pre className="mt-1 max-w-xs whitespace-pre-wrap break-all font-mono text-[11px] text-charcoal/80">{JSON.stringify(details, null, 2)}</pre>}
    </div>
  );
}

// Super Admin only, strictly read-only — no edit/delete control anywhere on
// this page, matching the backend (there is no update/delete route for
// audit logs at all).
function AuditLogsContent() {
  const { apiFetchWithMeta } = useAdminAuth();
  const [logs, setLogs] = useState(null);
  const [meta, setMeta] = useState({ page: 1, limit: LIMIT, total: 0 });
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ action: '', actorEmail: '', targetType: '', dateFrom: '', dateTo: '' });

  const load = useCallback(
    async (page = 1) => {
      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
        if (filters.action.trim()) qs.set('action', filters.action.trim());
        if (filters.actorEmail.trim()) qs.set('actorEmail', filters.actorEmail.trim());
        if (filters.targetType.trim()) qs.set('targetType', filters.targetType.trim());
        if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) qs.set('dateTo', filters.dateTo);
        const { data, meta: m } = await apiFetchWithMeta(`/admin/audit-logs?${qs.toString()}`);
        setLogs(data);
        setMeta(m);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiFetchWithMeta, filters.action, filters.actorEmail, filters.targetType, filters.dateFrom, filters.dateTo]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="mx-auto mt-8 max-w-[1100px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Audit Logs</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">Read-only. Super Admin only.</p>

      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <input
          type="text"
          value={filters.action}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
          placeholder="Action (e.g. users.disabled)"
          className={inputClass}
        />
        <input
          type="text"
          value={filters.actorEmail}
          onChange={(e) => setFilters((f) => ({ ...f, actorEmail: e.target.value }))}
          placeholder="Actor email"
          className={inputClass}
        />
        <input
          type="text"
          value={filters.targetType}
          onChange={(e) => setFilters((f) => ({ ...f, targetType: e.target.value }))}
          placeholder="Target type (e.g. User)"
          className={inputClass}
        />
        <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} className={inputClass} />
        <input type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} className={inputClass} />
      </div>

      <StateBlock loading={!logs && !error} error={error} empty={logs && !logs.length} emptyMessage="No audit entries match.">
        <Table
          columns={[
            { key: 'createdAt', label: 'Timestamp', render: (l) => new Date(l.createdAt).toLocaleString() },
            { key: 'actorEmail', label: 'Actor', render: (l) => l.actorEmail || 'system' },
            { key: 'action', label: 'Action' },
            { key: 'target', label: 'Target', render: (l) => (l.targetType ? `${l.targetType}${l.targetId ? ` · ${l.targetId}` : ''}` : '—') },
            { key: 'ip', label: 'IP', render: (l) => l.ip || '—' },
            { key: 'details', label: 'Details', render: (l) => <DetailsCell details={l.details} /> },
          ]}
          rows={logs || []}
          rowKey={(l) => l._id}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPageChange={load} />
      </StateBlock>
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <RequireAdminAuth>
      <AuditLogsContent />
    </RequireAdminAuth>
  );
}
