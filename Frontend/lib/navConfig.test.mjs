// Task 7J — regression coverage for lib/navConfig.js, added alongside the
// fix that adds the previously-unlinked /credibility/audit-reports page to
// the Credibility nav dropdown (Task 7G finding). Confirms every internal
// nav link (header dropdowns + footer) still resolves to a real page.js
// under app/(public)/, that no link is accidentally duplicated, and that
// the newly-added Audit Reports entry is present exactly once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV, CONTACT_LINK, DONATE_LINK, FAQ_LINK, FOOTER_LINKS, PLATFORM_LINKS } from './navConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_APP_DIR = path.resolve(__dirname, '../app/(public)');

function flattenInternalHrefs() {
  const hrefs = [];
  for (const item of NAV) {
    hrefs.push(item.href);
    for (const child of item.children || []) hrefs.push(child.href);
  }
  hrefs.push(CONTACT_LINK.href, DONATE_LINK.href, FAQ_LINK.href);
  for (const item of FOOTER_LINKS) hrefs.push(item.href);
  return hrefs;
}

function pageFileForHref(href) {
  const relative = href === '/' ? '' : href.replace(/^\//, '');
  return path.join(PUBLIC_APP_DIR, relative, 'page.js');
}

test('every internal nav/footer link resolves to a real page.js file', () => {
  for (const href of flattenInternalHrefs()) {
    const pageFile = pageFileForHref(href);
    assert.ok(fs.existsSync(pageFile), `expected a page.js for "${href}" at ${pageFile}`);
  }
});

test('no internal nav/footer href is listed more than once within its own list', () => {
  const navTopLevel = NAV.map((item) => item.href);
  assert.equal(navTopLevel.length, new Set(navTopLevel).size, 'duplicate top-level NAV href found');

  for (const item of NAV) {
    if (!item.children) continue;
    const childHrefs = item.children.map((c) => c.href);
    assert.equal(childHrefs.length, new Set(childHrefs).size, `duplicate child href found under "${item.label}"`);
  }

  const footerHrefs = FOOTER_LINKS.map((l) => l.href);
  assert.equal(footerHrefs.length, new Set(footerHrefs).size, 'duplicate FOOTER_LINKS href found');
});

test('Task 7J: Audit Reports is now listed exactly once, as a child of the Credibility nav entry', () => {
  const credibility = NAV.find((item) => item.label === 'Credibility');
  assert.ok(credibility, 'expected a Credibility top-level nav entry');
  const auditReportsEntries = credibility.children.filter((c) => c.href === '/credibility/audit-reports');
  assert.equal(auditReportsEntries.length, 1, 'expected exactly one Audit Reports entry under Credibility');
  assert.equal(auditReportsEntries[0].label, 'Audit Reports');
});

test('every PLATFORM_LINKS entry is marked external and is a real https URL (never checked against local page.js files)', () => {
  for (const item of PLATFORM_LINKS) {
    assert.equal(item.external, true, `${item.label} must be marked external`);
    assert.match(item.href, /^https:\/\//, `${item.label} must be a real https URL`);
  }
});
