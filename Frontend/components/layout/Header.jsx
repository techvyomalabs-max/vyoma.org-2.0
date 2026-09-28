'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { NAV, CONTACT_LINK } from '@/lib/navConfig';
import { useModal } from './ModalProvider';

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

  const isActive = (href) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav className="relative flex flex-col justify-center gap-2.5 bg-vyoma-blue px-8 py-4 border-b border-white/25">
      {/* Decorative cloud watermark — three layered puffs, matching the exact
          position/size/opacity of the approved design reference (see
          vyoma-org-design-system Vercel preview). The clipping wrapper is
          scoped to ONLY this layer (not `nav` itself) — the NavItem
          dropdowns below are also descendants of `nav` and are meant to
          extend past its bottom edge; clipping `nav` as a whole hid them. */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <Image src="/images/cloud-1.png" alt="" width={676} height={213} className="absolute" style={{ top: '-43px', left: '696px', opacity: 0.3 }} />
        <Image src="/images/cloud-2.png" alt="" width={726} height={166} className="absolute" style={{ top: '72px', left: '-147px', opacity: 0.32 }} />
        <Image src="/images/cloud-3.png" alt="" width={654} height={167} className="absolute" style={{ top: '0px', left: '66px', opacity: 0.28 }} />
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <Link href="/">
          <Image src="/images/logo-white.png" alt="Vyoma" width={208} height={101} className="h-[104px] w-auto" />
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-5">
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
      </div>
      <div className="relative z-10 flex items-center justify-end gap-7 flex-wrap">
        {NAV.map((item) => (
          <NavItem key={item.label} item={item} isActive={isActive} openItem={openItem} setOpenItem={setOpenItem} />
        ))}
      </div>
    </nav>
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
