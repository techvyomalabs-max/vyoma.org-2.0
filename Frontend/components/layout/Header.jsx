'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { NAV, CONTACT_LINK } from '@/lib/navConfig';
import { useMobileNav } from '@/lib/useMobileNav';
import { useModal } from './ModalProvider';

const MOBILE_NAV_PANEL_ID = 'mobile-nav-panel';

export function Header() {
  const pathname = usePathname();
  const { openDonate } = useModal();
  // Which parent's dropdown is open via the touch/keyboard disclosure control
  // (mouse hover keeps working independently of this — see NavItem). Only one
  // open at a time; reset on navigation so a stale open panel doesn't persist
  // across route changes (this layout isn't remounted by App Router).
  const [openItem, setOpenItem] = useState(null);

  useEffect(() => {
    setOpenItem(null);
  }, [pathname]);

  // Task 7K: the mobile nav panel's open/accordion state and its Escape-key,
  // scroll-lock, route-change, and focus-management behavior all live in
  // this shared, independently-tested hook (lib/useMobileNav.js) — kept
  // separate from the desktop hover/click dropdown state above so the two
  // interaction models (hover+click-toggle vs. tap-to-expand-accordion)
  // never interfere with each other, even though both read from the same
  // NAV data.
  const {
    mobileOpen,
    mobileOpenGroup,
    setMobileOpenGroup,
    mobileToggleRef,
    mobileCloseRef,
    mobilePanelRef,
    toggleMobileMenu,
    closeMobileMenu,
  } = useMobileNav(pathname);

  const isActive = (href) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav className="relative flex flex-col justify-center gap-2.5 bg-vyoma-blue px-8 py-4 border-b border-white/25">
      {/* Decorative cloud watermark — three layered puffs, matching the exact
          position/size/opacity of the approved design reference (see
          vyoma-org-design-system Vercel preview). The clipping wrapper is
          scoped to ONLY this layer (not `nav` itself) — the NavItem
          dropdowns below are also descendants of `nav` and are meant to
          extend past its bottom edge; clipping `nav` as a whole hid them.
          `alt=""` on each image already removes them from the accessibility
          tree (the standard WCAG technique for a purely decorative image);
          `aria-hidden` on the wrapper is redundant-but-conventional extra
          robustness, matching the same alt="" + aria-hidden pairing already
          used for the other purely decorative image in this codebase (the
          ActivityCard background icon, app/(public)/page.js) — one
          attribute here covers all three images at once rather than
          repeating it on each. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <Image src="/images/cloud-1.png" alt="" width={676} height={213} className="absolute" style={{ top: '-43px', left: '696px', opacity: 0.3 }} />
        <Image src="/images/cloud-2.png" alt="" width={726} height={166} className="absolute" style={{ top: '72px', left: '-147px', opacity: 0.32 }} />
        <Image src="/images/cloud-3.png" alt="" width={654} height={167} className="absolute" style={{ top: '0px', left: '66px', opacity: 0.28 }} />
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <Link href="/">
          <Image src="/images/logo-white.png" alt="Vyoma" width={208} height={101} className="h-[104px] w-auto" />
        </Link>
        {/* Desktop-only: unchanged from before Task 7K — same markup, same
            classes, now just explicitly hidden below the md breakpoint
            (matching the breakpoint components/admin/AdminShell.jsx already
            uses for its own desktop-sidebar/mobile-drawer split) instead of
            always rendering alongside the new mobile toggle below. */}
        <div className="hidden md:flex flex-wrap items-center justify-end gap-5">
          <SearchBox />
          <NavLink href={CONTACT_LINK.href} active={isActive(CONTACT_LINK.href)}>
            {CONTACT_LINK.label}
          </NavLink>
          <button
            onClick={openDonate}
            className="font-sans font-semibold text-base px-5 py-2 rounded-md border-[1.5px] border-white bg-transparent text-white cursor-pointer
              transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)]
              hover:bg-white hover:text-vyoma-blue"
          >
            Donate
          </button>
        </div>
        {/* Task 7K: mobile/tablet menu toggle — the only new element in the
            top row. Hidden at md and up, where the full desktop cluster
            above and the nav row below take over. */}
        <button
          ref={mobileToggleRef}
          type="button"
          onClick={toggleMobileMenu}
          aria-expanded={mobileOpen}
          aria-controls={MOBILE_NAV_PANEL_ID}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="flex items-center justify-center rounded-md p-2.5 text-white hover:bg-white/10 md:hidden"
        >
          {mobileOpen ? <CloseIcon className="h-6 w-6" /> : <MenuIcon className="h-6 w-6" />}
        </button>
      </div>
      {/* Desktop-only nav row — unchanged except for the added `hidden
          md:flex` (it was unconditional `flex` before). */}
      <div className="hidden md:flex relative z-10 items-center justify-end gap-7 flex-wrap">
        {NAV.map((item) => (
          <NavItem key={item.label} item={item} isActive={isActive} openItem={openItem} setOpenItem={setOpenItem} />
        ))}
      </div>

      {mobileOpen && (
        <MobileNavPanel
          panelId={MOBILE_NAV_PANEL_ID}
          isActive={isActive}
          openGroup={mobileOpenGroup}
          setOpenGroup={setMobileOpenGroup}
          onNavigate={closeMobileMenu}
          onClose={closeMobileMenu}
          closeButtonRef={mobileCloseRef}
          panelRef={mobilePanelRef}
          openDonate={openDonate}
        />
      )}
    </nav>
  );
}

