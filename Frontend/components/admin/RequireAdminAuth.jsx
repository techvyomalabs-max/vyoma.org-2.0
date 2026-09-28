'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';

// Client-side route guard for everything under /admin except /admin/login.
//
// There is deliberately no Next.js `middleware.js` doing this: the refresh
// cookie lives on the Backend's origin (localhost:4000), and Edge Middleware
// only sees cookies sent to the Frontend's own origin (localhost:3000) — a
// middleware.js checking `request.cookies` here would never see it and would
// always redirect to login, authenticated or not. The real signal is
// AdminAuthProvider's silent /auth/refresh call on load, which correctly
// reaches the Backend with `credentials: 'include'`. This component just
// reacts to that result.
export function RequireAdminAuth({ children }) {
  const { status } = useAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/admin/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <div className="px-8 py-16 text-center font-sans text-charcoal">Checking session…</div>;
  }
  if (status !== 'authenticated') {
    return null; // redirect effect above is in flight
  }
  return children;
}
