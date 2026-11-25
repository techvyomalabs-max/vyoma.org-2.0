// QA Bug 14 — Footer alignment fix regression coverage. Footer.jsx is an
// async Server Component (no 'use client', but still JSX) with no
// React-rendering harness available in this project (the same established
// limitation as every other JSX-returning component here — see e.g.
// app/(public)/join-us/internship/page.emptyState.test.mjs's own header
// comment for the identical situation). Per the task's own instruction to
// "verify actual structural nesting rather than merely checking whether
// class names exist somewhere in the source," this goes beyond a flat
// `assert.match` scan: it extracts the component's actual returned JSX
// block (paren-balanced) and then confirms real parent/child containment
// and sibling ORDER via substring position comparisons within that block
// — not just "does this string appear anywhere in the file."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, 'Footer.jsx'), 'utf8');

// Extracts the exact JSX the `return (` in Footer() produces, by paren-depth
// matching from the first `(` after `return` to its own closing `)` —
// immune to any other parens/braces elsewhere in the file (e.g. inside the
// SVG path data strings or the SOCIAL_PLATFORMS array above it).
function extractReturnedJsx(src) {
  // Must search from Footer() itself, not the file's first "return (" --
  // FooterLink() (defined earlier in the file) also has its own `return (`
  // for its external-link branch.
  const footerFnIndex = src.indexOf('export async function Footer()');
  assert.notEqual(footerFnIndex, -1, 'expected to find "export async function Footer()" in Footer.jsx');
  const returnIndex = src.indexOf('return (', footerFnIndex);
  assert.notEqual(returnIndex, -1, 'expected to find "return (" inside Footer()');
  const start = src.indexOf('(', returnIndex);
  let depth = 0;
  let i = start;
  for (; i < src.length; i += 1) {
    if (src[i] === '(') depth += 1;
    else if (src[i] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  assert.ok(depth === 0 && i < src.length, "expected return (...)'s parens to balance");
  return src.slice(start + 1, i);
}

const jsx = extractReturnedJsx(source);

// Finds the index of a substring within `jsx`, failing loudly (rather than
// silently returning -1 and making every downstream `<` comparison
// vacuously true) if it isn't found at all.
function must(substr) {
  const i = jsx.indexOf(substr);
  assert.notEqual(i, -1, `expected to find ${JSON.stringify(substr)} in Footer's returned JSX`);
  return i;
}

// --- Outer <footer>: full-width background + existing padding preserved,
// flex/alignment classes moved OFF it (onto the new inner wrapper) --------

test('the outer <footer> keeps bg-sky-mist, px-8 and py-7, with no width cap of its own (still full-width)', () => {
  must('<footer className="bg-sky-mist px-8 py-7">');
});

test('the outer <footer> no longer carries the flex/flex-col/items-end/gap-5 layout classes itself -- those moved to the new inner wrapper', () => {
  assert.doesNotMatch(jsx, /<footer className="[^"]*flex[^"]*">/, 'the outer <footer> tag itself must not be a flex container anymore');
});

// --- New inner wrapper: mx-auto + max-w-[1600px], contains both blocks --
// (QA Bug 14 reopened: widened from 1100px -- the standard page-content
// width -- because this footer's own content is denser than a typical page
// section and needs more room to sit on one row at desktop widths. 1600px
// is an approved initial value, not a browser-verified measurement.)

test('a new inner wrapper uses mx-auto and max-w-[1600px], carrying the flex-column layout the footer tag used to have', () => {
  must('<div className="mx-auto flex max-w-[1600px] flex-col items-end gap-5">');
});

test('the inner wrapper opens AFTER <footer> opens and BEFORE the platform-links row opens (real nesting, not just co-presence)', () => {
  const footerOpen = must('<footer className="bg-sky-mist px-8 py-7">');
  const wrapperOpen = must('<div className="mx-auto flex max-w-[1600px] flex-col items-end gap-5">');
  const rowOpen = must('<div className="flex w-full flex-wrap items-start justify-between gap-6">');
  assert.ok(footerOpen < wrapperOpen, '<footer> must open before the inner wrapper');
  assert.ok(wrapperOpen < rowOpen, 'the inner wrapper must open before the platform-links row');
});

// --- Both the platform-links row AND the copyright block are inside the
// SAME wrapper (siblings of each other, both children of the wrapper) ----

test('the platform-links row and the copyright block are both inside the new wrapper, as siblings, in their original order', () => {
  const wrapperOpen = must('<div className="mx-auto flex max-w-[1600px] flex-col items-end gap-5">');
  const rowOpen = must('<div className="flex w-full flex-wrap items-start justify-between gap-6">');
  const copyrightOpen = must('<div className="w-full self-start break-words font-sans text-sm text-charcoal">');

  // The row's own content (identifies where it plausibly closes) -- the
  // last element inside it is the social-icons wrapper div.
  const socialIconsDivOpen = must('<div className="ml-2 flex gap-3">');

  assert.ok(wrapperOpen < rowOpen, 'the platform-links row must be inside the wrapper');
  assert.ok(rowOpen < socialIconsDivOpen, 'the social icons div must be inside the platform-links row');
  assert.ok(socialIconsDivOpen < copyrightOpen, 'the copyright block must come after the platform-links row content, not before or interleaved with it');
  assert.ok(copyrightOpen < jsx.length, 'the copyright block must still be found inside the extracted JSX');
});

test('the copyright block is a sibling of the platform-links row (both direct children of the wrapper), not nested inside the row itself', () => {
  // Depth-count from the wrapper's own opening tag: track <div...> opens vs
  // </div> closes to confirm the copyright div sits at the SAME nesting
  // depth as the platform-links row, one level inside the wrapper -- not
  // one level deeper (which would mean it got nested inside the row by
  // mistake).
  const wrapperOpenTag = '<div className="mx-auto flex max-w-[1600px] flex-col items-end gap-5">';
  const wrapperOpen = must(wrapperOpenTag);
  const rowOpenTag = '<div className="flex w-full flex-wrap items-start justify-between gap-6">';
  const rowOpen = must(rowOpenTag);
  const copyrightOpenTag = '<div className="w-full self-start break-words font-sans text-sm text-charcoal">';
  const copyrightOpen = must(copyrightOpenTag);

  // Count net <div ...> opens minus </div> closes between the wrapper's own
  // opening tag's END and the row's opening tag's start -- expect exactly 0
  // (the row opens immediately as the wrapper's first child, depth 1).
  // Slicing from wrapperOpen (its start) rather than past its own tag text
  // would wrongly count the wrapper's own "<div " as one of these opens.
  const afterWrapperOpen = wrapperOpen + wrapperOpenTag.length;
  const betweenWrapperAndRow = jsx.slice(afterWrapperOpen, rowOpen);
  const opensBeforeRow = (betweenWrapperAndRow.match(/<div /g) || []).length;
  const closesBeforeRow = (betweenWrapperAndRow.match(/<\/div>/g) || []).length;
  assert.equal(opensBeforeRow - closesBeforeRow, 0, 'the platform-links row must be the wrapper\'s first direct child (depth 1)');

  // Between the row's OWN opening tag and the copyright div's opening tag,
  // the row must have fully closed (net opens-closes returns to 0 relative
  // to right after the row's own open) -- i.e. the copyright div is a
  // sibling of the row, not nested inside it.
  const afterRowOpen = rowOpen + rowOpenTag.length;
  const betweenRowAndCopyright = jsx.slice(afterRowOpen, copyrightOpen);
  const opensInBetween = (betweenRowAndCopyright.match(/<div /g) || []).length;
  const closesInBetween = (betweenRowAndCopyright.match(/<\/div>/g) || []).length;
  // +1 closing tag accounts for the row's OWN closing </div>, which must be
  // among these closes for the copyright div to be a sibling, not a child.
  assert.ok(closesInBetween > opensInBetween, 'the platform-links row must have fully closed before the copyright div opens (sibling, not nested child)');
});

// --- Content, links, attributes and accessibility completely unchanged --

test('platform links and footer links are still rendered from the same unchanged PLATFORM_LINKS/FOOTER_LINKS imports via the unchanged FooterLink component', () => {
  assert.match(source, /import \{ FOOTER_LINKS, PLATFORM_LINKS \} from '@\/lib\/navConfig';/);
  assert.match(jsx, /\{PLATFORM_LINKS\.map\(\(l\) => \(\s*\n\s*<FooterLink key=\{l\.label\} label=\{l\.label\} href=\{l\.href\} external=\{l\.external\} \/>\s*\n\s*\)\)\}/);
  assert.match(jsx, /\{FOOTER_LINKS\.map\(\(l\) => \(\s*\n\s*<FooterLink key=\{l\.label\} label=\{l\.label\} href=\{l\.href\} external=\{l\.external\} \/>\s*\n\s*\)\)\}/);
});

test('the "Our Platforms" label and its accessibility-contrast class (text-charcoal/70, Task 7D.12) are unchanged', () => {
  assert.match(jsx, /<span className="mr-1 font-sans text-xs font-bold uppercase tracking-wide text-charcoal\/70">Our Platforms<\/span>/);
});

test('social icons are unchanged: same SOCIAL_PLATFORMS filter, same href/target/rel/title attributes, same icon size and fill', () => {
  assert.match(
    jsx,
    /\{SOCIAL_PLATFORMS\.filter\(\(p\) => socialLinks\[p\.slug\]\)\.map\(\(p\) => \(/
  );
  assert.match(jsx, /target="_blank"/);
  assert.match(jsx, /rel="noopener noreferrer"/);
  assert.match(jsx, /title=\{p\.name\}/);
  assert.match(jsx, /className="block h-\[18px\] w-\[18px\]"/);
  assert.match(jsx, /fill="var\(--color-vyoma-blue\)"/);
});

test('FooterLink itself (external vs internal Link, hover/transition classes) is completely unchanged', () => {
  assert.match(
    source,
    /function FooterLink\(\{ label, href, external \}\) \{\s*\n\s*const className =\s*\n\s*'font-sans text-base text-vyoma-blue transition-colors duration-\[var\(--duration-fast\)\] ease-\[var\(--ease-standard\)\] hover:text-charcoal';/
  );
});

test('the copyright text is byte-identical to before', () => {
  assert.match(jsx, /© 2026 Vyoma Linguistic Labs Foundation\. All rights reserved\./);
});

test('SOCIAL_PLATFORMS, SOCIAL_ICON_PATHS and the Settings-backed socialLinks fetch/fallback are completely unchanged', () => {
  assert.match(source, /const SOCIAL_PLATFORMS = \[/);
  assert.match(source, /const SOCIAL_ICON_PATHS = \{/);
  assert.match(source, /const settings = await getPublicSettings\(\);/);
  assert.match(source, /socialLinks = settings\.socialLinks \|\| \{\};/);
  assert.match(source, /console\.error\('\[Footer\] getPublicSettings failed, rendering without social links:', err\.message\);/);
});

// --- Responsive wrapping / no new breakpoints / no hardcoded margins ----

test('existing flex-wrap responsive behavior is preserved on both the platform-links row and its two inner groups', () => {
  assert.match(jsx, /<div className="flex w-full flex-wrap items-start justify-between gap-6">/);
  assert.match(jsx, /<div className="flex flex-wrap gap-x-5 gap-y-2">/);
  assert.match(jsx, /<div className="ml-auto flex flex-wrap items-center justify-end gap-5">/);
});

// --- ml-auto on the right-hand group (QA Bug 14 reopened): keeps it
// right-aligned even when flex-wrap pushes it onto its own second line,
// where a lone flex item under justify-between would otherwise fall back
// to flex-start (left-aligned) per the flexbox spec --------------------

test('the right-hand group (footer links + social icons) carries ml-auto, preserving its existing justify-end and all its other classes unchanged', () => {
  must('<div className="ml-auto flex flex-wrap items-center justify-end gap-5">');
});

test('ml-auto is on the right-hand group ONLY -- the platform-links (left) group and the row/wrapper are untouched', () => {
  assert.doesNotMatch(jsx, /<div className="ml-auto flex flex-wrap gap-x-5 gap-y-2">/, 'ml-auto must not have been added to the left-hand platform-links group');
  assert.doesNotMatch(jsx, /<div className="ml-auto flex w-full flex-wrap items-start justify-between gap-6">/, 'ml-auto must not have been added to the row itself');
  assert.doesNotMatch(jsx, /<div className="ml-auto mx-auto flex max-w-\[1600px\]/, 'ml-auto must not have been added to the outer wrapper');
});

test('the row\'s existing justify-between and the right-hand group\'s own justify-end are both still present, unremoved, alongside the new ml-auto', () => {
  assert.match(jsx, /<div className="flex w-full flex-wrap items-start justify-between gap-6">/, 'justify-between must still be present on the row (preserved, now redundant-but-harmless once ml-auto supplies right alignment)');
  assert.match(jsx, /<div className="ml-auto flex flex-wrap items-center justify-end gap-5">/, 'justify-end must still be present on the right-hand group itself');
});

test('no viewport-specific breakpoint prefix (sm:/md:/lg:/xl:/2xl:) or hardcoded margin/left/right utility was introduced anywhere in this file', () => {
  assert.doesNotMatch(source, /\b(?:sm|md|lg|xl|2xl):/, 'no new responsive breakpoint should have been introduced for this fix');
  assert.doesNotMatch(source, /\bml-\[|mr-\[|pl-\[|pr-\[/, 'no hardcoded pixel margin/padding should have been introduced');
});

test('the component is still a single mx-auto max-w wrapper, not multiple competing width constraints that could cause horizontal overflow', () => {
  // Matches only an actual className attribute's max-w-[...], not the
  // explanatory code comments elsewhere in the file that also mention
  // max-w-[1600px]/max-w-[1100px] in prose.
  const maxWOccurrences = (source.match(/className="[^"]*max-w-\[/g) || []).length;
  assert.equal(maxWOccurrences, 1, 'expected exactly one max-w-[...] class in this file -- the new wrapper -- not several that could conflict');
});

// --- Shared layout wiring (confirms the fix lives in the one shared
// component every public page already renders, not a per-page duplicate) --

test('the shared public layout still imports and renders Footer unchanged', () => {
  const layoutPath = path.join(__dirname, '..', '..', 'app', '(public)', 'layout.js');
  const layoutSource = fs.readFileSync(layoutPath, 'utf8');
  assert.match(layoutSource, /import \{ Footer \} from '@\/components\/layout\/Footer';/);
  assert.match(layoutSource, /<Footer \/>/);
});
