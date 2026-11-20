// Regression coverage for Task 7C's three Batch 1 importer safety fixes
// (Backend/scripts/wordpress/import/batch1-import.mjs), found unsafe during
// the Task 7B read-only investigation:
//
//   Blocker A: the importer's BlogPost upsert used to be a bare replacement
//   document (no $set/$setOnInsert), which told MongoDB to REPLACE the
//   whole existing document on every match -- silently discarding an
//   admin's edited data, in-progress draftData, and any status/publishedAt
//   change on every rerun. Fixed via upsertBlogPosts()'s $setOnInsert-only
//   write, the same pattern already proven for runSeed.js (Task 6I-B/6I-B3)
//   but never previously applied to this independently-written importer.
//
//   Blocker B: the importer wrote post bodies straight from the WXR parse,
//   never calling sanitizeBlogBody() -- contradicting its own code comment
//   and the frontend's trust invariant for dangerouslySetInnerHTML. Fixed
//   by routing every body through the app's own, already WordPress-content-
//   audited sanitizer inside toBlogPostRecord().
//
//   Blocker C: the importer depended entirely on whatever MONGODB_URI
//   happened to be configured at invocation time, with no guard against
//   the standing-rules-protected vyoma_migration_dryrun database. Fixed via
//   assertSafeDatabaseTarget(), and by guarding main()'s own invocation so
//   importing this module for testing never triggers a real connection or
//   write as a side effect.
//
// Runs against disposable mongodb-memory-server instances only -- never
// MongoDB Atlas, never any persistent database, and never
// mongodb://127.0.0.1:27017/vyoma_migration_dryrun. This file connects
// mongoose directly to its own in-memory instance (bypassing connectDb()
// and any ambient MONGODB_URI entirely), exactly so these tests never rely
// on -- or are affected by -- whatever the environment happens to have
// configured.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import sanitizeHtml from 'sanitize-html';
import {
  parseWxr,
  toBlogPostRecord,
  upsertBlogPosts,
  assertSafeDatabaseTarget,
  assertDisposableTestDatabase,
  DEFAULT_WXR_PATH,
} from '../../../scripts/wordpress/import/batch1-import.mjs';
import { BlogPostModel } from './blogPost.model.js';
import { BlogPostRevisionModel } from './blogPostRevision.model.js';
import { BlogCategoryModel } from './blogCategory.model.js';
import { sanitizeBlogBody } from './sanitizeBody.js';

// Task 7D.21 — same gitignored-fixture convention already established in
// batch1ImportImages.test.js/blogImageManifest.integrity.test.js: this real,
// private WordPress export is never committed, so it is absent on any
// machine other than the one migration work was actually done on (confirmed
// as the cause of a cascading GitHub Actions CI failure -- every test below
// that needs it used to read it unconditionally via the shared `before()`
// hook, with no guard at all). Every test that actually needs `parsed`/
// `blogRecords` now skips explicitly, with a clear reason, when the file is
// absent -- a skip here is never a confirmation that the importer/sanitizer
// behaves correctly, only that it wasn't checked. Tests that only use
// synthetic/fake post data (no WXR needed) are unaffected and never skip.
const wxrExists = fs.existsSync(DEFAULT_WXR_PATH);
const WXR_SKIP = 'The real WordPress export is absent (gitignored) -- skipping; not a confirmation of correctness.';

let mem;
let parsed;
let blogRecords;