// Task 7K: full-screen mobile/tablet navigation panel — reuses the exact
// same NAV/CONTACT_LINK data from lib/navConfig.js the desktop nav above
// already uses (no second navigation data source), rendered as a
// tap-to-expand accordion instead of desktop's hover+click dropdown, since
// hover has no equivalent on touch. Only ever mounted while `mobileOpen` is
// true (see the conditional render above) — Escape handling, the Tab/
// Shift+Tab focus trap (Task 7K.1), the background-scroll lock, and initial
// focus are all managed by useMobileNav.js via `panelRef`, so this component
// only needs to attach that ref to its own root and call `onClose`/
// `onNavigate` at the right moments.
function MobileNavPanel({ panelId, isActive, openGroup, setOpenGroup, onNavigate, onClose, closeButtonRef, panelRef, openDonate }) {
  return (
    <div ref={panelRef} id={panelId} role="dialog" aria-modal="true" aria-label="Site navigation" className="fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 max-h-screen overflow-y-auto bg-vyoma-blue px-6 pb-8 pt-4 shadow-hover">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/" onClick={onNavigate}>
            <Image src="/images/logo-white.png" alt="Vyoma" width={208} height={101} className="h-[64px] w-auto" />
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex items-center justify-center rounded-md p-2.5 text-white hover:bg-white/10"
          >
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>

        <ul className="flex flex-col gap-1">
          {NAV.map((item) => (
            <MobileNavItem
              key={item.label}
              item={item}
              isActive={isActive}
              openGroup={openGroup}
              setOpenGroup={setOpenGroup}
              onNavigate={onNavigate}
            />
          ))}
          <li className="mt-2 border-t border-white/20 pt-2">
            <Link
              href={CONTACT_LINK.href}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-3 font-sans text-[17px] ${
                isActive(CONTACT_LINK.href) ? 'font-bold text-white' : 'font-normal text-white/80'
              }`}
            >
              {CONTACT_LINK.label}
            </Link>
          </li>
          <li className="mt-2">
            <button
              type="button"
              onClick={() => {
                onNavigate();
                openDonate();
              }}
              className="w-full rounded-md border-[1.5px] border-white bg-transparent px-5 py-3 text-center font-sans text-base font-semibold text-white"
            >
              Donate
            </button>
          </li>
        </ul>

        <div className="mt-6">
          <SearchBox />
        </div>
      </div>
    </div>
  );
}

function MobileNavItem({ item, isActive, openGroup, setOpenGroup, onNavigate }) {
  const active = isActive(item.href) || item.children?.some((c) => isActive(c.href));
  const hasChildren = !!item.children;
  const isOpen = hasChildren && openGroup === item.label;
  const panelId = `mobile-subnav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <li>
      <div className="flex items-center justify-between">
        <Link
          href={item.href}
          onClick={onNavigate}
          className={`block flex-1 rounded-md px-3 py-3 font-sans text-[17px] ${
            active ? 'font-bold text-white' : 'font-normal text-white/80'
          }`}
        >
          {item.label}
        </Link>
        {hasChildren && (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${item.label} submenu`}
            onClick={() => setOpenGroup(isOpen ? null : item.label)}
            className="flex items-center justify-center p-3 text-white/70 hover:text-white"
          >
            <ChevronIcon className={`h-4 w-4 transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hasChildren && isOpen && (
        <ul id={panelId} className="ml-3 flex flex-col gap-0.5 border-l border-white/20 pl-3">
          {item.children.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                onClick={onNavigate}
                className={`block rounded-md px-3 py-2.5 font-sans text-base ${
                  isActive(c.href) ? 'font-bold text-white' : 'font-normal text-white/70'
                }`}
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function MenuIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function NavItem({ item, isActive, openItem, setOpenItem }) {
  const active = isActive(item.href) || item.children?.some((c) => isActive(c.href));
  const hasChildren = !!item.children;
  const isOpen = hasChildren && openItem === item.label;
  const dropdownId = `nav-dropdown-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div className="group relative">
      <span className="inline-flex items-center">
        <NavLink href={item.href} active={active}>
          {item.label}
        </NavLink>
        {hasChildren && (
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={dropdownId}
            aria-label={`${isOpen ? 'Close' : 'Open'} ${item.label} submenu`}
            onClick={() => setOpenItem(isOpen ? null : item.label)}
            className="ml-1.5 flex items-center justify-center p-2 text-white/70 hover:text-white"
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-[var(--duration-fast)] ${isOpen ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </span>
      {hasChildren && (
        <div
          id={dropdownId}
          className={
            isOpen
              ? 'absolute right-0 top-[calc(100%+10px)] z-30 min-w-[220px] rounded-sm bg-white py-2 shadow-hover transition-opacity duration-[var(--duration-fast)]'
              : 'invisible absolute right-0 top-[calc(100%+10px)] z-30 min-w-[220px] rounded-sm bg-white py-2 shadow-hover opacity-0 transition-opacity duration-[var(--duration-fast)] group-hover:visible group-hover:opacity-100'
          }
        >
          {item.children.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className={`block whitespace-nowrap px-4.5 py-2.5 font-sans text-base text-vyoma-blue ${
                isActive(c.href) ? 'font-bold' : 'font-normal'
              }`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NavLink({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`font-sans text-[17px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
        active ? 'font-bold text-white' : 'font-normal text-white/70 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

function SearchBox() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center">
      {open && (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => !value && setOpen(false)}
          placeholder="Search the site…"
          className="mr-2 w-[200px] rounded-md border border-white/40 bg-white/12 px-3 py-1.5 font-sans text-sm text-white outline-none placeholder:text-white/75"
        />
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label="Search" className="flex items-center p-1">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>
  );
}
