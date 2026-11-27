// QA Bug 3 fix regression coverage: the Donate page hero's "Donate Now"
// button previously reused the site-wide DonateCta/openDonate handler
// (ModalProvider.jsx's openDonate: () => router.push('/donate')), which is
// a same-page no-op on /donate itself and never scrolled to the Donation
// Schemes section (id="schemes", SchemesGrid.jsx). This is a server
// component (no 'use client', async function) with no rendering harness in
// this project (same reason as Header.jsx's own tests) -- so this follows
// Header.mobileNav.test.mjs's established source-text-assertion pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pageSource = fs.readFileSync(path.join(__dirname, 'page.js'), 'utf8');
const schemesGridSource = fs.readFileSync(
  path.join(__dirname, '../../../components/sections/donate/SchemesGrid.jsx'),
  'utf8'
);
const modalProviderSource = fs.readFileSync(
  path.join(__dirname, '../../../components/layout/ModalProvider.jsx'),
  'utf8'
);

test('the hero CTA is a real anchor targeting #schemes, not the site-wide DonateCta/openDonate handler', () => {
  assert.match(
    pageSource,
    /<Button variant="outline-inverse" size="lg" href="#schemes">\s*\{HERO\.ctaLabel\}\s*<\/Button>/,
    'expected the hero CTA to be a Button with href="#schemes", rendering HERO.ctaLabel unchanged'
  );
  assert.ok(!pageSource.includes('<DonateCta'), 'the hero CTA must no longer render the shared DonateCta component, which only router.push(\'/donate\')s');
  assert.ok(!pageSource.includes("from '@/components/sections/CtaButtons'"), 'the now-unused DonateCta import should be removed, not left dangling');
});

test('SchemesGrid retains id="schemes" -- the hero CTA\'s scroll target must still exist', () => {
  assert.match(schemesGridSource, /<section id="schemes" className="bg-sky-mist px-8 py-14">/);
});

test('the global openDonate handler (used by Header.jsx and every other page\'s DonateCta) is unchanged', () => {
  assert.match(modalProviderSource, /openDonate: \(\) => router\.push\('\/donate'\),/);
});
