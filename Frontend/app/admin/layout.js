import { AdminAuthProvider } from '@/lib/AdminAuthContext';
import { AdminShell } from '@/components/admin/AdminShell';
import { ToastProvider } from '@/components/admin/ui/Toast';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return (
    <AdminAuthProvider>
      <ToastProvider>
        <AdminShell>{children}</AdminShell>
      </ToastProvider>
    </AdminAuthProvider>
  );
}
