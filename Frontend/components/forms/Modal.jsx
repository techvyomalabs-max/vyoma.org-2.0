'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ open, title, onClose, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  // Escape-to-dismiss: expected behavior for any dialog (WCAG dialog
  // pattern), and there was previously no keyboard way to close this at all
  // — backdrop click and the X button both require a pointer.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // Baseline focus management: without this, opening the dialog left focus
  // on whatever triggered it (background page content stayed reachable by
  // Tab while the overlay was up) and closing it dropped focus back to the
  // top of the document instead of where the user actually was. Move focus
  // into the dialog on open, trap Tab/Shift+Tab within it (the standard
  // WCAG dialog pattern), and restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement;
    const dialogEl = dialogRef.current;
    const focusables = dialogEl ? [...dialogEl.querySelectorAll(FOCUSABLE_SELECTOR)] : [];
    (focusables[0] || dialogEl)?.focus();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab' || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocusedRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/55 p-5"
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-[440px] rounded-lg bg-white p-8 font-sans shadow-hover"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 border-none bg-transparent text-xl leading-none text-charcoal cursor-pointer"
        >
          ×
        </button>
        <h3 id={titleId} className="text-h3 font-bold text-vyoma-blue mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}
