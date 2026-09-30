// Read-only Blog Migration Parity Audit. No writes, no media downloads, no
// redirects created. Compares the 19 migrated BlogPost documents against a
// fresh parse of the WXR source.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WXR_PATH = path.resolve(__dirname, '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml');
const MONGO_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';

const SLUG_OVERRIDES = new Map([
  ['unveiling-the-mysteries-of-ga%e1%b9%87apati', 'unveiling-the-mysteries-of-ganapati'],
  ['edicinal-value-of-21-kinds-of-leaves-that-are-offered-in-ga%e1%b9%87esa-puja', 'medicinal-value-of-21-kinds-of-leaves-offered-in-ganesa-puja'],
  ['what-is-sa%e1%b9%83sk%e1%b9%9btam', 'what-is-samskrtam'],
  ['why-sa%e1%b9%83sk%e1%b9%9btam', 'why-samskrtam'],
  ['how-sa%e1%b9%83sk%e1%b9%9btam', 'how-samskrtam'],
  ['yoga_day', 'yoga-day'],
]);

function clean(s) { return s == null ? null : s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim(); }
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
}
function categoriesOf(block, domain) {
  const re = new RegExp(`<category domain="${domain}"[^>]*><!\\[CDATA\\[(.*?)\\]\\]></category>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function postmetaOf(block) {
  const out = {};
  const re = /<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g;
  let m;
  while ((m = re.exec(block))) {
    const key = tag('wp:meta_key', m[1]);
    const val = tag('wp:meta_value', m[1]);
    if (key) out[key] = val;
  }
  return out;
}
function stripGutenbergComments(html) {
  return (html || '').replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '').trim();
}

function extractStructure(html) {
  const h = html || '';
  return {
    headings: [...h.matchAll(/<h([1-6])[^>]*>(.*?)<\/h\1>/gis)].map((m) => `H${m[1]}: ${m[2].replace(/<[^>]+>/g, '').trim()}`),
    lists: (h.match(/<(ul|ol)\b/gi) || []).length,
    blockquotes: (h.match(/<blockquote\b/gi) || []).length,
    links: [...h.matchAll(/<a[^>]+href="([^"]+)"/gi)].map((m) => m[1]),
    images: [...h.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]),
  };
}

function arraysEqual(a, b) {
  const A = [...(a || [])].sort();
  const B = [...(b || [])].sort();
  return JSON.stringify(A) === JSON.stringify(B);
}

// --- Parse WXR ---
const xml = fs.readFileSync(WXR_PATH, 'utf8');
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const sourcePosts = items
  .filter((b) => tag('wp:post_type', b) === 'blog_post')
  .map((b) => {
    const rawContent = tag('content:encoded', b) || '';
    const meta = postmetaOf(b);
    const oldSlug = tag('wp:post_name', b);
    const finalSlug = SLUG_OVERRIDES.get(oldSlug) || oldSlug;
    return {
      postId: tag('wp:post_id', b),
      title: tag('title', b),
      oldSlug,
      finalSlug,
      oldUrl: tag('link', b),
      postDate: tag('wp:post_date', b),
      author: tag('dc:creator', b) || null,
      categories: categoriesOf(b, 'blog-category'),
      tags: categoriesOf(b, 'post_tag'),
      rankMathTitle: meta['rank_math_title'] || null,
      rankMathDescription: meta['rank_math_description'] || null,
      expectedBody: stripGutenbergComments(rawContent),
    };
  });

console.log('Parsed', sourcePosts.length, 'source blog_post items from WXR.');

// --- Read MERN ---
await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;
const dbPosts = await db.collection('blogposts').find({}).toArray();
const dbBySlug = new Map(dbPosts.map((p) => [p.slug, p]));

console.log('Read', dbPosts.length, 'BlogPost documents from MongoDB.\n');

const WP_HOST_RE = /vyoma\.org\/wp-content\/uploads/i;

const rows = [];
const allWpMediaRefs = new Set();

for (const src of sourcePosts) {
  const doc = dbBySlug.get(src.finalSlug);
  const issues = [];
  let contentParity = 'PASS';
  let metadataParity = 'PASS';
  let mediaCol = 'PASS';
  let seoCol = 'PASS';

  if (!doc) {
    rows.push({ src, doc: null, contentParity: 'CONTENT DEFECT', metadataParity: 'METADATA DEFECT', mediaCol: 'N/A', seoCol: 'N/A', issues: ['No matching MERN document found for this slug.'] });
    continue;
  }

  // --- Content parity: exact string match of transformed source vs stored body
  const storedBody = doc.data?.body || '';
  const bodyMatches = storedBody === src.expectedBody;
  if (!bodyMatches) {
    contentParity = 'CONTENT DEFECT';
    issues.push(`Body text does not exactly match transformed source (lengths: source=${src.expectedBody.length}, stored=${storedBody.length}).`);
  }

  const structure = extractStructure(storedBody);
  const srcStructure = extractStructure(src.expectedBody);
  if (JSON.stringify(structure.headings) !== JSON.stringify(srcStructure.headings)) {
    contentParity = 'CONTENT DEFECT';
    issues.push('Heading structure differs from source.');
  }

  // --- Metadata parity
  if (doc.data?.title !== src.title) { metadataParity = 'METADATA DEFECT'; issues.push(`Title mismatch: "${doc.data?.title}" vs source "${src.title}".`); }
  const srcDate = src.postDate ? new Date(src.postDate.replace(' ', 'T') + 'Z').toISOString() : null;
  const docDate = doc.publishedAt ? new Date(doc.publishedAt).toISOString() : null;
  if (srcDate !== docDate) { metadataParity = 'METADATA DEFECT'; issues.push(`publishedAt mismatch: ${docDate} vs source ${srcDate}.`); }
  if ((doc.data?.author || null) !== (src.author || null)) { metadataParity = 'METADATA DEFECT'; issues.push(`Author mismatch: "${doc.data?.author}" vs source "${src.author}".`); }
  if (!arraysEqual(doc.data?.categories, src.categories)) { metadataParity = 'METADATA DEFECT'; issues.push('Category list mismatch.'); }
  if (!arraysEqual(doc.data?.tags, src.tags)) { metadataParity = 'METADATA DEFECT'; issues.push('Tag list mismatch.'); }

  // --- SEO parity
  const expectedSeoTitle = src.rankMathTitle || undefined;
  const expectedSeoDesc = src.rankMathDescription || undefined;
  const storedSeoTitle = doc.data?.seo?.title;
  const storedSeoDesc = doc.data?.seo?.description;
  if ((expectedSeoTitle || null) !== (storedSeoTitle || null)) { seoCol = 'SEO DEFECT'; issues.push(`SEO title mismatch: expected "${expectedSeoTitle}", got "${storedSeoTitle}".`); }
  if ((expectedSeoDesc || null) !== (storedSeoDesc || null)) { seoCol = 'SEO DEFECT'; issues.push(`SEO description mismatch: expected "${expectedSeoDesc}", got "${storedSeoDesc}".`); }

  // --- Media
  const wpImages = structure.images.filter((u) => WP_HOST_RE.test(u));
  if (wpImages.length) {
    mediaCol = 'MEDIA PENDING';
    wpImages.forEach((u) => allWpMediaRefs.add(u));
    issues.push(`${wpImages.length} inline <img> reference(s) still point at WordPress-hosted media (expected — Media/S3 migration is a separate phase).`);
  }
  if (doc.data?.featuredImage !== null) {
    issues.push(`featuredImage is not null (unexpected — Batch 1 explicitly set this to null for all posts).`);
  }

  // --- Slug/URL/redirect (informational, not defect-classified — always REDIRECT PENDING since no redirects have been created yet)
  const slugChanged = src.oldSlug !== src.finalSlug;
  const newUrl = `/media/blog/${src.finalSlug}`;

  rows.push({
    src, doc, contentParity, metadataParity, mediaCol, seoCol, issues,
    slugChanged, newUrl, wpImageCount: wpImages.length, linkCount: structure.links.length,
    externalLinks: structure.links.filter((l) => !/vyoma\.org/i.test(l)).length,
  });
}

// --- Print table ---
console.log('POST | CONTENT | METADATA | MEDIA | SEO | URL/REDIRECT | ISSUES');
for (const r of rows) {
  const label = r.src.finalSlug;
  console.log('-'.repeat(100));
  console.log(label);
  console.log('  Content parity:', r.contentParity);
  console.log('  Metadata parity:', r.metadataParity);
  console.log('  Media:', r.mediaCol, r.wpImageCount ? `(${r.wpImageCount} WP-hosted image refs)` : '');
  console.log('  SEO:', r.seoCol);
  console.log('  Old URL:', r.src.oldUrl);
  console.log('  New URL:', r.newUrl || 'N/A', '| slug changed:', r.slugChanged);
  console.log('  Redirect: REDIRECT PENDING (none created yet)');
  console.log('  Links in body:', r.linkCount, '| external:', r.externalLinks);
  if (r.issues.length) {
    console.log('  Issues:');
    r.issues.forEach((i) => console.log('   -', i));
  } else {
    console.log('  Issues: none');
  }
}

// --- Summary ---
console.log('\n' + '='.repeat(100));
console.log('SUMMARY');
console.log('='.repeat(100));
const contentPass = rows.filter((r) => r.contentParity === 'PASS').length;
const mediaPending = rows.filter((r) => r.mediaCol === 'MEDIA PENDING').length;
const redirectPending = rows.length; // every post needs a redirect: path prefix changes from /blog-post/ to /media/blog/ regardless of slug
const contentDefects = rows.filter((r) => r.contentParity === 'CONTENT DEFECT');
const metadataDefects = rows.filter((r) => r.metadataParity === 'METADATA DEFECT');
const seoDefects = rows.filter((r) => r.seoCol === 'SEO DEFECT');

console.log('1. Posts with complete text/content parity:', contentPass, '/', rows.length);
console.log('2. Posts with media still pending:', mediaPending, '/', rows.length);
console.log('3. Posts needing redirects:', redirectPending, '/', rows.length, '(ALL — old path prefix /blog-post/ changes to /media/blog/ regardless of slug)');
console.log('4. Content defects:', contentDefects.length, contentDefects.map((r) => r.src.finalSlug));
console.log('5. Metadata defects:', metadataDefects.length, metadataDefects.map((r) => r.src.finalSlug));
console.log('6. SEO defects:', seoDefects.length, seoDefects.map((r) => r.src.finalSlug));
console.log('7. Exact WordPress-hosted media URLs still referenced (', allWpMediaRefs.size, 'unique):');
[...allWpMediaRefs].sort().forEach((u) => console.log('  -', u));

await mongoose.disconnect();
