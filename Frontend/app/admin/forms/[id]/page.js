'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { SubmissionDetail } from '@/components/admin/forms/SubmissionDetail';

function SubmissionDetailContent() {
  const { apiFetch } = useAdminAuth();
  const params = useParams();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/admin/forms/${params.id}`)
      .then(setSubmission)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiFetch, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpdate = async (body) => {
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/admin/forms/${params.id}`, { method: 'PATCH', body });
      setNotice('Saved.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-[700px] px-4">
      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="mb-3 font-sans text-sm text-red-600">{error}</p>}
      {notice && <p className="mb-3 font-sans text-sm text-green-700">{notice}</p>}
      {!loading && submission && <SubmissionDetail submission={submission} onUpdate={handleUpdate} saving={saving} />}
    </div>
  );
}

export default function AdminFormSubmissionPage() {
  return (
    <RequireAdminAuth>
      <SubmissionDetailContent />
    </RequireAdminAuth>
  );
}
