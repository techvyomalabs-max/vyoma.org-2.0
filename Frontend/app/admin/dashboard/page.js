'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';

function MetricTile({ label, value, loading }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] p-4">
      <div className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">{label}</div>
      <div className="mt-1 font-sans text-3xl font-bold text-vyoma-blue">{loading ? '…' : value}</div>
    </div>
  );
}

// Phase F: every metric here re-uses an existing paginated admin endpoint's
// own `meta.total` (called with limit=1, purely for the count) — no new
// backend endpoint, no fabricated revenue/storage/redirect-hit numbers.
// Which requests fire at all depends on role: a plain `admin` never has
// permission for /admin/users or /admin/audit-logs, so those calls are
// simply never made for that role, rather than made and their 403 hidden.
function DashboardContent() {
  const { user, apiFetch, apiFetchWithMeta } = useAdminAuth();
  const [me, setMe] = useState(null);
  const [donationsTotal, setDonationsTotal] = useState(null);
  const [formsNewTotal, setFormsNewTotal] = useState(null);
  const [usersTotal, setUsersTotal] = useState(null);
  const [recentAudit, setRecentAudit] = useState(null);

  const isSuperAdmin = user?.roleKey === 'super_admin';

  useEffect(() => {
    apiFetch('/auth/me').then(setMe).catch(() => {});
  }, [apiFetch]);

  useEffect(() => {
    apiFetchWithMeta('/admin/donations?limit=1')
      .then(({ meta }) => setDonationsTotal(meta.total))
      .catch(() => setDonationsTotal(null));
    apiFetchWithMeta('/admin/forms?status=new&limit=1')
      .then(({ meta }) => setFormsNewTotal(meta.total))
      .catch(() => setFormsNewTotal(null));
  }, [apiFetchWithMeta]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    apiFetchWithMeta('/admin/users?limit=1')
      .then(({ meta }) => setUsersTotal(meta.total))
      .catch(() => setUsersTotal(null));
    apiFetch('/admin/audit-logs?limit=5')
      .then(setRecentAudit)
      .catch(() => setRecentAudit(null));
  }, [isSuperAdmin, apiFetch, apiFetchWithMeta]);

  return (
    <div className="mx-auto mt-10 max-w-3xl px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Admin dashboard</h1>
      <p className="mb-6 font-sans text-sm text-charcoal/70">
        Signed in as <strong>{user?.name}</strong> ({user?.email}) · Role: {user?.roleKey}
        {me?.mfaEnabled ? ' · MFA enabled' : ''}
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {isSuperAdmin && <MetricTile label="Total users" value={usersTotal} loading={usersTotal === null} />}
        <MetricTile label="Total donations" value={donationsTotal} loading={donationsTotal === null} />
        <MetricTile label="Forms needing attention" value={formsNewTotal} loading={formsNewTotal === null} />
      </div>

      {isSuperAdmin && (
        <div className="mt-6 rounded-md border border-[var(--border-subtle)] p-4">
          <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">Recent audit activity</h2>
          {!recentAudit && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
          {recentAudit && !recentAudit.length && <p className="font-sans text-sm text-charcoal/60">No activity yet.</p>}
          <ul className="flex flex-col gap-2">
            {recentAudit?.map((entry) => (
              <li key={entry._id} className="font-sans text-sm text-charcoal">
                <span className="text-charcoal/60">{new Date(entry.createdAt).toLocaleString()}</span> · {entry.actorEmail || 'system'} ·{' '}
                <strong>{entry.action}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <RequireAdminAuth>
      <DashboardContent />
    </RequireAdminAuth>
  );
}
