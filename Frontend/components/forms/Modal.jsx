'use client';

export function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-charcoal/55 p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[440px] rounded-lg bg-white p-8 font-sans shadow-hover"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 border-none bg-transparent text-xl leading-none text-charcoal cursor-pointer"
        >
          ×
        </button>
        <h3 className="text-h3 font-bold text-vyoma-blue mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}
