// Regression coverage for QA Bug 15 (Privacy Policy / Terms & Conditions UI
// improvements). Follows the exact convention already established by
// globals.overflowFix.test.mjs: assert against the real rule text in the
// real globals.css (so a future edit can't silently drop a declaration
// without a test failure), plus source-level checks on both page files
// confirming they apply the identical class. A live browser check of
// rendered pixel alignment, list-number visibility and responsive
// wrapping is NOT claimed here -- see the task's own report for what
// still needs manual QA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');
const privacySource = fs.readFileSync(path.join(__dirname, '(public)', 'privacy', 'page.js'), 'utf8');
const termsSource = fs.readFileSync(path.join(__dirname, '(public)', 'terms', 'page.js'), 'utf8');

// Matches the selector only at the start of a line (plus its leading
// indentation), so a comment that merely *mentions* a selector as prose
// (this file's own new comment block does, extensively) is never mistaken
// for the real rule -- identical technique to globals.overflowFix.test.mjs.
function ruleBodyFor(selector, source) {
  const pattern = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'm');
  const match = pattern.exec(source);
  assert.notEqual(match, null, `selector "${selector}" not found as a real rule (only in a comment?) in globals.css`);
  const openBrace = source.indexOf('{', match.index);
  const closeBrace = source.indexOf('}', openBrace);
  return source.slice(openBrace + 1, closeBrace);
}

// --- Both pages apply the identical legal-content class, alongside the
// existing prose-blog class (never replacing it) --------------------------

// QA Bug 15 (second reopening): the wrapper div's class attribute is
// unchanged, but the rendering line now reads BODY through the approved
// render-only stripBlankLegalParagraphs() normalization (see
// Frontend/lib/stripBlankLegalParagraphs.mjs and its own dedicated test
// file for that function's full coverage) rather than BODY directly --
// the div itself is also now written across multiple lines rather than
// one. Both assertions below are updated to match exactly, confirming
// both pages still use the SAME rendering mechanism (dangerouslySetInnerHTML),
// the same shared normalization utility, and the same unchanged wrapper
// classes -- no unrelated rendering or layout change was introduced.
test('Privacy applies legal-content alongside the existing prose-blog class, with every other existing wrapper class unchanged, and renders BODY through the approved stripBlankLegalParagraphs normalization', () => {
  assert.match(
    privacySource,
    /<div\s*\n\s*className="prose-blog legal-content font-sans text-\[17px\] leading-normal text-charcoal"\s*\n\s*dangerouslySetInnerHTML=\{\{ __html: stripBlankLegalParagraphs\(BODY\) \}\}\s*\n\s*\/>/
  );
});

test('Terms applies legal-content alongside the existing prose-blog class, with every other existing wrapper class unchanged, and renders BODY through the approved stripBlankLegalParagraphs normalization', () => {
  assert.match(
    termsSource,
    /<div\s*\n\s*className="prose-blog legal-content font-sans text-\[17px\] leading-normal text-charcoal"\s*\n\s*dangerouslySetInnerHTML=\{\{ __html: stripBlankLegalParagraphs\(BODY\) \}\}\s*\n\s*\/>/
  );
});

test('Privacy and Terms apply the exact same wrapper div markup -- byte-identical except for the content-fetch call and component name (already true before this fix, confirmed unaffected by it)', () => {
  const stripIdentity = (src) =>
    src
      .replace(/getPrivacyContent|getTermsContent/g, 'getLegalContent')
      .replace(/PrivacyPage|TermsPage/g, 'LegalPage')
      .replace(/'\/privacy'|'\/terms'/g, "'/legal'");
  assert.equal(stripIdentity(privacySource), stripIdentity(termsSource));
});

