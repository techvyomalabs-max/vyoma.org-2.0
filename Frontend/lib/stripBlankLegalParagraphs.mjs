// QA Bug 15 (third reopening) — render-only normalization of blank
// formatting paragraphs for Privacy Policy and Terms & Conditions ONLY.
// Imported exclusively by Frontend/app/(public)/privacy/page.js and
// Frontend/app/(public)/terms/page.js, applied to the BODY string
// immediately before dangerouslySetInnerHTML -- never touches the stored
// Content document, never re-runs on save, never affects any other page.
// Pure function: never mutates its input, always returns a new string.
//
// This replaces an earlier regex-based implementation. That approach
// could not reliably distinguish a genuine <p> element from a
// blank-paragraph-shaped substring sitting inside a quoted attribute
// value (e.g. a crafted href) -- a real, confirmed content-corruption
// case, not a hypothetical one. This implementation uses `parse5`
// (the same spec-compliant HTML5 parsing engine that underlies jsdom) to
// build a real parse tree with source-location tracking, and only ever
// deletes verified source spans of genuinely-matched <p> nodes from the
// ORIGINAL string -- it never serializes or rewrites the parsed tree, and
// every byte outside an approved removal span is passed through
// byte-identical.
//
// APPROVED REMOVABLE CONTENT (exact, enumerated -- nothing else):
//   - Zero characters (a truly empty `<p></p>`).
//   - ASCII space (U+0020), tab (U+0009), carriage return (U+000D), line
//     feed (U+000A), form feed (U+000C).
//   - The literal U+00A0 NON-BREAKING SPACE character.
//   - The exact literal entity text `&nbsp;`, `&#160;`, `&#xA0;`, or
//     `&#xa0;` -- matched against the RAW SOURCE TEXT, never the parser's
//     own decoded value. parse5 decodes all of these (and plenty of OTHER
//     character references, e.g. `&#32;` for space) to the same character
//     internally for its own tree-building purposes -- relying on the
//     decoded value alone would silently widen the approved set to any
//     entity that happens to decode to an approved character. This
//     function never does that: it independently re-checks the EXACT raw
//     source text of each candidate paragraph's content against the
//     explicitly-approved literal/entity spellings only.
//
// MANDATORY ELIGIBILITY CHECKS -- a <p> is removed only when ALL of the
// following hold:
//   1. It is a genuine element node, tagName === 'p', in the HTML
//      namespace (http://www.w3.org/1999/xhtml) -- never a same-named
//      element in a foreign-content (SVG/MathML) subtree, which this
//      content never contains but which parse5 itself distinguishes.
//   2. It has zero attributes.
//   3. Every child node is a text node -- zero child elements, zero child
//      comments. A `<br>`, a nested `<strong>`, or a comment anywhere
//      inside disqualifies the match entirely.
//   4. It has a complete `sourceCodeLocation` with BOTH an explicit
//      `startTag` and an explicit `endTag` location. An implicitly-closed
//      <p> (the HTML5 "a <p> auto-closes when certain other tags are
//      encountered" rule, or a genuinely unclosed <p> at the end of the
//      input) never has an `endTag` location at all -- there is no
//      literal `</p>` token in the source for it -- so this check alone
//      correctly and structurally excludes every implicitly-closed
//      paragraph from ever being considered, with no separate special
//      case needed.
//   5. All four offsets (`startOffset`/`endOffset` on the overall
//      location, and on `startTag`/`endTag`) are present, are integers,
//      are internally consistent (overall span starts exactly where the
//      start tag starts and ends exactly where the end tag ends, the
//      start tag ends at or before the end tag starts), and fall within
//      the bounds of the original string. Any inconsistency here aborts
//      just that one candidate (it is simply not removed), never the
//      whole operation.
//   6. The exact raw source text of the start tag is the literal 3
//      characters `<p>`, and the end tag is the literal 4 characters
//      `</p>` -- rejecting any other casing/whitespace/self-closing
//      variant defensively, even though parse5 would not produce this
//      node shape for such input anyway.
//   7. The exact raw source text BETWEEN the start and end tags matches
//      only the explicitly-approved literal whitespace characters and/or
//      the four named entity spellings, in any mixture or repetition --
//      verified independently of, and in addition to, check 3's
//      node-based "every child is text" structural check.
//
// WHY THIS CORRECTLY HANDLES EVERY REQUIRED ADVERSARIAL CASE (verified
// empirically against the real, already-resolved `parse5` package, not
// merely reasoned about):
//   - A blank-paragraph-shaped substring inside a quoted attribute value
//     (e.g. `<a href="https://x/<p></p>">`) is parsed as part of that
//     attribute's VALUE by parse5's real HTML5 tokenizer -- no `<p>` node
//     is ever created for it at all. There is nothing for this function
//     to find or remove; the input is returned byte-identical.
//   - A blank-paragraph-shaped substring inside an HTML comment is parsed
//     as part of that comment's `data` string, never as a child element --
//     structurally impossible to misidentify as a <p> node.
//   - The same shape inside `<script>`/`<style>`/`<textarea>`/`<title>`
//     raw-text content is parsed as that element's own text content, never
//     as a nested element.
//   - Malformed/unclosed input never produces a false match (see
//     eligibility check 4): only a <p> with a REAL, explicit `</p>` in the
//     source can ever be removed.
//
// SAFETY NET -- reparse-and-compare: after computing the candidate result,
// this function re-parses it and walks both trees (the original, with the
// approved-for-removal nodes excluded, and the candidate result) together,
// confirming every remaining node matches in type, tag name, attributes,
// text/comment content, and child count/order. If anything else differs
// -- or if parsing, matching, or verification throws for any reason -- the
// ORIGINAL html is returned completely unchanged. This function never
// throws; a failure anywhere in this process is always a silent no-op,
// not a new exception reaching the page that renders it.
//
// This function does not, by itself, guarantee complete security merely
// because it only ever deletes characters -- the reparse-and-compare
// verification above is what actually confirms a given transformation is
// safe before it is ever returned; deletion-only is a necessary property,
// not a sufficient one.
import { parseFragment } from 'parse5';

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const BLANK_RAW_TEXT_RE = /^(?:[ \t\r\n\f ]|&nbsp;|&#160;|&#x[Aa]0;)*$/;

function isEligibleBlankParagraph(node, html) {
  if (!node || node.tagName !== 'p' || node.nodeName !== 'p') return false;
  if (node.namespaceURI !== HTML_NS) return false;
  if (!Array.isArray(node.attrs) || node.attrs.length !== 0) return false;

  const children = node.childNodes || [];
  if (!children.every((child) => child.nodeName === '#text')) return false;

  const loc = node.sourceCodeLocation;
  if (!loc || !loc.startTag || !loc.endTag) return false; // excludes implicit/unclosed <p>

  const { startOffset, endOffset } = loc;
  const startTagEnd = loc.startTag.endOffset;
  const endTagStart = loc.endTag.startOffset;

  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    !Number.isInteger(loc.startTag.startOffset) ||
    !Number.isInteger(startTagEnd) ||
    !Number.isInteger(endTagStart) ||
    !Number.isInteger(loc.endTag.endOffset) ||
    startOffset < 0 ||
    endOffset > html.length ||
    startOffset !== loc.startTag.startOffset ||
    endOffset !== loc.endTag.endOffset ||
    startOffset > startTagEnd ||
    startTagEnd > endTagStart ||
    endTagStart > endOffset
  ) {
    return false;
  }

  if (html.slice(startOffset, startTagEnd) !== '<p>') return false;
  if (html.slice(endTagStart, endOffset) !== '</p>') return false;

  const rawInner = html.slice(startTagEnd, endTagStart);
  if (!BLANK_RAW_TEXT_RE.test(rawInner)) return false;

  return true;
}

