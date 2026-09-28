'use client';

// Week 4 Decision W4-2: a generic *structured* editor, not a raw JSON
// textarea and not 12 page-specific forms. Every field renders a
// type-appropriate control (text/number/checkbox/nested panel), so a value
// can never leave this component as anything other than the same JS type it
// arrived as — there is no JSON.parse step and therefore no way for
// malformed JSON to ever reach the network, which is a stronger guarantee
// than "validate the JSON before sending."
//
// Deliberately does NOT allow adding or renaming object keys (only editing
// the values of keys that already exist) — that would let the shape of
// existing content drift silently. Arrays *can* have items added/removed,
// the one legitimate "grow the content" case (e.g. one more FAQ entry),
// and a new item is always cloned from the last existing one so nothing is
// invented from nothing.

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function FieldEditor({ value, onChange }) {
  if (value === null || value === undefined) {
    return <span className="font-sans text-sm italic text-charcoal/50">— empty —</span>;
  }

  if (typeof value === 'string') {
    const long = value.length > 80;
    return long ? (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal"
      />
    ) : (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal"
      />
    );
  }

  if (typeof value === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full box-border rounded-md border border-[var(--border-subtle)] px-2.5 py-2 font-sans text-sm text-charcoal"
      />
    );
  }

  if (typeof value === 'boolean') {
    return (
      <label className="inline-flex items-center gap-2 font-sans text-sm text-charcoal">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        {value ? 'true' : 'false'}
      </label>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-[var(--border-subtle)] bg-sky-mist/40 p-2.5">
        {value.map((item, i) => (
          <div key={i} className="flex gap-2 rounded-md border border-[var(--border-subtle)] bg-white p-2.5">
            <div className="flex-1">
              <FieldEditor
                value={item}
                onChange={(next) => {
                  const copy = value.slice();
                  copy[i] = next;
                  onChange(copy);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              className="h-fit shrink-0 rounded-md border border-red-300 px-2 py-1 font-sans text-xs font-semibold text-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([...value, deepClone(value[value.length - 1])])}
            className="self-start rounded-md border border-vyoma-blue px-2.5 py-1.5 font-sans text-xs font-semibold text-vyoma-blue"
          >
            + Add item
          </button>
        ) : (
          <p className="font-sans text-xs italic text-charcoal/50">Empty list — no existing item to base a new one on.</p>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-sky-mist/40 p-2.5">
        {Object.entries(value).map(([key, val]) => (
          <div key={key}>
            <div className="mb-1 font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">{key}</div>
            <FieldEditor value={val} onChange={(next) => onChange({ ...value, [key]: next })} />
          </div>
        ))}
      </div>
    );
  }

  return <span className="font-sans text-sm text-charcoal">{String(value)}</span>;
}

export function ContentEditor({ value, onChange }) {
  if (value == null || typeof value !== 'object') {
    return <p className="font-sans text-sm italic text-charcoal/50">No editable content for this type yet.</p>;
  }
  return <FieldEditor value={value} onChange={onChange} />;
}
