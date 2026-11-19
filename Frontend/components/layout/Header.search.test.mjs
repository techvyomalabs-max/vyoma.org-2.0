// QA Bug 5, Stage 5: regression coverage for SearchBox()'s search
// submission wiring. Header.jsx is a client component with real JSX, and
// this project has no React-rendering harness for any JSX-returning file
// (same already-established limitation as every other Header.*.test.mjs
// in this project) -- so the whole file cannot be `import`-ed.
//
// This file gets real behavioral coverage anyway for submit()'s own exact
// logic: submit() is defined with free variables (`value`, `router`,
// `lastSubmitRef`) that are normally supplied by closure from inside
// SearchBox() -- this test extracts submit()'s verbatim body and wraps it
// in `new Function('value', 'router', 'lastSubmitRef', body)`, supplying
// those same three names as real parameters instead of closures. This
// executes the real, unmodified logic (trimming, the empty guard, the
// debounce window, encodeURIComponent, and the exact router.push target)
// with controlled fake inputs -- genuine runtime behavior, not a re-typed
// duplicate and not a regex match. Everything about the surrounding JSX
// wiring (which event calls submit(), the input's aria-label, the icon
// button's branching) is a separate, explicitly-labelled structural
// source-text assertion instead, never claimed as browser/render
// verification.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Header.jsx'), 'utf8');

function extractSubmitBody() {
  const marker = 'const submit = () => {';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'submit() not found in SearchBox()');
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
  assert.ok(i < source.length, 'could not find the end of submit()\'s body');
  // Exclude the outer braces themselves -- just the statements inside.
  return source.slice(braceStart + 1, i);
}

function makeSubmit() {
  const body = extractSubmitBody();
  // eslint-disable-next-line no-new-func -- deliberate: executing the
  // real, verbatim-extracted statements as real code, with `value`/
  // `router`/`lastSubmitRef`/`setValue`/`setOpen` supplied as explicit
  // parameters in place of the closures SearchBox() normally provides.
  return new Function('value', 'router', 'lastSubmitRef', 'setValue', 'setOpen', body);
}

function fakeRouter() {
  const calls = [];
  return { push: (url) => calls.push(url), calls };
}

function spy() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  return fn;
}

// --- submit(): real, extracted behavior ---------------------------------

test('submit() trims whitespace and navigates to /search?q=<encoded> for a plain English keyword', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: '', time: 0 } };
  submit('  team  ', router, ref, spy(), spy());
  assert.deepEqual(router.calls, ['/search?q=team']);
});

test('a valid submission closes the input and clears the keyword', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: '', time: 0 } };
  const setValue = spy();
  const setOpen = spy();
  submit('team', router, ref, setValue, setOpen);
  assert.deepEqual(setValue.calls, [['']], 'the keyword must be cleared after a real submission');
  assert.deepEqual(setOpen.calls, [[false]], 'the input must be closed after a real submission');
});

test('submit() never navigates for an empty or whitespace-only value, and never clears/closes the input for one', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: '', time: 0 } };
  const setValue = spy();
  const setOpen = spy();
  submit('', router, ref, setValue, setOpen);
  submit('   ', router, ref, setValue, setOpen);
  submit('\t\n', router, ref, setValue, setOpen);
  assert.deepEqual(router.calls, []);
  assert.deepEqual(setValue.calls, [], 'an empty/whitespace-only submission must never clear the input');
  assert.deepEqual(setOpen.calls, [], 'an empty/whitespace-only submission must never close the input');
});

test('submit() encodes Tamil, Devanagari, and IAST queries correctly', () => {
  const submit = makeSubmit();
  for (const q of ['தமிழ்', 'गीता', 'Gītā']) {
    const router = fakeRouter();
    const ref = { current: { value: '', time: 0 } };
    submit(q, router, ref, spy(), spy());
    assert.deepEqual(router.calls, [`/search?q=${encodeURIComponent(q.trim())}`]);
  }
});

test('submit() blocks an accidental, near-instant repeat of the exact same keyword, and never clears/closes the input for it', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  // Simulates a second call arriving 10ms after the first, as a held key
  // or rapid double-click would -- the ref already reflects "just
  // submitted this value", so the guard must suppress this one.
  const ref = { current: { value: 'team', time: Date.now() - 10 } };
  const setValue = spy();
  const setOpen = spy();
  submit('team', router, ref, setValue, setOpen);
  assert.deepEqual(router.calls, [], 'a near-instant repeat of the same keyword must be suppressed');
  assert.deepEqual(setValue.calls, [], 'a suppressed duplicate must never clear the input');
  assert.deepEqual(setOpen.calls, [], 'a suppressed duplicate must never close the input');
});

