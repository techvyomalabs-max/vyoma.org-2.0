// Minimal React-hook rendering harness built entirely from already-installed
// dependencies (react, react-dom, jsdom -- no new package). This project has
// no React Testing Library / react-test-renderer; see
// components/layout/Header.a11y.test.mjs's own header comment ("no
// React-rendering harness exists in this project yet") for the prior
// precedent of falling back to source-text assertions instead. This module
// is the first such harness, scoped narrowly to rendering a single hook via
// a throwaway host component -- not a general component-testing utility.
//
// jsdom setup mirrors components/admin/cms/blog/RichTextEditor.roundtrip
// .test.mjs's own established pattern exactly (same globals, same
// Object.defineProperty workaround for Node 22's read-only `navigator`).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

// Tells React this environment supports act() -- without it, every state
// update inside act() logs "not configured to support act(...)" and (worse,
// confirmed while building this harness) effects can fail to flush
// synchronously, making assertions unreliable.
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createRoot } = await import('react-dom/client');

// Renders `useHookFn` (e.g. `() => useContentEditor('about')`) inside a
// throwaway host component and returns a handle exposing its latest return
// value plus an `act()` wrapper for driving further state updates (calling
// one of the hook's own returned actions, e.g. `.publish()`) so React
// batches and flushes the resulting state updates the same way a real
// browser event handler would.
//
// `initialArg` (optional) is passed through to `useHookFn(arg)` as its sole
// argument and can be changed across renders via the returned `rerender()`
// — for a hook like useMobileNav(pathname) whose own behavior specifically
// depends on that argument CHANGING on an already-mounted instance (e.g. a
// `useEffect` keyed on it), not just on its initial value. Existing callers
// that pass a zero-arg closure (e.g. `() => useContentEditor(type)`) are
// unaffected: `useHookFn(undefined)` behaves identically to `useHookFn()`
// for a function that ignores its arguments.
export async function renderHook(useHookFn, initialArg) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const state = { current: undefined };

  function Host({ arg }) {
    state.current = useHookFn(arg);
    return null;
  }

  await React.act(async () => {
    root.render(React.createElement(Host, { arg: initialArg }));
  });

  return {
    get result() {
      return state.current;
    },
    // Runs `fn` (sync or async) inside act(), then returns the hook's
    // up-to-date return value once every resulting state update has
    // flushed.
    async act(fn) {
      await React.act(async () => {
        await fn(state.current);
      });
      return state.current;
    },
    // Re-renders the same hook instance with a new argument (e.g. a changed
    // pathname), then returns its up-to-date return value once any
    // resulting effect has flushed.
    async rerender(newArg) {
      await React.act(async () => {
        root.render(React.createElement(Host, { arg: newArg }));
      });
      return state.current;
    },
    async unmount() {
      await React.act(async () => {
        root.unmount();
      });
    },
  };
}
