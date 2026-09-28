'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useToast } from '@/components/admin/ui/Toast';
import { Table } from '@/components/admin/ui/Table';
import { StateBlock } from '@/components/admin/ui/StateBlock';
import { Pagination } from '@/components/admin/ui/Pagination';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const LIMIT = 20;

function StatusBadge({ status }) {
  return (
    <span className={`rounded-pill px-2 py-0.5 font-sans text-xs font-semibold ${status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {status}
    </span>
  );
}

// Super Admin only — never even attempted for `admin` (the nav entry is
// hidden per AdminShell's `roles` gate, and every route here is
// requireRole('super_admin') backend-side regardless).
function UsersContent() {
  const { user, apiFetchWithMeta, apiFetch } = useAdminAuth();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [meta, setMeta] = useState({ page: 1, limit: LIMIT, total: 0 });
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const debounceRef = useRef(null);
  const [busyId, setBusyId] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'disable'|'enable', target } | null
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (page = 1, query = q) => {
      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
        if (query.trim()) qs.set('q', query.trim());
        const { data, meta: m } = await apiFetchWithMeta(`/admin/users?${qs.toString()}`);
        setUsers(data);
        setMeta(m);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    [apiFetchWithMeta, q]
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchChange = (value) => {
    setQ(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(1, value), 300);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      // Phase F Decision D-F5: the normal Create Admin form only ever
      // creates `admin` accounts — super_admin creation stays out of routine
      // admin management for now. The backend endpoint itself is untouched
      // (still accepts any valid roleKey) — this is a UI-level choice, not a
      // backend restriction.
      await apiFetch('/admin/users', { method: 'POST', body: { ...newUser, roleKey: 'admin' } });
      toast.success('Admin account created.');
      setNewUser({ name: '', email: '', password: '' });
      load(meta.page);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const runDisableEnable = async () => {
    const { type, target } = confirmAction;
    setConfirmAction(null);
    setBusyId(target.id);
    try {
      await apiFetch(`/admin/users/${target.id}/${type}`, { method: 'PATCH' });
      toast.success(type === 'disable' ? 'Account disabled.' : 'Account re-enabled.');
      load(meta.page);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Users</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">
        Super Admin only. Passwords, MFA secrets, recovery codes, and session tokens are never shown here — the API
        never returns them.
      </p>

      <input
        type="text"
        value={q}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search by name or email…"
        className={`mb-4 max-w-sm ${inputClass}`}
      />

      <StateBlock loading={!users && !error} error={error} empty={users && !users.length} emptyMessage="No users found.">
        <Table
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'roleKey', label: 'Role', render: (u) => <span className="capitalize">{u.roleKey.replace('_', ' ')}</span> },
            { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.status} /> },
            { key: 'mfaEnabled', label: 'MFA', render: (u) => (u.mfaEnabled ? 'Yes' : 'No') },
            { key: 'createdAt', label: 'Created', render: (u) => new Date(u.createdAt).toLocaleDateString() },
            { key: 'lastLoginAt', label: 'Last login', render: (u) => (u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never') },
            {
              key: 'actions',
              label: '',
              render: (u) => {
                const isSelf = u.id === user?.id;
                if (isSelf) return <span className="font-sans text-xs text-charcoal/40">(you)</span>;
                return u.status === 'active' ? (
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => setConfirmAction({ type: 'disable', target: u })}
                    className="rounded-md border border-red-300 px-2.5 py-1 font-sans text-xs font-semibold text-red-600 disabled:opacity-60"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => setConfirmAction({ type: 'enable', target: u })}
                    className="rounded-md border border-green-600 px-2.5 py-1 font-sans text-xs font-semibold text-green-700 disabled:opacity-60"
                  >
                    Enable
                  </button>
                );
              },
            },
          ]}
          rows={users || []}
          rowKey={(u) => u.id}
        />
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPageChange={(p) => load(p)} />
      </StateBlock>

      <form onSubmit={handleCreate} className="mt-6 rounded-md border border-vyoma-blue p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-vyoma-blue">Create Admin</h2>
        <p className="mb-3 font-sans text-xs text-charcoal/60">
          Creates an <strong>Admin</strong> account. Super Admin accounts are not created from this form.
        </p>
        <div className="mb-2 grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={newUser.name}
            onChange={(e) => setNewUser((s) => ({ ...s, name: e.target.value }))}
            placeholder="Name"
            required
            className={inputClass}
          />
          <input
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
            placeholder="Email"
            required
            className={inputClass}
          />
          <input
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
            placeholder="Password (min 10 characters)"
            required
            minLength={10}
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={creating} className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60">
          {creating ? 'Creating…' : 'Create Admin'}
        </button>
      </form>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'disable' ? `Disable ${confirmAction.target.name}?` : `Re-enable ${confirmAction?.target.name}?`}
        message={
          confirmAction?.type === 'disable'
            ? 'This immediately revokes their access, including any session already in progress.'
            : 'They will be able to sign in again with their existing password.'
        }
        confirmLabel={confirmAction?.type === 'disable' ? 'Disable' : 'Enable'}
        danger={confirmAction?.type === 'disable'}
        onConfirm={runDisableEnable}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

export default function UsersPage() {
  return (
    <RequireAdminAuth>
      <UsersContent />
    </RequireAdminAuth>
  );
}