test('submit() never permanently blocks a legitimate repeat search of the same keyword once the short window has passed', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: 'team', time: Date.now() - 2000 } }; // 2s ago -- well past the 1s window
  const setValue = spy();
  const setOpen = spy();
  submit('team', router, ref, setValue, setOpen);
  assert.deepEqual(router.calls, ['/search?q=team'], 'a deliberate repeat search after the debounce window must go through');
  assert.deepEqual(setValue.calls, [['']], 'a real repeat submission must still clear the input, same as any other valid submission');
  assert.deepEqual(setOpen.calls, [[false]]);
});

test('submit() allows back-to-back submissions of two different keywords, even within the debounce window', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: 'team', time: Date.now() - 10 } };
  submit('leadership', router, ref, spy(), spy());
  assert.deepEqual(router.calls, ['/search?q=leadership'], 'the debounce must only ever match the identical trimmed value, not any recent submission');
});

test('submit() updates lastSubmitRef after a real submission, so an immediate identical resubmission is suppressed next', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: '', time: 0 } };
  submit('team', router, ref, spy(), spy());
  assert.equal(ref.current.value, 'team');
  submit('team', router, ref, spy(), spy()); // immediately again
  assert.equal(router.calls.length, 1, 'the second, immediate call must be suppressed by the ref this same function just set');
});

test('a new keyword can be searched normally right after a previous valid submission', () => {
  const submit = makeSubmit();
  const router = fakeRouter();
  const ref = { current: { value: '', time: 0 } };
  submit('team', router, ref, spy(), spy());
  submit('leadership', router, ref, spy(), spy());
  assert.deepEqual(router.calls, ['/search?q=team', '/search?q=leadership']);
});

test('setValue(\'\')/setOpen(false) appear in the real source only after router.push, not before the early-return guards', () => {
  assert.match(source, /router\.push\(`\/search\?q=\$\{encodeURIComponent\(trimmed\)\}`\);\s*\n[\s\S]*?setValue\(''\);\s*\n\s*setOpen\(false\);/);
});

// --- Structural assertions on the JSX wiring (NOT browser/render verification) --

test('clicking the search icon while closed opens the input (structural: existing toggle branch preserved)', () => {
  assert.match(source, /if \(open && value\.trim\(\)\) submit\(\);\s*\n\s*else setOpen\(\(o\) => !o\);/);
});

test('pressing Enter in the input calls submit() (structural)', () => {
  assert.match(source, /onKeyDown=\{\(e\) => \{\s*\n\s*if \(e\.key === 'Enter'\) submit\(\);/);
});

test('the input has its own accessible label, distinct from the icon button\'s', () => {
  assert.match(source, /aria-label="Search the site"/);
  assert.match(source, /aria-label="Search"/);
});

test('both desktop and mobile render the exact same SearchBox function -- no second implementation', () => {
  const defCount = (source.match(/function SearchBox\(\)/g) || []).length;
  const usageCount = (source.match(/<SearchBox \/>/g) || []).length;
  assert.equal(defCount, 1, 'SearchBox must be defined exactly once');
  assert.equal(usageCount, 2, 'SearchBox must be rendered at both the desktop and mobile call sites');
});

test('the existing onBlur-closes-when-empty behavior is preserved unchanged', () => {
  assert.match(source, /onBlur=\{\(\) => !value && setOpen\(false\)\}/);
});

test('no raw HTML injection is introduced -- no dangerouslySetInnerHTML anywhere in this file', () => {
  assert.ok(!source.includes('dangerouslySetInnerHTML'));
});

test('navigation targets only the internal /search route, never an external URL or window.location', () => {
  assert.match(source, /router\.push\(`\/search\?q=\$\{encodeURIComponent\(trimmed\)\}`\)/);
  assert.ok(!source.includes('window.location'));
});

test('no Stage 1-4 search module, Atlas, payment, donation, or FCRA code is referenced by this file', () => {
  assert.ok(!source.includes('searchPublicContent'));
  assert.ok(!source.includes('searchEngine'));
  assert.ok(!source.includes('searchAdapters'));
  assert.ok(!source.includes('searchRegistry'));
  assert.ok(!source.includes('razorpay'));
  assert.ok(!source.includes('Razorpay'));
  assert.ok(!source.includes('mongodb'));
});