before(async () => {
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  // Task 7C.1: an explicit, positive check -- not just "isn't named the
  // protected database" -- that the connection every test in this file is
  // about to write through really is the disposable instance this file
  // just created. If this throws, every subsequent test in the file would
  // otherwise be writing through an unverified connection.
  assertDisposableTestDatabase(mongoose.connection, mem);
  if (wxrExists) {
    parsed = parseWxr(DEFAULT_WXR_PATH);
    blogRecords = parsed.blogPosts.map(toBlogPostRecord);
  }
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

test('sanity: the real WXR export still parses to exactly 19 real blog posts', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  assert.equal(parsed.blogPosts.length, 19);
  assert.equal(blogRecords.length, 19);
});

// 1. First-time insert
test('first-time insert creates all 19 real posts with correct data, status, and publishedAt', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);

  const docs = await BlogPostModel.find().lean();
  assert.equal(docs.length, 19);
  assert.deepEqual(
    docs.map((d) => d.slug).sort(),
    blogRecords.map((r) => r.slug).sort()
  );

  const first = blogRecords[0];
  const doc = docs.find((d) => d.slug === first.slug);
  assert.deepEqual(doc.data, first.data);
  assert.equal(doc.status, 'published');
  assert.equal(new Date(doc.publishedAt).toISOString(), new Date(first.publishedAt).toISOString());
  assert.equal(doc.draftData, null);
});

// 2. Safe rerun
test('repeated reruns of upsertBlogPosts are idempotent -- no duplicates, no content drift', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  await upsertBlogPosts(blogRecords);
  await upsertBlogPosts(blogRecords);

  assert.equal(await BlogPostModel.countDocuments(), 19);
  const doc = await BlogPostModel.findOne({ slug: blogRecords[0].slug }).lean();
  assert.deepEqual(doc.data, blogRecords[0].data);
});

// 3. Existing admin-edited post
test('an admin-edited real post survives a rerun completely untouched', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  const slug = blogRecords[0].slug;
  const adminEdit = {
    title: 'Admin-edited title',
    excerpt: 'Admin-edited excerpt',
    body: '<p>Admin-edited body</p>',
    featuredImage: { url: 'https://example.com/photo.jpg' },
    author: 'Admin Author',
    categories: ['Research'],
    tags: ['admin', 'edited'],
    seo: { title: 'Admin SEO title' },
  };
  await BlogPostModel.updateOne({ slug }, { $set: { data: adminEdit } });

  await upsertBlogPosts(blogRecords);

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.deepEqual(doc.data, adminEdit);
});

// 4. Existing draftData
test('existing draftData survives a rerun completely untouched', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  const slug = blogRecords[0].slug;
  const draftEdit = { title: 'Pending draft title', excerpt: '', body: '', featuredImage: null, author: '', categories: [], tags: [], seo: {} };
  await BlogPostModel.updateOne({ slug }, { $set: { draftData: draftEdit } });

  await upsertBlogPosts(blogRecords);

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.deepEqual(doc.draftData, draftEdit);
});

// 5. Existing publishedAt and status
test('existing status and publishedAt survive a rerun completely untouched', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  const slug = blogRecords[0].slug;
  const customDate = new Date('2020-01-01T00:00:00.000Z');
  await BlogPostModel.updateOne({ slug }, { $set: { status: 'draft', publishedAt: customDate } });

  await upsertBlogPosts(blogRecords);

  const doc = await BlogPostModel.findOne({ slug }).lean();
  assert.equal(doc.status, 'draft');
  assert.equal(new Date(doc.publishedAt).toISOString(), customDate.toISOString());
});

// 6. Existing revisions remain unchanged
test('existing BlogPostRevisionModel records are never created, deleted, or modified by the importer', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  const slug = blogRecords[0].slug;
  const post = await BlogPostModel.findOne({ slug }).lean();
  // A non-empty `seo` is used deliberately: BlogPostRevisionModel's schema
  // (unlike BlogPostModel) has no `minimize: false`, so Mongoose's default
  // minimize:true would strip an empty `seo: {}` on save -- a pre-existing
  // property of that model, unrelated to anything this task fixes. Using a
  // populated value here keeps this test focused on its actual point (does
  // the importer disturb an existing revision), not on that separate detail.
  const revisionData = { ...post.data, seo: { title: 'Existing SEO Title' } };
  const revision = await BlogPostRevisionModel.create({
    postId: post._id,
    version: 1,
    data: revisionData,
    action: 'publish',
    publishedBy: null,
    publishedByEmail: 'tester@example.com',
    details: null,
  });

  await upsertBlogPosts(blogRecords);

  const revisions = await BlogPostRevisionModel.find({ postId: post._id }).lean();
  assert.equal(revisions.length, 1);
  assert.equal(String(revisions[0]._id), String(revision._id));
  assert.deepEqual(revisions[0].data, revisionData);
  // And the importer itself creates zero revisions of its own, first run or rerun.
  assert.equal(await BlogPostRevisionModel.countDocuments(), 1);
});

