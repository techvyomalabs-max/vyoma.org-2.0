'use client';

import { useMemo, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import {
  updateItemAt,
  addItem as computeNewItem,
  moveItem,
  deleteItemAt,
  getMatchedIndices,
  getPagination,
} from './repeatableListLogic.mjs';

// Generic Add/Edit/Delete/Reorder/Enable-Disable shell for a repeatable
// content array (hero slides, sponsors, team members, FAQ items, ...). The
// consuming section-specific form supplies `renderItem` for its own fields;
// this component only owns the list mechanics. Delete always confirms first.
// Enable/Disable only appears when items already carry a boolean `active`
// field (added per-section as needed — not assumed globally).
//
// `pageSize`/`searchable`/`searchKeys` are optional (Batch 8) — omitted by
// every pre-existing call site, which keeps rendering every item exactly
// as before. Only a section with a genuinely large list (e.g. 1,375
// patron rows) opts in, so this never renders every item simultaneously.
// Every mutation (update/move/delete) always operates on the item's real,
// absolute index in the full `items` array — pagination/search only change
// which indices are rendered, never how edits are applied.
//
// `cloneLastItem` (default true, Batch 9 fix): "+ Add" normally clones the
// last item as a starting point (handy for a flat object like a FAQ entry
// or a board member). That is actively wrong for a list whose items carry
// their own large nested arrays (e.g. a patron category, which nests up to
// 963 patron rows) — the "new" item would be a full, visually identical
// duplicate of the last one (same name, same nested data), which looks
// exactly like nothing happened. Pass `cloneLastItem={false}` for any such
// list to always start a new item from `newItemTemplate` instead.
//
// `addLabel` (optional, Batch 9 fix): overrides the word after "+ Add " —
// every pre-existing call site omits it and keeps seeing "+ Add item"
// exactly as before. Without a distinct label, an outer list (categories)
// and a list nested inside each of its items (patrons) both say "+ Add
// item", so it's unclear which button was even clicked.
export function RepeatableList({
  items,
  onChange,
  renderItem,
  newItemTemplate,
  itemLabel = (item, i) => `Item ${i + 1}`,
  pageSize,
  searchable = false,
  searchKeys,
  deleteConfirmMessage,
  cloneLastItem = true,
  addLabel,
}) {
  const [pendingDelete, setPendingDelete] = useState(null); // index or null
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const updateItem = (index, next) => onChange(updateItemAt(items, index, next));

  const addItem = () => {
    onChange(computeNewItem(items, { newItemTemplate, cloneLastItem }));
    if (pageSize) setPage(Math.ceil((items.length + 1) / pageSize));
  };

  const move = (index, delta) => {
    const next = moveItem(items, index, delta);
    if (next) onChange(next);
  };

  const confirmDelete = () => {
    onChange(deleteItemAt(items, pendingDelete));
    setPendingDelete(null);
  };

  const matchedIndices = useMemo(
    () => getMatchedIndices(items, { searchable, search, searchKeys }),
    [items, search, searchable, searchKeys]
  );

  const { totalPages, currentPage, visibleIndices } = getPagination(matchedIndices, { pageSize, page });

  const Pager = () =>
    pageSize && matchedIndices.length > pageSize ? (
      <div className="flex items-center justify-between rounded-md bg-sky-mist px-3 py-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className="rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1 font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="font-sans text-xs text-charcoal">
          Page {currentPage} of {totalPages} ({matchedIndices.length} {matchedIndices.length === 1 ? 'item' : 'items'})
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-md border border-[var(--border-subtle)] bg-white px-2.5 py-1 font-sans text-xs font-semibold text-vyoma-blue disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search…"
          className="w-full max-w-xs rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal"
        />
      )}

      <Pager />

      {visibleIndices.length === 0 && (
        <p className="font-sans text-sm text-charcoal/60">{search ? 'No matching items.' : 'No items yet.'}</p>
      )}

      {visibleIndices.map((i) => (
        <div key={i} className="rounded-md border border-[var(--border-subtle)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">
              {itemLabel(items[i], i)}
            </span>
            <div className="flex items-center gap-2">
              {items[i].active !== undefined && (
                <label className="inline-flex items-center gap-1 font-sans text-xs text-charcoal">
                  <input
                    type="checkbox"
                    checked={items[i].active}
                    onChange={(e) => updateItem(i, { ...items[i], active: e.target.checked })}
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
          {renderItem(items[i], (next) => updateItem(i, next))}
        </div>
      ))}

      <Pager />

      <button
        type="button"
        onClick={addItem}
        className="self-start rounded-md border border-vyoma-blue px-3 py-1.5 font-sans text-sm font-semibold text-vyoma-blue"
      >
        + Add {addLabel || (typeof itemLabel === 'function' ? 'item' : itemLabel)}
      </button>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this item?"
        message={
          pendingDelete !== null && deleteConfirmMessage
            ? deleteConfirmMessage(items[pendingDelete])
            : "This can't be undone once you publish."
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
