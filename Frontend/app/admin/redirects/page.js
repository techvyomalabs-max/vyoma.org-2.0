'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { useToast } from '@/components/admin/ui/Toast';
import { StateBlock } from '@/components/admin/ui/StateBlock';
import { Pagination } from '@/components/admin/ui/Pagination';
import { ConfirmDialog } from '@/components/admin/ui/ConfirmDialog';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';
const LIMIT = 25;

function validateClientSide(fromPath, toPath) {
  if (!fromPath.trim() || !fromPath.trim().startsWith('/')) return 'fromPath must start with "/".';
  if (!toPath.trim()) return 'toPath is required.';
  if (!toPath.trim().startsWith('/') && !/^https?:\/\//i.test(toPath.trim())) {
    return 'toPath must start with "/" or be an absolute http(s) URL.';
  }
  if (fromPath.trim() === toPath.trim()) return 'fromPath and toPath cannot be the same path.';
  return null;
}

// Phase F, D-F8: this is a best-effort UX warning only — the backend is the
// authoritative check (redirects.controller.js's assertNoLoop), which also
// catches cases this simple client-side pass can't see (e.g. a loop formed
// against a redirect not on the currently-loaded page).
function findClientSideLoopWarning(fromPath, toPath, existing, excludeId) {
  const reverse = existing.find((r) => r._id !== excludeId && r.fromPath === toPath.trim() && r.toPath === fromPath.trim());
  if (reverse) return `Warning: an existing redirect already sends "${toPath.trim()}" → "${fromPath.trim()}" — this would form a loop.`;
  return null;
}

