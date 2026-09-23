'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { SettingsForm } from '@/components/admin/settings/SettingsForm';

function SettingsPageContent() {
  const { apiFetch } = useAdminAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    apiFetch('/admin/settings')
      .then(setSettings)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiFetch]);

  const handleSave = async (body) => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiFetch('/admin/settings', { method: 'PUT', body });
      setSettings(updated);
      setNotice('Settings saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto mt-10 max-w-[700px] px-4 pb-16">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Settings</h1>
      {loading && <p className="font-sans text-sm text-charcoal/60">Loading…</p>}
      {error && <p className="mb-3 font-sans text-sm text-red-600">{error}</p>}
      {notice && <p className="mb-3 font-sans text-sm text-green-700">{notice}</p>}
      {!loading && settings && <SettingsForm initial={settings} onSave={handleSave} saving={saving} />}
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <RequireAdminAuth>
      <SettingsPageContent />
    </RequireAdminAuth>
  );
}
