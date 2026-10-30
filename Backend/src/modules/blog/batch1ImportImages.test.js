// Task 7F.2 — regression tests for the Batch 1 importer's new image-
// preservation logic (Backend/scripts/wordpress/import/batch1-import.mjs's
// rewriteInlineImages()/resolveFeaturedImage(), wired into
// toBlogPostRecord()). Distinct from Task 7F.1's
// blogImageManifest.integrity.test.js, which only checks the manifest/asset
// files themselves -- this file checks how the IMPORTER uses that manifest.
//
// Manifest- and WXR-dependent tests below skip with an explicit reason when
// those gitignored files are absent (same convention as Task 7F.1); a skip
// here is never a confirmation that image mapping works, only that it
// wasn't checked. Tests that use synthetic/fake post data (no manifest or
// WXR needed) never skip.
//
// Runs only against disposable mongodb-memory-server instances for its two
// database-backed tests. No network fetch, no image download/upload, no S3,
// no real WordPress import, no persistent/protected database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sanitizeHtml from 'sanitize-html';
import { env } from '../../config/env.js';
import {
  parseWxr,
  toBlogPostRecord,
  rewriteInlineImages,
  resolveFeaturedImage,
  upsertBlogPosts,
  assertCommitDevPreviewNotCombined,
  SLUG_OVERRIDES,
  DEFAULT_WXR_PATH,
} from '../../../scripts/wordpress/import/batch1-import.mjs';
import { MANIFEST_PATH, loadBlogImageManifest, buildImageUrlMap } from '../../../scripts/wordpress/import/blogImageManifest.js';
import { BlogPostModel } from './blogPost.model.js';
import { BlogPostRevisionModel } from './blogPostRevision.model.js';
import { BlogCategoryModel } from './blogCategory.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMPORTER_CLI_PATH = path.resolve(__dirname, '../../../scripts/wordpress/import/batch1-import.mjs');

const manifestExists = fs.existsSync(MANIFEST_PATH);
const wxrExists = fs.existsSync(DEFAULT_WXR_PATH);
const MANIFEST_SKIP = 'Backend/.local-media/blog-image-manifest.json is absent (gitignored) -- skipping; not a confirmation image mapping works.';
const WXR_SKIP = 'The real WordPress export is absent (gitignored) -- skipping; not a confirmation of correctness.';

const KNOWN_GOOGLE_SLUGS = ['ramanavami', 'guru-purnima', 'what-is-sa%e1%b9%83sk%e1%b9%9btam', 'why-sa%e1%b9%83sk%e1%b9%9btam', 'how-sa%e1%b9%83sk%e1%b9%9btam'];
const KNOWN_FEATURED_SLUGS = [
  'guru-purnima',
  'what-is-sa%e1%b9%83sk%e1%b9%9btam',
  'why-sa%e1%b9%83sk%e1%b9%9btam',
  'how-sa%e1%b9%83sk%e1%b9%9btam',
  'the-lion-as-vahana-of-the-goddess-textual-zoological-and-symbolic-perspectives',
  'dhanurveda-the-science-of-warfare-and-wisdom-in-indian-knowledge-systems',
  'a-blissful-awakening-our-vision-for-todays-children-at-vyoma-bala-gurukulam',
  'gandharvaveda-the-science-of-music-and-dance-in-indian-knowledge-systems',
  'how-panchatantra-teaches-without-teaching',
  'why-the-amarakosha-was-written-to-be-sung',
  'raksha-bandhan-gift-a-year-of-sanskrit',
  'why-sanskrit-is-not-finished-it-is-alive',
];

function plainText(html) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function loadParsedAndMap() {
  const parsed = parseWxr(DEFAULT_WXR_PATH);
  const manifest = loadBlogImageManifest();
  const { inlineMap, featuredByPostSlug } = buildImageUrlMap(manifest);
  return { parsed, inlineMap, featuredByPostSlug };
}

