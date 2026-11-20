import { test } from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../../config/env.js';
import { sanitizeBlogBody } from './sanitizeBody.js';

const LOCAL_IMG = `http://localhost:${env.port}/local-media/blog/photo-abc123.png`;

test('allows a WordPress-hosted inline image (http and https, apex and www)', () => {
  const cases = [
    'http://vyoma.org/wp-content/uploads/2024/07/guru-purnima.png',
    'https://vyoma.org/wp-content/uploads/2024/07/guru-purnima.png',
    'https://www.vyoma.org/wp-content/uploads/2024/07/guru-purnima.png',
  ];
  for (const src of cases) {
    const out = sanitizeBlogBody(`<p>Before</p><img src="${src}" alt="Guru Purnima"><p>After</p>`);
    assert.equal(out, `<p>Before</p><img src="${src}" alt="Guru Purnima" /><p>After</p>`);
  }
});

test('allows an approved S3-hosted inline image', () => {
  const src = 'https://vyoma-media.s3.ap-south-1.amazonaws.com/blog/photo.jpg';
  const out = sanitizeBlogBody(`<p>Text</p><img src="${src}" alt="">`);
  assert.equal(out, `<p>Text</p><img src="${src}" alt="" />`);
});

test('allows a local-development /local-media/ image under this server\'s own port', () => {
  const out = sanitizeBlogBody(`<img src="${LOCAL_IMG}" alt="staged">`);
  assert.equal(out, `<img src="${LOCAL_IMG}" alt="staged" />`);
});

