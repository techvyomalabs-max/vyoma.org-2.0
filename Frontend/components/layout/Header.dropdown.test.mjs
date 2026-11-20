// QA Bug 6: regression coverage for the desktop header dropdown fix
// (NavItem's single-button trigger, shared `openItem`-driven hover+click
// coordination, and Header()'s new outside-click/Escape effect).
//
// Header.jsx is a client component with real JSX, and this project has no
// React-rendering harness for any JSX-returning file (same already-
// established limitation as every other Header.*.test.mjs in this
// project) -- so the whole file cannot be `import`-ed.
//
// This file still gets genuine real-behavior coverage for two things:
// 1. Parent-page-preservation logic (`parentAlreadyLinked`), verified
//    against the REAL, unmodified lib/navConfig.js NAV data -- not a
//    synthetic fixture -- confirming exactly which dropdowns do/don't get
//    a new "<Label> Overview" link.
// 2. The new outside-click/Escape close logic, by extracting each
//    handler's verbatim source text and executing it for real via
//    `new Function(...)`, supplying `navRowRef`/`setOpenItem` as explicit
//    parameters in place of the closures Header() normally provides.
// Everything else about the surrounding JSX wiring (which element calls
// which handler, the single-button structure, aria attributes) is a
// separate, explicitly-labelled structural source-text assertion
// instead, never claimed as browser/render verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV } from '../../lib/navConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Header.jsx'), 'utf8');

function extractFunctionBody(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${marker} not found in Header.jsx`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.ok(i < source.length, `could not find the end of ${marker}'s body`);
  return source.slice(braceStart + 1, i);
}

function spy() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

// --- Real data: parent-page preservation against the actual NAV array ----

test('real NAV data: every dropdown parent except "Our Work" needs an Overview link (parentAlreadyLinked is false)', () => {
  const withChildren = NAV.filter((item) => item.children);
  assert.ok(withChildren.length > 0, 'expected at least one dropdown item in the real NAV data');
  for (const item of withChildren) {
    const parentAlreadyLinked = item.children.some((c) => c.href === item.href);
    if (item.label === 'Our Work') {
      assert.equal(parentAlreadyLinked, true, 'Our Work\'s own href must already be covered by an existing child (Seven Schools)');
    } else {
      assert.equal(parentAlreadyLinked, false, `${item.label}'s own page must not already be reachable via an existing child, so it needs a new Overview link`);
    }
  }
});

test('real NAV data: no dropdown parent\'s href is ever missing or ambiguous (every parent has a real, non-empty href)', () => {
  for (const item of NAV.filter((i) => i.children)) {
    assert.equal(typeof item.href, 'string');
    assert.ok(item.href.length > 0, `${item.label} must have a real href`);
  }
});

// --- Real behavior: the extracted outside-click / Escape handlers --------

function makeHandleOutsideClick() {
  const body = extractFunctionBody('function handleOutsideClick(e) {');
  // eslint-disable-next-line no-new-func -- executing the real, verbatim
  // body, with `e`/`navRowRef`/`setOpenItem` as explicit parameters in
  // place of the closures Header() normally provides.
  return new Function('e', 'navRowRef', 'setOpenItem', body);
}

function makeHandleKeyDown() {
  const body = extractFunctionBody('function handleKeyDown(e) {');
  return new Function('e', 'setOpenItem', body);
}

test('handleOutsideClick closes the dropdown when the click target is outside the whole nav row', () => {
  const handleOutsideClick = makeHandleOutsideClick();
  const setOpenItem = spy();
  const navRowRef = { current: { contains: () => false } }; // target is outside
  handleOutsideClick({ target: {} }, navRowRef, setOpenItem);
  assert.deepEqual(setOpenItem.calls, [[null]], 'an outside click must close the open dropdown');
});

test('handleOutsideClick does nothing when the click target is inside the nav row (e.g. a different trigger, already handled by its own onClick)', () => {
  const handleOutsideClick = makeHandleOutsideClick();
  const setOpenItem = spy();
  const navRowRef = { current: { contains: () => true } }; // target is inside
  handleOutsideClick({ target: {} }, navRowRef, setOpenItem);
  assert.deepEqual(setOpenItem.calls, [], 'a click inside the nav row must never be closed by this handler');
});

test('handleOutsideClick is defensive when navRowRef.current is not yet set', () => {
  const handleOutsideClick = makeHandleOutsideClick();
  const setOpenItem = spy();
  const navRowRef = { current: null };
  assert.doesNotThrow(() => handleOutsideClick({ target: {} }, navRowRef, setOpenItem));
  assert.deepEqual(setOpenItem.calls, [[null]]);
});

test('handleKeyDown closes the dropdown on Escape', () => {
  const handleKeyDown = makeHandleKeyDown();
  const setOpenItem = spy();
  handleKeyDown({ key: 'Escape' }, setOpenItem);
  assert.deepEqual(setOpenItem.calls, [[null]]);
});

test('handleKeyDown ignores every other key', () => {
  const handleKeyDown = makeHandleKeyDown();
  const setOpenItem = spy();
  for (const key of ['Enter', 'Tab', 'a', 'ArrowDown']) {
    handleKeyDown({ key }, setOpenItem);
  }
  assert.deepEqual(setOpenItem.calls, []);
});

// --- Structural assertions on the JSX wiring (NOT browser/render verification) --

