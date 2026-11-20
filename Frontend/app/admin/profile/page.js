'use client';

import { useAdminAuth } from '@/lib/AdminAuthContext';
import { RequireAdminAuth } from '@/components/admin/RequireAdminAuth';
import { ChangePasswordForm } from '@/components/admin/profile/ChangePasswordForm';

// Task 7D.6 — a minimal account page for the currently signed-in admin.
// There was no existing Profile/Account Settings/Security section (the
// existing /admin/settings page is site-wide organizational settings, not
// per-user account settings — a distinct, unrelated page left untouched).
// Accessible to both Admin and Super Admin (no `roles` restriction, matching
// AdminShell's NAV entry for this page) since changing one's own password is
// not a privileged action.
function ProfilePageContent() {
  const { user } = useAdminAuth();

  return (
    <div className="mx-auto mt-10 max-w-[700px] px-4 pb-16">
      <h1 className="mb-1 font-sans text-h2 font-bold text-vyoma-blue">My Profile</h1>
      <p className="mb-6 font-sans text-sm text-charcoal/70">
        {user?.name} &middot; {user?.email} &middot; <span className="capitalize">{user?.roleKey?.replace('_', ' ')}</span>
      </p>
      <ChangePasswordForm />
    </div>
  );
}

export default function AdminProfilePage() {
  return (
    <RequireAdminAuth>
      <ProfilePageContent />
    </RequireAdminAuth>
  );
}
