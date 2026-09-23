'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';

// Week 4 Decision W4-5: exactly these four links. Users/Audit Logs/
// Donations/Redirects have working backend APIs but no UI yet — omitted on
// purpose, not an oversight, so nothing here points at a page that 404s.
const LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/forms', label: 'Forms' },
  { href: '/admin/settings', label: 'Settings' },
];

export function AdminNav() {
  const { status, user, logout } = useAdminAuth();
  const pathname = usePathname();

  // Hidden whenever there's no authenticated session — this naturally
  // covers the login page (never authenticated there) and the brief
  // loading/unauthenticated states, with no path-based special-casing.
  if (status !== 'authenticated') return null;

  return (
    <nav className="border-b border-[var(--border-subtle)] bg-white">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-2 font-sans text-sm font-semibold ${
                  active ? 'bg-vyoma-blue text-white' : 'text-vyoma-blue hover:bg-sky-mist'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-3 font-sans text-sm text-charcoal">
          <span className="hidden sm:inline">
            {user?.name} <span className="text-charcoal/60">({user?.roleKey})</span>
          </span>
          <button
            onClick={logout}
            className="rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  );
}
