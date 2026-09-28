'use client';

import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// Generic Add/Edit/Delete/Reorder/Enable-Disable shell for a repeatable
// content array (hero slides, sponsors, team members, FAQ items, ...). The
// consuming section-specific form supplies `renderItem` for its own fields;
// this component only owns the list mechanics. Delete always confirms first.
// Enable/Disable only appears when items already carry a boolean `active`
// field (added per-section as needed — not assumed globally).
export function RepeatableList({ items, onChange, renderItem, newItemTemplate, itemLabel = (item, i) => `Item ${i + 1}` }) {
  const [pendingDelete, setPendingDelete] = useState(null); // index or null

  const updateItem = (index, next) => {
    const copy = items.slice();
    copy[index] = next;
    onChange(copy);
  };

  const addItem = () => {
    const template = items.length ? JSON.parse(JSON.stringify(items[items.length - 1])) : newItemTemplate;
    onChange([...items, template]);
  };

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const copy = items.slice();
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };

  const confirmDelete = () => {
    onChange(items.filter((_, i) => i !== pendingDelete));
    setPendingDelete(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={i} className="rounded-md border border-[var(--border-subtle)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">
              {itemLabel(item, i)}
            </span>
            <div className="flex items-center gap-2">
              {item.active !== undefined && (
                <label className="inline-flex items-center gap-1 font-sans text-xs text-charcoal">
                  <input
                    type="checkbox"
                    checked={item.active}
                    onChange={(e) => updateItem(i, { ...item, active: e.target.checked })}
                  />
                  Visible
                </label>
              )}
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-xs text-charcoal/60 disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className="text-xs text-charcoal/60 disabled:opacity-30"
              >
                ↓
              </button>
              <button type="button" onClick={() => setPendingDelete(i)} className="font-sans text-xs font-semibold text-red-600">
                Delete
              </button>
            </div>
          </div>
          {renderItem(item, (next) => updateItem(i, next))}
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="self-start rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue"
      >
        + Add {typeof itemLabel === 'function' ? 'item' : itemLabel}
      </button>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this item?"
        message="This can't be undone once you publish."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
