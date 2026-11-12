// Task 7K — behavioral regression coverage for the real, unmodified
// useMobileNav hook, rendered via lib/testSupport/reactTestEnv.mjs's React
// harness (no module aliasing needed here, unlike useContentEditor.test.mjs
// — this hook has no AdminAuthContext/Toast/network dependency at all, only
// React state/effects against the jsdom `document` that harness sets up).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { renderHook } = await import('./testSupport/reactTestEnv.mjs');
const { useMobileNav } = await import('./useMobileNav.js');

// `t.after(...)` always unmounts the hook once its test finishes (pass or
// fail) -- required because the hook's `mobileOpen` effect registers a real
// `document`-level keydown listener (Escape + the Task 7K.1 focus trap)
// whenever the menu is open; unmounting runs that effect's cleanup and
// removes it. Without this, a test that opens the menu and never explicitly
// closes it would leave its listener (and its closure over that test's own
// panel/button elements) permanently attached to the single shared jsdom
// `document`, where it would keep firing — and intervening — during every
// later test's own Tab/Escape dispatches in this same file.
async function setup(t, initialPathname = '/about') {
  // `initialArg` is threaded through reactTestEnv.mjs's renderHook so that
  // h.rerender(newPathname) below actually changes what useMobileNav sees on
  // an already-mounted instance -- a closure-captured pathname would not.
  const h = await renderHook((pathname) => useMobileNav(pathname), initialPathname);
  // try/catch: safe even for the one test below that explicitly unmounts
  // itself to assert doing so doesn't throw -- a second unmount() call on an
  // already-unmounted root is not this hook's concern.
  t.after(async () => {
    try {
      await h.unmount();
    } catch {
      // already unmounted by the test itself -- fine.
    }
  });
  return h;
}

function dispatchTab({ shiftKey = false } = {}) {
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
}

// Builds a minimal real DOM subtree with `count` focusable <button>s inside a
// container, attaches it as the hook's panel, and returns the buttons --
// used by the Task 7K.1 focus-trap tests below, which drive real
// document.activeElement/focus() the same way the real browser's Tab key
// would, against a real (if synthetic) focusable-element list.
function buildPanel(hookResult, count) {
  const panel = document.createElement('div');
  document.body.appendChild(panel);
  const buttons = Array.from({ length: count }, (_, i) => {
    const b = document.createElement('button');
    b.textContent = `item-${i}`;
    panel.appendChild(b);
    return b;
  });
  hookResult.mobilePanelRef.current = panel;
  return { panel, buttons };
}

test('starts closed, with no accordion group open', async (t) => {
  const h = await setup(t);
  assert.equal(h.result.mobileOpen, false);
  assert.equal(h.result.mobileOpenGroup, null);
});

test('toggleMobileMenu() opens the panel, and a second call closes it', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(h.result.mobileOpen, true);
  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(h.result.mobileOpen, false);
});

test('closeMobileMenu() closes the panel and clears any open accordion group', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.toggleMobileMenu());
  await h.act(() => h.result.setMobileOpenGroup('Credibility'));
  assert.equal(h.result.mobileOpen, true);
  assert.equal(h.result.mobileOpenGroup, 'Credibility');

  await h.act(() => h.result.closeMobileMenu());
  assert.equal(h.result.mobileOpen, false);
  assert.equal(h.result.mobileOpenGroup, null, 'closing must also collapse any open submenu group');
});

test('setMobileOpenGroup toggles independently of mobileOpen (submenu expand/collapse)', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.setMobileOpenGroup('Our Work'));
  assert.equal(h.result.mobileOpenGroup, 'Our Work');
  await h.act(() => h.result.setMobileOpenGroup(null));
  assert.equal(h.result.mobileOpenGroup, null);
});

test('locks document.body scroll while open, and restores the exact previous value when closed', async (t) => {
  const h = await setup(t);
  document.body.style.overflow = 'auto'; // simulate a pre-existing, non-default value
  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(document.body.style.overflow, 'hidden');

  await h.act(() => h.result.closeMobileMenu());
  assert.equal(document.body.style.overflow, 'auto', 'must restore the exact prior value, not hardcode empty string');
});

test('pressing Escape while open closes the menu', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(h.result.mobileOpen, true);

  await h.act(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  });
  assert.equal(h.result.mobileOpen, false);
});

test('Escape does nothing while already closed (no error, no state change)', async (t) => {
  const h = await setup(t);
  await h.act(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  });
  assert.equal(h.result.mobileOpen, false);
});

test('a non-Escape key while open does not close the menu', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.toggleMobileMenu());
  await h.act(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter' }));
  });
  assert.equal(h.result.mobileOpen, true);
});

test('moves focus into the panel (the close button) when opened', async (t) => {
  const h = await setup(t);
  const closeButton = document.createElement('button');
  document.body.appendChild(closeButton);
  h.result.mobileCloseRef.current = closeButton;

  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(document.activeElement, closeButton);
});

test('returns focus to the toggle button once the panel actually closes', async (t) => {
  const h = await setup(t);
  const toggleButton = document.createElement('button');
  document.body.appendChild(toggleButton);
  h.result.mobileToggleRef.current = toggleButton;

  await h.act(() => h.result.toggleMobileMenu()); // open
  await h.act(() => h.result.closeMobileMenu()); // close
  assert.equal(document.activeElement, toggleButton);
});

