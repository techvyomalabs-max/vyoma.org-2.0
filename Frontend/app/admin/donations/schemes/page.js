'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useToast } from '@/components/admin/ui/Toast';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

// Direct CRUD against DonationSchemeModel — deliberately NOT the
// draft/preview/publish Content workflow used elsewhere, because scheme
// identity is checkout-critical live data (createDonationOrder reads it
// directly), not page copy. Every edit here takes effect immediately.
// There is no delete button anywhere in this file — only Active/Inactive.
function SchemesAdminContent() {
  const { apiFetch } = useAdminAuth();
  const toast = useToast();
  const [schemes, setSchemes] = useState(null);
  const [error, setError] = useState(null);
  const [busySlug, setBusySlug] = useState(null);
  const [confirmStatus, setConfirmStatus] = useState(null); // { slug, nextStatus } | null
  const [newScheme, setNewScheme] = useState({ slug: '', name: '', description: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await apiFetch('/admin/donations/schemes');
      setSchemes(list);
    } catch (err) {
      setError(err.message);
    }
  }, [apiFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const updateLocal = (slug, patch) => setSchemes((prev) => prev.map((s) => (s.slug === slug ? { ...s, ...patch } : s)));

  const saveField = async (slug, field, value) => {
    setBusySlug(slug);
    try {
      const updated = await apiFetch(`/admin/donations/schemes/${slug}`, { method: 'PATCH', body: { [field]: value } });
      updateLocal(slug, updated);
      toast.success('Saved.');
    } catch (err) {
      toast.error(err.message);
      load(); // revert to server state on failure
    } finally {
      setBusySlug(null);
    }
  };

  const move = async (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= schemes.length) return;
    const a = schemes[index];
    const b = schemes[target];
    setBusySlug(a.slug);
    try {
      await Promise.all([
        apiFetch(`/admin/donations/schemes/${a.slug}`, { method: 'PATCH', body: { displayOrder: b.displayOrder } }),
        apiFetch(`/admin/donations/schemes/${b.slug}`, { method: 'PATCH', body: { displayOrder: a.displayOrder } }),
      ]);
      await load();
      toast.success('Order updated.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusySlug(null);
    }
  };

  const toggleStatus = (scheme) => setConfirmStatus({ slug: scheme.slug, nextStatus: scheme.status === 'active' ? 'inactive' : 'active' });

  const confirmToggle = async () => {
    const { slug, nextStatus } = confirmStatus;
    setConfirmStatus(null);
    await saveField(slug, 'status', nextStatus);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await apiFetch('/admin/donations/schemes', { method: 'POST', body: newScheme });
      setSchemes((prev) => [...prev, created]);
      setNewScheme({ slug: '', name: '', description: '' });
      toast.success('Scheme created.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (error) return <p className="mx-auto mt-10 max-w-[900px] px-4 font-sans text-sm text-red-600">{error}</p>;
  if (!schemes) return <p className="mx-auto mt-10 max-w-[900px] px-4 font-sans text-sm text-charcoal/60">Loading…</p>;

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Donation Schemes</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">
        Changes here take effect immediately on the public site and at checkout — there is no draft/publish step.
        Slugs can never be changed once created.
      </p>

      <div className="flex flex-col gap-3">
        {schemes.map((s, i) => (
          <div key={s.slug} className="rounded-md border border-[var(--border-subtle)] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-pill bg-sky-mist px-2 py-0.5 font-sans text-xs font-semibold text-vyoma-blue">{s.slug}</span>
                <span
                  className={`rounded-pill px-2 py-0.5 font-sans text-xs font-semibold ${
                    s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {s.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" disabled={i === 0 || busySlug} onClick={() => move(i, -1)} className="text-xs text-charcoal/60 disabled:opacity-30">
                  ↑
                </button>
                <button type="button" disabled={i === schemes.length - 1 || busySlug} onClick={() => move(i, 1)} className="text-xs text-charcoal/60 disabled:opacity-30">
                  ↓
                </button>
                <button
                  type="button"
                  disabled={busySlug === s.slug}
                  onClick={() => toggleStatus(s)}
                  className={`rounded-md border px-2.5 py-1 font-sans text-xs font-semibold ${
                    s.status === 'active' ? 'border-red-300 text-red-600' : 'border-green-600 text-green-700'
                  }`}
                >
                  {s.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                defaultValue={s.name}
                onBlur={(e) => e.target.value !== s.name && saveField(s.slug, 'name', e.target.value)}
                placeholder="Name"
                className={inputClass}
              />
              <textarea
                defaultValue={s.description}
                onBlur={(e) => e.target.value !== s.description && saveField(s.slug, 'description', e.target.value)}
                placeholder="Description"
                rows={2}
                className={inputClass}
              />
              <input
                type="text"
                defaultValue={s.note || ''}
                onBlur={(e) => (e.target.value || null) !== (s.note || null) && saveField(s.slug, 'note', e.target.value || null)}
                placeholder="Note (optional)"
                className={inputClass}
              />
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleCreate} className="mt-6 rounded-md border border-vyoma-blue p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-vyoma-blue">Add a new scheme</h2>
        <div className="mb-2 grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={newScheme.slug}
            onChange={(e) => setNewScheme((s) => ({ ...s, slug: e.target.value }))}
            placeholder="slug-in-kebab-case"
            required
            className={inputClass}
          />
          <input
            type="text"
            value={newScheme.name}
            onChange={(e) => setNewScheme((s) => ({ ...s, name: e.target.value }))}
            placeholder="Name"
            required
            className={inputClass}
          />
          <input
            type="text"
            value={newScheme.description}
            onChange={(e) => setNewScheme((s) => ({ ...s, description: e.target.value }))}
            placeholder="Description"
            required
            className={inputClass}
          />
        </div>
        <button type="submit" disabled={creating} className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60">
          {creating ? 'Creating…' : 'Create scheme'}
        </button>
      </form>

      <ConfirmDialog
        open={!!confirmStatus}
        title={confirmStatus?.nextStatus === 'inactive' ? 'Deactivate this scheme?' : 'Reactivate this scheme?'}
        message={
          confirmStatus?.nextStatus === 'inactive'
            ? 'It will disappear from the public donate page and stop accepting new donations immediately. Its URL and any historical donations are unaffected.'
            : 'It will reappear on the public donate page and start accepting donations again.'
        }
        confirmLabel={confirmStatus?.nextStatus === 'inactive' ? 'Deactivate' : 'Reactivate'}
        danger={confirmStatus?.nextStatus === 'inactive'}
        onConfirm={confirmToggle}
        onCancel={() => setConfirmStatus(null)}
      />
    </div>
  );
}

export default function SchemesAdminPage() {
  return (
    <RequireAdminAuth>
      <SchemesAdminContent />
    </RequireAdminAuth>
  );
}
