// QA Bug 5, Stage 1: regression coverage for searchRegistry.js. Beyond
// structural checks (count/uniqueness/shape/required fields), the last two
// tests cross-check every entry's title/description against the real
// page.js source file it claims to come from -- real-behavior verification
// against the filesystem, not just trusting the registry's own content, so
// a future edit that silently drifts the registry away from a page's real
// metadata (or a page that gets renamed/removed) fails this suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEARCH_REGISTRY } from './searchRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_APP_DIR = path.join(__dirname, '../app/(public)');

// '/' -> app/(public)/page.js; '/a/b' -> app/(public)/a/b/page.js.
function pageFileFor(routePath) {
  const rel = routePath === '/' ? '' : routePath.replace(/^\//, '');
  return path.join(PUBLIC_APP_DIR, rel, 'page.js');
}

test('the registry has exactly the 39 verified non-dynamic public routes', () => {
  assert.equal(SEARCH_REGISTRY.length, 39);
});

test('every path is unique', () => {
  const paths = SEARCH_REGISTRY.map((e) => e.path);
  assert.equal(new Set(paths).size, paths.length, 'expected no duplicate route in the registry');
});

test('every path is a plain, concrete URL -- no dynamic segments, no trailing slash, no query string', () => {
  for (const { path: p } of SEARCH_REGISTRY) {
    assert.match(p, /^\//, `${p} must start with /`);
    assert.ok(!p.includes('['), `${p} must not be a dynamic route template`);
    assert.ok(!p.includes('?'), `${p} must not carry a query string`);
    assert.ok(p === '/' || !p.endsWith('/'), `${p} must not have a trailing slash`);
  }
});

test('every entry has a non-empty title and description', () => {
  for (const entry of SEARCH_REGISTRY) {
    assert.equal(typeof entry.title, 'string');
    assert.ok(entry.title.trim().length > 0, `${entry.path} must have a non-empty title`);
    assert.equal(typeof entry.description, 'string');
    assert.ok(entry.description.trim().length > 0, `${entry.path} must have a non-empty description`);
  }
});

test('no admin/private route is present', () => {
  for (const { path: p } of SEARCH_REGISTRY) {
    assert.ok(!p.startsWith('/admin'), `${p} must never be an admin route`);
  }
});

test('no dynamic route template (donate/[schemeSlug], media/blog/[slug]) is present', () => {
  const paths = SEARCH_REGISTRY.map((e) => e.path);
  assert.ok(!paths.includes('/donate/[schemeSlug]'));
  assert.ok(!paths.includes('/media/blog/[slug]'));
});

test('every registry path resolves to a real, existing page.js file', () => {
  for (const { path: p } of SEARCH_REGISTRY) {
    const file = pageFileFor(p);
    assert.ok(fs.existsSync(file), `expected a page.js to exist for ${p} at ${file}`);
  }
});

// Home, Privacy, and Terms are explicitly documented in searchRegistry.js's
// own header comment as sourced from app/layout.js's default title/
// description (home) or a mockData TITLE constant plus the same layout
// default (privacy/terms), not from their own page.js's pageMetadata() call
// -- excluded from the literal cross-check below for that documented reason.
const SPECIAL_CASED_PATHS = new Set(['/', '/privacy', '/terms']);

test('every other entry\'s title/description literally appears in its real page.js source', () => {
  for (const { path: p, title, description } of SEARCH_REGISTRY) {
    if (SPECIAL_CASED_PATHS.has(p)) continue;
    const source = fs.readFileSync(pageFileFor(p), 'utf8');
    assert.ok(source.includes(title), `${p}: title ${JSON.stringify(title)} not found verbatim in its page.js`);
    assert.ok(source.includes(description), `${p}: description not found verbatim in its page.js`);
  }
});

test('Home/Privacy/Terms are sourced from app/layout.js\'s real default title/description, not invented', () => {
  const layoutSource = fs.readFileSync(path.join(__dirname, '../app/layout.js'), 'utf8');
  const home = SEARCH_REGISTRY.find((e) => e.path === '/');
  const privacy = SEARCH_REGISTRY.find((e) => e.path === '/privacy');
  const terms = SEARCH_REGISTRY.find((e) => e.path === '/terms');
  assert.ok(layoutSource.includes(home.title), 'home title must match layout.js default title');
  assert.ok(layoutSource.includes(home.description), 'home description must match layout.js default description');
  assert.equal(privacy.description, home.description, 'privacy has no literal description fallback of its own -- must reuse the same layout default');
  assert.equal(terms.description, home.description, 'terms has no literal description fallback of its own -- must reuse the same layout default');

  const privacySource = fs.readFileSync(path.join(__dirname, 'mockData/privacy.js'), 'utf8');
  const termsSource = fs.readFileSync(path.join(__dirname, 'mockData/terms.js'), 'utf8');
  assert.ok(privacySource.includes(`TITLE = "${privacy.title}"`), 'privacy title must match its real TITLE constant');
  assert.ok(termsSource.includes(`TITLE = "${terms.title}"`), 'terms title must match its real TITLE constant');
});
