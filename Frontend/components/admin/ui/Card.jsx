'use client';

export function Card({ title, children, className = '' }) {
  return (
    <div className={`rounded-md border border-[var(--border-subtle)] bg-white p-4 ${className}`}>
      {title && <h2 className="mb-3 font-sans text-sm font-bold text-charcoal">{title}</h2>}
      {children}
    </div>
  );
}