// 7. Partial import recovery
test('a partially-imported batch recovers cleanly on rerun without duplicating or disturbing existing posts', async (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  await resetBlog();
  await upsertBlogPosts(blogRecords);
  const [first, second] = blogRecords;
  const customized = { ...first.data, title: 'Customized' };
  await BlogPostModel.updateOne({ slug: first.slug }, { $set: { data: customized } });
  await BlogPostModel.deleteOne({ slug: second.slug }); // stands in for "a prior partial run that died before inserting this one"

  await upsertBlogPosts(blogRecords);

  const recreated = await BlogPostModel.findOne({ slug: second.slug }).lean();
  assert.ok(recreated, 'the missing post must be recreated by the next run');
  assert.deepEqual(recreated.data, second.data);

  const untouched = await BlogPostModel.findOne({ slug: first.slug }).lean();
  assert.deepEqual(untouched.data, customized, 'an unrelated, already-customized post must remain untouched');

  assert.equal(await BlogPostModel.countDocuments(), 19, 'rerunning must not create duplicate documents for posts that already exist');
});

// 8. Disallowed script removal
test('toBlogPostRecord sanitizes a body containing a disallowed <script> tag before it is ever stored', () => {
  const fakePost = {
    oldSlug: 'fake-slug-for-script-test',
    title: 'Fake post for script-removal test',
    postDate: '2024-01-01 00:00:00',
    author: 'Tester',
    categories: [],
    tags: [],
    bodyHtml: '<p>Safe text</p><script>alert(1)</script><p>More text</p>',
    rankMathTitle: null,
    rankMathDescription: null,
  };
  const record = toBlogPostRecord(fakePost);
  assert.ok(!/<script/i.test(record.data.body), 'script tag must not survive sanitization');
  assert.ok(!/alert\(1\)/.test(record.data.body), 'script content must not survive sanitization');
  assert.ok(record.data.body.includes('Safe text'));
  assert.ok(record.data.body.includes('More text'));
});

// 9. Unsafe HTML event-handler / URL-scheme removal
test('toBlogPostRecord strips unsafe event-handler attributes and javascript: URLs while keeping safe text', () => {
  const fakePost = {
    oldSlug: 'fake-slug-for-event-handler-test',
    title: 'Fake post for event-handler-removal test',
    postDate: '2024-01-01 00:00:00',
    author: 'Tester',
    categories: [],
    tags: [],
    bodyHtml: '<p onclick="doEvil()">Click me</p><a href="javascript:doEvil()">bad link</a><img src="javascript:doEvil()" onerror="doEvil()" />',
    rankMathTitle: null,
    rankMathDescription: null,
  };
  const record = toBlogPostRecord(fakePost);
  assert.ok(!/onclick/i.test(record.data.body), 'onclick attribute must not survive sanitization');
  assert.ok(!/onerror/i.test(record.data.body), 'onerror attribute must not survive sanitization');
  assert.ok(!/javascript:/i.test(record.data.body), 'javascript: URLs must not survive sanitization');
  assert.ok(record.data.body.includes('Click me'));
});

// 10. Preservation of allowed article markup (across all 19 real posts)
//
// Both sides of this comparison are run through the SAME underlying parser
// (sanitize-html, configured to allow everything and just strip tags) so
// that the only possible difference left is content sanitizeBlogBody()
// actually removed -- not an artifact of entity decoding (e.g. the raw WXR
// text contains the literal 6 characters "&nbsp;", which any HTML parser,
// including sanitizeBlogBody()'s own, decodes to a real space; comparing
// against the raw un-decoded string directly would wrongly look like lost
// wording).
function plainText(html) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/[\s ]+/g, ' ')
    .trim();
}

