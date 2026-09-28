'use client';

import { useEffect, useId } from 'react';

export function Modal({ open, title, onClose, children }) {
  const titleId = useId();

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

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/55 p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
