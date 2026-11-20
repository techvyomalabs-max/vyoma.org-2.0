// Regression coverage for the decorative hero-image accessibility fix:
// Header.jsx's three cloud watermark images are purely decorative (never
// convey information) and must stay hidden from assistive technology, while
// the logo link's accessible name must keep describing its destination.
// Header.jsx is a client component wired to Next.js routing and a modal
// context provider, so it isn't rendered here (no React-rendering harness
// exists in this project yet -- see globals.overflowFix.test.mjs for the
// same source-assertion pattern used for a CSS-only fix); this asserts the
// exact source text a future edit could otherwise silently regress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Header.jsx'), 'utf8');

function cloudImageLines(src) {
  return src.split('\n').filter((line) => /src="\/images\/cloud-\d\.png"/.test(line));
}

test('every decorative cloud watermark image has alt="" (the standard technique for removing a purely decorative image from the accessibility tree)', () => {
  const lines = cloudImageLines(source);
  assert.equal(lines.length, 3, 'expected exactly 3 cloud images in Header.jsx');
  for (const line of lines) {
    assert.match(line, /alt=""/, `expected alt="" on: ${line.trim()}`);
  }
});

test('the cloud-image wrapper carries aria-hidden, so all three are hidden from assistive technology in one place', () => {
  const wrapperLineIdx = source.split('\n').findIndex((line) => line.includes('pointer-events-none absolute inset-0 z-0 overflow-hidden'));
  assert.notEqual(wrapperLineIdx, -1, 'decorative-cloud wrapper div not found');
  assert.match(source.split('\n')[wrapperLineIdx], /aria-hidden="true"/);
});

test('the homepage logo link keeps a non-empty, meaningful accessible name (a functional image, not decorative)', () => {
  const logoLine = source.split('\n').find((line) => line.includes('logo-white.png'));
  assert.notEqual(logoLine, undefined, 'logo image not found');
  assert.match(logoLine, /alt="[^"]+"/);
  assert.doesNotMatch(logoLine, /alt=""/);
  // No redundant "image of"/"picture of" phrasing.
  assert.doesNotMatch(logoLine, /alt="[^"]*\b(image of|picture of)\b/i);
});
