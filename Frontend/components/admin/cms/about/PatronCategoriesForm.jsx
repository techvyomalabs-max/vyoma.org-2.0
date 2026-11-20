'use client';

import { RepeatableList } from '@/components/admin/ui/RepeatableList';
import { SimpleRepeatableForm } from '@/components/admin/ui/SimpleRepeatableForm';

const inputClass = 'w-full rounded-md border border-[var(--border-subtle)] px-2.5 py-1.5 font-sans text-sm text-charcoal';

const ROW_FIELDS = [
  { key: 'name', type: 'text', label: 'Patron name' },
  { key: 'place', type: 'text', label: 'Place' },
  { key: 'product', type: 'text', label: 'Product sponsored' },
];

const NEW_CATEGORY = { sanskrit: '', meaning: '', note: '', hasProductField: false, active: true, rows: [] };

// Replaces the old fixed-6-tier PATRON_TIERS + PATRON_TIER_ROWS pair.
// data.PATRON_CATEGORIES is now a single array — each category carries its
// own patron rows nested inside it, so creating, renaming (just edit
// `sanskrit` in place — its rows move with it, nothing can be orphaned),
// and reordering a category is just adding/editing/moving one array item,
// using the exact same mechanics as every other repeatable section in
// this CMS. No source-code change is ever needed to add a category.
export function PatronCategoriesForm({ value, onChange }) {
  return (
    <RepeatableList
      items={value}
      onChange={onChange}
      newItemTemplate={NEW_CATEGORY}
      itemLabel={(c) => `${c.sanskrit || 'New category'} (${(c.rows || []).length})`}
      addLabel="Category"
      cloneLastItem={false}
      deleteConfirmMessage={(c) =>
        (c.rows || []).length > 0
          ? `"${c.sanskrit || 'This category'}" contains ${c.rows.length} patron ${
              c.rows.length === 1 ? 'record' : 'records'
            }. Deleting it deletes all of them too — this can't be undone once you publish. Consider turning off "Visible" instead if you just want to hide it.`
          : "This can't be undone once you publish."
      }
      renderItem={(category, onCategoryChange) => (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={category.sanskrit}
              onChange={(e) => onCategoryChange({ ...category, sanskrit: e.target.value })}
              placeholder="Sanskrit category name (e.g. Prayojakas)"
              className={inputClass}
            />
            <input
              type="text"
              value={category.meaning}
              onChange={(e) => onCategoryChange({ ...category, meaning: e.target.value })}
              placeholder="English meaning (e.g. Initiators)"
              className={inputClass}
            />
          </div>
          <textarea
            value={category.note}
            onChange={(e) => onCategoryChange({ ...category, note: e.target.value })}
            placeholder="Description"
            rows={2}
            className={inputClass}
          />
          <label className="inline-flex items-center gap-2 font-sans text-sm text-charcoal">
            <input
              type="checkbox"
              checked={!!category.hasProductField}
              onChange={(e) => onCategoryChange({ ...category, hasProductField: e.target.checked })}
            />
            Show a "Product Sponsored" column for this category
          </label>

          <div className="rounded-md border border-[var(--border-subtle)] p-3">
            <div className="mb-2 font-sans text-xs font-bold text-charcoal/60">
              Patrons in {category.sanskrit || 'this category'} ({(category.rows || []).length})
            </div>
            <SimpleRepeatableForm
              value={category.rows || []}
              onChange={(rows) => onCategoryChange({ ...category, rows })}
              fields={ROW_FIELDS}
              labelKey="name"
              newItemTemplate={{ name: '', place: '', product: '', active: true }}
              pageSize={25}
              searchable
              searchKeys={['name', 'place', 'product']}
              addLabel="Patron"
            />
          </div>
        </div>
      )}
    />
  );
}
