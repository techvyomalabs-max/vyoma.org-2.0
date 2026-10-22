// Full round trip, using the real HTML from all 19 migrated WordPress
// posts: original -> server sanitizer -> editor parsing -> editor
// serialization -> server sanitizer again. Both ends use the real,
// unmodified modules the app actually runs: Backend's sanitizeBlogBody
// (imported across the package boundary -- Node resolves its own
// `sanitize-html` dependency relative to that file's own location, not this
// one) and this editor's actual extension list (richTextEditorExtensions.mjs,
// the same file RichTextEditor.jsx itself imports).
//
// Tiptap/ProseMirror need a DOM to parse HTML outside a browser; jsdom
// supplies that here (test-only devDependency, never shipped).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.DOMParser = dom.window.DOMParser;
global.Node = dom.window.Node;
global.Element = dom.window.Element;
global.HTMLElement = dom.window.HTMLElement;
// Node 22+ ships its own read-only global `navigator` (a Web-standard
// NavigatorID polyfill) -- redefine it instead of assigning, since jsdom's
// richer Navigator is what @tiptap/core's environment checks expect.
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });

const { generateJSON, generateHTML } = await import('@tiptap/core');
const { blogEditorExtensions } = await import('./richTextEditorExtensions.mjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { sanitizeBlogBody } = await import(
  pathToFileURL(path.join(__dirname, '..', '..', '..', '..', '..', 'Backend', 'src', 'modules', 'blog', 'sanitizeBody.js')).href
);

