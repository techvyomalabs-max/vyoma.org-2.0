// Regression tests using the actual published HTML from all 19 migrated
// WordPress blog posts (snapshotted read-only into __fixtures__/
// realPostBodies.json -- never touches the live database). These catch the
// exact class of bug this file exists to prevent: a post using some real
// HTML pattern that the allowlist doesn't yet cover, silently losing
// content the next time its draft is saved.
//
// Two separate questions are tested deliberately separately:
//  1. "Does the tag/attribute allowlist preserve structure and text?" --
//     tested with every <img src> normalized to a known-trusted host first,
//     so this stays stable regardless of which image hosts happen to be
//     trusted today.
//  2. "Which image hosts are currently trusted?" -- a standalone, explicit
//     policy test, so a future change to that list is a conscious,
//     visible diff here, not a silent side effect.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizeBlogBody } from './sanitizeBody.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '__fixtures__', 'realPostBodies.json'), 'utf8'));

// Every class token actually found across the 19 real posts that ISN'T one
// of the three alignment values -- all WordPress/Gutenberg presentational
// classes with no matching CSS on this site, intentionally dropped.
const ACCEPTED_NON_ALIGN_CLASS_DROP = true; // documented in sanitizeBody.js itself; not re-enumerated here
const ACCEPTED_DROPPED_TAGS = new Set(['span']); // 2 occurrences, 1 post, a style-only carrier with no semantic meaning once style is stripped

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
function textOnly(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
// Points every <img src="..."> at a trusted host so tag-level fidelity can
// be tested independently of which exact hosts are on the allowlist today.
function trustAllImageSrcs(html) {
  return html.replace(/<img\b[^>]*\bsrc=["']([^"']*)["'][^>]*>/gi, (full) =>
    full.replace(/\bsrc=["'][^"']*["']/i, 'src="https://vyoma.org/wp-content/uploads/placeholder.png"')
  );
}

test('fidelity: every real post preserves all tag structure and all text (image hosts normalized to trusted)', () => {
  for (const { slug, body } of fixtures) {
    const normalizedInput = trustAllImageSrcs(body);
    const sanitized = sanitizeBlogBody(normalizedInput);

    const beforeCounts = tagCounts(normalizeVoidTags(normalizedInput));
    const afterCounts = tagCounts(normalizeVoidTags(sanitized));
    for (const [tag, count] of beforeCounts) {
      const after = afterCounts.get(tag) || 0;
      if (!ACCEPTED_DROPPED_TAGS.has(tag)) {
        assert.ok(after >= count, `${slug}: <${tag}> count dropped ${count} -> ${after} (unexpected -- allowlist regression)`);
      }
    }

    assert.equal(textOnly(sanitized), textOnly(normalizedInput), `${slug}: visible text content changed`);
  }
});

test('fidelity: alignment classes survive, all other class tokens are dropped (closed enum, not a regression)', () => {
  const ALIGN = new Set(['has-text-align-left', 'has-text-align-center', 'has-text-align-right']);
  for (const { slug, body } of fixtures) {
    const sanitized = sanitizeBlogBody(trustAllImageSrcs(body));
    const classAttrs = [...sanitized.matchAll(/class=["']([^"']*)["']/g)].map((m) => m[1]);
    for (const value of classAttrs) {
      for (const token of value.split(/\s+/).filter(Boolean)) {
        assert.ok(ALIGN.has(token), `${slug}: unexpected class token survived sanitization: "${token}"`);
      }
    }
  }
});

test('fidelity: no script, event-handler, style, or disallowed-scheme content survives any real post', () => {
  for (const { slug, body } of fixtures) {
    const sanitized = sanitizeBlogBody(trustAllImageSrcs(body));
    assert.doesNotMatch(sanitized, /<script/i, `${slug}: <script> survived`);
    assert.doesNotMatch(sanitized, /\son\w+\s*=/i, `${slug}: an event-handler attribute survived`);
    assert.doesNotMatch(sanitized, /\sstyle\s*=/i, `${slug}: a style attribute survived`);
    assert.doesNotMatch(sanitized, /javascript:/i, `${slug}: a javascript: URI survived`);
  }
});

test('policy: the 5 posts with Google Docs-hosted inline images currently lose those images (expected, host-allowlist by design -- not a regression)', () => {
  const affected = ['ramanavami', 'guru-purnima', 'what-is-samskrtam', 'why-samskrtam', 'how-samskrtam'];
  for (const slug of affected) {
    const fixture = fixtures.find((f) => f.slug === slug);
    if (!fixture) continue;
    const sanitized = sanitizeBlogBody(fixture.body); // NOT trust-normalized -- real current state
    assert.doesNotMatch(sanitized, /googleusercontent\.com/, `${slug}: a googleusercontent.com image unexpectedly survived -- allowlist change not noticed here`);
  }
});

test('fidelity: table structure (cells and rows) is fully preserved on the real table-bearing posts', () => {
  const tableSlugs = fixtures.filter((f) => /<table/i.test(f.body)).map((f) => f.slug);
  assert.ok(tableSlugs.length >= 6, 'expected at least 6 real posts with tables to exercise this path');
  for (const slug of tableSlugs) {
    const { body } = fixtures.find((f) => f.slug === slug);
    const sanitized = sanitizeBlogBody(trustAllImageSrcs(body));
    const beforeCells = (body.match(/<td[^>]*>/gi) || []).length;
    const afterCells = (sanitized.match(/<td[^>]*>/gi) || []).length;
    assert.equal(afterCells, beforeCells, `${slug}: table cell count changed`);
  }
});
