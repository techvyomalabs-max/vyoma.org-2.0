// Source-assertion coverage confirming Header.jsx's desktop NavItem and
// mobile MobileNavItem actually USE the shared navActiveLogic.mjs helper
// for per-link submenu highlighting, rather than reverting to a raw
// isActive(href) check per link (the exact root cause of the duplicate-
// highlight bug this fix addresses). Header.jsx is a client component with
// real JSX and no React-rendering harness exists for it in this project
// (same established limitation as every other Header.*.test.mjs here) --
// the actual matching MATH is fully exercised, with real rendering of its
// own logic, by navActiveLogic.test.mjs; this file only guards the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Header.jsx'), 'utf8');

function bodyOf(fnSignature, nextFnSignature) {
  const start = source.indexOf(fnSignature);
  assert.ok(start !== -1, `expected to find "${fnSignature}" in Header.jsx`);
  const end = nextFnSignature ? source.indexOf(nextFnSignature, start) : source.length;
  assert.ok(end > start, `expected to find "${nextFnSignature}" after "${fnSignature}"`);
  return source.slice(start, end);
}

test('Header.jsx imports the shared navActiveLogic helpers', () => {
  assert.match(source, /import \{ isRouteActive, getActiveSubmenuHref \} from '\.\/navActiveLogic\.mjs';/);
});

test('Header() computes both a group-level isActive and a submenu-level activeSubmenuHref from the shared helpers', () => {
  const headerBody = bodyOf('export function Header()', 'function MobileNavPanel(');
  assert.match(headerBody, /const isActive = \(href\) => isRouteActive\(pathname, href\);/);
  assert.match(headerBody, /const activeSubmenuHref = \(candidates\) => getActiveSubmenuHref\(pathname, candidates\);/);
});

test('desktop NavItem receives activeSubmenuHref as a prop', () => {
  const headerBody = bodyOf('export function Header()', 'function MobileNavPanel(');
  assert.match(headerBody, /<NavItem\b[\s\S]*?activeSubmenuHref=\{activeSubmenuHref\}[\s\S]*?\/>/);
});

test('mobile MobileNavPanel/MobileNavItem receive activeSubmenuHref as a prop', () => {
  const headerBody = bodyOf('export function Header()', 'function MobileNavPanel(');
  assert.match(headerBody, /<MobileNavPanel\b[\s\S]*?activeSubmenuHref=\{activeSubmenuHref\}[\s\S]*?\/>/);

  const panelBody = bodyOf('function MobileNavPanel(', 'function MobileNavItem(');
  assert.match(panelBody, /<MobileNavItem\b[\s\S]*?activeSubmenuHref=\{activeSubmenuHref\}[\s\S]*?\/>/);
});

test('desktop NavItem computes one activeHref from the real rendered submenu candidates and uses it for both the Overview link and every child link', () => {
  const navItemBody = bodyOf('function NavItem(', 'function NavLink(');
  assert.match(
    navItemBody,
    /const submenuCandidates = \[\.\.\.\(parentAlreadyLinked \? \[\] : \[item\.href\]\), \.\.\.item\.children\.map\(\(c\) => c\.href\)\];/
  );
  assert.match(navItemBody, /const activeHref = activeSubmenuHref\(submenuCandidates\);/);
  assert.match(navItemBody, /activeHref === item\.href \? 'font-bold' : 'font-normal'/);
  assert.match(navItemBody, /activeHref === c\.href \? 'font-bold' : 'font-normal'/);
  // Regression guard: the old per-link raw check must be gone from this
  // component entirely -- it's exactly what caused the duplicate highlight.
  assert.doesNotMatch(navItemBody, /isActive\(item\.href\) \? 'font-bold'/);
  assert.doesNotMatch(navItemBody, /isActive\(c\.href\) \? 'font-bold'/);
});

test('mobile MobileNavItem computes one activeChildHref from its real rendered children and uses it for every child link', () => {
  const mobileItemBody = bodyOf('function MobileNavItem(', 'function MenuIcon(');
  assert.match(
    mobileItemBody,
    /const activeChildHref = hasChildren \? activeSubmenuHref\(item\.children\.map\(\(c\) => c\.href\)\) : null;/
  );
  assert.match(mobileItemBody, /activeChildHref === c\.href \? 'font-bold text-white' : 'font-normal text-white\/70'/);
  // Regression guard: the old per-link raw check must be gone here too.
  assert.doesNotMatch(mobileItemBody, /isActive\(c\.href\) \? 'font-bold text-white'/);
});

test('the top-level group-bolding check (About/Our Work/etc. staying bold on its own subpages) is untouched -- still isActive(), not activeSubmenuHref', () => {
  const navItemBody = bodyOf('function NavItem(', 'function NavLink(');
  const mobileItemBody = bodyOf('function MobileNavItem(', 'function MenuIcon(');
  assert.match(navItemBody, /const active = isActive\(item\.href\) \|\| item\.children\?\.some\(\(c\) => isActive\(c\.href\)\);/);
  assert.match(mobileItemBody, /const active = isActive\(item\.href\) \|\| item\.children\?\.some\(\(c\) => isActive\(c\.href\)\);/);
});

test('Home and Impact (no children, plain NavLink) are untouched -- still use isActive(), never activeSubmenuHref', () => {
  assert.match(source, /<NavLink href=\{item\.href\} active=\{active\}>/);
});

test('previous fixes remain intact: the desktop dropdown chevron stays removed, and the mobile accordion chevron stays present', () => {
  const navItemBody = bodyOf('function NavItem(', 'function NavLink(');
  assert.doesNotMatch(navItemBody, /M6 9l6 6 6-6/, 'the desktop chevron svg must not be reintroduced');
  assert.match(source, /<ChevronIcon className=\{`h-4 w-4 transition-transform/, 'the mobile accordion chevron must still exist');
});
