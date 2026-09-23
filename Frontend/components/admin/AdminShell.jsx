'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/lib/AdminAuthContext';

function DashboardIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ContentIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M5 2.5h7l3 3v12a.5.5 0 0 1-.5.5h-9.5a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M7 9h6M7 12.5h6M7 16h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function FormsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="2" width="6" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9.5h6M7 13h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MediaIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3.5 14.5 8 10l2.5 2.5L14 9l2.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 5h9M15 5h2M3 10h2M8 10h9M3 15h9M15 15h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="5" cy="10" r="1.6" fill="currentColor" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" />
    </svg>
  );
}

// Week 4 Decision W4-5: Users/Audit Logs/Donations/Redirects have working
// backend APIs but no UI yet — omitted on purpose, not an oversight, so
// nothing here points at a page that 404s. Media added Week 5 (metadata +
// upload UI; real storage still gated on AWS_* — see media.admin.controller.js).
const LINKS = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/admin/content', label: 'Content', Icon: ContentIcon },
  { href: '/admin/media', label: 'Media', Icon: MediaIcon },
  { href: '/admin/forms', label: 'Forms', Icon: FormsIcon },
  { href: '/admin/settings', label: 'Settings', Icon: SettingsIcon },
];

// WordPress-admin-style shell: slim top bar for site identity/session info,
// a dark left sidebar with icon+label navigation, content to the right —
// replacing the earlier top-nav-bar layout at the user's request.
export function AdminShell({ children }) {
  const { status, user, logout } = useAdminAuth();
  const pathname = usePathname();

  // No shell on the login page or during the loading/unauthenticated states —
  // this naturally covers /admin/login with no path-based special-casing,
  // same as the top-nav version this replaces.
  if (status !== 'authenticated') return children;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between bg-charcoal px-4">
        <span className="font-sans text-sm font-semibold text-white">Vyoma Admin</span>
        <div className="flex items-center gap-3">
          <span className="hidden font-sans text-xs text-white/80 sm:inline">
            {user?.name} <span className="text-white/50">({user?.roleKey})</span>
          </span>
          <button
            onClick={logout}
            className="rounded border border-white/30 px-2.5 py-1 font-sans text-xs font-semibold text-white hover:bg-white/10"
          >
            Log out
          </button>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-56 shrink-0 bg-charcoal py-3">
          <nav className="flex flex-col gap-0.5 px-2">
            {LINKS.map(({ href, label, Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm font-medium transition-colors ${
                    active ? 'bg-vyoma-blue text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 bg-white">{children}</main>
      </div>
    </div>
  );
}
