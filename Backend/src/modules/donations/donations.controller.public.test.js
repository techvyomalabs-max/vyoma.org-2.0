// Task 7D.4 — regression coverage for the public donation-schemes endpoints
// (GET /api/v1/public/donation-schemes, GET /api/v1/public/donation-schemes/:slug,
// donations.controller.js). Previously had zero route-level test coverage
// (confirmed by audit) — only shapePublicScheme() itself was unit-tested in
// isolation, never the two real routes that call it. Follows the same
// real-HTTP pattern already established in content.controller.public.test.js
// and blog.controller.public.test.js: a real createApp() behind an ephemeral
// listener, against a throwaway mongodb-memory-server instance only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mem;
let DonationSchemeModel;
let app;
let server;
let baseUrl;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  ({ DonationSchemeModel } = await import('./donationScheme.model.js'));
  const { createApp } = await import('../../app.js');
  app = createApp();
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mem.stop();
});

async function getSchemes() {
  const res = await fetch(`${baseUrl}/api/v1/public/donation-schemes`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

async function getSchemeBySlug(slug) {
  const res = await fetch(`${baseUrl}/api/v1/public/donation-schemes/${slug}`);
  const body = await res.json().catch(() => null);
  return { res, body };
}

test('GET /public/donation-schemes returns only active schemes, sorted by displayOrder, in the allowlisted public shape', async () => {
  await DonationSchemeModel.create([
    { slug: 'list-active-b', name: 'Active B', description: 'body-b', status: 'active', displayOrder: 1, note: 'internal-only note' },
    { slug: 'list-active-a', name: 'Active A', description: 'body-a', status: 'active', displayOrder: 0, note: 'internal-only note' },
    { slug: 'list-inactive', name: 'Inactive scheme', description: 'body-inactive', status: 'inactive', displayOrder: 2 },
  ]);

  const { res, body } = await getSchemes();
  assert.equal(res.status, 200);
  const slugs = body.data.map((s) => s.slug);
  assert.deepEqual(slugs, ['list-active-a', 'list-active-b'], 'inactive scheme excluded, active ones sorted by displayOrder');

  for (const scheme of body.data) {
    assert.equal(scheme.note, undefined, 'internal-only `note` must never reach the public list response');
    assert.equal(scheme._id, undefined, '_id must never reach the public list response');
    assert.equal(scheme.displayOrder, undefined, 'displayOrder must never reach the public list response');
  }
});

test('GET /public/donation-schemes/:slug returns an active scheme in the allowlisted public shape', async () => {
  await DonationSchemeModel.create({
    slug: 'detail-active',
    name: 'Detail Active',
    description: 'detail body',
    status: 'active',
    displayOrder: 0,
    note: 'internal-only note',
  });

  const { res, body } = await getSchemeBySlug('detail-active');
  assert.equal(res.status, 200);
  assert.equal(body.data.slug, 'detail-active');
  assert.equal(body.data.name, 'Detail Active');
  assert.equal(body.data.body, 'detail body');
  assert.equal(body.data.status, 'active');
  assert.equal(body.data.note, undefined, 'internal-only `note` must never reach the public detail response');
  assert.equal(body.data._id, undefined, '_id must never reach the public detail response');
});

// Deliberate, documented design (donations.controller.js:32-36): unlike the
// list endpoint, the detail endpoint returns a non-active scheme too (rather
// than a fake 404), so the donor-facing page can show "not currently
// accepting donations" as a real, distinct state. This test exists so that
// the detail endpoint's broader-than-the-list behavior is an intentional,
// pinned contract, not an untested accident.
test('GET /public/donation-schemes/:slug returns an inactive scheme too (by design), still in the allowlisted shape, never via the list endpoint', async () => {
  await DonationSchemeModel.create({
    slug: 'detail-inactive',
    name: 'Detail Inactive',
    description: 'inactive body',
    status: 'inactive',
    displayOrder: 0,
    note: 'internal-only note',
  });

  const { res, body } = await getSchemeBySlug('detail-inactive');
  assert.equal(res.status, 200);
  assert.equal(body.data.status, 'inactive');
  assert.equal(body.data.note, undefined);

  const { body: listBody } = await getSchemes();
  assert.ok(
    !listBody.data.some((s) => s.slug === 'detail-inactive'),
    'the same inactive scheme must still be excluded from the list endpoint'
  );
});

test('GET /public/donation-schemes/:slug returns 404 for an unknown slug', async () => {
  const { res, body } = await getSchemeBySlug('this-slug-does-not-exist-anywhere');
  assert.equal(res.status, 404);
  assert.equal(body.code, 'SCHEME_NOT_FOUND');
});