test('sanitization preserves plain-text wording exactly, across all 19 real published posts', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  for (const post of parsed.blogPosts) {
    const sanitized = sanitizeBlogBody(post.bodyHtml);
    assert.equal(plainText(sanitized), plainText(post.bodyHtml), `wording must be unchanged by sanitization for post "${post.oldSlug}"`);
  }
});

// Known, confirmed finding (not a defect in this fix): 5 of the 19 real
// posts (ramanavami, guru-purnima, what-is-samskrtam, why-samskrtam,
// how-samskrtam) have inline <img> tags hosted on Google's
// lh7-*.googleusercontent.com (images pasted from Google Docs into the
// WordPress editor), which sanitizeBody.js's IMAGE_ALLOWED_HOSTS allowlist
// (vyoma.org/www.vyoma.org only, plus the S3 pattern) correctly and
// intentionally drops -- allowing arbitrary external image hosts would
// defeat the point of that allowlist. This is a genuine, pre-existing
// content-owner decision (re-host these specific images, or accept the
// loss), out of this narrow safety-fix task's scope -- recorded here as a
// locked-in regression test so a future allowlist change is a conscious
// decision, not a silent behavior change.
const NON_VYOMA_IMAGE_HOST_SLUGS = ['ramanavami', 'guru-purnima', 'what-is-sa%e1%b9%83sk%e1%b9%9btam', 'why-sa%e1%b9%83sk%e1%b9%9btam', 'how-sa%e1%b9%83sk%e1%b9%9btam'];

test('finding: inline images hosted on Google\'s image CDN (not vyoma.org) are dropped by the existing image-host allowlist, for exactly the 5 known posts', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  for (const post of parsed.blogPosts) {
    const sanitized = sanitizeBlogBody(post.bodyHtml);
    const rawImgSrcs = [...post.bodyHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    const nonVyomaRawImgs = rawImgSrcs.filter((src) => {
      try {
        const host = new URL(src).hostname;
        return host !== 'vyoma.org' && host !== 'www.vyoma.org';
      } catch {
        return false;
      }
    });
    if (NON_VYOMA_IMAGE_HOST_SLUGS.includes(post.oldSlug)) {
      assert.ok(nonVyomaRawImgs.length > 0, `expected "${post.oldSlug}" to have a known non-vyoma.org image in the raw body`);
      assert.ok(!/<img/i.test(sanitized) || !nonVyomaRawImgs.some((src) => sanitized.includes(src)), `non-vyoma.org image(s) must be dropped from "${post.oldSlug}"`);
    } else {
      assert.equal(nonVyomaRawImgs.length, 0, `did not expect a non-vyoma.org image in "${post.oldSlug}" -- the known-list above may be stale`);
    }
  }
});

test('sanitization preserves required formatting tags (headings, lists, links, tables) wherever the raw post already uses them', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  // img is checked separately above -- vyoma.org-hosted images survive,
  // non-vyoma.org-hosted ones are intentionally dropped (see the finding
  // test above), so a blanket "every raw <img> must survive" assertion
  // would be factually wrong for 5 of the 19 real posts.
  const TAGS_TO_CHECK = ['h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'table', 'blockquote', 'strong', 'em'];
  for (const post of parsed.blogPosts) {
    const sanitized = sanitizeBlogBody(post.bodyHtml);
    for (const t of TAGS_TO_CHECK) {
      const rawHasTag = new RegExp(`<${t}[\\s>]`, 'i').test(post.bodyHtml);
      if (rawHasTag) {
        const sanitizedHasTag = new RegExp(`<${t}[\\s>]`, 'i').test(sanitized);
        assert.ok(sanitizedHasTag, `expected <${t}> to survive sanitization for post "${post.oldSlug}"`);
      }
    }
  }
});

test('sanitization preserves vyoma.org-hosted images wherever the raw post already uses them', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  for (const post of parsed.blogPosts) {
    if (NON_VYOMA_IMAGE_HOST_SLUGS.includes(post.oldSlug)) continue;
    const sanitized = sanitizeBlogBody(post.bodyHtml);
    const rawHasImg = /<img[\s>]/i.test(post.bodyHtml);
    if (rawHasImg) {
      assert.ok(/<img[\s>]/i.test(sanitized), `expected a vyoma.org-hosted <img> to survive sanitization for post "${post.oldSlug}"`);
    }
  }
});