function collectRemovableSpans(node, html, spans) {
  for (const child of node.childNodes || []) {
    if (isEligibleBlankParagraph(child, html)) {
      spans.push([child.sourceCodeLocation.startOffset, child.sourceCodeLocation.endOffset]);
    } else {
      collectRemovableSpans(child, html, spans);
    }
  }
}

function removeSpans(html, spans) {
  if (spans.length === 0) return html;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    result += html.slice(cursor, start);
    cursor = end;
  }
  result += html.slice(cursor);
  return result;
}

// Builds an ordered list of "comparable" descriptors for a node's OWN
// direct children only (skipping exactly the nodes identified as removed,
// by reference), recursing into each retained element's own children
// list separately. Adjacent text descriptors are coalesced, but ONLY
// within a single direct-children list -- never across a nesting
// boundary. This matters because removing an element that used to sit
// BETWEEN two TRUE SIBLING text nodes (e.g. "real<p></p>more") makes
// those two text nodes ADJACENT once re-parsed -- and HTML's own
// tokenizer always coalesces adjacent sibling character data into a
// single text node. A naive single flat list across the whole tree would
// over-merge: e.g. for "<b>foo</b>bar", "foo" (a child of <b>) and "bar"
// (a child of the parent, after <b>) are adjacent in a flat traversal
// order but are NOT siblings, and must never be merged -- a real reparse
// keeps "foo" nested inside <b> and "bar" as a separate, later sibling.
// Comparing children list-by-list (with coalescing scoped to each list)
// avoids this.
function buildChildDescriptors(node, removedSet) {
  const raw = [];
  for (const child of node.childNodes || []) {
    if (removedSet.has(child)) continue;
    if (child.nodeName === '#text') {
      raw.push({ kind: 'text', value: child.value });
    } else if (child.nodeName === '#comment') {
      raw.push({ kind: 'comment', data: child.data });
    } else {
      raw.push({
        kind: 'element',
        tagName: child.tagName,
        namespaceURI: child.namespaceURI,
        attrs: (child.attrs || [])
          .map((a) => `${a.prefix || ''}:${a.name}=${a.value}`)
          .sort(),
        children: buildChildDescriptors(child, removedSet),
      });
    }
  }

  const merged = [];
  for (const desc of raw) {
    const prev = merged[merged.length - 1];
    if (desc.kind === 'text' && prev && prev.kind === 'text') {
      prev.value += desc.value;
    } else {
      merged.push(desc.kind === 'text' ? { ...desc } : desc);
    }
  }
  return merged;
}

