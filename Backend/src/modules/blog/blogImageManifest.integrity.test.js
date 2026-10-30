// Task 7F.1 — read-only regression tests for the staged WordPress blog
// image assets (Backend/.local-media/blog/) and their manifest
// (Backend/.local-media/blog-image-manifest.json). Both are gitignored
// (see Backend/.gitignore's ".local-media/" entry), so a fresh checkout or
// CI environment will not have them. In that case, the asset-dependent
// tests below each SKIP with an explicit reason -- a skip here is never
// reported as "the assets were checked and are fine," only as "the assets
// were not present to check." If the manifest file DOES exist but is
// malformed, or a file/URL it references is missing or wrong, that is
// always a hard FAILURE, never a skip: "absent entirely" and "present but
// wrong" are different conditions and must not be conflated.
//
// No database connection, no network fetch, no importer execution, no
// image download or upload, no secrets/env credentials read anywhere in
// this file. `parseWxr`/`DEFAULT_WXR_PATH`/`SLUG_OVERRIDES` are imported
// read-only from the already-reviewed, unmodified Batch 1 importer (the
// same pattern already used by batch1Import.safety.test.js) purely to
// cross-reference manifest entries against real post body text -- nothing
// in that importer is changed, and importing it triggers no database
// activity (its main() only ever runs on direct CLI invocation, proven in
// Task 7C.1's own regression tests).
//
// Task 7F.2: the manifest-loading and path-safety helpers below now live in
// Backend/scripts/wordpress/import/blogImageManifest.js, the same shared
// module the importer's own image-preservation logic uses -- imported
// here, not duplicated, so this test exercises the exact helpers the
// importer relies on rather than a parallel copy that could drift from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseWxr, DEFAULT_WXR_PATH, SLUG_OVERRIDES } from '../../../scripts/wordpress/import/batch1-import.mjs';
import {
  BLOG_MEDIA_DIR,
  MANIFEST_PATH,
  isSafeLocalFilename,
  resolveWithinBlogMediaDir,
  loadBlogImageManifest,
} from '../../../scripts/wordpress/import/blogImageManifest.js';

const manifestExists = fs.existsSync(MANIFEST_PATH);
const wxrExists = fs.existsSync(DEFAULT_WXR_PATH);

const MANIFEST_SKIP_REASON =
  'Backend/.local-media/blog-image-manifest.json is absent (gitignored, not present in this checkout/CI) -- skipping. ' +
  'This is NOT a confirmation that the staged image assets are valid; it only means they were not present to check here.';
const WXR_SKIP_REASON =
  'Backend/.migration-data/...xml (the real WordPress export) is absent (gitignored, not present in this checkout/CI) -- ' +
  'skipping the body cross-reference check. This is NOT a confirmation that the mapping is correct.';

function readManifest() {
  // loadBlogImageManifest() throws on a malformed (present-but-invalid)
  // manifest -- a genuine failure, not caught/swallowed here, per the "fail
  // rather than skip" requirement. It returns null on absence, which every
  // call site below already guards against via `manifestExists` first.
  return loadBlogImageManifest();
}

// --- Path-safety helper unit tests (run unconditionally -- pure functions,
// no file/manifest dependency, so these never skip) -------------------------

test('isSafeLocalFilename rejects path-traversal and nested-path attempts', () => {
  assert.equal(isSafeLocalFilename('../../etc/passwd'), false);
  assert.equal(isSafeLocalFilename('..\\..\\windows\\system32\\config'), false);
  assert.equal(isSafeLocalFilename('subdir/file.png'), false);
  assert.equal(isSafeLocalFilename('subdir\\file.png'), false);
  assert.equal(isSafeLocalFilename('/etc/passwd'), false);
  assert.equal(isSafeLocalFilename(''), false);
  assert.equal(isSafeLocalFilename(null), false);
  assert.equal(isSafeLocalFilename(undefined), false);
  assert.equal(isSafeLocalFilename(42), false);
});

test('isSafeLocalFilename accepts an ordinary bare filename', () => {
  assert.equal(isSafeLocalFilename('guru-purnima-f4f66f5e.png'), true);
  assert.equal(isSafeLocalFilename('1-1.jpg'), true);
});

test('resolveWithinBlogMediaDir refuses to resolve outside the approved directory', () => {
  assert.equal(resolveWithinBlogMediaDir('../../etc/passwd'), null);
  assert.equal(resolveWithinBlogMediaDir('..\\..\\secret.env'), null);
  const safe = resolveWithinBlogMediaDir('guru-purnima-f4f66f5e.png');
  assert.ok(safe);
  assert.ok(safe.startsWith(BLOG_MEDIA_DIR));
});

// --- Manifest-dependent tests ------------------------------------------------

