// Regression coverage for the mobile horizontal-overflow fix: a long,
// unbroken URL (as a real <a> link, or as plain text never wrapped in one)
// or a wide rich-text table previously forced the whole page wider than
// the viewport on mobile across 7 real pages (/media/where-iks, several
// blog posts, /privacy). Since the fix lives entirely in CSS, this test
// asserts the three rules it depends on are present in the source file,
// so a future edit to globals.css can't silently drop them without a
// test failure -- a live Playwright check of the rendered pages is the
// real end-to-end proof (done manually; see the task's verification
// report), this just guards the source of truth those pages depend on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');

// Matches the selector only at the start of a line (plus its leading
// indentation), so a comment that merely *mentions* e.g. "a { color: ... }"
// as prose (several do, in this file) is never mistaken for the real rule.
function ruleBodyFor(selector, source) {
  const pattern = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
  const match = pattern.exec(source);
  assert.notEqual(match, null, `selector "${selector}" not found as a real rule (only in a comment?) in globals.css`);
  const openBrace = source.indexOf('{', match.index);
  const closeBrace = source.indexOf('}', openBrace);
  return source.slice(openBrace + 1, closeBrace);
}

test('the global `a` rule wraps long unbroken link text (e.g. a URL used as its own label)', () => {
  const body = ruleBodyFor('a {', css);
  assert.match(body, /overflow-wrap:\s*anywhere/);
});

test('`.prose-blog` itself wraps long unbroken plain text (a URL typed directly in a paragraph, never linked)', () => {
  const body = ruleBodyFor('.prose-blog {', css);
  assert.match(body, /overflow-wrap:\s*anywhere/);
});

test('`.prose-blog table` scrolls within its own bounds instead of widening the page', () => {
  const body = ruleBodyFor('.prose-blog table {', css);
  assert.match(body, /display:\s*block/);
  assert.match(body, /overflow-x:\s*auto/);
  assert.match(body, /max-width:\s*100%/);
});

test('the table fix is scoped to .prose-blog only, not applied to every table on the site (would affect admin/dashboard tables)', () => {
  // A bare `table { display: block }` with no .prose-blog prefix anywhere
  // in the file would mean the scoping was accidentally widened/removed.
  assert.equal(/(?<!\.prose-blog\s)\btable\s*\{\s*\n\s*display:\s*block/.test(css), false);
});
