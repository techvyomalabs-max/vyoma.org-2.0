// QA Bug 15 (third reopening) — regression coverage for
// stripBlankLegalParagraphs, now backed by parse5 (a real, spec-compliant
// HTML5 parser with source-location tracking) rather than a regex. Tests
// the real function against both complete local seed fixtures (never a
// database), using genuine jsdom parsing for independent DOM comparison
// where useful, plus a battery of adversarial inputs tested directly
// against the production function itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { parseFragment } from 'parse5';
import { stripBlankLegalParagraphs } from './stripBlankLegalParagraphs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractBody(relativePathFromRepoRoot) {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', relativePathFromRepoRoot), 'utf8');
  const m = /export const BODY = "([\s\S]*?)";\n/.exec(src);
  assert.notEqual(m, null, `expected to find a BODY export in ${relativePathFromRepoRoot}`);
  return JSON.parse('"' + m[1] + '"');
}

const privacyBody = extractBody('Backend/scripts/seedData/privacy.js');
const termsBody = extractBody('Backend/scripts/seedData/terms.js');

function parseDom(html) {
  return new JSDOM(`<!doctype html><body>${html}</body>`).window.document.body;
}

function countTag(root, tag) {
  return root.querySelectorAll(tag).length;
}

// --- Mandatory regression: the case that broke the previous regex -------

test('MANDATORY: a quoted href attribute value containing a literal blank-paragraph-shaped substring remains COMPLETELY byte-identical -- the parser never creates a <p> node for text inside an attribute value', () => {
  const input = '<a href="https://example.test/<p></p>">link</a>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('the same case with NBSP/whitespace variants inside the attribute value is also preserved byte-identical', () => {
  for (const input of [
    '<a href="https://example.test/<p>&nbsp;</p>">link</a>',
    '<a href="https://example.test/<p> </p>">link</a>',
    '<a title="<p></p>" href="https://example.test/">link</a>',
  ]) {
    assert.equal(stripBlankLegalParagraphs(input), input, `expected no change for ${JSON.stringify(input)}`);
  }
});

// --- Fixture removal counts (exact, per the approved spec) ----------------

test('Privacy: exactly 20 blank paragraphs are removed (5 truly-empty + 15 NBSP-only)', () => {
  const beforeCount = countTag(parseDom(privacyBody), 'p');
  const afterCount = countTag(parseDom(stripBlankLegalParagraphs(privacyBody)), 'p');
  assert.equal(beforeCount - afterCount, 20);
});

test('Terms: exactly 57 blank paragraphs are removed (2 truly-empty + 55 NBSP-only)', () => {
  const beforeCount = countTag(parseDom(termsBody), 'p');
  const afterCount = countTag(parseDom(stripBlankLegalParagraphs(termsBody)), 'p');
  assert.equal(beforeCount - afterCount, 57);
});

// --- Meaningful text preservation (word-level; see rationale below) -----
// Removing an NBSP-only paragraph legitimately removes that lone NBSP
// character's own contribution to .textContent -- that is the approved,
// intended behavior, not a content loss. Whitespace/NBSP is collapsed
// before comparing for this reason only.
function meaningfulWords(root) {
  return root.textContent.replace(/[\s ]+/g, ' ').trim();
}

test('Privacy: every meaningful word is preserved', () => {
  assert.equal(meaningfulWords(parseDom(stripBlankLegalParagraphs(privacyBody))), meaningfulWords(parseDom(privacyBody)));
});

test('Terms: every meaningful word is preserved', () => {
  assert.equal(meaningfulWords(parseDom(stripBlankLegalParagraphs(termsBody))), meaningfulWords(parseDom(termsBody)));
});

// --- Non-target markup remains byte-identical (DOM structure comparison) --

