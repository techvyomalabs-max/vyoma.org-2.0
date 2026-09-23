'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';

function DashboardContent() {
  const { user, logout, apiFetch } = useAdminAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    apiFetch('/auth/me').then(setMe).catch(() => {});
  }, [apiFetch]);

  return (
    <div className="mx-auto mt-16 max-w-lg px-4">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Admin dashboard</h1>
      <p className="mb-2 font-sans text-charcoal">
        Signed in as <strong>{user?.name}</strong> ({user?.email})
      </p>
      <p className="mb-6 font-sans text-charcoal">
        Role: {user?.roleKey}
        {me?.mfaEnabled ? ' · MFA enabled' : ''}
      </p>
      <button
        onClick={logout}
        className="rounded-md border border-vyoma-blue px-4 py-2 font-sans font-semibold text-vyoma-blue"
      >
        Log out
      </button>
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
