'use client';

import { useState } from 'react';
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

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M7 5l6 5-6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MenuIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Target information architecture (per the approved CMS redesign): "Website
// Content" is its own group, grouped by public page, kept visually separate
// from operational admin areas. Right now it holds only the legacy generic
// content editor, since no page has a structured editor yet (Phase B+) — it
// stays here, not hidden, because until Phase B ships it is the ONLY way to
// edit content, not yet a "fallback." `roles` (omitted = visible to every
// authenticated role) is read but nothing currently needs it — ready for
// Phase F's Users/Audit Logs additions without another shell rewrite.
const NAV = [
  { type: 'link', href: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  {
    type: 'group',
    key: 'website-content',
    label: 'Website Content',
    Icon: ContentIcon,
    items: [
      { href: '/admin/content/home', label: 'Home' },
      { href: '/admin/content', label: 'All other pages (legacy editor)' },
    ],
  },
  { type: 'link', href: '/admin/media', label: 'Media', Icon: MediaIcon },
  { type: 'link', href: '/admin/forms', label: 'Forms', Icon: FormsIcon },
  { type: 'link', href: '/admin/settings', label: 'Settings', Icon: SettingsIcon },
];

function isActive(pathname, href) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ href, label, Icon, active, onNavigate }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm font-medium transition-colors ${
        active ? 'bg-vyoma-blue text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
      }`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      {label}
    </Link>
  );
}

function NavGroup({ group, pathname, onNavigate }) {
  const groupActive = group.items.some((item) => isActive(pathname, item.href));
  const [open, setOpen] = useState(true); // default-expanded — currently the only group, and small

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 font-sans text-sm font-medium ${
          groupActive ? 'text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
        }`}
      >
        <group.Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 flex flex-col gap-0.5 border-l border-white/10 pl-3">
          {group.items.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNav({ pathname, user, onNavigate }) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {NAV.filter((entry) => !entry.roles || entry.roles.includes(user?.roleKey)).map((entry) =>
        entry.type === 'group' ? (
          <NavGroup key={entry.key} group={entry} pathname={pathname} onNavigate={onNavigate} />
        ) : (
          <NavLink key={entry.href} href={entry.href} label={entry.label} Icon={entry.Icon} active={isActive(pathname, entry.href)} onNavigate={onNavigate} />
        )
      )}
    </nav>
  );
}

// WordPress-admin-style shell: slim top bar for site identity/session info, a
// dark left sidebar (collapsible groups, role-filtered) with icon+label
// navigation, content to the right. Below `md` the sidebar becomes a
// slide-out drawer behind a hamburger button — there was no mobile handling
// at all before this pass.
export function AdminShell({ children }) {
  const { status, user, logout } = useAdminAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // No shell on the login page or during the loading/unauthenticated states —
  // this naturally covers /admin/login with no path-based special-casing.
  if (status !== 'authenticated') return children;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-11 shrink-0 items-center justify-between bg-charcoal px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="rounded p-1 text-white md:hidden"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="font-sans text-sm font-semibold text-white">Vyoma Admin</span>
        </div>
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
        {/* Desktop sidebar */}
        <aside className="hidden w-56 shrink-0 overflow-y-auto bg-charcoal py-3 md:block">
          <SidebarNav pathname={pathname} user={user} />
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-charcoal py-3 shadow-xl">
              <SidebarNav pathname={pathname} user={user} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 bg-white">{children}</main>
      </div>
    </div>
  );
}