// --- 1. All 8 Google-hosted images are preserved through safe mapping (dev-preview) ---
test('dev-image-preview mode preserves all 8 Google-hosted images via the local-media route', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();

  let totalPreserved = 0;
  for (const post of parsed.blogPosts) {
    if (!KNOWN_GOOGLE_SLUGS.includes(post.oldSlug)) continue;
    const record = toBlogPostRecord(post, { inlineMap, featuredByPostSlug, devImagePreview: true, devImagePreviewPort: env.port });
    assert.deepEqual(record.imageIssues, [], `expected no image issues for "${post.oldSlug}" in dev-preview mode`);
    const localUrlMatches = [...record.data.body.matchAll(/http:\/\/localhost:\d+\/local-media\/blog\/[^"]+/g)];
    assert.ok(localUrlMatches.length > 0, `expected at least one local-media URL in the sanitized body for "${post.oldSlug}"`);
    totalPreserved += localUrlMatches.length;
    assert.ok(!record.data.body.includes('googleusercontent.com'), `expected no remaining googleusercontent.com reference in "${post.oldSlug}"`);
  }
  assert.equal(totalPreserved, 8, 'expected exactly 8 Google-hosted images preserved across the 5 known posts');
});

// --- 2. WordPress-hosted images remain intact (untouched, in every mode) ---
test('vyoma.org-hosted inline images are left completely untouched, with or without dev-image-preview', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  const parsed = parseWxr(DEFAULT_WXR_PATH);
  const post = parsed.blogPosts.find((p) => p.oldSlug === 'unveiling-the-mysteries-of-ga%e1%b9%87apati');
  assert.ok(post, 'expected to find the Ganapati post in the real WXR');
  const originalVyomaUrl = 'https://vyoma.org/wp-content/uploads/2023/09/Ganesha-new-1-1024x576.png';
  assert.ok(post.bodyHtml.includes(originalVyomaUrl));

  for (const devImagePreview of [false, true]) {
    const record = toBlogPostRecord(post, { devImagePreview, devImagePreviewPort: env.port });
    assert.ok(record.data.body.includes(originalVyomaUrl), `expected the original vyoma.org URL to survive unchanged (devImagePreview=${devImagePreview})`);
  }
});

// --- 3. Image order, alt text and captions remain unchanged ---
test('rewriting preserves image order and every non-src attribute exactly', () => {
  const body =
    '<p>intro</p>' +
    '<img width="100" height="50" src="https://example-untrusted.test/a.png" alt="First image" />' +
    '<p>middle</p>' +
    '<img src="https://example-untrusted.test/b.png" alt="Second image" class="has-text-align-center" />' +
    '<p>end</p>';
  const inlineMap = new Map([
    ['fake-slug|https://example-untrusted.test/a.png', { postSlug: 'fake-slug', originalUrl: 'https://example-untrusted.test/a.png', localFilename: 'a-aaaa1111.png', type: 'inline' }],
    ['fake-slug|https://example-untrusted.test/b.png', { postSlug: 'fake-slug', originalUrl: 'https://example-untrusted.test/b.png', localFilename: 'b-bbbb2222.png', type: 'inline' }],
  ]);
  const { html, issues } = rewriteInlineImages(body, 'fake-slug', inlineMap, { devImagePreview: true, devImagePreviewPort: 4000 });
  assert.deepEqual(issues, []);

  const imgTags = [...html.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
  assert.equal(imgTags.length, 2);
  assert.match(imgTags[0], /width="100"/);
  assert.match(imgTags[0], /height="50"/);
  assert.match(imgTags[0], /alt="First image"/);
  assert.match(imgTags[0], /src="http:\/\/localhost:4000\/local-media\/blog\/a-aaaa1111\.png"/);
  assert.match(imgTags[1], /alt="Second image"/);
  assert.match(imgTags[1], /class="has-text-align-center"/);
  assert.match(imgTags[1], /src="http:\/\/localhost:4000\/local-media\/blog\/b-bbbb2222\.png"/);
  // Order and surrounding text preserved exactly.
  assert.ok(html.indexOf('intro') < html.indexOf(imgTags[0]));
  assert.ok(html.indexOf(imgTags[0]) < html.indexOf('middle'));
  assert.ok(html.indexOf('middle') < html.indexOf(imgTags[1]));
  assert.ok(html.indexOf(imgTags[1]) < html.indexOf('end'));
});

// --- 4. No article wording changes, across all 19 real posts, in either mode ---
test('image mapping never changes plain-text wording, across all 19 real posts, in any image mode', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();

  for (const post of parsed.blogPosts) {
    const withoutContext = toBlogPostRecord(post);
    const withDevPreview = toBlogPostRecord(post, { inlineMap, featuredByPostSlug, devImagePreview: true, devImagePreviewPort: env.port });
    assert.equal(plainText(withDevPreview.data.body), plainText(withoutContext.data.body), `wording changed for "${post.oldSlug}" when image mapping was enabled`);
  }
});

// --- 5. No localhost URLs in production-target records (default mode) ---
test('no localhost URL ever appears in any record built without --dev-image-preview', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();

  for (const post of parsed.blogPosts) {
    const record = toBlogPostRecord(post, { inlineMap, featuredByPostSlug, devImagePreview: false, devImagePreviewPort: env.port });
    assert.ok(!record.data.body.includes('localhost'), `expected no "localhost" in the production-mode body for "${post.oldSlug}"`);
    if (record.data.featuredImage) {
      assert.ok(!record.data.featuredImage.url.includes('localhost'), `expected no "localhost" in the production-mode featuredImage for "${post.oldSlug}"`);
    }
  }
});

