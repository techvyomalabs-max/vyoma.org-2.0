'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Task 7K — stateful behavior for Header.jsx's mobile/tablet navigation
// panel, extracted into its own plain (JSX-free) hook specifically so it can
// be rendered and driven directly via lib/testSupport/reactTestEnv.mjs's
// renderHook() harness (see useMobileNav.test.mjs) — Header.jsx itself is a
// client component wired to Next.js routing and a modal context provider,
// which Header.a11y.test.mjs's own header comment already established isn't
// renderable in this project's test environment. Every other piece of
// Header's new mobile-nav JSX (the panel markup, aria wiring on individual
// elements, the accordion structure) is still covered the same way
// Header.a11y.test.mjs already covers the rest of Header.jsx: source-text
// assertions, in Header.mobileNav.test.mjs.
//
// `pathname` is passed in (from Header's own usePathname()) rather than
// read here, so this hook has zero dependency on Next.js routing itself and
// can be driven with a plain string in tests.
//
// Task 7K.1: standard list of natively-focusable element types for the
// manual Tab/Shift+Tab focus trap below — no focus-trap library is used
// (none was previously a dependency of this project, and plain DOM APIs are
// sufficient). Deliberately does NOT filter by visibility (e.g. no
// `offsetParent` check): a collapsed accordion submenu's <ul> is not merely
// hidden, it is not rendered into the DOM at all (see MobileNavItem in
// Header.jsx), so querySelectorAll run fresh on every Tab keypress already
// only ever finds elements that are genuinely visible and interactive right
// now — including correctly picking up/dropping a submenu's links the
// instant it expands or collapses. An `offsetParent`-based visibility check
// would also silently never match in jsdom (no layout engine), which would
// have made this untestable with this project's existing test harness.
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useMobileNav(pathname) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileOpenGroup, setMobileOpenGroup] = useState(null);
  const mobileToggleRef = useRef(null);
  const mobileCloseRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const wasMobileOpen = useRef(false);

  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    setMobileOpenGroup(null);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileOpen((o) => !o);
  }, []);

  // Closes the panel on every route change — covers browser back/forward
  // and any navigation that doesn't go through a link's own onClick (which
  // also calls closeMobileMenu directly, for the common case) — Header's
  // layout isn't remounted by App Router, so without this a panel opened on
  // one page would stay open after navigating to another.
  useEffect(() => {
    closeMobileMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally
    // keyed on pathname only; closeMobileMenu is stable (useCallback, no deps).
  }, [pathname]);

  // Escape-to-close, the Tab/Shift+Tab focus trap, background-scroll lock,
  // and initial focus into the panel — scoped to only run while open, and
  // unwound (including restoring the previous body overflow value, never a
  // hardcoded '') the instant it closes for any reason.
  useEffect(() => {
    if (!mobileOpen) return undefined;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        closeMobileMenu();
        return;
      }
      if (e.key !== 'Tab') return;

      const panel = mobilePanelRef.current;
      if (!panel) return;

      // Re-queried on every keypress (not cached at open time) specifically
      // so an accordion submenu that expands/collapses mid-session is
      // immediately reflected in where the trap wraps -- see
      // FOCUSABLE_SELECTOR's own comment above.
      const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const withinPanel = panel.contains(document.activeElement);

      if (e.shiftKey) {
        if (!withinPanel || document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (!withinPanel || document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileCloseRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen, closeMobileMenu]);

  // Returns focus to the hamburger toggle once the panel has actually
  // closed, so keyboard/screen-reader users land back where they opened it
  // from instead of focus silently falling back to <body>.
  useEffect(() => {
    if (wasMobileOpen.current && !mobileOpen) {
      mobileToggleRef.current?.focus();
    }
    wasMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  return {
    mobileOpen,
    mobileOpenGroup,
    setMobileOpenGroup,
    mobileToggleRef,
    mobileCloseRef,
    mobilePanelRef,
    toggleMobileMenu,
    closeMobileMenu,
  };
}
