// Read-only, full-detail WXR extraction (no writes to WordPress or MongoDB).
// Builds on parse-wxr.cjs's summary pass with per-item content signals needed
// for the migration mapping/decision report: Divi shortcode tag detection,
// form-module detection, attachment parent linkage, full postmeta per item.
const fs = require('fs');

const filePath = process.argv[2];
const outPath = process.argv[3];
const xml = fs.readFileSync(filePath, 'utf8');

function clean(s) {
  if (s == null) return null;
  return s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
}
function allTags(name, block) {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(clean(m[1]));
  return out;
}
function categoriesOf(block, domain) {
  const re = new RegExp(`<category domain="${domain}"[^>]*><!\\[CDATA\\[(.*?)\\]\\]></category>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}
function postmetaOf(block) {
  const blocks = allTags('wp:postmeta', block).map((x) => null); // placeholder, real extraction below (need raw, not cleaned, since values may contain nested tags)
  const re = /<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g;
  const out = {};
  let m;
  while ((m = re.exec(block))) {
    const key = tag('wp:meta_key', m[1]);
    const val = tag('wp:meta_value', m[1]);
    if (key) out[key] = val;
  }
  return out;
}

// Divi shortcode tag names present in post_content (detection only — no
// conversion, per instruction not to attempt a blind shortcode->HTML pass).
const DIVI_TAG_RE = /\[(et_pb_[a-z_]+|contact-field|contact-form)\b/g;
function diviTagsOf(content) {
  const set = new Set();
  let m;
  const re = new RegExp(DIVI_TAG_RE);
  while ((m = re.exec(content || ''))) set.add(m[1]);
  return [...set];
}

const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);

function baseFields(b) {
  const content = tag('content:encoded', b) || '';
  const meta = postmetaOf(b);
  return {
    post_id: tag('wp:post_id', b),
    title: tag('title', b),
    link: tag('link', b),
    post_type: tag('wp:post_type', b),
    status: tag('wp:status', b),
    post_name: tag('wp:post_name', b),
    post_parent: tag('wp:post_parent', b),
    post_date: tag('wp:post_date', b),
    creator: tag('dc:creator', b),
    excerpt: (tag('excerpt:encoded', b) || '').slice(0, 300),
    contentLength: content.length,
    diviTags: diviTagsOf(content),
    hasContactForm: /\[et_pb_contact_form|\[contact-field|\[et_pb_contact_field/.test(content),
    hasEmbeddedMedia: /\[embed\]|youtube\.com|youtu\.be|\[video/.test(content),
    thumbnailId: meta['_thumbnail_id'] || null,
    rankMath: {
      title: meta['rank_math_title'] || null,
      description: meta['rank_math_description'] || null,
      focusKeyword: meta['rank_math_focus_keyword'] || null,
      canonical: meta['rank_math_canonical_url'] || null,
    },
    metaKeys: Object.keys(meta),
  };
}

const pages = itemBlocks.filter((b) => tag('wp:post_type', b) === 'page').map((b) => baseFields(b));

const blogPosts = itemBlocks
  .filter((b) => tag('wp:post_type', b) === 'blog_post')
  .map((b) => {
    const f = baseFields(b);
    f.categories = categoriesOf(b, 'blog-category');
    f.tags = categoriesOf(b, 'post_tag');
    return f;
  });

const testimonials = itemBlocks
  .filter((b) => tag('wp:post_type', b) === 'dipl-testimonial')
  .map((b) => {
    const f = baseFields(b);
    f.category = categoriesOf(b, 'dipl-testimonial-category');
    const content = tag('content:encoded', b) || '';
    f.bodyText = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    return f;
  });

const attachments = itemBlocks
  .filter((b) => tag('wp:post_type', b) === 'attachment')
  .map((b) => ({
    post_id: tag('wp:post_id', b),
    title: tag('title', b),
    attachment_url: clean(tag('wp:attachment_url', b) || ''),
    post_parent: tag('wp:post_parent', b),
    post_date: tag('wp:post_date', b),
  }));

// build a lookup: post_id -> {title, post_name, link, post_type} for parent resolution
const idIndex = {};
for (const b of itemBlocks) {
  const id = tag('wp:post_id', b);
  if (id) idIndex[id] = { title: tag('title', b), post_name: tag('wp:post_name', b), link: tag('link', b), post_type: tag('wp:post_type', b) };
}
for (const a of attachments) {
  a.parent = a.post_parent && a.post_parent !== '0' ? idIndex[a.post_parent] || null : null;
}

fs.writeFileSync(outPath, JSON.stringify({ pages, blogPosts, testimonials, attachments }, null, 2));
console.log('pages:', pages.length, 'blogPosts:', blogPosts.length, 'testimonials:', testimonials.length, 'attachments:', attachments.length);