for (const [label, body] of [['Privacy', privacyBody], ['Terms', termsBody]]) {
  test(`${label}: every non-<p> element count is unchanged (ol, ul, li, a, strong, u, em, i, b, blockquote, br)`, () => {
    const before = parseDom(body);
    const after = parseDom(stripBlankLegalParagraphs(body));
    for (const tag of ['ol', 'ul', 'li', 'a', 'strong', 'u', 'em', 'i', 'b', 'blockquote', 'br']) {
      assert.equal(countTag(after, tag), countTag(before, tag), `expected the same number of <${tag}> elements`);
    }
  });

  test(`${label}: every <a> href is unchanged, in the same order`, () => {
    const beforeHrefs = [...parseDom(body).querySelectorAll('a')].map((a) => a.getAttribute('href'));
    const afterHrefs = [...parseDom(stripBlankLegalParagraphs(body)).querySelectorAll('a')].map((a) => a.getAttribute('href'));
    assert.deepEqual(afterHrefs, beforeHrefs);
  });

  test(`${label}: every <ol>'s start attribute is unchanged, in the same order (native numbering preserved)`, () => {
    const beforeStarts = [...parseDom(body).querySelectorAll('ol')].map((ol) => ol.getAttribute('start'));
    const afterStarts = [...parseDom(stripBlankLegalParagraphs(body)).querySelectorAll('ol')].map((ol) => ol.getAttribute('start'));
    assert.deepEqual(afterStarts, beforeStarts);
  });
}

test('Privacy: the existing empty <ol></ol> is preserved, not removed (this function only ever targets <p>)', () => {
  assert.match(stripBlankLegalParagraphs(privacyBody), /<ol><\/ol>/);
});

test('Privacy: the real section headings/sub-labels are preserved exactly', () => {
  const after = stripBlankLegalParagraphs(privacyBody);
  assert.match(after, /<p><strong>1\. General Principles<\/strong><\/p>/);
  assert.match(after, /<strong><u>13\. Changes to This Privacy Policy<\/u><\/strong>/);
});

test('Terms: native <ol start="N"> numbered section headings are preserved exactly', () => {
  const after = stripBlankLegalParagraphs(termsBody);
  assert.match(after, /<ol start="2">\s*<li><strong> <\/strong><strong><u>Our License to You<\/u><\/strong><\/li>\s*<\/ol>/);
});

// --- Original input is never mutated; idempotency --------------------------

test('the original BODY string is never mutated', () => {
  const original = privacyBody.slice();
  stripBlankLegalParagraphs(privacyBody);
  assert.equal(privacyBody, original);
});

test('running the function twice produces the same result as running it once (idempotent)', () => {
  const once = stripBlankLegalParagraphs(privacyBody);
  const twice = stripBlankLegalParagraphs(once);
  assert.equal(twice, once);
});

// --- Surrounding whitespace preserved exactly ------------------------------

test('whitespace immediately surrounding a removed blank paragraph is left untouched', () => {
  assert.equal(stripBlankLegalParagraphs('before\n<p> </p>\nafter'), 'before\n\nafter');
});

// --- Approved blank-content variants ---------------------------------------

test('a truly empty <p></p> is removed', () => {
  assert.equal(stripBlankLegalParagraphs('<p></p>'), '');
});

test('a <p> containing only ASCII space/tab/CR/LF/form-feed (alone or mixed) is removed', () => {
  for (const ws of [' ', '\t', '\r', '\n', '\f', '   ', '\n\t \r\f']) {
    assert.equal(stripBlankLegalParagraphs(`<p>${ws}</p>`), '', `expected removal for ${JSON.stringify(ws)}`);
  }
});

test('a <p> containing only a literal NBSP character (U+00A0) is removed', () => {
  assert.equal(stripBlankLegalParagraphs('<p> </p>'), '');
});

test('a <p> containing only the literal entity text &nbsp;, &#160;, &#xA0;, or &#xa0; is removed', () => {
  for (const entity of ['&nbsp;', '&#160;', '&#xA0;', '&#xa0;']) {
    assert.equal(stripBlankLegalParagraphs(`<p>${entity}</p>`), '', `expected removal for ${entity}`);
  }
});

