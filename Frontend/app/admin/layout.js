import { AdminAuthProvider } from '@/lib/AdminAuthContext';
import { AdminNav } from '@/components/admin/AdminNav';

export const metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return (
    <AdminAuthProvider>
      <AdminNav />
      {children}
    </AdminAuthProvider>
  );
}
