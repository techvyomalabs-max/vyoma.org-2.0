// Regression coverage for the pure logic extracted from RepeatableList.jsx
// into repeatableListLogic.mjs (see that file's header comment). Exercises
// the real, unmodified functions directly -- no rendering, no DOM, no new
// dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateItemAt, addItem, moveItem, deleteItemAt, getMatchedIndices, getPagination } from './repeatableListLogic.mjs';

// --- updateItemAt: immutability + order preservation ---

test('updateItemAt replaces only the targeted index, leaving every other item untouched, and returns a new array', () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const next = updateItemAt(items, 1, { id: 'replaced' });

  assert.deepEqual(next, [{ id: 1 }, { id: 'replaced' }, { id: 3 }]);
  assert.notEqual(next, items, 'must return a new array, not mutate in place');
  assert.deepEqual(items, [{ id: 1 }, { id: 2 }, { id: 3 }], 'the original array must be untouched');
});

// --- addItem: template vs. clone-last-item, deep copy ---

test('addItem appends a deep copy of newItemTemplate when the list is empty', () => {
  const template = { name: '', nested: { tags: [] } };
  const next = addItem([], { newItemTemplate: template, cloneLastItem: true });

  assert.equal(next.length, 1);
  assert.deepEqual(next[0], template);
  assert.notEqual(next[0], template, 'the appended item must be a copy, not the same object reference');
  assert.notEqual(next[0].nested, template.nested, 'nested objects must also be copied, not shared');
});

test('addItem appends a deep copy of newItemTemplate (not a clone) when cloneLastItem is false, even with existing items', () => {
  const items = [{ name: 'Existing', nested: { tags: ['a'] } }];
  const template = { name: '', nested: { tags: [] } };

  const next = addItem(items, { newItemTemplate: template, cloneLastItem: false });

  assert.equal(next.length, 2);
  assert.deepEqual(next[1], template);
  assert.notEqual(next[1], template);
});

test('addItem clones the last item (deep copy) when cloneLastItem is true (the default) and items already exist', () => {
  const items = [{ name: 'First', nested: { tags: ['x'] } }, { name: 'Last', nested: { tags: ['y', 'z'] } }];

  const next = addItem(items, { newItemTemplate: { name: '', nested: { tags: [] } } });

  assert.equal(next.length, 3);
  assert.deepEqual(next[2], { name: 'Last', nested: { tags: ['y', 'z'] } }, 'the new item must be a copy of the LAST item');
});

test('addItem defaults cloneLastItem to true when the option is omitted entirely', () => {
  const items = [{ name: 'Only item' }];
  const next = addItem(items, { newItemTemplate: { name: '' } });
  assert.deepEqual(next[1], { name: 'Only item' });
});

test('a cloned item shares no nested object/array references with the item it was cloned from', () => {
  const items = [{ name: 'Original', nested: { tags: ['a', 'b'] }, list: [{ x: 1 }] }];
  const next = addItem(items, { newItemTemplate: {}, cloneLastItem: true });
  const clone = next[1];

  assert.notEqual(clone.nested, items[0].nested);
  assert.notEqual(clone.list, items[0].list);
  assert.notEqual(clone.list[0], items[0].list[0]);

  // Mutating the clone's nested structures must never affect the original.
  clone.nested.tags.push('mutated');
  clone.list[0].x = 999;
  assert.deepEqual(items[0].nested.tags, ['a', 'b'], 'mutating the clone must not affect the original item');
  assert.equal(items[0].list[0].x, 1, 'mutating the clone must not affect the original item');
});

test('addItem does not mutate the original items array (returns a new array with the template appended)', () => {
  const items = [{ name: 'A' }];
  const next = addItem(items, { newItemTemplate: { name: '' } });
  assert.notEqual(next, items);
  assert.equal(items.length, 1, 'the original array must be untouched');
});

// --- moveItem: bounds-checked swap ---

test('moveItem swaps an item with its neighbor and preserves every other item/order', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const next = moveItem(items, 1, 1);
  assert.deepEqual(next.map((i) => i.id), ['a', 'c', 'b']);
});

test('moveItem moves an item upward (negative delta)', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const next = moveItem(items, 2, -1);
  assert.deepEqual(next.map((i) => i.id), ['a', 'c', 'b']);
});

test('moveItem returns null (a no-op) when moving the first item upward (below index 0)', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(moveItem(items, 0, -1), null);
});

test('moveItem returns null (a no-op) when moving the last item downward (past the end)', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.equal(moveItem(items, 1, 1), null);
});

test('moveItem does not mutate the original array', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  const next = moveItem(items, 0, 1);
  assert.deepEqual(items.map((i) => i.id), ['a', 'b'], 'the original array must be untouched');
  assert.deepEqual(next.map((i) => i.id), ['b', 'a']);
});