test('a route change (new pathname passed to the hook) closes an open menu', async (t) => {
  const h = await setup(t, '/about');
  await h.act(() => h.result.toggleMobileMenu());
  assert.equal(h.result.mobileOpen, true);

  await h.act(() => h.rerender('/credibility'));
  assert.equal(h.result.mobileOpen, false);
});

// --- Task 7K.1: keyboard focus trap -----------------------------------------

test('Tab from the last focusable element wraps to the first, preventing focus from reaching background elements', async (t) => {
  const h = await setup(t);
  const { buttons } = buildPanel(h.result, 3);
  const [first, , last] = buttons;

  await h.act(() => h.result.toggleMobileMenu());
  last.focus();
  assert.equal(document.activeElement, last);

  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, first);
});

test('Shift+Tab from the first focusable element wraps to the last', async (t) => {
  const h = await setup(t);
  const { buttons } = buildPanel(h.result, 3);
  const [first, , last] = buttons;

  await h.act(() => h.result.toggleMobileMenu());
  first.focus();

  await h.act(() => dispatchTab({ shiftKey: true }));
  assert.equal(document.activeElement, last);
});

test('Tab while focus is on a middle element does not force-move focus (the trap only acts at the boundary)', async (t) => {
  const h = await setup(t);
  const { buttons } = buildPanel(h.result, 3);
  const [, middle] = buttons;

  await h.act(() => h.result.toggleMobileMenu());
  middle.focus();

  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, middle, 'jsdom never moves focus natively on Tab, so this also confirms the trap did not force a jump');
});

test('Tab while focus has somehow landed outside the panel pulls it back in, to the first focusable element', async (t) => {
  const h = await setup(t);
  buildPanel(h.result, 2);
  const outside = document.createElement('button');
  document.body.appendChild(outside);

  await h.act(() => h.result.toggleMobileMenu());
  outside.focus();
  assert.equal(document.activeElement, outside);

  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, h.result.mobilePanelRef.current.querySelector('button'), 'focus must be pulled back into the panel, not left on a background element');
});

test('Shift+Tab while focus has somehow landed outside the panel pulls it back in, to the last focusable element', async (t) => {
  const h = await setup(t);
  const { buttons } = buildPanel(h.result, 2);
  const outside = document.createElement('button');
  document.body.appendChild(outside);

  await h.act(() => h.result.toggleMobileMenu());
  outside.focus();

  await h.act(() => dispatchTab({ shiftKey: true }));
  assert.equal(document.activeElement, buttons[buttons.length - 1]);
});

test('expanding an accordion submenu immediately moves the Tab-wrap boundary to include its new links (no stale cached list)', async (t) => {
  const h = await setup(t);
  const { panel, buttons } = buildPanel(h.result, 2); // [close-ish, toggle-ish]
  const [first, toggle] = buttons;

  await h.act(() => h.result.toggleMobileMenu());

  // Before expansion: `toggle` is the last focusable element -- Tab from it wraps to `first`.
  toggle.focus();
  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, first);

  // Simulate the accordion expanding: a new link is added to the DOM (exactly
  // how MobileNavItem renders a submenu -- conditionally, not just hidden).
  const subLink = document.createElement('a');
  subLink.href = '#';
  subLink.textContent = 'sub-item';
  panel.appendChild(subLink);

  // `toggle` is no longer last, so Tab from it must NOT wrap anymore.
  toggle.focus();
  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, toggle, 'toggle is no longer the last focusable element once the submenu is open, so the trap must not intervene here');

  // The newly-added submenu link is now correctly treated as last.
  subLink.focus();
  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, first, 'the submenu link, not toggle, must now be where Tab wraps from');

  // Simulate the accordion collapsing again (the link is removed from the DOM).
  panel.removeChild(subLink);
  toggle.focus();
  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, first, 'once collapsed, toggle must again be treated as the last focusable element');
});

test('the focus trap stops intercepting Tab once the menu is closed (panel is not keyboard-accessible while closed)', async (t) => {
  const h = await setup(t);
  buildPanel(h.result, 2);

  await h.act(() => h.result.toggleMobileMenu());
  await h.act(() => h.result.closeMobileMenu());

  const outside = document.createElement('button');
  document.body.appendChild(outside);
  outside.focus();

  await h.act(() => dispatchTab());
  assert.equal(document.activeElement, outside, 'no trap should intervene once the menu is closed -- the keydown listener must have been removed');
});

test('Escape still closes the menu with the focus trap active, and focus still restores to the toggle button', async (t) => {
  const h = await setup(t);
  buildPanel(h.result, 2);
  const toggleButton = document.createElement('button');
  document.body.appendChild(toggleButton);
  h.result.mobileToggleRef.current = toggleButton;

  await h.act(() => h.result.toggleMobileMenu());
  await h.act(() => {
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  });
  assert.equal(h.result.mobileOpen, false);
  assert.equal(document.activeElement, toggleButton);
});

test('unmounting while open does not throw (scroll lock / listeners are cleaned up)', async (t) => {
  const h = await setup(t);
  await h.act(() => h.result.toggleMobileMenu());
  await assert.doesNotReject(() => h.unmount());
});