test('a <p> containing a mixture of approved tokens is removed', () => {
  assert.equal(stripBlankLegalParagraphs('<p> &nbsp;   &#160;\n&#xA0;\t</p>'), '');
});

test('multiple consecutive blank paragraphs are all removed in one pass', () => {
  assert.equal(stripBlankLegalParagraphs('<p></p><p> </p><p>&nbsp;</p><p> </p>'), '');
  assert.equal(stripBlankLegalParagraphs('real<p></p><p>&nbsp;</p>more'), 'realmore');
});

// --- Unapproved entities that happen to DECODE to an approved character
// must NOT be removed -- the parser decoding &#32; to a space must never
// silently widen the approved set beyond the four explicitly-named NBSP
// entity spellings -----------------------------------------------------

test('a decimal numeric character reference that decodes to an approved character (e.g. &#32; for space, &#10; for newline) is NOT treated as approved -- only the four explicitly-named NBSP entity spellings are', () => {
  for (const entity of ['&#32;', '&#9;', '&#10;', '&#13;', '&#12;']) {
    const input = `<p>${entity}</p>`;
    assert.equal(stripBlankLegalParagraphs(input), input, `expected ${entity} to be preserved, not treated as approved blank content`);
  }
});

test('zero-width characters (U+200B) and other unapproved Unicode whitespace (U+2028, U+2029, U+FEFF, U+2003) are never treated as blank', () => {
  for (const ch of ['​', ' ', ' ', '﻿', ' ']) {
    const input = `<p>${ch}</p>`;
    assert.equal(stripBlankLegalParagraphs(input), input, `expected U+${ch.codePointAt(0).toString(16)} to be preserved`);
  }
});

// --- Meaningful content must never be removed ------------------------------

