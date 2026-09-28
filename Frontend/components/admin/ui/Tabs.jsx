'use client';

// Used to switch between a page-type's sections inside one structured editor
// (e.g. Website Content -> Home -> Hero / Statistics / Topics / ...) —
// Phase B's primary navigation within a page, not a global nav element.
export function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--border-subtle)]">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`-mb-px rounded-t-md border-b-2 px-3.5 py-2 font-sans text-sm font-semibold ${
            active === tab.key
              ? 'border-vyoma-blue text-vyoma-blue'
              : 'border-transparent text-charcoal/60 hover:text-charcoal'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