// 1. The manifest is valid JSON.
test('the manifest file is valid JSON with the expected top-level shape', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  assert.equal(typeof manifest, 'object');
  assert.ok(Array.isArray(manifest.rows), 'manifest.rows must be an array');
});

// 2. Exactly 63 image references are recorded.
test('exactly 63 image references are recorded in the manifest', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  assert.equal(manifest.rows.length, 63);
});

// 3. Exactly 62 unique image files are referenced.
test('exactly 62 unique local image files are referenced', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  const unique = new Set(manifest.rows.map((r) => r.localFilename));
  assert.equal(unique.size, 62);
});

// 4. All 62 files exist and are non-empty.
test('all 62 referenced local files exist on disk and are non-empty', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  const unique = new Set(manifest.rows.map((r) => r.localFilename));
  for (const filename of unique) {
    const resolved = resolveWithinBlogMediaDir(filename);
    assert.ok(resolved, `manifest localFilename "${filename}" is not a safe, in-directory filename`);
    assert.ok(fs.existsSync(resolved), `expected file to exist: ${filename}`);
    const stat = fs.statSync(resolved);
    assert.ok(stat.isFile(), `expected a regular file: ${filename}`);
    assert.ok(stat.size > 0, `expected a non-empty file: ${filename}`);
  }
});

// 5. All files have valid PNG/JPEG signatures.
test('all 62 referenced local files have a valid PNG or JPEG signature', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  const unique = new Set(manifest.rows.map((r) => r.localFilename));
  for (const filename of unique) {
    const resolved = resolveWithinBlogMediaDir(filename);
    assert.ok(resolved);
    const fd = fs.openSync(resolved, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    assert.ok(isPng || isJpg, `expected a PNG or JPEG signature for "${filename}", got bytes: ${buf.toString('hex')}`);
  }
});

// 6. Every manifest entry (row, not just unique file) maps to a valid local file.
test('every manifest row (not just unique files) maps to a file that actually exists', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  for (const row of manifest.rows) {
    const resolved = resolveWithinBlogMediaDir(row.localFilename);
    assert.ok(resolved, `row for postSlug "${row.postSlug}" has an unsafe localFilename: ${row.localFilename}`);
    assert.ok(fs.existsSync(resolved), `row for postSlug "${row.postSlug}" references a missing file: ${row.localFilename}`);
    assert.equal(row.downloaded, true, `row for postSlug "${row.postSlug}" is not marked downloaded`);
  }
});

// 7. Every inline-image originalUrl corresponds to a real reference in the
// appropriate WordPress post body (cross-referenced against the real WXR
// export, read-only, via the unmodified importer's own parseWxr()).
test('every inline-image originalUrl is present in its post\'s real WordPress body', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  if (!wxrExists) return t.skip(WXR_SKIP_REASON);

  const manifest = readManifest();
  const parsed = parseWxr(DEFAULT_WXR_PATH);
  const bySlug = new Map();
  for (const post of parsed.blogPosts) {
    const finalSlug = SLUG_OVERRIDES.get(post.oldSlug) || post.oldSlug;
    bySlug.set(post.oldSlug, post);
    bySlug.set(finalSlug, post);
  }

  const inlineRows = manifest.rows.filter((r) => r.type === 'inline');
  assert.ok(inlineRows.length > 0, 'expected at least one inline-type manifest row');
  for (const row of inlineRows) {
    const post = bySlug.get(row.postSlug);
    assert.ok(post, `no WordPress post found for manifest postSlug "${row.postSlug}"`);
    assert.ok(post.bodyHtml.includes(row.originalUrl), `expected originalUrl to appear in the real body of "${row.postSlug}": ${row.originalUrl}`);
  }
});

// 8. The 8 Google-hosted images across 5 posts are represented in the manifest.
const EXPECTED_GOOGLE_IMAGES = {
  ramanavami: 3,
  'guru-purnima': 1,
  'what-is-samskrtam': 2,
  'why-samskrtam': 1,
  'how-samskrtam': 1,
};

test('the 8 Google-hosted inline images across the 5 known posts are represented in the manifest', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  let total = 0;
  for (const [slug, expectedCount] of Object.entries(EXPECTED_GOOGLE_IMAGES)) {
    const googleRows = manifest.rows.filter((r) => r.postSlug === slug && /googleusercontent\.com/i.test(r.originalUrl));
    assert.equal(googleRows.length, expectedCount, `expected ${expectedCount} Google-hosted image row(s) for "${slug}", found ${googleRows.length}`);
    total += googleRows.length;
  }
  assert.equal(total, 8, 'expected exactly 8 Google-hosted images total across the 5 known posts');

  // No OTHER post should have a Google-hosted row -- if one appears, the
  // known-list above (and the earlier Task 7C.1/7D/7E findings it mirrors)
  // has gone stale and needs a conscious update, not a silent drift.
  const unexpectedGoogleRows = manifest.rows.filter((r) => !Object.keys(EXPECTED_GOOGLE_IMAGES).includes(r.postSlug) && /googleusercontent\.com/i.test(r.originalUrl));
  assert.equal(unexpectedGoogleRows.length, 0, `unexpected Google-hosted image row(s) found outside the known 5 posts: ${JSON.stringify(unexpectedGoogleRows.map((r) => r.postSlug))}`);
});

