'use client';

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';

function DashboardContent() {
  const { user, apiFetch } = useAdminAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    apiFetch('/auth/me').then(setMe).catch(() => {});
  }, [apiFetch]);

  return (
    <div className="mx-auto mt-10 max-w-lg px-4">
      <h1 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Admin dashboard</h1>
      <p className="mb-2 font-sans text-charcoal">
        Signed in as <strong>{user?.name}</strong> ({user?.email})
      </p>
      <p className="font-sans text-charcoal">
        Role: {user?.roleKey}
        {me?.mfaEnabled ? ' · MFA enabled' : ''}
      </p>
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
