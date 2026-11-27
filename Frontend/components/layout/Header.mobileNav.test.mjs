// Task 7K — regression coverage for Header.jsx's new mobile/tablet
// navigation markup. Header.jsx cannot be rendered in this project's test
// environment (same reason as Header.a11y.test.mjs: a client component
// wired to Next.js routing and a modal context provider) — this follows
// that file's own established source-text-assertion pattern for the markup
// itself. The actual stateful behavior it wires up to (open/close, Escape,
// scroll-lock, route-change, focus) is independently, behaviorally tested
// in lib/useMobileNav.test.mjs via the real rendering harness.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Header.jsx'), 'utf8');

test('the desktop nav cluster and nav row are gated behind the md breakpoint, not removed', () => {
  assert.match(source, /hidden md:flex flex-wrap items-center justify-end gap-5/, 'expected the desktop search/contact/donate cluster to be hidden below md');
  assert.match(source, /hidden md:flex relative z-10 items-center justify-end gap-7 flex-wrap/, 'expected the desktop NAV row to be hidden below md');
});

test('desktop regression: NavItem/NavLink/SearchBox exist, and dropdown visibility is driven only by the shared openItem state (QA Bug 6)', () => {
  assert.match(source, /function NavItem\(/);
  assert.match(source, /function NavLink\(/);
  assert.match(source, /function SearchBox\(/);
  // QA Bug 6: the old independent CSS hover mechanism (group-hover:),
  // which let two dropdowns be visible at once, has been removed --
  // visibility is now driven only by `isOpen` (openItem === item.label)
  // for both click and hover, since onMouseEnter sets the same shared
  // openItem click already does. See Header.dropdown.test.mjs for the
  // full regression coverage of this fix; this test only guards against
  // the old, removed mechanism silently coming back.
  assert.ok(!source.includes('group-hover:visible'), 'the old independent per-item hover-visibility mechanism must remain removed');
  assert.ok(!source.includes('group-hover:opacity-100'), 'the old independent per-item hover-visibility mechanism must remain removed');
  assert.match(source, /onMouseEnter=\{\(\) => setOpenItem\(item\.label\)\}/, 'hover must open the dropdown via the same shared openItem state as click');
  assert.match(source, /const isOpen = openItem === item\.label;/, 'dropdown visibility must be computed from the single shared openItem state');
});

test('the mobile menu toggle button is hidden at md and up, and carries the required aria attributes', () => {
  const buttonBlock = source.slice(source.indexOf('Task 7K: mobile/tablet menu toggle'), source.indexOf('</button>', source.indexOf('Task 7K: mobile/tablet menu toggle')));
  assert.match(buttonBlock, /md:hidden/);
  assert.match(buttonBlock, /aria-expanded=\{mobileOpen\}/);
  assert.match(buttonBlock, /aria-controls=\{MOBILE_NAV_PANEL_ID\}/);
  assert.match(buttonBlock, /aria-label=\{mobileOpen \? 'Close navigation menu' : 'Open navigation menu'\}/);
});

test('the mobile panel is only rendered while open, reuses NAV/CONTACT_LINK, and is hidden at md and up', () => {
  assert.match(source, /\{mobileOpen && \(\s*<MobileNavPanel/, 'the panel must not be unconditionally mounted');
  assert.match(source, /role="dialog" aria-modal="true" aria-label="Site navigation" className="fixed inset-0 z-40 md:hidden"/);
  // Reuses the single NAV/CONTACT_LINK import already used by the desktop
  // nav above -- no second navigation-data source is ever defined.
  const navImportCount = (source.match(/import \{ NAV, CONTACT_LINK \} from '@\/lib\/navConfig';/g) || []).length;
  assert.equal(navImportCount, 1, 'NAV/CONTACT_LINK must be imported exactly once, from lib/navConfig.js, and shared by both desktop and mobile rendering');
});

test('every mobile nav link and the Donate button close the menu via onNavigate/onClose on click', () => {
  const panelBody = source.slice(source.indexOf('function MobileNavPanel'), source.indexOf('function MobileNavItem'));
  // Logo link, every top-level NAV link (via MobileNavItem, checked separately
  // below), the Contact link, and the Donate button must all route through
  // onNavigate so selecting any of them closes the panel.
  assert.match(panelBody, /<Link href="\/" onClick=\{onNavigate\}>/);
  assert.match(panelBody, /<Link\s+href=\{CONTACT_LINK\.href\}\s+onClick=\{onNavigate\}/);
  assert.match(panelBody, /onClick=\{\(\) => \{\s*onNavigate\(\);\s*openDonate\(\);\s*\}\}/);
});

test('MobileNavItem wires aria-expanded/aria-controls on its own accordion toggle, distinct from the desktop dropdown', () => {
  const itemBody = source.slice(source.indexOf('function MobileNavItem'), source.indexOf('function MenuIcon'));
  assert.match(itemBody, /aria-expanded=\{isOpen\}/);
  assert.match(itemBody, /aria-controls=\{panelId\}/);
  assert.match(itemBody, /aria-label=\{`\$\{isOpen \? 'Collapse' : 'Expand'\} \$\{item\.label\} submenu`\}/);
  // Label and toggle are separate controls (label always navigates, the
  // chevron button only ever expands/collapses) -- same split-interaction
  // model as the desktop NavItem, applied to tap-to-expand instead of hover.
  assert.match(itemBody, /<Link\s+href=\{item\.href\}\s+onClick=\{onNavigate\}/);
  assert.match(itemBody, /onClick=\{\(\) => setOpenGroup\(isOpen \? null : item\.label\)\}/);
});

test('each expanded submenu renders every child link from item.children (no hardcoded subset)', () => {
  const itemBody = source.slice(source.indexOf('function MobileNavItem'), source.indexOf('function MenuIcon'));
  assert.match(itemBody, /\{item\.children\.map\(\(c\) => \(/);
  assert.match(itemBody, /href=\{c\.href\}/);
  assert.match(itemBody, /onClick=\{onNavigate\}/);
});

test('mobile-nav behavior (open/close, Escape, scroll-lock, route-change, focus) is delegated to the shared useMobileNav hook, not reimplemented inline', () => {
  assert.match(source, /import \{ useMobileNav \} from '@\/lib\/useMobileNav';/);
  assert.match(source, /useMobileNav\(pathname\)/);
  // No body-overflow manipulation inside Header.jsx itself -- that logic
  // has exactly one home, in the hook. (Unaffected by QA Bug 6.)
  assert.ok(!/document\.body\.style\.overflow/.test(source), 'Header.jsx must not duplicate the scroll-lock logic that useMobileNav.js already owns');
  // QA Bug 6: Header.jsx now legitimately owns exactly ONE keydown
  // listener of its own -- the new desktop dropdown's Escape handler,
  // scoped to `openItem` (the desktop dropdown state) inside its own
  // useEffect keyed on [openItem]. This is a different, approved feature,
  // not a duplicate of the mobile panel's Escape handling, which still
  // lives entirely inside useMobileNav.js -- Header.jsx never reimplements
  // that logic itself, it only ever calls the hook (asserted above). A
  // second keydown listener appearing here would mean mobile's own Escape
  // handling had been duplicated inline, which this still catches.
  const keydownListenerCount = (source.match(/addEventListener\('keydown'/g) || []).length;
  assert.equal(keydownListenerCount, 1, 'exactly one keydown listener is expected: the new desktop dropdown Escape handler, scoped to openItem -- not zero, and not a second, duplicated one for the mobile panel');
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*\n\s*if \(!openItem\) return undefined;/,
    'the one keydown listener must be scoped to the desktop openItem state, not reimplementing the mobile panel\'s own Escape handling'
  );
});

test('Task 7K.1: the panel attaches mobilePanelRef to its own root, so the hook\'s focus trap can query its live focusable elements', () => {
  assert.match(source, /mobilePanelRef/, 'Header must destructure mobilePanelRef from useMobileNav()');
  assert.match(source, /panelRef=\{mobilePanelRef\}/, 'mobilePanelRef must be passed down to MobileNavPanel');
  const panelBody = source.slice(source.indexOf('function MobileNavPanel'), source.indexOf('function MobileNavItem'));
  assert.match(panelBody, /panelRef/, 'MobileNavPanel must accept panelRef as a prop');
  assert.match(panelBody, /<div ref=\{panelRef\}/, 'panelRef must be attached to the panel\'s own root element, not a child');
});