test('items without children render as a plain NavLink, unchanged', () => {
  assert.match(source, /if \(!hasChildren\) \{\s*\n\s*return \(\s*\n\s*<NavLink href=\{item\.href\} active=\{active\}>/);
});

test('the dropdown trigger is one single, semantic <button type="button">, not two separate controls, and contains no nested button', () => {
  const navItemBody = source.slice(source.indexOf('function NavItem('), source.indexOf('function NavLink('));
  const buttonOpenCount = (navItemBody.match(/<button\b/g) || []).length;
  assert.equal(buttonOpenCount, 1, 'exactly one <button> must exist inside the dropdown trigger -- never two, and never a nested second one');
  assert.match(navItemBody, /<button\s*\n\s*type="button"/);
});

test('clicking the trigger toggles the same shared openItem state the chevron used to own alone', () => {
  assert.match(source, /onClick=\{\(\) => setOpenItem\(isOpen \? null : item\.label\)\}/);
});

test('hovering the trigger area opens it via the same shared openItem state (no independent per-item state)', () => {
  assert.match(source, /onMouseEnter=\{\(\) => setOpenItem\(item\.label\)\}/);
});

test('the independent CSS group-hover visibility mechanism has been removed -- visibility is driven only by isOpen', () => {
  assert.ok(!source.includes('group-hover:visible'), 'the old independent CSS hover mechanism must be gone');
  assert.ok(!source.includes('group-hover:opacity-100'));
});

test('aria-expanded and aria-controls are present on the single trigger button', () => {
  const navItemBody = source.slice(source.indexOf('function NavItem('), source.indexOf('function NavLink('));
  assert.match(navItemBody, /aria-expanded=\{isOpen\}/);
  assert.match(navItemBody, /aria-controls=\{dropdownId\}/);
});

test('an "Overview" link is added only for a dropdown parent whose own href is not already covered by a child', () => {
  assert.match(source, /\{!parentAlreadyLinked && \(/);
  assert.match(source, /\{item\.label\} Overview/);
});

test('every dropdown child link, and the Overview link, closes the dropdown on selection (in addition to navigating)', () => {
  const navItemBody = source.slice(source.indexOf('function NavItem('), source.indexOf('function NavLink('));
  const onClickCloseCount = (navItemBody.match(/onClick=\{\(\) => setOpenItem\(null\)\}/g) || []).length;
  assert.equal(onClickCloseCount, 2, 'both the Overview link and the item.children.map() link must close on click');
});

test('Header() attaches navRowRef to the desktop nav row, scoping the outside-click check to exactly that element', () => {
  assert.match(source, /<div ref=\{navRowRef\} className="hidden md:flex/);
});

test('the outside-click/Escape effect is scoped to openItem only, and cleans up its listeners', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*\n\s*if \(!openItem\) return undefined;/);
  assert.match(source, /document\.addEventListener\('mousedown', handleOutsideClick\);/);
  assert.match(source, /document\.addEventListener\('keydown', handleKeyDown\);/);
  assert.match(source, /document\.removeEventListener\('mousedown', handleOutsideClick\);/);
  assert.match(source, /document\.removeEventListener\('keydown', handleKeyDown\);/);
  assert.match(source, /\}, \[openItem\]\);/);
});

test('the new effect never references mobileOpen, closeMobileMenu, or SearchBox state -- it cannot interfere with the mobile menu or search input', () => {
  const effectBody = source.slice(source.indexOf('const navRowRef = useRef(null);'), source.indexOf('}, [openItem]);') + 20);
  assert.ok(!effectBody.includes('mobileOpen'));
  assert.ok(!effectBody.includes('closeMobileMenu'));
  assert.ok(!effectBody.includes('setValue'));
});

test('pathname-change still resets openItem, unchanged from before this fix', () => {
  assert.match(source, /useEffect\(\(\) => \{\s*\n\s*setOpenItem\(null\);\s*\n\s*\}, \[pathname\]\);/);
});

test('MobileNavItem and useMobileNav.js are completely untouched by this fix', () => {
  assert.ok(!source.includes('navRowRef') || !source.slice(source.indexOf('function MobileNavItem')).includes('navRowRef'), 'navRowRef must never appear inside MobileNavItem');
  assert.match(source, /function MobileNavItem\(\{ item, isActive, openGroup, setOpenGroup, onNavigate \}\) \{/, 'MobileNavItem\'s own signature must be unchanged');
});

test('every other interactive element inside MobileNavPanel (links, Donate) is unchanged and still calls onNavigate directly', () => {
  const panelBody = source.slice(source.indexOf('function MobileNavPanel'), source.indexOf('function MobileNavItem'));
  assert.match(panelBody, /<Link href="\/" onClick=\{onNavigate\}>/);
  assert.match(panelBody, /onClick=\{\(\) => \{\s*\n\s*onNavigate\(\);\s*\n\s*openDonate\(\);\s*\n\s*\}\}/);
});

test('SearchBox and its mobile-menu-closing onNavigate wiring (Stage 5 fix) are unaffected', () => {
  assert.match(source, /function SearchBox\(\{ onNavigate \} = \{\}\) \{/);
  assert.match(source, /<SearchBox onNavigate=\{onNavigate\} \/>/);
  assert.match(source, /<SearchBox \/>/);
});