// --- 6. Missing or unsafe mappings cause an explicit failure (never silent) ---
test('a required image with no manifest entry produces an explicit issue, not a silent pass', () => {
  const body = '<img src="https://untrusted-host.test/missing.png" alt="x" />';
  const { html, issues } = rewriteInlineImages(body, 'some-slug', new Map(), { devImagePreview: true, devImagePreviewPort: 4000 });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /No manifest mapping found/);
  assert.ok(html.includes('untrusted-host.test'), 'the untouched original URL should remain in the pre-sanitize HTML, to be dropped by sanitizeBlogBody() as before');
});

test('a mapped image with no --dev-image-preview produces an explicit production-mapping-unavailable issue', () => {
  const row = { postSlug: 'some-slug', originalUrl: 'https://untrusted-host.test/x.png', localFilename: 'x-aaaa.png', type: 'inline' };
  const inlineMap = new Map([['some-slug|https://untrusted-host.test/x.png', row]]);
  const { issues } = rewriteInlineImages('<img src="https://untrusted-host.test/x.png" />', 'some-slug', inlineMap, { devImagePreview: false, devImagePreviewPort: 4000 });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /Production-safe mapping unavailable/);
});

test('a manifest entry with an unsafe local filename (path traversal) produces an explicit issue, even in dev-preview mode', () => {
  const row = { postSlug: 'some-slug', originalUrl: 'https://untrusted-host.test/x.png', localFilename: '../../etc/passwd', type: 'inline' };
  const inlineMap = new Map([['some-slug|https://untrusted-host.test/x.png', row]]);
  const { issues } = rewriteInlineImages('<img src="https://untrusted-host.test/x.png" />', 'some-slug', inlineMap, { devImagePreview: true, devImagePreviewPort: 4000 });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /unsafe local path/);
});

test('resolveFeaturedImage flags a featured row whose original host is not already-safe, rather than using it', () => {
  const featuredByPostSlug = new Map([['some-slug', { postSlug: 'some-slug', originalUrl: 'https://untrusted-host.test/featured.png', type: 'featured' }]]);
  const { featuredImage, issues } = resolveFeaturedImage('some-slug', featuredByPostSlug);
  assert.equal(featuredImage, null);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /not from an already-safe host/);
});

// --- 7. The sanitizer still blocks unsafe HTML and scripts, even with image mapping active ---
test('sanitization still strips <script> and event handlers when image mapping is enabled', () => {
  const fakePost = {
    oldSlug: 'fake-slug-for-7f2-sanitizer-regression',
    title: 'Fake',
    postDate: '2024-01-01 00:00:00',
    author: 'Tester',
    categories: [],
    tags: [],
    bodyHtml: '<p onclick="doEvil()">hi</p><script>alert(1)</script><img src="https://vyoma.org/safe.png" onerror="doEvil()" />',
    rankMathTitle: null,
    rankMathDescription: null,
  };
  const inlineMap = new Map();
  const record = toBlogPostRecord(fakePost, { inlineMap, featuredByPostSlug: new Map(), devImagePreview: true, devImagePreviewPort: 4000 });
  assert.ok(!/<script/i.test(record.data.body));
  assert.ok(!/onclick/i.test(record.data.body));
  assert.ok(!/onerror/i.test(record.data.body));
  assert.ok(record.data.body.includes('https://vyoma.org/safe.png'));
});