const manifestPath = path.join(__dirname, '..', '..', '..', '..', '..', 'Backend', '.local-media', 'blog-image-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const inlineMap = new Map(manifest.rows.filter((r) => r.type === 'inline').map((r) => [r.originalUrl, r.localUrl]));
function trustImages(html) {
  let next = html;
  for (const [originalUrl, localUrl] of inlineMap) next = next.split(`src="${originalUrl}"`).join(`src="${localUrl}"`);
  return next;
}

function editorRoundTrip(html) {
  const json = generateJSON(html, blogEditorExtensions);
  return generateHTML(json, blogEditorExtensions);
}

function normalizeVoidTags(html) {
  return html.replace(/<(img|hr)([^>]*?)\s*\/?>/gi, (m, tag, attrs) => `<${tag}${attrs}>`);
}
function tagCounts(html) {
  const counts = new Map();
  for (const raw of html.match(/<\/?[a-zA-Z][a-zA-Z0-9]*[^>]*>/g) || []) {
    const name = (raw.match(/^<\/?\s*([a-zA-Z0-9]+)/) || [])[1]?.toLowerCase();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}
// Block-level boundaries (paragraph breaks, list items, table cells, line
// breaks) are always a visible separation to a reader, whether or not the
// source HTML happened to have literal whitespace between the tags --
// browsers render "<p>a</p><p>b</p>" with a visible gap either way. Forcing
// a space at those boundaries (and ONLY those -- not at inline mark
// boundaries like </strong><em>, where ProseMirror legitimately coalescing
// adjacent same-mark runs is a harmless, meaning-preserving normalization)
// means this comparison reflects what a reader actually sees, not incidental
// whitespace-in-the-source-text differences.
const BLOCK_TAGS = /<\/?(p|h1|h2|h3|h4|h5|h6|li|tr|td|br|hr|blockquote|div|figure|table|thead|tbody|ul|ol)[^>]*>/gi;
function textOnly(html) {
  return html
    .replace(BLOCK_TAGS, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// `ins` has no dedicated Tiptap extension (documented gap -- see the
// compatibility report); the editor's schema doesn't recognize it, so a
// generic Mark-less parse keeps its TEXT but drops the tag itself. That's
// the one known, accepted exception to full fidelity through the editor
// specifically (sanitizeBlogBody alone still preserves it on direct API
// saves that never touch the editor, e.g. the scripted image-URL update).
const ACCEPTED_EDITOR_DROPPED_TAGS = new Set(['ins']);

// `strong`/`em` raw tag counts can legitimately shift for two independently
// confirmed, benign reasons (checked by hand against the real output for
// several posts, not assumed):
//  1. ProseMirror coalesces two directly-adjacent runs of the same mark
//     (e.g. "<strong>2. </strong><strong>Why...</strong>" from the
//     original WordPress export) into one continuous mark -- same text,
//     same styling, fewer tags.
//  2. Where bold+italic text also carries a third, differently-scoped mark
//     (a link around just one word inside a bold+italic run), the
//     serializer picks a tag-nesting order that can close and reopen
//     strong/em around that inner span rather than keeping one continuous
//     outer wrapper -- again the same text, same styling (bold, italic,
//     AND the link all still present), just split into more tag instances.
// A per-span character-count metric was tried here and discarded: any
// span-local trimming to ignore boundary whitespace (case 1) ends up
// mis-measuring case 2, because a space that is still correctly rendered
// in the full document can sit exactly at a span's trim point once marks
// reorganize. The full-document `textOnly()` comparison below doesn't have
// this problem -- it already proved reliable across all 19 posts and is
// the real gate on "was any text actually lost." `strong`/`em` tag-count
// changes are therefore informational only, not asserted.
const COALESCE_PRONE_MARK_TAGS = ['strong', 'em'];

// Anchors with no href and no text are already-inert WordPress table-of-
// contents bookmark remnants (their identifying `id`/`name` was already
// stripped by the sanitizer's attribute allowlist before the editor ever
// sees them) -- there's no href for a reader to follow and no text for a
// link mark to attach to, so the editor correctly has nothing to preserve.
// A REAL link loss is checked precisely: every non-empty href present
// before must still be present after, counting duplicates.
function hrefMultiset(html) {
  const hrefs = [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const counts = new Map();
  for (const h of hrefs) counts.set(h, (counts.get(h) || 0) + 1);
  return counts;
}

const fixturesPath = path.join(__dirname, '..', '..', '..', '..', '..', 'Backend', 'src', 'modules', 'blog', '__fixtures__', 'realPostBodies.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

test('full round trip (sanitizer -> editor parse -> editor serialize -> sanitizer) preserves structure and text for every real post', () => {
  const issues = [];
  for (const { slug, body } of fixtures) {
    const trusted = trustImages(body);
    const afterFirstSanitize = sanitizeBlogBody(trusted);
    const afterEditor = editorRoundTrip(afterFirstSanitize);
    const final = sanitizeBlogBody(afterEditor);

    const beforeCounts = tagCounts(normalizeVoidTags(afterFirstSanitize));
    const afterCounts = tagCounts(normalizeVoidTags(final));
    for (const [tag, count] of beforeCounts) {
      if (ACCEPTED_EDITOR_DROPPED_TAGS.has(tag) || COALESCE_PRONE_MARK_TAGS.includes(tag) || tag === 'a') continue;
      const after = afterCounts.get(tag) || 0;
      if (after < count) issues.push(`${slug}: <${tag}> count dropped ${count} -> ${after} across the editor round trip`);
    }

    const beforeHrefs = hrefMultiset(afterFirstSanitize);
    const afterHrefs = hrefMultiset(final);
    for (const [href, count] of beforeHrefs) {
      const after = afterHrefs.get(href) || 0;
      if (after < count) issues.push(`${slug}: link to "${href}" dropped (${count} -> ${after})`);
    }

    if (textOnly(final) !== textOnly(afterFirstSanitize)) issues.push(`${slug}: visible text changed across the editor round trip`);
  }
  assert.equal(issues.length, 0, `\n${issues.join('\n')}`);
});

// Alignment-specific regression (not covered by tag counts or visible
// text, since a class attribute carries no text and doesn't change which
// tags exist): count occurrences of each of the 3 alignment classes
// across the whole document, before vs. after the full sanitizer -> editor
// parse -> editor serialize -> sanitizer round trip, and require an exact
// match per value. This is the test that would have caught the TextAlign
// bug (its default only recognized inline `style="text-align:..."`, never
// the `has-text-align-*` class every real post actually uses, and even
// re-serialized back out as `style`, which the sanitizer then stripped
// entirely).
//
// A per-element positional comparison was tried and discarded: ProseMirror
// auto-wraps bare inline content inside <li>/<blockquote>/table cells in a
// <p> (the same benign, already-accepted restructuring the main fidelity
// test tolerates for unrelated tags -- see its own tag-count check, which
// only flags a *decrease*), which changes how many <p> tags exist with no
// bearing on alignment. Counting only the classes themselves sidesteps
// that entirely while still catching the real bug class: a lost, gained,
// or swapped alignment value anywhere in the document.
function alignmentClassCounts(html) {
  const counts = { left: 0, center: 0, right: 0 };
  for (const align of ['left', 'center', 'right']) {
    counts[align] = (html.match(new RegExp(`has-text-align-${align}\\b`, 'g')) || []).length;
  }
  return counts;
}

test('alignment classes survive the full round trip for every real post (not just tag counts/text)', () => {
  const issues = [];
  for (const { slug, body } of fixtures) {
    const trusted = trustImages(body);
    const afterFirstSanitize = sanitizeBlogBody(trusted);
    const final = sanitizeBlogBody(editorRoundTrip(afterFirstSanitize));

    const before = alignmentClassCounts(afterFirstSanitize);
    const after = alignmentClassCounts(final);
    for (const align of ['left', 'center', 'right']) {
      if (before[align] !== after[align]) {
        issues.push(`${slug}: has-text-align-${align} count changed ${before[align]} -> ${after[align]}`);
      }
    }
  }
  assert.equal(issues.length, 0, `\n${issues.join('\n')}`);
});

// The exact chain requirement 7 asks for, in isolation, for each of the 3
// alignment classes: Sanitizer -> Tiptap parse -> Tiptap serialize ->
// Sanitizer again. Minimal and explicit, independent of any real post.
test('left/center/right alignment survives sanitizer -> parse -> serialize -> sanitizer, in isolation', () => {
  for (const align of ['left', 'center', 'right']) {
    const original = `<p class="has-text-align-${align}">text</p>`;
    const afterFirstSanitize = sanitizeBlogBody(original);
    assert.equal(afterFirstSanitize, original, `${align}: sanitizer alone should be a no-op on its own output`);

    const afterEditor = editorRoundTrip(afterFirstSanitize);
    const final = sanitizeBlogBody(afterEditor);
    assert.equal(final, original, `${align}: lost across sanitizer -> parse -> serialize -> sanitizer`);
  }
});

test('idempotent: a second open-edit-save cycle does not change alignment', () => {
  for (const align of ['left', 'center', 'right']) {
    const original = `<p class="has-text-align-${align}">text</p>`;
    const once = sanitizeBlogBody(editorRoundTrip(sanitizeBlogBody(original)));
    const twice = sanitizeBlogBody(editorRoundTrip(once));
    assert.equal(twice, once, `${align}: alignment drifted on a second pass`);
    assert.equal(twice, original, `${align}: alignment is gone by the second pass`);
  }
});

test('an unrecognized or absent alignment class is simply absent, never invented or defaulted to style=', () => {
  const noClass = sanitizeBlogBody(editorRoundTrip(sanitizeBlogBody('<p>text</p>')));
  assert.equal(noClass, '<p>text</p>');

  const unknownClass = sanitizeBlogBody(editorRoundTrip(sanitizeBlogBody('<p class="has-text-align-justify">text</p>')));
  assert.doesNotMatch(unknownClass, /has-text-align-justify/, 'an alignment value outside the closed enum must not survive');
  assert.doesNotMatch(unknownClass, /style=/, 'alignment must never be represented as an inline style -- the sanitizer would strip it anyway');
});

test('full round trip is idempotent: running it a second time changes nothing a reader would see', () => {
  // Whitespace-insensitive on purpose: a run of whitespace renders
  // identically in HTML regardless of how many spaces/newlines it contains,
  // and whitespace immediately next to a BLOCK-level tag boundary (e.g.
  // "text </p>" vs "text</p>") is invisible in any rendered page either way
  // -- ProseMirror trims/collapses both in ways that can take an extra
  // normalization pass to fully settle. This deliberately does NOT strip
  // whitespace next to an INLINE tag (</strong> <em>, say), since a space
  // between two inline runs is real, visible inter-word spacing.
  const BLOCK_BOUNDARY = /\s*(<\/?(p|h1|h2|h3|h4|h5|h6|li|tr|td|br|hr|blockquote|div|figure|table|thead|tbody|ul|ol)[^>]*>)\s*/gi;
  const normalize = (html) => html.replace(/\s+/g, ' ').replace(BLOCK_BOUNDARY, '$1').trim();
  for (const { slug, body } of fixtures) {
    const trusted = trustImages(body);
    const once = sanitizeBlogBody(editorRoundTrip(sanitizeBlogBody(trusted)));
    const twice = sanitizeBlogBody(editorRoundTrip(once));
    assert.equal(normalize(twice), normalize(once), `${slug}: a second open-edit-save cycle changed visible content further -- not stable`);
  }
});
