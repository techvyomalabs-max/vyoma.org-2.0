// Regression coverage for the "Sandhi App" broken-link bug: CurrentWorkStage
// previously rendered `u: '#'` as a real `<a href="#" target="_blank">`
// (desktop hover panel and mobile fallback list both did this). The fix
// routes every platform/programme URL through this one check before
// deciding whether to render a link at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRealLink } from './platformLink.mjs';

test('hasRealLink rejects the literal "#" placeholder (the exact Sandhi App shape)', () => {
  assert.equal(hasRealLink('#'), false);
});

test('hasRealLink rejects "#" with incidental surrounding whitespace', () => {
  assert.equal(hasRealLink('  #  '), false);
});

test('hasRealLink rejects empty string, null, and undefined without throwing', () => {
  assert.equal(hasRealLink(''), false);
  assert.equal(hasRealLink('   '), false);
  assert.equal(hasRealLink(null), false);
  assert.equal(hasRealLink(undefined), false);
});

test('hasRealLink rejects non-string values without throwing', () => {
  assert.equal(hasRealLink(0), false);
  assert.equal(hasRealLink({}), false);
  assert.equal(hasRealLink([]), false);
});

test('hasRealLink accepts every real platform URL currently in CW_PLATFORMS/CW_PROGRAMMES, unaffected by this fix', () => {
  const realUrls = [
    'https://www.sanskritfromhome.org/',
    'https://digitalsanskrit.com/',
    'https://digitalsanskritguru.com/?v=13b5bfe96f3e',
    'https://sanskritlanguagelab.com',
    'https://iks.vyoma.org/index.html',
    'https://vyomausa.org/',
  ];
  for (const url of realUrls) assert.equal(hasRealLink(url), true, `expected ${url} to be treated as a real link`);
});

test('hasRealLink accepts a real URL that happens to contain a hash fragment (not confused with the bare "#" placeholder)', () => {
  assert.equal(hasRealLink('https://example.com/page#section'), true);
});