// --- 9. Featured-image mapping follows the approved source inventory ---
test('exactly the 12 known posts resolve a featuredImage; all others (including yoga-day) remain null', (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();

  const withFeatured = [];
  for (const post of parsed.blogPosts) {
    const record = toBlogPostRecord(post, { inlineMap, featuredByPostSlug, devImagePreview: false, devImagePreviewPort: env.port });
    if (record.data.featuredImage) withFeatured.push(post.oldSlug);
  }
  assert.deepEqual(withFeatured.sort(), [...KNOWN_FEATURED_SLUGS].sort());
  // yoga_day specifically must never get an invented featuredImage.
  const yogaDay = parsed.blogPosts.find((p) => p.oldSlug === 'yoga_day');
  const yogaDayRecord = toBlogPostRecord(yogaDay, { inlineMap, featuredByPostSlug, devImagePreview: false, devImagePreviewPort: env.port });
  assert.equal(yogaDayRecord.data.featuredImage, null);
});

// --- Database-backed tests (8 and 10): disposable mongodb-memory-server only ---
let mem;
before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
});
after(async () => {
  await mongoose.disconnect();
  await mem.stop();
});
async function resetBlog() {
  await BlogPostModel.deleteMany({});
  await BlogPostRevisionModel.deleteMany({});
  await BlogCategoryModel.deleteMany({});
}

// --- 8. Existing admin edits remain protected on rerun, with image mapping enabled ---
test('an admin-edited post (with a real image in its data) survives a rerun, with image mapping enabled', async (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();
  const imageContext = { inlineMap, featuredByPostSlug, devImagePreview: true, devImagePreviewPort: env.port };
  const blogRecords = parsed.blogPosts.map((p) => toBlogPostRecord(p, imageContext));

  await upsertBlogPosts(blogRecords);
  const targetSlug = SLUG_OVERRIDES.get('guru-purnima') || 'guru-purnima';
  const adminEdit = { title: 'Admin title', excerpt: '', body: '<p>Admin body</p>', featuredImage: { url: 'https://example.com/admin.jpg', alt: 'admin' }, author: 'Admin', categories: [], tags: [], seo: {} };
  await BlogPostModel.updateOne({ slug: targetSlug }, { $set: { data: adminEdit } });

  await upsertBlogPosts(blogRecords); // rerun, image mapping still enabled

  const doc = await BlogPostModel.findOne({ slug: targetSlug }).lean();
  assert.deepEqual(doc.data, adminEdit);
});

// --- 10. The importer remains safe and idempotent, with image mapping enabled ---
test('a full insert-then-rerun cycle with image mapping enabled is fully idempotent', async (t) => {
  if (!manifestExists) return t.skip(MANIFEST_SKIP);
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  const { parsed, inlineMap, featuredByPostSlug } = loadParsedAndMap();
  const imageContext = { inlineMap, featuredByPostSlug, devImagePreview: true, devImagePreviewPort: env.port };
  const blogRecords = parsed.blogPosts.map((p) => toBlogPostRecord(p, imageContext));

  await upsertBlogPosts(blogRecords);
  const firstRun = await BlogPostModel.find().lean();
  assert.equal(firstRun.length, 19);

  await upsertBlogPosts(blogRecords);
  await upsertBlogPosts(blogRecords);
  const secondRun = await BlogPostModel.find().lean();
  assert.equal(secondRun.length, 19);

  for (const before of firstRun) {
    const after = secondRun.find((d) => d.slug === before.slug);
    assert.deepEqual(after.data, before.data, `content drifted for "${before.slug}" across reruns`);
  }
});

// ---------------------------------------------------------------------------
// Task 7F.2A — the --commit + --dev-image-preview fail-closed guard
//
// The unit tests below exercise the exported assertCommitDevPreviewNotCombined()
// directly (fast, no subprocess). The CLI tests spawn the real importer as a
// child process, with MONGODB_URI explicitly cleared, to prove the guard
// fires before ANY other code in main() -- including the WXR-file check
// (which runs before connectDb()) -- regardless of NODE_ENV or flag order.
// None of these ever create, or wait for, a real MongoDB connection: every
// "guard fires" case is rejected before the WXR check even runs, and the
// two "guard does not wrongly fire" cases point --wxr at a nonexistent path
// so the subprocess fails at that check too, strictly before connectDb().
// ---------------------------------------------------------------------------

test('assertCommitDevPreviewNotCombined throws only when both commit and devImagePreview are true', () => {
  assert.throws(() => assertCommitDevPreviewNotCombined(true, true), /must never be combined/);
  assert.doesNotThrow(() => assertCommitDevPreviewNotCombined(true, false));
  assert.doesNotThrow(() => assertCommitDevPreviewNotCombined(false, true));
  assert.doesNotThrow(() => assertCommitDevPreviewNotCombined(false, false));
});