test('existing content fetch functions, SEO metadata construction, and effective-date rendering are unchanged on both pages', () => {
  for (const src of [privacySource, termsSource]) {
    assert.match(src, /const \{ TITLE, EFFECTIVE_DATE, BODY \} = await get(?:Privacy|Terms)Content\(\);/);
    assert.match(src, /\{EFFECTIVE_DATE && \(/);
    assert.match(src, /Effective date: \{EFFECTIVE_DATE\}/);
    assert.match(src, /export async function generateMetadata\(\) \{/);
    assert.match(src, /const \{ SEO, TITLE \} = await get(?:Privacy|Terms)Content\(\);/);
  }
});

test('the existing 820px max-width container and section padding are unchanged on both pages', () => {
  assert.match(privacySource, /<section className="bg-white px-8 py-16">/);
  assert.match(privacySource, /<div className="mx-auto max-w-\[820px\]">/);
  assert.match(termsSource, /<section className="bg-white px-8 py-16">/);
  assert.match(termsSource, /<div className="mx-auto max-w-\[820px\]">/);
});

test('the shared PageHero is used identically on both pages, unchanged', () => {
  assert.match(privacySource, /<PageHero eyebrow="Legal" eyebrowSize="text-\[16px\]" title=\{TITLE\} \/>/);
  assert.match(termsSource, /<PageHero eyebrow="Legal" eyebrowSize="text-\[16px\]" title=\{TITLE\} \/>/);
});

test('dangerouslySetInnerHTML is still the only HTML-rendering mechanism on both pages, now fed BODY through the approved render-only stripBlankLegalParagraphs normalization rather than directly', () => {
  assert.match(privacySource, /dangerouslySetInnerHTML=\{\{ __html: stripBlankLegalParagraphs\(BODY\) \}\}/);
  assert.match(termsSource, /dangerouslySetInnerHTML=\{\{ __html: stripBlankLegalParagraphs\(BODY\) \}\}/);
  // Confirms both pages import the SAME shared utility -- never a
  // per-page duplicate -- so they can never drift apart from each other.
  assert.match(privacySource, /import \{ stripBlankLegalParagraphs \} from '@\/lib\/stripBlankLegalParagraphs\.mjs';/);
  assert.match(termsSource, /import \{ stripBlankLegalParagraphs \} from '@\/lib\/stripBlankLegalParagraphs\.mjs';/);
});

// --- Heading typography and spacing -----------------------------------

test('headings share margin-top: 24px, margin-bottom: 12px, font-weight: 700 and the site heading color token', () => {
  const body = ruleBodyFor('.legal-content :where(h1, h2, h3) {', css);
  assert.match(body, /margin-top:\s*24px/);
  assert.match(body, /margin-bottom:\s*12px/);
  assert.match(body, /font-weight:\s*700/);
  assert.match(body, /color:\s*var\(--text-heading\)/);
});

test('h1 is 28px with a readable line-height', () => {
  const body = ruleBodyFor('.legal-content h1 {', css);
  assert.match(body, /font-size:\s*28px/);
  assert.match(body, /line-height:\s*[\d.]+/);
});

test('h2 is 24px with a readable line-height', () => {
  const body = ruleBodyFor('.legal-content h2 {', css);
  assert.match(body, /font-size:\s*24px/);
  assert.match(body, /line-height:\s*[\d.]+/);
});

test('h3 is 20px, font-weight 600 (overriding the shared 700), with a readable line-height', () => {
  const body = ruleBodyFor('.legal-content h3 {', css);
  assert.match(body, /font-size:\s*20px/);
  assert.match(body, /font-weight:\s*600/);
  assert.match(body, /line-height:\s*[\d.]+/);
});

test('the first heading has its margin-top trimmed, so it does not sit unbalanced below the effective-date line', () => {
  const body = ruleBodyFor('.legal-content > :where(h1, h2, h3):first-child {', css);
  assert.match(body, /margin-top:\s*0/);
});

// --- Paragraph spacing ---------------------------------------------------

test('paragraphs have margin-bottom: 16px', () => {
  const body = ruleBodyFor('.legal-content p {', css);
  assert.match(body, /margin-bottom:\s*16px/);
});

// --- List marker restoration, indentation and item spacing --------------

test('ordered lists restore native decimal markers (never a CSS counter/::marker override)', () => {
  const body = ruleBodyFor('.legal-content ol {', css);
  assert.match(body, /list-style:\s*decimal/);
});

test('unordered lists restore native disc markers', () => {
  const body = ruleBodyFor('.legal-content ul {', css);
  assert.match(body, /list-style:\s*disc/);
});

test('no CSS counter-reset/counter-increment/::marker/content-based numbering exists anywhere in this file -- native HTML list numbering (including existing ol start attributes) is the only numbering mechanism', () => {
  // Strips /* ... */ comments first -- this file's own explanatory comment
  // for the list-marker rules legitimately mentions "::marker" in prose,
  // as a bare string match in the real CSS would be a false positive here.
  const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(cssWithoutComments, /counter-reset|counter-increment|::marker|content:\s*counter/);
});

test('lists (ol and ul) share 24px left indentation and 16px bottom margin', () => {
  const body = ruleBodyFor('.legal-content :where(ol, ul) {', css);
  assert.match(body, /padding-left:\s*24px/);
  assert.match(body, /margin-bottom:\s*16px/);
});

test('list items have 8px bottom spacing, trimmed on the last item to avoid doubling with the list\'s own margin-bottom', () => {
  const liBody = ruleBodyFor('.legal-content li {', css);
  assert.match(liBody, /margin-bottom:\s*8px/);
  const lastBody = ruleBodyFor('.legal-content li:last-child {', css);
  assert.match(lastBody, /margin-bottom:\s*0/);
});

test('the last content block\'s own margin-bottom is trimmed, keeping first/last spacing visually balanced', () => {
  const body = ruleBodyFor('.legal-content > :where(h1, h2, h3, p, ol, ul):last-child {', css);
  assert.match(body, /margin-bottom:\s*0/);
});

// --- Scoping: every new selector lives under .legal-content only --------

test('every new declaration introduced for this fix is scoped under the .legal-content selector', () => {
  const start = css.indexOf('QA Bug 15 — Privacy Policy / Terms & Conditions UI');
  assert.notEqual(start, -1, 'expected to find the QA Bug 15 comment block marking where this fix begins');
  const newSection = css.slice(start);
  // Every rule-opening brace in this new section must be preceded by
  // ".legal-content" somewhere on the same selector line.
  const selectorLines = newSection.split('\n').filter((line) => line.includes('{') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'));
  for (const line of selectorLines) {
    assert.match(line, /\.legal-content/, `expected every new selector to be scoped under .legal-content, found: "${line.trim()}"`);
  }
});

test('the new rules do not redefine or remove any existing .prose-blog declaration (overflow-wrap, has-text-align-*, table) -- those remain exactly as before', () => {
  const proseBlogBody = ruleBodyFor('.prose-blog {', css);
  assert.match(proseBlogBody, /overflow-wrap:\s*anywhere/);
  const tableBody = ruleBodyFor('.prose-blog table {', css);
  assert.match(tableBody, /display:\s*block/);
  assert.match(tableBody, /overflow-x:\s*auto/);
  assert.match(tableBody, /max-width:\s*100%/);
  const leftAlign = ruleBodyFor('.prose-blog :where(p, h1, h2, h3, h4, h5, h6, td).has-text-align-left {', css);
  assert.match(leftAlign, /text-align:\s*left/);
});

test('no unrelated file (blog page, admin rich-text editors, Header, Footer) references the new legal-content class', () => {
  const blogSource = fs.readFileSync(path.join(__dirname, '(public)', 'media', 'blog', '[slug]', 'page.js'), 'utf8');
  assert.doesNotMatch(blogSource, /legal-content/, 'the public blog page must never receive the new class');

  const blogEditorSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'admin', 'cms', 'blog', 'RichTextEditor.jsx'),
    'utf8'
  );
  assert.doesNotMatch(blogEditorSource, /legal-content/, 'the admin blog rich-text editor must never receive the new class');

  const legalEditorSource = fs.readFileSync(
    path.join(__dirname, '..', 'components', 'admin', 'cms', 'legal', 'LegalRichTextEditor.jsx'),
    'utf8'
  );
  assert.doesNotMatch(legalEditorSource, /legal-content/, 'the admin legal rich-text editor must never receive the new class (same preview styling as before)');

  const headerSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'layout', 'Header.jsx'), 'utf8');
  const footerSource = fs.readFileSync(path.join(__dirname, '..', 'components', 'layout', 'Footer.jsx'), 'utf8');
  assert.doesNotMatch(headerSource, /legal-content/);
  assert.doesNotMatch(footerSource, /legal-content/);
});

// --- Existing overflow protections remain intact (re-confirmed here too,
// not just in globals.overflowFix.test.mjs, since this task touches the
// same file) ---------------------------------------------------------------

test('the existing global `a` overflow-wrap rule and .prose-blog\'s own overflow-wrap/table rules are untouched by this fix', () => {
  const aBody = ruleBodyFor('a {', css);
  assert.match(aBody, /overflow-wrap:\s*anywhere/);
  const proseBlogBody = ruleBodyFor('.prose-blog {', css);
  assert.match(proseBlogBody, /overflow-wrap:\s*anywhere/);
});