test('sanitization preserves Sanskrit/IAST Unicode text unchanged', () => {
  const fakePost = {
    oldSlug: 'fake-slug-for-unicode-test',
    title: 'Fake post for Unicode preservation test',
    postDate: '2024-01-01 00:00:00',
    author: 'Tester',
    categories: [],
    tags: [],
    bodyHtml: '<p>Saṃskṛtam, गुरु बिन ज्ञान न उपजै, and Gaṇeśa caturthī are preserved exactly.</p>',
    rankMathTitle: null,
    rankMathDescription: null,
  };
  const record = toBlogPostRecord(fakePost);
  assert.ok(record.data.body.includes('Saṃskṛtam'));
  assert.ok(record.data.body.includes('गुरु बिन ज्ञान न उपजै'));
  assert.ok(record.data.body.includes('Gaṇeśa caturthī'));
});

// 11. Accidental persistent/protected-database targeting is rejected
test('assertSafeDatabaseTarget rejects a connection whose database name is the protected dry-run database', async () => {
  // A second, separate in-memory instance, deliberately given the
  // PROTECTED database's NAME only -- still fully disposable/in-memory,
  // never the real persistent database, used only to exercise the
  // name-based guard without ever touching anything real.
  const protectedMem = await MongoMemoryServer.create();
  const protectedConn = await mongoose.createConnection(protectedMem.getUri('vyoma_migration_dryrun')).asPromise();
  try {
    assert.throws(() => assertSafeDatabaseTarget(protectedConn), /vyoma_migration_dryrun/);
  } finally {
    await protectedConn.close();
    await protectedMem.stop();
  }
});

test('assertSafeDatabaseTarget allows an ordinary, non-protected database connection', () => {
  assert.doesNotThrow(() => assertSafeDatabaseTarget(mongoose.connection));
});

// 12. No database writes without explicit authorization
test('the importer performs no writes unless its exported functions are explicitly called', async () => {
  await resetBlog();
  // Nothing changed merely from this module having been imported at the
  // top of this file -- main() is never auto-invoked on import (see the
  // direct-CLI-invocation guard at the bottom of batch1-import.mjs). Every
  // other test in this file already depends on that being true; this test
  // states it explicitly.
  assert.equal(await BlogPostModel.countDocuments(), 0);
  assert.equal(await BlogCategoryModel.countDocuments(), 0);

  // Calling the write function with zero records is itself a no-op write.
  await upsertBlogPosts([]);
  assert.equal(await BlogPostModel.countDocuments(), 0);
});

// --- Task 7C.1 additions ----------------------------------------------------

// assertDisposableTestDatabase: a stronger, allow-list-style guard for the
// test suite specifically (distinct from assertSafeDatabaseTarget's
// blocklist-by-name above) -- it requires the exact disposable instance to
// be supplied and verifies the live connection actually resolves to it.
test('assertDisposableTestDatabase rejects a connection that does not match the supplied memory server', async () => {
  const otherMem = await MongoMemoryServer.create();
  const otherConn = await mongoose.createConnection(otherMem.getUri()).asPromise();
  try {
    // otherConn is a perfectly legitimate disposable instance -- just not
    // the one passed as the second argument, which is the whole point.
    assert.throws(() => assertDisposableTestDatabase(otherConn, mem), /does not match the explicitly supplied/);
  } finally {
    await otherConn.close();
    await otherMem.stop();
  }
});

test('assertDisposableTestDatabase rejects when no memory server instance is supplied at all', () => {
  assert.throws(() => assertDisposableTestDatabase(mongoose.connection, null), /must be supplied/);
  assert.throws(() => assertDisposableTestDatabase(mongoose.connection, undefined), /must be supplied/);
  assert.throws(() => assertDisposableTestDatabase(mongoose.connection, {}), /must be supplied/);
});