function runImporterCli(args, nodeEnv) {
  try {
    const output = execFileSync(process.execPath, [IMPORTER_CLI_PATH, ...args], {
      encoding: 'utf8',
      env: { ...process.env, NODE_ENV: nodeEnv, MONGODB_URI: '', ALLOW_LOCAL_DEV_DEFAULTS: '' },
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout: output, stderr: '' };
  } catch (err) {
    return {
      exitCode: typeof err.status === 'number' ? err.status : 1,
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : '',
    };
  }
}

function assertGuardFiredCleanly(result) {
  assert.notEqual(result.exitCode, 0, 'expected a non-zero exit code');
  assert.match(result.stderr, /ABORT: --commit and --dev-image-preview must never be combined/);
  // Proves rejection happened before literally anything else in main() --
  // not just before connectDb(), but before even the WXR-file-existence
  // check that itself runs before connectDb(). Neither a successful
  // connection message nor connectDb()'s own distinct "MONGODB_URI must be
  // set" error (which an UNGUARDED run under NODE_ENV=staging/production
  // with no MONGODB_URI would instead produce) appears anywhere.
  assert.ok(!result.stderr.includes('[db] connected'));
  assert.ok(!result.stdout.includes('[OK] Connected'));
  assert.ok(!result.stderr.includes('MONGODB_URI must be set'));
  assert.ok(!result.stderr.includes('WXR file not found'));
}

// 1 & 4. --commit --dev-image-preview is rejected (NODE_ENV=development)
test('CLI: --commit --dev-image-preview is rejected under NODE_ENV=development', () => {
  assertGuardFiredCleanly(runImporterCli(['--commit', '--dev-image-preview'], 'development'));
});

// 2. Reversing flag order is also rejected
test('CLI: reversing the flag order (--dev-image-preview --commit) is also rejected', () => {
  assertGuardFiredCleanly(runImporterCli(['--dev-image-preview', '--commit'], 'development'));
});

// 5. NODE_ENV=staging cannot bypass the guard
test('CLI: --commit --dev-image-preview is rejected under NODE_ENV=staging', () => {
  assertGuardFiredCleanly(runImporterCli(['--commit', '--dev-image-preview'], 'staging'));
});

// 6. NODE_ENV=production cannot bypass the guard
test('CLI: --commit --dev-image-preview is rejected under NODE_ENV=production', () => {
  assertGuardFiredCleanly(runImporterCli(['--commit', '--dev-image-preview'], 'production'));
});

// Step 2's "check any other write-capable CLI path" requirement:
// --fix-media-sync is a separate write-capable entry point that never
// touches image mapping at all, but the guard is checked before main()
// even looks at --fix-media-sync, so the dangerous combination is rejected
// here too, uniformly, rather than relying on --fix-media-sync's own logic
// (which has no image-awareness to rely on in the first place).
test('CLI: --fix-media-sync --commit --dev-image-preview is also rejected, before reaching that code path', () => {
  assertGuardFiredCleanly(runImporterCli(['--fix-media-sync', '--commit', '--dev-image-preview'], 'development'));
});

// 7. Safe dry-run and normal importer behavior remain unchanged: the new
// guard must never fire for either flag used alone. --wxr points at a
// nonexistent path so each of these fails at the pre-existing WXR check
// (itself before connectDb()) rather than proceeding to a real connection
// attempt -- this test only cares whether the 7F.2A guard wrongly fired.
test('CLI: --dev-image-preview alone (no --commit) is never rejected by the new guard', () => {
  const result = runImporterCli(['--dev-image-preview', '--wxr', '/nonexistent/path/does-not-exist.xml'], 'development');
  assert.ok(!result.stderr.includes('--commit and --dev-image-preview must never be combined'));
  assert.match(result.stderr, /WXR file not found/);
});

test('CLI: --commit alone (no --dev-image-preview) is never rejected by the new guard', () => {
  const result = runImporterCli(['--commit', '--wxr', '/nonexistent/path/does-not-exist.xml'], 'development');
  assert.ok(!result.stderr.includes('--commit and --dev-image-preview must never be combined'));
  assert.match(result.stderr, /WXR file not found/);
});