// 9. The legitimate shared author-headshot reference is not treated as an error.
test('the one legitimate shared-file duplicate (author headshot) is recognized and not flagged', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  const byFile = new Map();
  for (const row of manifest.rows) {
    if (!byFile.has(row.localFilename)) byFile.set(row.localFilename, []);
    byFile.get(row.localFilename).push(row);
  }
  const duplicateFiles = [...byFile.entries()].filter(([, rows]) => rows.length > 1);
  assert.equal(duplicateFiles.length, 1, `expected exactly 1 duplicate local filename, found ${duplicateFiles.length}`);

  const [filename, rows] = duplicateFiles[0];
  assert.match(filename, /^vishwanathan-150x150-/i);
  const slugs = rows.map((r) => r.postSlug).sort();
  assert.deepEqual(slugs, ['how-panchatantra-teaches-without-teaching', 'why-sanskrit-is-not-finished-it-is-alive']);
  // Both rows must point at the SAME original URL -- a shared file is only
  // legitimate when it's genuinely the same source image, not a filename
  // collision between two different images (see test 11 below).
  const originalUrls = new Set(rows.map((r) => r.originalUrl));
  assert.equal(originalUrls.size, 1, 'the shared duplicate must point at exactly one original URL');
});

// 10. The yoga_day image classification remains consistent with the manifest
// (resolved in Task 7F: 01_Yoga_Bundle.jpg is genuinely the first inline
// image in the post body, which Yoast also happens to use as the live
// og:image -- the manifest's "inline" classification is correct).
test('the yoga_day featured-image classification is consistent: 01_Yoga_Bundle.jpg is a real inline image, classified as such', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  if (!wxrExists) return t.skip(WXR_SKIP_REASON);

  const manifest = readManifest();
  const row = manifest.rows.find((r) => r.postSlug === 'yoga-day' && /01_Yoga_Bundle/i.test(r.originalUrl));
  assert.ok(row, 'expected a manifest row for yoga-day referencing 01_Yoga_Bundle.jpg');
  assert.equal(row.type, 'inline', 'the manifest must classify this as an inline image, not "featured" -- it has no distinct WordPress featured-image attachment, only an in-content image Yoast also surfaces as the OG image');

  const parsed = parseWxr(DEFAULT_WXR_PATH);
  const post = parsed.blogPosts.find((p) => (SLUG_OVERRIDES.get(p.oldSlug) || p.oldSlug) === 'yoga-day');
  assert.ok(post);
  const firstImgMatch = post.bodyHtml.match(/<img[^>]+src="([^"]+)"/i);
  assert.ok(firstImgMatch, 'expected at least one inline <img> in the yoga_day body');
  assert.ok(firstImgMatch[1].includes('01_Yoga_Bundle'), 'expected 01_Yoga_Bundle.jpg to be the FIRST inline image in the body, consistent with it being the Yoast-derived OG image');
});

// 11. No unexpected duplicate mappings exist (beyond the one legitimate case in test 9).
test('no local filename is shared by two rows pointing at genuinely different original URLs', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  const byFile = new Map();
  for (const row of manifest.rows) {
    if (!byFile.has(row.localFilename)) byFile.set(row.localFilename, new Set());
    byFile.get(row.localFilename).add(row.originalUrl);
  }
  for (const [filename, urls] of byFile.entries()) {
    assert.equal(urls.size, 1, `local filename "${filename}" is mapped to ${urls.size} different original URLs -- this would mean two different source images collided onto one local file`);
  }
});

// 12. No manifest entry references a path outside the approved blog-media directory.
test('no manifest entry references a path outside the approved blog-media directory', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP_REASON);
  const manifest = readManifest();
  for (const row of manifest.rows) {
    assert.ok(isSafeLocalFilename(row.localFilename), `manifest row for "${row.postSlug}" has an unsafe localFilename: ${JSON.stringify(row.localFilename)}`);
    const resolved = resolveWithinBlogMediaDir(row.localFilename);
    assert.ok(resolved, `manifest row for "${row.postSlug}" resolves outside the approved blog-media directory: ${row.localFilename}`);
  }
});