test('a paragraph containing real text is never removed', () => {
  const input = '<p>Real legal text.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph containing meaningful text alongside an NBSP character is preserved byte-identical', () => {
  const input = '<p>Please read carefully.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph containing meaningful text alongside the literal entity text &nbsp; is preserved byte-identical', () => {
  const input = '<p>Please&nbsp;read carefully.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph containing only a <br> is preserved (a child element disqualifies the match)', () => {
  const input = '<p><br></p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph containing a nested element (even a visually blank/NBSP-only one) is preserved', () => {
  for (const input of ['<p><strong> </strong></p>', '<p><strong> </strong></p>']) {
    assert.equal(stripBlankLegalParagraphs(input), input, `expected no change for ${JSON.stringify(input)}`);
  }
});

test('a paragraph containing ONLY a comment (no text) is preserved -- a child comment disqualifies the match', () => {
  const input = '<p><!-- note --></p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph containing text AND a comment is preserved', () => {
  const input = '<p>text<!-- c --></p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a paragraph carrying any attribute (id, class, or otherwise) is preserved, even when its content is otherwise blank/NBSP-only', () => {
  for (const input of ['<p id="x"></p>', '<p class="y"> </p>', '<p data-test="z"> </p>', '<p id="x">&nbsp;</p>']) {
    assert.equal(stripBlankLegalParagraphs(input), input, `expected no change for ${JSON.stringify(input)}`);
  }
});

test('a paragraph containing a link/anchor is preserved, even if the link text itself is short or NBSP-only', () => {
  assert.equal(stripBlankLegalParagraphs('<p><a href="https://example.test/">x</a></p>'), '<p><a href="https://example.test/">x</a></p>');
  const nbspLink = '<p>See <a href="https://example.test/"> </a> for details.</p>';
  assert.equal(stripBlankLegalParagraphs(nbspLink), nbspLink);
});

// --- Comments and raw-text contexts (script/style/textarea/title) --------

test('an HTML comment containing a blank-paragraph-shaped substring is preserved untouched, including its exact text', () => {
  const input = '<p>Real.</p><!-- example markup: <p></p> and <p>&nbsp;</p> --><p>Also real.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a <script> raw-text region containing a blank-paragraph-shaped substring is preserved untouched', () => {
  const input = '<p>Real.</p><script>var x = "<p></p>";</script><p>Also real.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a <style> raw-text region containing a blank-paragraph-shaped substring is preserved untouched', () => {
  const input = '<p>Real.</p><style>/* <p>&nbsp;</p> */</style><p>Also real.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a <textarea> raw-text region containing a blank-paragraph-shaped substring is preserved untouched', () => {
  const input = '<p>Real.</p><textarea><p></p></textarea><p>Also real.</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a blank paragraph immediately adjacent to (outside) a protected region is still correctly removed, while the protected region itself is untouched', () => {
  const input = '<p>Real.</p><p> </p><!-- keep: <p></p> --><p>&nbsp;</p><p>Also real.</p>';
  const expected = '<p>Real.</p><!-- keep: <p></p> --><p>Also real.</p>';
  assert.equal(stripBlankLegalParagraphs(input), expected);
});

// --- Malformed / unclosed / implicitly-closed markup ------------------------

test('an implicitly-closed <p> (auto-closed by a following <p>) is NEVER removed, even if it is genuinely blank -- it has no explicit </p> in the source', () => {
  // The first <p> here is blank (just "unclosed " as the second <p>'s own
  // text is actually what follows) -- more precisely: "<p>unclosed <p></p>"
  // auto-closes the FIRST <p> (containing "unclosed ") the moment the
  // second <p> starts. Only the second, explicit, genuinely-empty <p></p>
  // may be removed.
  assert.equal(stripBlankLegalParagraphs('<p>unclosed <p></p>'), '<p>unclosed ');
});

test('an implicitly-closed <p> that is ITSELF entirely blank is still never removed, because it has no explicit end tag', () => {
  // "<p> <p>real</p>" -- the first <p> (blank, auto-closed) has no </p> in
  // the source at all, so it must be left completely untouched.
  const input = '<p> <p>real</p>';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('a genuinely unclosed <p> at the end of the input (no second tag at all) is never removed', () => {
  const input = '<p> ';
  assert.equal(stripBlankLegalParagraphs(input), input);
});

test('malformed input of various shapes never produces new executable markup and is handled without throwing', () => {
  for (const input of ['<p>unterminated', '<<p></p>>', '<p></p ><p></p>', '<p "broken attr></p>']) {
    assert.doesNotThrow(() => stripBlankLegalParagraphs(input));
    const result = stripBlankLegalParagraphs(input);
    assert.doesNotMatch(result, /<script/i);
    assert.doesNotMatch(result, /\son\w+\s*=/i);
  }
});

// --- Unicode offsets, including supplementary-plane characters -------------

test('a supplementary-plane character (e.g. an emoji, a 2-UTF-16-code-unit character) immediately before a removable paragraph does not shift the computed offsets', () => {
  const emoji = '\u{1F600}';
  const input = `${emoji}<p> </p>after`;
  assert.equal(stripBlankLegalParagraphs(input), `${emoji}after`);
});

test('multiple supplementary-plane characters mixed with removable and non-removable paragraphs are all handled with correct offsets', () => {
  const emoji = '\u{1F600}\u{1F601}';
  const input = `<p>${emoji} real text</p><p> </p>${emoji}<p>&nbsp;</p>tail`;
  assert.equal(stripBlankLegalParagraphs(input), `<p>${emoji} real text</p>${emoji}tail`);
});

// --- Reparse-and-compare structural verification (external check of the
// invariant the function enforces internally) ------------------------------

test('after removal, re-parsing the result and comparing to the original (minus only the removed <p> elements) shows identical structure, for both fixtures', () => {
  for (const body of [privacyBody, termsBody]) {
    const originalFragment = parseFragment(body, { sourceCodeLocationInfo: true });
    const resultHtml = stripBlankLegalParagraphs(body);
    const resultFragment = parseFragment(resultHtml);

    function flattenTags(node, out) {
      for (const child of node.childNodes || []) {
        if (child.nodeName !== '#text' && child.nodeName !== '#comment') {
          out.push(child.tagName);
          flattenTags(child, out);
        }
      }
    }
    const originalNonBlankPTags = [];
    // Same approach the implementation itself uses: every element tag,
    // except truly-blank <p> elements (identified the same way: zero
    // attrs, text-only children whose text is entirely approved).
    (function walk(node) {
      for (const child of node.childNodes || []) {
        if (child.nodeName === '#text' || child.nodeName === '#comment') continue;
        const loc = child.sourceCodeLocation;
        const isBlankP =
          child.tagName === 'p' &&
          (child.attrs || []).length === 0 &&
          loc &&
          loc.startTag &&
          loc.endTag &&
          (child.childNodes || []).every((c) => c.nodeName === '#text') &&
          /^(?:[ \t\r\n\f ]|&nbsp;|&#160;|&#x[Aa]0;)*$/.test(body.slice(loc.startTag.endOffset, loc.endTag.startOffset));
        if (!isBlankP) {
          originalNonBlankPTags.push(child.tagName);
          walk(child);
        }
      }
    })(originalFragment);

    const resultTags = [];
    flattenTags(resultFragment, resultTags);
    assert.deepEqual(resultTags, originalNonBlankPTags);
  }
});

// --- No executable markup or unsafe URL can ever be introduced -------------

test('the function cannot introduce any new tag, attribute, or executable markup', () => {
  for (const body of [privacyBody, termsBody]) {
    const result = stripBlankLegalParagraphs(body);
    assert.ok(result.length <= body.length, 'result must never be longer than the input');
    assert.doesNotMatch(result, /<script/i);
    assert.doesNotMatch(result, /\son\w+\s*=/i);
    assert.doesNotMatch(result, /javascript:/i);
  }
});

test('non-string input is returned unchanged rather than throwing', () => {
  assert.equal(stripBlankLegalParagraphs(null), null);
  assert.equal(stripBlankLegalParagraphs(undefined), undefined);
});

test('an empty string input is handled without throwing', () => {
  assert.equal(stripBlankLegalParagraphs(''), '');
});

// --- Both pages use the same utility; no unrelated file does --------------

test('both Privacy and Terms pages import stripBlankLegalParagraphs from the same shared module and apply it to BODY before dangerouslySetInnerHTML', () => {
  const privacySource = fs.readFileSync(path.join(__dirname, '..', 'app', '(public)', 'privacy', 'page.js'), 'utf8');
  const termsSource = fs.readFileSync(path.join(__dirname, '..', 'app', '(public)', 'terms', 'page.js'), 'utf8');
  for (const source of [privacySource, termsSource]) {
    assert.match(source, /import \{ stripBlankLegalParagraphs \} from '@\/lib\/stripBlankLegalParagraphs\.mjs';/);
    assert.match(source, /dangerouslySetInnerHTML=\{\{ __html: stripBlankLegalParagraphs\(BODY\) \}\}/);
  }
});

test('no unrelated page or component imports stripBlankLegalParagraphs', () => {
  const searchRoots = [path.join(__dirname, '..', 'app', '(public)'), path.join(__dirname, '..', 'components')];
  const offenders = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(full);
      } else if (/\.(js|jsx|mjs)$/.test(entry.name) && !full.includes(`privacy${path.sep}page.js`) && !full.includes(`terms${path.sep}page.js`)) {
        if (fs.readFileSync(full, 'utf8').includes('stripBlankLegalParagraphs')) offenders.push(full);
      }
    }
  }
  for (const root of searchRoots) walk(root);
  assert.deepEqual(offenders, []);
});
