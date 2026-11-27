'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { NAV, CONTACT_LINK } from '@/lib/navConfig';
import { useMobileNav } from '@/lib/useMobileNav';
import { useModal } from './ModalProvider';
import { isRouteActive, getActiveSubmenuHref } from './navActiveLogic.mjs';

const MOBILE_NAV_PANEL_ID = 'mobile-nav-panel';

export function Header() {
  const pathname = usePathname();
  const { openDonate } = useModal();
  // Which desktop dropdown is open -- the single shared source of truth for
  // both click (the trigger button) and hover (onMouseEnter) in NavItem, so
  // only one dropdown can ever be open at a time, however it was opened.
  // Only one open at a time; reset on navigation so a stale open panel
  // doesn't persist across route changes (this layout isn't remounted by
  // App Router).
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

  // Group-level ("is any page in this whole section active," used only to
  // bold a top-level label like "About") -- unchanged in meaning, now
  // segment-aware (navActiveLogic.mjs) so it can never be fooled by a bare
  // string-prefix collision between unrelated routes.
  const isActive = (href) => isRouteActive(pathname, href);
  // Submenu-level: given the hrefs actually rendered inside one dropdown,
  // picks the single most specific (longest) one that's active for the
  // current page -- see navActiveLogic.mjs's own header comment for why
  // this (not isActive() per link) is what fixes the duplicate-highlight
  // bug.
  const activeSubmenuHref = (candidates) => getActiveSubmenuHref(pathname, candidates);

  // QA Bug 6: desktop dropdown overlap/close handling. A single shared
  // `openItem` (above) is already the one source of truth for which
  // dropdown is open -- this effect adds the two close conditions that
  // were previously missing entirely for the desktop dropdown (confirmed
  // by investigation: no outside-click/Escape handling existed here
  // before, only useMobileNav.js's own, unrelated handling for the mobile
  // panel). `mousedown` (not `click`) is used for the outside-click
  // check, the conventional choice for this pattern -- it only ever acts
  // when the target is outside the whole desktop nav row (`navRowRef`),
  // so it never races with an in-row click's own onClick (which handles
  // toggling/closing that specific item itself, via normal event bubbling
  // up through React's delegated handlers before this listener runs).
  // Scoped to `if (!openItem) return` exactly like useMobileNav.js's own
  // Escape effect, so no listener is ever attached while nothing is open,
  // and it only ever touches `openItem` -- never `mobileOpen` or
  // SearchBox's own state -- so it cannot interfere with the mobile menu
  // or search input.
  const navRowRef = useRef(null);

  useEffect(() => {
    if (!openItem) return undefined;

    function handleOutsideClick(e) {
      if (!navRowRef.current?.contains(e.target)) {
        setOpenItem(null);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpenItem(null);
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openItem]);

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
      <div ref={navRowRef} className="hidden md:flex relative z-10 items-center justify-end gap-7 flex-wrap">
        {NAV.map((item) => (
          <NavItem
            key={item.label}
            item={item}
            isActive={isActive}
            activeSubmenuHref={activeSubmenuHref}
            openItem={openItem}
            setOpenItem={setOpenItem}
          />
        ))}
      </div>

      {mobileOpen && (
        <MobileNavPanel
          panelId={MOBILE_NAV_PANEL_ID}
          isActive={isActive}
          activeSubmenuHref={activeSubmenuHref}
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
function MobileNavPanel({ panelId, isActive, activeSubmenuHref, openGroup, setOpenGroup, onNavigate, onClose, closeButtonRef, panelRef, openDonate }) {
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
              activeSubmenuHref={activeSubmenuHref}
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
          <SearchBox onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

function MobileNavItem({ item, isActive, activeSubmenuHref, openGroup, setOpenGroup, onNavigate }) {
  const active = isActive(item.href) || item.children?.some((c) => isActive(c.href));
  const hasChildren = !!item.children;
  const isOpen = hasChildren && openGroup === item.label;
  const panelId = `mobile-subnav-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // Mobile never renders a separate "Overview" link (unlike desktop's
  // NavItem below) -- its rendered candidates are exactly item.children's
  // own hrefs. Our Work's "Seven Schools" child (href === item.href) is the
  // one case this still matters for on mobile; see navActiveLogic.mjs.
  const activeChildHref = hasChildren ? activeSubmenuHref(item.children.map((c) => c.href)) : null;

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
                  activeChildHref === c.href ? 'font-bold text-white' : 'font-normal text-white/70'
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

// QA Bug 6: desktop dropdown usability/overlap fix.
//
// Items without children are completely unchanged -- a plain NavLink.
//
// For items with children, text and arrow are now one single, accessible
// <button> (never two separate controls, and never a nested button) that
// toggles the shared `openItem` state -- clicking it, pressing Enter/Space
// while focused on it, or clicking it again while open all behave exactly
// the same way text and arrow clicks always did for the arrow alone.
// Hovering the whole trigger+panel area (`onMouseEnter` on this component's
// own wrapper) sets the SAME shared `openItem` to this item -- since it's
// a single shared value, opening any one item via hover or click always
// implicitly closes whichever other item was open, by construction, with
// no independent per-item CSS `group-hover` state left to ever disagree
// with it (removed entirely -- visibility is driven only by `isOpen` now).
//
// Deliberately no `onMouseLeave`-driven auto-close: moving the pointer
// away from an open dropdown (without clicking elsewhere, pressing
// Escape, or hovering a different item) is not one of the required close
// conditions, and omitting it removes any chance of a hover-vs-click race
// or flicker -- there is nothing for a click's own state update to be
// "undone" by, since leaving never changes `openItem` on its own.
function NavItem({ item, isActive, activeSubmenuHref, openItem, setOpenItem }) {
  const active = isActive(item.href) || item.children?.some((c) => isActive(c.href));
  const hasChildren = !!item.children;

  if (!hasChildren) {
    return (
      <NavLink href={item.href} active={active}>
        {item.label}
      </NavLink>
    );
  }

  const isOpen = openItem === item.label;
  const dropdownId = `nav-dropdown-${item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  // Parent-page preservation: only "Our Work" already has its own href
  // among its children (Seven Schools -> /our-work) -- confirmed by
  // reading lib/navConfig.js, not assumed. Every other dropdown parent's
  // own page would otherwise become unreachable once its label stops
  // navigating directly, so an extra "<Label> Overview" entry is added
  // for exactly those, reusing the parent's own already-defined href --
  // never an invented route, and never added where it would duplicate an
  // existing equivalent destination.
  const parentAlreadyLinked = item.children.some((c) => c.href === item.href);
  // The actual set of hrefs this dropdown renders: the synthetic Overview
  // link (only when the parent isn't already one of the real children), plus
  // every real child -- the exact candidate list navActiveLogic.mjs's
  // getActiveSubmenuHref() needs to pick the single most specific match
  // from, instead of each link independently re-checking isActive() (the
  // root cause of the duplicate-highlight bug: the Overview/parent href is
  // always a path-prefix of every sibling child route).
  const submenuCandidates = [...(parentAlreadyLinked ? [] : [item.href]), ...item.children.map((c) => c.href)];
  const activeHref = activeSubmenuHref(submenuCandidates);

  return (
    <div className="relative" onMouseEnter={() => setOpenItem(item.label)}>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={dropdownId}
        onClick={() => setOpenItem(isOpen ? null : item.label)}
        className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0"
      >
        <span
          className={`font-sans text-[17px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
            active ? 'font-bold text-white' : 'font-normal text-white/90 hover:text-white'
          }`}
        >
          {item.label}
        </span>
      </button>
      <div
        id={dropdownId}
        className={
          isOpen
            ? 'absolute right-0 top-[calc(100%+10px)] z-30 min-w-[220px] rounded-sm bg-white py-2 shadow-hover transition-opacity duration-[var(--duration-fast)]'
            : 'invisible absolute right-0 top-[calc(100%+10px)] z-30 min-w-[220px] rounded-sm bg-white py-2 shadow-hover opacity-0 transition-opacity duration-[var(--duration-fast)]'
        }
      >
        {!parentAlreadyLinked && (
          <Link
            href={item.href}
            onClick={() => setOpenItem(null)}
            className={`block whitespace-nowrap px-4.5 py-2.5 font-sans text-base text-vyoma-blue ${
              activeHref === item.href ? 'font-bold' : 'font-normal'
            }`}
          >
            {item.label} Overview
          </Link>
        )}
        {item.children.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            onClick={() => setOpenItem(null)}
            className={`block whitespace-nowrap px-4.5 py-2.5 font-sans text-base text-vyoma-blue ${
              activeHref === c.href ? 'font-bold' : 'font-normal'
            }`}
          >
            {c.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function NavLink({ href, active, children }) {
  return (
    <Link
      href={href}
      className={`font-sans text-[17px] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] ${
        // Task 7D.12 (A11Y-01/A11Y-02): text-white/70 measured 3.86:1 against
        // the header's solid vyoma-blue background (axe-core, WCAG AA
        // requires 4.5:1 for this font size/weight) -- /90 clears it with
        // margin while staying visibly "muted" relative to the active link.
        active ? 'font-bold text-white' : 'font-normal text-white/90 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

// QA Bug 5, Stage 5: wires this previously-inert toggle up to the real
// /search?q=<query> results page (Stage 4) -- Enter and clicking the icon
// while already open (with a non-empty keyword) both submit the same way,
// via one shared submit() function, so desktop and mobile (both of which
// render this exact function, never a second copy) behave identically
// with no duplicated logic.
// `onNavigate` is optional -- the desktop call site passes none (there is
// no menu to close there), so it only ever does anything at the mobile
// call site inside MobileNavPanel, which already has `closeMobileMenu`
// available as its own `onNavigate` prop. Mirrors the exact pattern every
// other interactive element inside MobileNavPanel already uses (every
// link, the Donate button) to close the menu explicitly and synchronously
// on its own action, rather than relying solely on useMobileNav.js's
// indirect, pathname-change-triggered close effect.
function SearchBox({ onNavigate } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  // A ref, not state -- tracking the last-submitted value/time causes no
  // re-render and leaves no visible "stale" UI of its own. Only absorbs an
  // accidental, near-instant repeat (held-Enter key-repeat, a rapid double
  // click) within a short window; a deliberate repeat search of the exact
  // same keyword a moment later is never permanently blocked, since the
  // window expires on its own.
  const lastSubmitRef = useRef({ value: '', time: 0 });

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const now = Date.now();
    const last = lastSubmitRef.current;
    if (trimmed === last.value && now - last.time < 1000) return;
    lastSubmitRef.current = { value: trimmed, time: now };
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    // Only reached on an actual navigation -- both early returns above
    // (empty, and the near-instant duplicate) skip this, so neither ever
    // clears or closes the input unexpectedly.
    setValue('');
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div className="flex items-center">
      {open && (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          onBlur={() => !value && setOpen(false)}
          aria-label="Search the site"
          placeholder="Search the site…"
          className="mr-2 w-[200px] rounded-md border border-white/40 bg-white/12 px-3 py-1.5 font-sans text-sm text-white outline-none placeholder:text-white/75"
        />
      )}
      <button
        onClick={() => {
          if (open && value.trim()) submit();
          else setOpen((o) => !o);
        }}
        aria-label="Search"
        className="flex items-center p-1"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>
  );
}
