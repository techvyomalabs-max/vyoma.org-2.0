'use client';

// EVENT_CATEGORIES is a plain array of strings (the filter chips on
// /media/events), unlike every other media section here — not an
// array-of-objects, so this is a small dedicated list editor rather than
// RepeatableList (which expects object items with an itemLabel).
const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

export function EventCategoriesForm({ value, onChange }) {
  const categories = value || [];

  const update = (i, next) => {
    const copy = [...categories];
    copy[i] = next;
    onChange(copy);
  };
  const remove = (i) => onChange(categories.filter((_, idx) => idx !== i));
  const add = () => onChange([...categories, '']);

  return (
    <div className="max-w-lg space-y-2">
      {categories.map((cat, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="text" value={cat} onChange={(e) => update(i, e.target.value)} className={inputClass} />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 rounded-md border border-red-300 px-2.5 py-1.5 font-sans text-xs font-semibold text-red-600"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-xs font-semibold text-vyoma-blue"
      >
        + Add category
      </button>
    </div>
  );
}
