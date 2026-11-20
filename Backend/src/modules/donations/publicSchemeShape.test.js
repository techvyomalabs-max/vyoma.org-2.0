// Regression coverage for the "internal donation-scheme note leaked via the
// public API" bug: GET /public/donation-schemes and
// /public/donation-schemes/:slug previously included `note` directly in
// their JSON response bodies. Both endpoints now route every scheme through
// this one allowlist before sending it, so these tests cover both at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapePublicScheme } from './publicSchemeShape.js';

// Mirrors a real DonationScheme Mongoose document (lean()) -- including the
// real, currently-live leaking note on "bala-gurukulam".
const REAL_SCHEMES = [
  { _id: 'a1', slug: 'guru-dakshina', name: 'Guru Dakshiṇā', description: 'Support a teacher directly.', image: { url: 'https://example.com/guru.jpg' }, status: 'active', amountOptions: [1000, 2500, 5000, 10000], paymentMode: 'razorpay', displayOrder: 0, __v: 0 },
  { _id: 'a2', slug: 'vidya-danam', name: 'Vidyā Dānam', description: "Fund a learner's course access.", image: null, status: 'active', displayOrder: 1 },
  { _id: 'a3', slug: 'grantha-danam', name: 'Grantha Dānam', description: 'Sponsor a book.', image: { url: 'https://example.com/grantha.jpg' }, status: 'active', displayOrder: 2 },
  { _id: 'a4', slug: 'vidyarthi-nidhi', name: 'Vidyārthi Nidhi', description: 'Scholarship fund.', image: null, status: 'active', displayOrder: 3 },
  { _id: 'a5', slug: 'sabha-ujjivanam', name: 'Sabhā Ujjīvanam', description: 'Revive a learning sabha.', image: null, status: 'active', displayOrder: 4 },
  { _id: 'a6', slug: 'anna-danam', name: 'Anna Dānam', description: 'Nourishment support.', image: null, status: 'active', displayOrder: 5 },
  {
    _id: 'a7',
    slug: 'bala-gurukulam',
    name: 'Vyoma Bāla Gurukulam',
    description: 'Fund an after-school Sanskrit, culture, and values programme for children — ₹2,500/student/month.',
    note: 'Confirm current duration before finalizing — live site says 3 years, noted as now 1.',
    image: { url: 'https://example.com/bala.jpg' },
    status: 'active',
    displayOrder: 6,
  },
  { _id: 'a8', slug: 'events-and-projects', name: 'Events & Projects', description: 'Sponsor an event.', image: null, status: 'active', displayOrder: 7 },
  { _id: 'a9', slug: 'general-donation', name: 'General Donation', description: 'Support wherever needed most.', image: null, status: 'active', displayOrder: 8 },
];

test('shapePublicScheme never returns a note field, even for the real currently-leaking scheme', () => {
  const result = shapePublicScheme(REAL_SCHEMES.find((s) => s.slug === 'bala-gurukulam'));
  assert.equal('note' in result, false);
  assert.equal(JSON.stringify(result).includes('Confirm current duration'), false);
});

test('shapePublicScheme drops every other internal-only field on the document (allowlist, not a note-specific denylist)', () => {
  const result = shapePublicScheme(REAL_SCHEMES.find((s) => s.slug === 'guru-dakshina'));
  assert.deepEqual(Object.keys(result).sort(), ['body', 'image', 'name', 'slug', 'status']);
  assert.equal('_id' in result, false);
  assert.equal('__v' in result, false);
  assert.equal('amountOptions' in result, false);
  assert.equal('paymentMode' in result, false);
  assert.equal('displayOrder' in result, false);
});

test('all 9 real donation schemes retain their approved public fields (slug, name, body, image, status) unchanged', () => {
  for (const scheme of REAL_SCHEMES) {
    const result = shapePublicScheme(scheme);
    assert.equal(result.slug, scheme.slug);
    assert.equal(result.name, scheme.name);
    assert.equal(result.body, scheme.description);
    assert.equal(result.status, scheme.status);
    if (scheme.image) assert.deepEqual(result.image, scheme.image);
  }
});

test('a scheme with no note at all (the other 8 schemes) is unaffected and does not throw', () => {
  for (const scheme of REAL_SCHEMES.filter((s) => s.slug !== 'bala-gurukulam')) {
    assert.doesNotThrow(() => shapePublicScheme(scheme));
    assert.equal('note' in shapePublicScheme(scheme), false);
  }
});

test('an explicitly empty-string or null note does not cause an error and is still excluded', () => {
  assert.doesNotThrow(() => shapePublicScheme({ slug: 's', name: 'N', description: 'B', note: '' }));
  assert.doesNotThrow(() => shapePublicScheme({ slug: 's', name: 'N', description: 'B', note: null }));
  assert.equal('note' in shapePublicScheme({ slug: 's', name: 'N', description: 'B', note: '' }), false);
});

test('a scheme with no image does not include a null/empty image key that would break the Frontend\'s own fallback check', () => {
  const result = shapePublicScheme({ slug: 's', name: 'N', description: 'B', image: null });
  assert.equal(result.image, undefined);
});

test('shapePublicScheme tolerates a null/undefined scheme instead of throwing', () => {
  assert.deepEqual(shapePublicScheme(undefined), { slug: '', name: '', body: '', image: undefined, status: undefined });
  assert.deepEqual(shapePublicScheme(null), { slug: '', name: '', body: '', image: undefined, status: undefined });
});