function RedirectRow({ redirect, onSave, onDelete, busy, existing }) {
  const [fromPath, setFromPath] = useState(redirect.fromPath);
  const [toPath, setToPath] = useState(redirect.toPath);
  const [statusCode, setStatusCode] = useState(redirect.statusCode);
  const [notes, setNotes] = useState(redirect.notes || '');
  const [fieldError, setFieldError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const dirty = fromPath !== redirect.fromPath || toPath !== redirect.toPath || statusCode !== redirect.statusCode || (notes || null) !== redirect.notes;

  const handleSave = () => {
    const clientError = validateClientSide(fromPath, toPath);
    if (clientError) return setFieldError(clientError);
    const warning = findClientSideLoopWarning(fromPath, toPath, existing, redirect._id);
    if (warning && !window.confirm(`${warning}\n\nSave anyway? (the server will reject it if it's really a loop)`)) return;
    setFieldError(null);
    onSave(redirect._id, { fromPath: fromPath.trim(), toPath: toPath.trim(), statusCode, notes: notes.trim() || null });
  };

  return (
    <div className="rounded-md border border-[var(--border-subtle)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_90px]">
        <input type="text" value={fromPath} onChange={(e) => setFromPath(e.target.value)} placeholder="/old-path" className={inputClass} />
        <input type="text" value={toPath} onChange={(e) => setToPath(e.target.value)} placeholder="/new-path or https://…" className={inputClass} />
        <select value={statusCode} onChange={(e) => setStatusCode(Number(e.target.value))} className={inputClass}>
          <option value={301}>301</option>
          <option value={302}>302</option>
        </select>
      </div>
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className={`mt-2 ${inputClass}`}
      />
      {fieldError && <p className="mt-1 font-sans text-xs text-red-600">{fieldError}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={handleSave}
          className="rounded-md bg-vyoma-blue px-3 py-1.5 font-sans text-xs font-semibold text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          className="rounded-md border border-red-300 px-3 py-1.5 font-sans text-xs font-semibold text-red-600 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this redirect?"
        message={`"${redirect.fromPath}" → "${redirect.toPath}" will be permanently deleted. This cannot be undone, and only this one redirect is affected.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(redirect._id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function RedirectsContent() {
  const { apiFetch, apiFetchWithMeta } = useAdminAuth();
  const toast = useToast();
  const [redirects, setRedirects] = useState(null);
  const [meta, setMeta] = useState({ page: 1, limit: LIMIT, total: 0 });
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [newRedirect, setNewRedirect] = useState({ fromPath: '', toPath: '', statusCode: 301, notes: '' });
  const [newError, setNewError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      try {
        const { data, meta: m } = await apiFetchWithMeta(`/admin/redirects?page=${page}&limit=${LIMIT}`);
        setRedirects(data);
        setMeta(m);
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    },
    [apiFetchWithMeta]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const handleSave = async (id, patch) => {
    setBusyId(id);
    try {
      await apiFetch(`/admin/redirects/${id}`, { method: 'PATCH', body: patch });
      toast.success('Redirect updated.');
      load(meta.page);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id) => {
    setBusyId(id);
    try {
      await apiFetch(`/admin/redirects/${id}`, { method: 'DELETE' });
      toast.success('Redirect deleted.');
      load(meta.page);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const clientError = validateClientSide(newRedirect.fromPath, newRedirect.toPath);
    if (clientError) return setNewError(clientError);
    const warning = findClientSideLoopWarning(newRedirect.fromPath, newRedirect.toPath, redirects || [], null);
    if (warning && !window.confirm(`${warning}\n\nSave anyway? (the server will reject it if it's really a loop)`)) return;
    setNewError(null);
    setCreating(true);
    try {
      await apiFetch('/admin/redirects', {
        method: 'POST',
        body: { ...newRedirect, fromPath: newRedirect.fromPath.trim(), toPath: newRedirect.toPath.trim(), notes: newRedirect.notes.trim() || null },
      });
      toast.success('Redirect created.');
      setNewRedirect({ fromPath: '', toPath: '', statusCode: 301, notes: '' });
      load(1);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-[900px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">Redirects</h1>
      <p className="mb-4 font-sans text-sm text-charcoal/60">
        Exact-path matches only (no wildcards). The server rejects a redirect that points a path to itself, or that
        would form a two-rule loop with an existing redirect. Deleting a redirect is permanent and affects only that
        one rule — there is no bulk delete.
      </p>

      <StateBlock loading={!redirects && !error} error={error} empty={redirects && !redirects.length} emptyMessage="No redirects yet.">
        <div className="flex flex-col gap-3">
          {redirects?.map((r) => (
            <RedirectRow key={r._id} redirect={r} onSave={handleSave} onDelete={handleDelete} busy={busyId === r._id} existing={redirects} />
          ))}
        </div>
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onPageChange={load} />
      </StateBlock>

      <form onSubmit={handleCreate} className="mt-6 rounded-md border border-vyoma-blue p-4">
        <h2 className="mb-3 font-sans text-sm font-bold text-vyoma-blue">Add a new redirect</h2>
        <div className="mb-2 grid gap-2 sm:grid-cols-[1fr_1fr_90px]">
          <input
            type="text"
            value={newRedirect.fromPath}
            onChange={(e) => setNewRedirect((s) => ({ ...s, fromPath: e.target.value }))}
            placeholder="/old-path"
            required
            className={inputClass}
          />
          <input
            type="text"
            value={newRedirect.toPath}
            onChange={(e) => setNewRedirect((s) => ({ ...s, toPath: e.target.value }))}
            placeholder="/new-path or https://…"
            required
            className={inputClass}
          />
          <select
            value={newRedirect.statusCode}
            onChange={(e) => setNewRedirect((s) => ({ ...s, statusCode: Number(e.target.value) }))}
            className={inputClass}
          >
            <option value={301}>301</option>
            <option value={302}>302</option>
          </select>
        </div>
        <input
          type="text"
          value={newRedirect.notes}
          onChange={(e) => setNewRedirect((s) => ({ ...s, notes: e.target.value }))}
          placeholder="Notes (optional)"
          className={`mb-2 ${inputClass}`}
        />
        {newError && <p className="mb-2 font-sans text-xs text-red-600">{newError}</p>}
        <button type="submit" disabled={creating} className="rounded-md bg-vyoma-blue px-4 py-2 font-sans text-sm font-semibold text-white disabled:opacity-60">
          {creating ? 'Creating…' : 'Create redirect'}
        </button>
      </form>
    </div>
  );
}

export default function RedirectsPage() {
  return (
    <RequireAdminAuth>
      <RedirectsContent />
    </RequireAdminAuth>
  );
}