// --- deleteItemAt: delete the correct item by index ---

test('deleteItemAt removes exactly the targeted index and preserves the order of the rest', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const next = deleteItemAt(items, 1);
  assert.deepEqual(next.map((i) => i.id), ['a', 'c', 'd']);
});

test('deleteItemAt does not mutate the original array', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  deleteItemAt(items, 0);
  assert.equal(items.length, 2, 'the original array must be untouched');
});

// --- getMatchedIndices: case-insensitive search, searchKeys, defaults ---

test('getMatchedIndices returns every index when search is disabled, regardless of the search text', () => {
  const items = [{ name: 'Alpha' }, { name: 'Beta' }];
  assert.deepEqual(getMatchedIndices(items, { searchable: false, search: 'alpha' }), [0, 1]);
});

test('getMatchedIndices returns every index when the search text is empty or whitespace-only', () => {
  const items = [{ name: 'Alpha' }, { name: 'Beta' }];
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: '' }), [0, 1]);
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: '   ' }), [0, 1]);
});

test('getMatchedIndices matches case-insensitively', () => {
  const items = [{ name: 'Alpha Sponsor' }, { name: 'Beta Partner' }];
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: 'ALPHA' }), [0]);
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: 'alpha' }), [0]);
});

test('getMatchedIndices searches across every configured searchKey, matching if any key matches', () => {
  const items = [
    { name: 'Alpha', email: 'contact@example.test' },
    { name: 'Beta', email: 'alpha-team@example.test' },
    { name: 'Gamma', email: 'nothing@example.test' },
  ];
  const result = getMatchedIndices(items, { searchable: true, search: 'alpha', searchKeys: ['name', 'email'] });
  assert.deepEqual(result, [0, 1], 'item 0 matches on name, item 1 matches on email');
});

test('getMatchedIndices defaults to every key of the first item when searchKeys is omitted', () => {
  const items = [{ name: 'Alpha', role: 'Volunteer' }, { name: 'Beta', role: 'Alpha-tester' }];
  // searchKeys omitted -> defaults to Object.keys(items[0]) = ['name', 'role']
  const result = getMatchedIndices(items, { searchable: true, search: 'alpha' });
  assert.deepEqual(result, [0, 1], 'item 0 matches on name, item 1 matches on role, via the default key set');
});

test('getMatchedIndices returns an empty array when nothing matches', () => {
  const items = [{ name: 'Alpha' }, { name: 'Beta' }];
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: 'zzz-no-match' }), []);
});

test('getMatchedIndices treats a missing/undefined field as an empty string rather than throwing', () => {
  const items = [{ name: 'Alpha' }, { name: undefined }];
  assert.deepEqual(getMatchedIndices(items, { searchable: true, search: 'alpha', searchKeys: ['name'] }), [0]);
});

// --- getPagination: window computation + page clamping ---

test('getPagination returns everything on one page when pageSize is not set', () => {
  const indices = [0, 1, 2, 3, 4];
  const result = getPagination(indices, { pageSize: undefined, page: 1 });
  assert.deepEqual(result, { totalPages: 1, currentPage: 1, visibleIndices: indices });
});

test('getPagination slices the correct window for a given page', () => {
  const indices = [0, 1, 2, 3, 4, 5, 6];
  const result = getPagination(indices, { pageSize: 3, page: 2 });
  assert.equal(result.totalPages, 3);
  assert.equal(result.currentPage, 2);
  assert.deepEqual(result.visibleIndices, [3, 4, 5]);
});

test('getPagination clamps currentPage down to the new totalPages after the result set shrinks (e.g. a search or a delete)', () => {
  // User was on page 3 of a 9-item list (pageSize 3); a search/delete now
  // leaves only 4 matching items (2 pages) -- the stored `page` state (3) is
  // now out of range and must be clamped down, not produce an empty page.
  const shrunkIndices = [10, 11, 12, 13];
  const result = getPagination(shrunkIndices, { pageSize: 3, page: 3 });
  assert.equal(result.totalPages, 2);
  assert.equal(result.currentPage, 2, 'currentPage must be clamped down to the new totalPages');
  assert.deepEqual(result.visibleIndices, [13]);
});

test('getPagination treats an empty matched-indices result as a single (empty) page, never zero pages', () => {
  const result = getPagination([], { pageSize: 5, page: 1 });
  assert.equal(result.totalPages, 1);
  assert.equal(result.currentPage, 1);
  assert.deepEqual(result.visibleIndices, []);
});

test('getPagination defaults page to 1 when omitted', () => {
  const result = getPagination([0, 1, 2, 3, 4], { pageSize: 2 });
  assert.equal(result.currentPage, 1);
  assert.deepEqual(result.visibleIndices, [0, 1]);
});
