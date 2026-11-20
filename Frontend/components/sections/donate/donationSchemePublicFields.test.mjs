// Regression coverage for the "internal donation-scheme note leaked
// publicly" bug: SchemesGrid.jsx and donate/[schemeSlug]/page.js previously
// rendered a scheme's `note` field as a visible "Handoff note:" box. The
// fix routes every scheme object through this allowlist before it ever
// reaches render -- same pattern as faqPublicFields.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPublicSchemeFields } from './donationSchemePublicFields.mjs';

// Mirrors the real shape returned by GET /public/donation-schemes and
// /public/donation-schemes/:slug (see Backend/src/modules/donations/
// donations.controller.js) -- including the real, currently-live leaking
// note on "bala-gurukulam".
const REAL_SCHEMES = [
  { slug: 'guru-dakshina', name: 'Guru Dakshiṇā', body: 'Support a teacher directly.', image: { url: 'https://example.com/guru.jpg' } },
  { slug: 'vidya-danam', name: 'Vidyā Dānam', body: 'Fund a learner’s course access.', image: null },
  { slug: 'grantha-danam', name: 'Grantha Dānam', body: 'Sponsor a book.', image: { url: 'https://example.com/grantha.jpg' } },
  { slug: 'vidyarthi-nidhi', name: 'Vidyārthi Nidhi', body: 'Scholarship fund.', image: null },
  { slug: 'sabha-ujjivanam', name: 'Sabhā Ujjīvanam', body: 'Revive a learning sabha.', image: null },
  { slug: 'anna-danam', name: 'Anna Dānam', body: 'Nourishment support.', image: null },
  {
    slug: 'bala-gurukulam',
    name: 'Vyoma Bāla Gurukulam',
    body: 'Fund an after-school Sanskrit, culture, and values programme for children — ₹2,500/student/month.',
    note: 'Confirm current duration before finalizing — live site says 3 years, noted as now 1.',
    image: { url: 'https://example.com/bala.jpg' },
    status: 'active',
  },
  { slug: 'events-and-projects', name: 'Events & Projects', body: 'Sponsor an event.', image: null },
  { slug: 'general-donation', name: 'General Donation', body: 'Support wherever needed most.', image: null },
];

test('getPublicSchemeFields never returns a note field, even for the real currently-leaking scheme', () => {
  const scheme = REAL_SCHEMES.find((s) => s.slug === 'bala-gurukulam');
  const result = getPublicSchemeFields(scheme);
  assert.equal('note' in result, false);
  assert.equal(JSON.stringify(result).includes('Confirm current duration'), false);
});

test('getPublicSchemeFields drops any other unexpected/internal field too (allowlist, not a note-specific denylist)', () => {
  const scheme = { slug: 's', name: 'N', body: 'B', image: null, internalReviewer: 'someone@vyomalabs.in', draftFlag: true };
  const result = getPublicSchemeFields(scheme);
  assert.deepEqual(result, { slug: 's', name: 'N', body: 'B', image: null, status: undefined });
});

test('all 9 real donation schemes retain their approved public fields (slug, name, body, image) unchanged', () => {
  for (const scheme of REAL_SCHEMES) {
    const result = getPublicSchemeFields(scheme);
    assert.equal(result.slug, scheme.slug);
    assert.equal(result.name, scheme.name);
    assert.equal(result.body, scheme.body);
    assert.deepEqual(result.image, scheme.image ?? null);
  }
});

test('donation CTA remains functional: slug is preserved exactly, including for the scheme with a leaking note', () => {
  const result = getPublicSchemeFields(REAL_SCHEMES.find((s) => s.slug === 'bala-gurukulam'));
  assert.equal(result.slug, 'bala-gurukulam');
  // The CTA link/QuickDonate call is built from exactly this field.
  assert.equal(`/donate/${result.slug}`, '/donate/bala-gurukulam');
});

test('a scheme with no note at all (the other 8 schemes) is unaffected and does not throw', () => {
  for (const scheme of REAL_SCHEMES.filter((s) => s.slug !== 'bala-gurukulam')) {
    assert.doesNotThrow(() => getPublicSchemeFields(scheme));
    assert.equal('note' in getPublicSchemeFields(scheme), false);
  }
});

test('an explicitly empty-string or null note does not cause an error and is still excluded', () => {
  assert.doesNotThrow(() => getPublicSchemeFields({ slug: 's', name: 'N', body: 'B', note: '' }));
  assert.doesNotThrow(() => getPublicSchemeFields({ slug: 's', name: 'N', body: 'B', note: null }));
  assert.equal('note' in getPublicSchemeFields({ slug: 's', name: 'N', body: 'B', note: '' }), false);
});

test('status is preserved for the detail page\'s active/inactive check, for both active and inactive schemes', () => {
  assert.equal(getPublicSchemeFields({ slug: 's', status: 'active' }).status, 'active');
  assert.equal(getPublicSchemeFields({ slug: 's', status: 'inactive' }).status, 'inactive');
});

test('getPublicSchemeFields tolerates a null/undefined scheme instead of throwing', () => {
  assert.deepEqual(getPublicSchemeFields(undefined), { slug: '', name: '', body: '', image: null, status: undefined });
  assert.deepEqual(getPublicSchemeFields(null), { slug: '', name: '', body: '', image: null, status: undefined });
});
