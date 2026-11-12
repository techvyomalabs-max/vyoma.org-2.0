// Regression coverage for the "internal FAQ note leaked via the public
// content API" bug: GET /public/pages/faq previously returned each FAQ
// item's `note` field verbatim in the JSON response. The generic content
// controller now routes every response through this sanitizer first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePublicContent } from './sanitizePublicContent.js';

// Mirrors the real pages/faq Content document's data shape -- including the
// three real, currently-live leaking notes.
const REAL_FAQ_DATA = {
  FAQ_GROUPS: [
    {
      group: 'Tax & Legal',
      active: true,
      items: [
        { q: 'Is my donation to Vyoma tax-exempt in India?', a: 'Yes. Vyoma holds 80G registration...', active: true },
        {
          q: 'What registration numbers does Vyoma hold?',
          a: 'Vyoma holds FCRA, 80G, and 12A registration under Indian law.',
          note: 'Actual registration numbers not on file. Send them if they should be listed here for donor verification.',
          active: true,
        },
      ],
    },
    {
      group: 'Ways to Give',
      active: true,
      items: [
        {
          q: 'Can I set up a recurring donation?',
          a: '',
          note: 'Answer pending: confirm whether recurring giving is supported on the current donation processor, then write the answer.',
          active: false,
        },
        { q: 'Can I donate by bank transfer instead of online?', a: 'Yes, write to us for bank details.', active: true },
      ],
    },
  ],
  SEO: { title: null, description: null, canonical: '/faq', ogImage: null },
};

test('sanitizePublicContent strips note from every FAQ item, including the real currently-leaking ones', () => {
  const result = sanitizePublicContent('pages/faq', REAL_FAQ_DATA);
  const allItems = result.FAQ_GROUPS.flatMap((g) => g.items);
  assert.ok(allItems.length > 0);
  for (const item of allItems) assert.equal('note' in item, false);
  assert.equal(JSON.stringify(result).includes('registration numbers not on file'), false);
  assert.equal(JSON.stringify(result).includes('Answer pending'), false);
});

test('sanitizePublicContent preserves question, answer, group name, and active status for every item/group', () => {
  const result = sanitizePublicContent('pages/faq', REAL_FAQ_DATA);
  assert.equal(result.FAQ_GROUPS.length, 2);
  assert.equal(result.FAQ_GROUPS[0].group, 'Tax & Legal');
  assert.equal(result.FAQ_GROUPS[0].items[1].q, 'What registration numbers does Vyoma hold?');
  assert.equal(result.FAQ_GROUPS[0].items[1].a, 'Vyoma holds FCRA, 80G, and 12A registration under Indian law.');
  assert.equal(result.FAQ_GROUPS[1].items[0].active, false); // the deactivated "recurring donation" item stays inactive
  assert.equal(result.FAQ_GROUPS[1].items[1].active, true);
});

test('sanitizePublicContent preserves other top-level keys (e.g. SEO) untouched', () => {
  const result = sanitizePublicContent('pages/faq', REAL_FAQ_DATA);
  assert.deepEqual(result.SEO, REAL_FAQ_DATA.SEO);
});

test('sanitizePublicContent is a no-op for every other content type (does not touch unrelated public endpoints)', () => {
  const homeData = { HERO_SLIDES: [{ title: 'x' }], STATS: [{ value: 1 }] };
  assert.equal(sanitizePublicContent('pages/home', homeData), homeData); // same reference, not even cloned
  const aboutData = { EXPLORE_MORE_LINKS: [{ label: 'Our Patrons', note: 'this must survive -- not pages/faq' }] };
  assert.equal(sanitizePublicContent('pages/about', aboutData), aboutData);
});

test('a FAQ item with no note at all is unaffected and does not throw', () => {
  const result = sanitizePublicContent('pages/faq', REAL_FAQ_DATA);
  const clean = result.FAQ_GROUPS[0].items[0];
  assert.equal(clean.q, 'Is my donation to Vyoma tax-exempt in India?');
  assert.equal('note' in clean, false);
});

test('an item missing the active field entirely defaults to active (matches the Frontend allowlist\'s own semantics)', () => {
  const data = { FAQ_GROUPS: [{ group: 'G', items: [{ q: 'Q', a: 'A' }] }] };
  const result = sanitizePublicContent('pages/faq', data);
  assert.equal(result.FAQ_GROUPS[0].items[0].active, true);
});

test('sanitizePublicContent tolerates null/undefined data and a FAQ document with no FAQ_GROUPS without throwing', () => {
  assert.equal(sanitizePublicContent('pages/faq', null), null);
  assert.equal(sanitizePublicContent('pages/faq', undefined), undefined);
  const malformed = { SEO: {} };
  assert.equal(sanitizePublicContent('pages/faq', malformed), malformed);
});