function descriptorsDeepEqual(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'text') return a.value === b.value;
  if (a.kind === 'comment') return a.data === b.data;
  if (
    a.tagName !== b.tagName ||
    a.namespaceURI !== b.namespaceURI ||
    a.attrs.length !== b.attrs.length ||
    !a.attrs.every((attr, i) => attr === b.attrs[i]) ||
    a.children.length !== b.children.length
  ) {
    return false;
  }
  return a.children.every((child, i) => descriptorsDeepEqual(child, b.children[i]));
}

// Re-parses the candidate result and confirms its structure is exactly
// the original's structure with only the approved-removed nodes missing
// -- same element order, tag names, namespaces, attributes, nesting, and
// every remaining text/comment node's content byte-identical. Returns
// false on ANY mismatch, or if re-parsing itself fails.
function verifyOnlyApprovedRemovals(originalFragment, removedNodeSet, candidateHtml) {
  try {
    const candidateFragment = parseFragment(candidateHtml);
    const expected = buildChildDescriptors(originalFragment, removedNodeSet);
    const actual = buildChildDescriptors(candidateFragment, new Set());
    if (expected.length !== actual.length) return false;
    return expected.every((desc, i) => descriptorsDeepEqual(desc, actual[i]));
  } catch {
    return false;
  }
}

/**
 * Removes blank `<p>` elements from a legal-content HTML string, for
 * rendering only. See the file header for the exact eligibility rules and
 * safety guarantees. Never mutates `html`. Returns the original `html`
 * completely unchanged if parsing, matching, or post-verification fails
 * for any reason -- this function never throws.
 */
export function stripBlankLegalParagraphs(html) {
  if (typeof html !== 'string') return html;
  try {
    const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
    const spans = [];
    collectRemovableSpans(fragment, html, spans);
    if (spans.length === 0) return html;

    const removedNodeSet = new Set();
    (function markRemoved(node) {
      for (const child of node.childNodes || []) {
        if (isEligibleBlankParagraph(child, html)) {
          removedNodeSet.add(child);
        } else {
          markRemoved(child);
        }
      }
    })(fragment);

    const candidate = removeSpans(html, spans);
    if (!verifyOnlyApprovedRemovals(fragment, removedNodeSet, candidate)) {
      return html;
    }
    return candidate;
  } catch {
    return html;
  }
}