test('assertDisposableTestDatabase accepts a connection that genuinely matches the supplied memory server', () => {
  assert.doesNotThrow(() => assertDisposableTestDatabase(mongoose.connection, mem));
});

// Point 3: --fix-media-sync must go through the same guarded-connection
// sequence as the main importer path. Running runFixMediaSync() end-to-end
// isn't exercised here (it calls connectToMigrationDb() itself, which this
// suite deliberately never invokes -- see the file header), so this is a
// narrow, static regression check: if a future edit ever added a new,
// unguarded connectDb() call site, this test fails instead of silently
// losing coverage.
//
// Task 7H.2: batch1-import.mjs no longer calls connectDb() +
// assertSafeDatabaseTarget() as two separate statements at each call site --
// both are now combined inside migrationDb.mjs's connectToMigrationDb(),
// which this file calls instead. That guarantee is therefore baked into the
// shared helper itself (exercised directly by migrationDb.test.js), not
// something a call site here could accidentally detach from. This test now
// confirms two things: this file has exactly the expected two call sites to
// the guarded helper, and it never bypasses it with a raw, unguarded
// connectDb() call of its own.
test('batch1-import.mjs connects to MongoDB only through the shared, guarded connectToMigrationDb()', async () => {
  const fs = await import('node:fs');
  const sourcePath = new URL('../../../scripts/wordpress/import/batch1-import.mjs', import.meta.url);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const guardedCalls = [...source.matchAll(/await connectToMigrationDb\(\);/g)];
  // One in main() (the full importer path), one in runFixMediaSync() -- if
  // this count ever changes, that's worth a deliberate look.
  assert.equal(guardedCalls.length, 2, 'expected exactly two connectToMigrationDb() call sites (main() and runFixMediaSync())');
  assert.ok(!/\bawait connectDb\(\)/.test(source), 'must not call connectDb() directly anywhere -- only through connectToMigrationDb()');
});

