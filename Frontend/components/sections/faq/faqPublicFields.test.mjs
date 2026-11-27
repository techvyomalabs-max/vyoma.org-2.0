// Regression coverage for the FAQ "internal note leaked publicly" bug:
// FaqGroup.jsx previously rendered a CMS item's `note` field as a visible
// "Handoff note:" box whenever a visitor expanded that question. The fix
// routes every FAQ item through this allowlist before it ever reaches
// render, so these tests assert the allowlist itself, not JSX output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicFaqItemFields } from './faqPublicFields.mjs';

test('getPublicFaqItemFields never returns a note field, even when the source item has one', () => {
  const item = { q: 'Can I set up a recurring donation?', a: '', note: 'Answer pending: confirm with the donation processor.', active: true };
  const result = getPublicFaqItemFields(item);
  assert.deepEqual(Object.keys(result).sort(), ['a', 'active', 'q']);
  assert.equal('note' in result, false);
});

test('getPublicFaqItemFields drops any other unexpected/internal field too (allowlist, not a note-specific denylist)', () => {
  const item = { q: 'Q', a: 'A', active: true, internalAuthor: 'jane@vyomalabs.in', draftComment: 'needs legal review' };
  const result = getPublicFaqItemFields(item);
  assert.deepEqual(result, { q: 'Q', a: 'A', active: true });
});

test('getPublicFaqItemFields preserves the real question and answer text exactly', () => {
  const item = { q: 'Is my donation to Vyoma tax-exempt in India?', a: 'Yes. Vyoma holds 80G registration...', note: 'internal', active: true };
  const result = getPublicFaqItemFields(item);
  assert.equal(result.q, 'Is my donation to Vyoma tax-exempt in India?');
  assert.equal(result.a, 'Yes. Vyoma holds 80G registration...');
});

test('getPublicFaqItemFields treats active !== false as the only way to be inactive (matches prior filter behavior)', () => {
  assert.equal(getPublicFaqItemFields({ q: 'Q', a: 'A', active: false }).active, false);
  assert.equal(getPublicFaqItemFields({ q: 'Q', a: 'A', active: true }).active, true);
  assert.equal(getPublicFaqItemFields({ q: 'Q', a: 'A' }).active, true); // active omitted -> defaults visible, same as before
});

test('getPublicFaqItemFields tolerates a missing/empty answer (the exact "recurring donation" shape) without throwing', () => {
  const result = getPublicFaqItemFields({ q: 'Can I set up a recurring donation?', a: '', note: 'Answer pending.', active: false });
  assert.equal(result.a, '');
  assert.equal(result.active, false);
  assert.equal('note' in result, false);
});

test('getPublicFaqItemFields tolerates a null/undefined item instead of throwing', () => {
  assert.deepEqual(getPublicFaqItemFields(undefined), { q: '', a: '', active: true });
  assert.deepEqual(getPublicFaqItemFields(null), { q: '', a: '', active: true });
});