test('strips an image on an unapproved external domain, keeps surrounding content', () => {
  const out = sanitizeBlogBody('<p>Before</p><img src="https://evil.example.com/x.png" alt="bad"><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('strips a javascript: image src', () => {
  const out = sanitizeBlogBody('<p>Text</p><img src="javascript:alert(1)" alt="bad">');
  assert.equal(out, '<p>Text</p>');
});

test('strips a data: image src', () => {
  const out = sanitizeBlogBody('<p>Text</p><img src="data:image/png;base64,aaaa" alt="bad">');
  assert.equal(out, '<p>Text</p>');
});

test('strips an image with no src and an image with an unparsable src', () => {
  assert.equal(sanitizeBlogBody('<p>Text</p><img alt="no src">'), '<p>Text</p>');
  assert.equal(sanitizeBlogBody('<p>Text</p><img src="/relative/path.png" alt="relative">'), '<p>Text</p>');
});

test('strips a local-media URL on the wrong port (not this server)', () => {
  const wrongPort = `http://localhost:${env.port + 1}/local-media/blog/photo.png`;
  const out = sanitizeBlogBody(`<p>Text</p><img src="${wrongPort}" alt="bad">`);
  assert.equal(out, '<p>Text</p>');
});

test('drops any event-handler/script attribute on an otherwise-valid image but keeps the image', () => {
  const src = 'https://vyoma.org/wp-content/uploads/2024/07/guru-purnima.png';
  const out = sanitizeBlogBody(`<img src="${src}" alt="ok" onerror="alert(1)" onload="alert(2)" style="x">`);
  assert.equal(out, `<img src="${src}" alt="ok" />`);
});

test('removes a <script> tag entirely, including its content', () => {
  const out = sanitizeBlogBody('<p>Before</p><script>alert(1)</script><p>After</p>');
  assert.equal(out, '<p>Before</p><p>After</p>');
});

test('preserves existing allowed text formatting and forces safe link attributes', () => {
  const input = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text.</p><ul><li>One</li><li>Two</li></ul><a href="https://vyoma.org">link</a>';
  const out = sanitizeBlogBody(input);
  assert.match(out, /<h2>Title<\/h2>/);
  assert.match(out, /<strong>bold<\/strong>/);
  assert.match(out, /<em>italic<\/em>/);
  assert.match(out, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
  assert.match(out, /<a href="https:\/\/vyoma\.org" rel="noopener noreferrer" target="_blank">link<\/a>/);
});

test('preserves multiple valid inline images in one post, in order, alongside text', () => {
  const img1 = 'https://vyoma.org/wp-content/uploads/a.jpg';
  const img2 = 'https://vyoma.org/wp-content/uploads/b.jpg';
  const img3 = LOCAL_IMG;
  const input = `<p>Intro</p><img src="${img1}" alt="one"><p>Middle</p><img src="${img2}" alt="two"><img src="${img3}" alt="three"><p>End</p>`;
  const expected = `<p>Intro</p><img src="${img1}" alt="one" /><p>Middle</p><img src="${img2}" alt="two" /><img src="${img3}" alt="three" /><p>End</p>`;
  const out = sanitizeBlogBody(input);
  assert.equal(out, expected);
});

test('a mix of valid and invalid images: only the invalid one is removed', () => {
  const good = 'https://vyoma.org/wp-content/uploads/a.jpg';
  const input = `<p>Intro</p><img src="${good}" alt="good"><img src="https://evil.example.com/x.png" alt="bad"><p>End</p>`;
  const out = sanitizeBlogBody(input);
  assert.equal(out, `<p>Intro</p><img src="${good}" alt="good" /><p>End</p>`);
});

test('non-string input returns an empty string, as before', () => {
  assert.equal(sanitizeBlogBody(undefined), '');
  assert.equal(sanitizeBlogBody(null), '');
  assert.equal(sanitizeBlogBody(42), '');
});

// --- WordPress compatibility: tables, headings, rules, inline marks ---

test('preserves a table with multiple rows and cells, including a header-like first row', () => {
  const input = '<table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>';
  assert.equal(sanitizeBlogBody(input), input);
});

test('preserves h1 and h6 (both now allowed alongside the existing h2-h4)', () => {
  assert.equal(sanitizeBlogBody('<h1>Title</h1>'), '<h1>Title</h1>');
  assert.equal(sanitizeBlogBody('<h6>Click to enlarge</h6>'), '<h6>Click to enlarge</h6>');
});

test('preserves a horizontal rule as a bare <hr>, dropping any class/style on it', () => {
  const out = sanitizeBlogBody('<p>a</p><hr class="wp-block-separator" style="color:red"><p>b</p>');
  assert.equal(out, '<p>a</p><hr /><p>b</p>');
});

test('preserves sup, u, ins, and mark as bare inline tags (no attributes survive)', () => {
  assert.equal(sanitizeBlogBody('<p>x<sup>2</sup></p>'), '<p>x<sup>2</sup></p>');
  assert.equal(sanitizeBlogBody('<p><u>underlined</u></p>'), '<p><u>underlined</u></p>');
  assert.equal(sanitizeBlogBody('<p><ins>inserted</ins></p>'), '<p><ins>inserted</ins></p>');
  assert.equal(sanitizeBlogBody('<p><mark style="color:red" class="has-vivid-red-color">hi</mark></p>'), '<p><mark>hi</mark></p>');
});

test('preserves figure and div as bare structural wrappers, dropping their class', () => {
  const out = sanitizeBlogBody('<div class="wp-block-group"><figure class="wp-block-image"><img src="https://vyoma.org/a.jpg" alt=""></figure></div>');
  assert.equal(out, '<div><figure><img src="https://vyoma.org/a.jpg" alt="" /></figure></div>');
});

test('preserves ol start and type attributes (actual list-numbering meaning, not cosmetic)', () => {
  const input = '<ol start="5" type="i"><li>x</li></ol>';
  assert.equal(sanitizeBlogBody(input), input);
});

test('preserves left/center/right alignment classes on paragraphs and headings, drops every other class token', () => {
  const out = sanitizeBlogBody('<p class="has-text-align-center has-black-color MsoNormal">x</p><h2 class="wp-block-heading has-text-align-right">y</h2>');
  assert.equal(out, '<p class="has-text-align-center">x</p><h2 class="has-text-align-right">y</h2>');
});

test('drops a class attribute entirely when none of its tokens are the alignment enum', () => {
  assert.equal(sanitizeBlogBody('<p class="has-black-color wp-block-heading">x</p>'), '<p>x</p>');
});

test('does not allow alignment classes on a tag outside the alignable set (e.g. div, table)', () => {
  const out = sanitizeBlogBody('<div class="has-text-align-center">x</div><table class="has-text-align-center"><tbody><tr><td>y</td></tr></tbody></table>');
  assert.equal(out, '<div>x</div><table><tbody><tr><td>y</td></tr></tbody></table>');
});

test('normalizes a table cell\'s WordPress data-align into the same alignment class family', () => {
  const out = sanitizeBlogBody('<table><tbody><tr><td data-align="center">x</td><td data-align="not-a-real-value">y</td></tr></tbody></table>');
  assert.equal(out, '<table><tbody><tr><td class="has-text-align-center">x</td><td>y</td></tr></tbody></table>');
});

test('does not duplicate the alignment class when a cell already has both class and data-align for the same value', () => {
  // Real WordPress export cells can carry both at once; naively appending
  // produced "has-text-align-center has-text-align-center" (caught during
  // the Tiptap TextAlign fix's own regression testing).
  const out = sanitizeBlogBody('<table><tbody><tr><td class="has-text-align-center" data-align="center">x</td></tr></tbody></table>');
  assert.equal(out, '<table><tbody><tr><td class="has-text-align-center">x</td></tr></tbody></table>');
});

test('never allows a style attribute anywhere, even on newly-allowed tags, even disguised as an alignment value', () => {
  const out = sanitizeBlogBody('<p style="background-image:url(https://evil.example.com/track.png)">x</p><mark style="color:red">y</mark><table style="width:100%"><tbody><tr><td style="color:blue">z</td></tr></tbody></table>');
  assert.equal(out, '<p>x</p><mark>y</mark><table><tbody><tr><td>z</td></tr></tbody></table>');
});

test('strips event-handler attributes from every newly-allowed tag, keeping the tag and its text', () => {
  const out = sanitizeBlogBody('<table onmouseover="alert(1)"><tbody><tr><td onclick="alert(2)">x</td></tr></tbody></table><div onload="alert(3)">y</div>');
  assert.equal(out, '<table><tbody><tr><td>x</td></tr></tbody></table><div>y</div>');
});

test('a script or iframe nested inside a newly-allowed wrapper (table/div/figure) is still fully removed', () => {
  const out = sanitizeBlogBody('<div><script>alert(1)</script><p>safe</p></div><figure><iframe src="https://evil.example.com"></iframe></figure>');
  assert.equal(out, '<div><p>safe</p></div><figure></figure>');
});