// Point 4: document, without touching, the 5 real posts whose inline images
// are hosted on Google's image CDN rather than vyoma.org -- these are
// correctly and intentionally dropped by the existing, unmodified
// IMAGE_ALLOWED_HOSTS allowlist (sanitizeBody.js). Not expanding that
// allowlist, not re-hosting, not removing these images from the source: this
// test only pins down the exact, currently-true facts so a future change to
// either the WXR export or the allowlist is a conscious, reviewed decision.
const EXPECTED_GOOGLE_HOSTED_IMAGES = {
  ramanavami: [
    'https://lh7-us.googleusercontent.com/c9J4ooaE2aW7ILwBWSF5KqUJei3Qmme9gzlEKok_c1-NcCg8qNqi74UvtsM_zvM4VE3AZq2N3ud2yCeRsnO1-69smgQuc14LydyoL4w-7HenvTHOM58F335KmzbGUV5Y87V4WY3LgR4wowHIm9Sip_k',
    'https://lh7-us.googleusercontent.com/RyG15Er6DFuBdIrLn6ssY8P2PXy2rrbXS3h9fl3gJj3_sutofs72EZY9hJDAjdONSxn1IPAON3eY6ZWOP8TUobk-X1LXhCpYserfZi3hccc2P5byDU0R0z9uf5223eAWq3Ob8rekhm1CBeIe7UNC3ck',
    'https://lh7-us.googleusercontent.com/TKNyjzyDw0wvwnc9Kuq-kJUnSe7urWngaadP00Exw3ODUR104ucu-A4TIR6hn2Kjz9oLKBdm5T_hE0BCmq4kbJkl0DHVhf3dZIz6xf_9gmrTpq_LdVKPz9KRoMfiW-vPzmWeUuhtcc3T0sjtKM441QY',
  ],
  'guru-purnima': [
    'https://lh7-us.googleusercontent.com/docsz/AD_4nXdTd4dhpu5ZJc2jYn7QBBGqCRRgV6bpoUoSCgnlgr5avspy4mVeOR2t3tcavrKdVwQZBU0_es5KvBaaZWQg9bCNfYp9cJ76EuUFK7RGh_e25sgUCSGr5K0g0uYX3SkHWX_LRVSZ32ZqnqbVj2ARSU6G6IeE?key=nXUqZ9OLR5Ok2Qqh4sowUA',
  ],
  'what-is-sa%e1%b9%83sk%e1%b9%9btam': [
    'https://lh7-rt.googleusercontent.com/docsz/AD_4nXeu6IQeQbZRLaHC88NZV3i4s4kRGp1mtfu2r4vnGLaPmQ0fDYaSjD0yjte2AIFxaCYVjVIpbdC_wUvUgE-iKASruoONvB-Fp9RnEIHMnwssrKPzByfp4abKlfXEGTYIi81yqUwF?key=CfWtDbQJ3YB4UfOixwn5w4Fn',
    'https://lh7-rt.googleusercontent.com/docsz/AD_4nXePu5Zpy18yG9cqNMltDpEiS2t9Z6lHs560LsQU4OfRrTWLnZx_yPn11jTs3089qNJlqDUgoD4j2MFTRD8m4bynhntMxD134-L3WpZEOSekxaNgey-qtVlbYhdKNSGV9sH60hzF?key=CfWtDbQJ3YB4UfOixwn5w4Fn',
  ],
  'why-sa%e1%b9%83sk%e1%b9%9btam': [
    'https://lh7-rt.googleusercontent.com/docsz/AD_4nXcZbIzm64t-EmR55B7sueylqs8LeFIra58fnpdbiGYhUMcFZ6Q7aa-000EIW7qGLIux7F3kqAxk5YMEfnbnVitpGR98ddpeOx2kTB-siRE3-X3Pdj8YnFwwXdUYkBhkj1QgZEn8fQ?key=vLbxEzBiQxIW8mhx_mjsxi_E',
  ],
  'how-sa%e1%b9%83sk%e1%b9%9btam': [
    'https://lh7-rt.googleusercontent.com/docsz/AD_4nXcV-g60yU-AMcokek3GtgaBaZrXzfpDlqT3DUxow3TLaPN5PbBNTMy5PP9S5zuzZAuXhAgrTvYdi7aU-oqlEzg2HWe9T7v_3oGwtTZXDnX8sx322QxZ9IwL6ATh2tyK6XrMgSEvhA?key=bdic_DpC8xcUwCBMfXNInCUY',
  ],
};

test('finding: documents the exact Google-hosted image URLs and per-post counts that the unmodified allowlist drops', (t) => {
  if (!wxrExists) return t.skip(WXR_SKIP);
  for (const [slug, expectedUrls] of Object.entries(EXPECTED_GOOGLE_HOSTED_IMAGES)) {
    const post = parsed.blogPosts.find((p) => p.oldSlug === slug);
    assert.ok(post, `expected to find post with oldSlug "${slug}" in the real WXR export`);
    const rawImgSrcs = [...post.bodyHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    const nonVyomaRawImgs = rawImgSrcs.filter((src) => {
      try {
        const host = new URL(src).hostname;
        return host !== 'vyoma.org' && host !== 'www.vyoma.org';
      } catch {
        return false;
      }
    });
    assert.deepEqual(nonVyomaRawImgs, expectedUrls, `non-vyoma.org image URLs changed for "${slug}" -- this must be a conscious, reviewed update, not a silent drift`);

    // Confirm these exact URLs are indeed absent from the sanitized body
    // (i.e. actually dropped, not just present-but-unflagged).
    const sanitized = sanitizeBlogBody(post.bodyHtml);
    for (const url of expectedUrls) {
      assert.ok(!sanitized.includes(url), `expected "${url}" to be dropped from the sanitized body of "${slug}"`);
    }
  }

  const totalAffectedImages = Object.values(EXPECTED_GOOGLE_HOSTED_IMAGES).reduce((sum, arr) => sum + arr.length, 0);
  assert.equal(totalAffectedImages, 8, '5 posts, 8 total Google-hosted images expected to be dropped (3+1+2+1+1)');
});
