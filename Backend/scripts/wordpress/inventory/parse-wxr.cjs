// Read-only WXR inspection — no writes to WordPress or MongoDB.
// Regex-based extraction (no XML parser dependency installed), safe for
// WXR's flat, non-nested tag structure.
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const xml = fs.readFileSync(filePath, 'utf8');

function grabAll(re, str) {
  const out = [];
  let m;
  const r = new RegExp(re, 'g');
  while ((m = r.exec(str))) out.push(m);
  return out;
}

function tag(name, block) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  if (!m) return null;
  return m[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function attrTag(name, attrMatch, block) {
  // returns array of {attrs, text}
  const re = new RegExp(`<${name}([^>]*)>([\\s\\S]*?)</${name}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(block))) {
    out.push({ attrs: m[1], text: m[2].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim() });
  }
  return out;
}

// --- Channel-level taxonomy term definitions (full site vocab, not just used-in-post) ---
const wpCategories = grabAll('<wp:category>([\\s\\S]*?)</wp:category>', xml).map((m) => {
  const b = m[1];
  return {
    term_id: tag('wp:term_id', b),
    nicename: tag('wp:category_nicename', b),
    name: tag('wp:cat_name', b),
    parent: tag('wp:category_parent', b),
  };
});

const wpTags = grabAll('<wp:tag>([\\s\\S]*?)</wp:tag>', xml).map((m) => {
  const b = m[1];
  return {
    term_id: tag('wp:term_id', b),
    slug: tag('wp:tag_slug', b),
    name: tag('wp:tag_name', b),
  };
});

const wpTerms = grabAll('<wp:term>([\\s\\S]*?)</wp:term>', xml).map((m) => {
  const b = m[1];
  return {
    term_id: tag('wp:term_id', b),
    taxonomy: tag('wp:term_taxonomy', b),
    slug: tag('wp:term_slug', b),
    name: tag('wp:term_name', b),
    parent: tag('wp:term_parent', b),
  };
});

// --- Items ---
const itemBlocks = grabAll('<item>([\\s\\S]*?)</item>', xml).map((m) => m[1]);

const items = itemBlocks.map((b) => {
  const categories = attrTag('category', null, b).map((c) => {
    const domainMatch = c.attrs.match(/domain="([^"]*)"/);
    const niceMatch = c.attrs.match(/nicename="([^"]*)"/);
    return { domain: domainMatch ? domainMatch[1] : null, nicename: niceMatch ? niceMatch[1] : null, name: c.text };
  });
  const postmetaBlocks = grabAll('<wp:postmeta>([\\s\\S]*?)</wp:postmeta>', b).map((m) => m[1]);
  const postmeta = postmetaBlocks.map((mb) => ({ key: tag('wp:meta_key', mb), value: tag('wp:meta_value', mb) }));
  return {
    title: tag('title', b),
    link: tag('link', b),
    post_id: tag('wp:post_id', b),
    post_type: tag('wp:post_type', b),
    status: tag('wp:status', b),
    post_name: tag('wp:post_name', b),
    post_parent: tag('wp:post_parent', b),
    post_date: tag('wp:post_date', b),
    menu_order: tag('wp:menu_order', b),
    attachment_url: tag('wp:attachment_url', b),
    creator: tag('dc:creator', b),
    categories,
    postmetaCount: postmeta.length,
    postmetaKeys: postmeta.map((pm) => pm.key),
  };
});

// --- Aggregate ---
const byType = {};
for (const it of items) {
  byType[it.post_type] = byType[it.post_type] || { count: 0, statuses: {} };
  byType[it.post_type].count++;
  byType[it.post_type].statuses[it.status] = (byType[it.post_type].statuses[it.status] || 0) + 1;
}

const KNOWN_WP_CORE_TYPES = new Set([
  'post', 'page', 'attachment', 'nav_menu_item', 'custom_css',
  'customize_changeset', 'wp_global_styles', 'wp_template',
  'wp_template_part', 'wp_navigation', 'wp_font_family', 'wp_font_face',
  'revision',
]);

const customPostTypes = Object.keys(byType).filter((t) => !KNOWN_WP_CORE_TYPES.has(t));

const pages = items.filter((i) => i.post_type === 'page');
const posts = items.filter((i) => i.post_type === 'post');
const attachments = items.filter((i) => i.post_type === 'attachment');
const navMenuItems = items.filter((i) => i.post_type === 'nav_menu_item');
const customItems = items.filter((i) => customPostTypes.includes(i.post_type));

// used categories/tags actually referenced on items (cross-check vs channel-level vocab)
const usedCategoryNames = new Set();
const usedTagNames = new Set();
for (const it of items) {
  for (const c of it.categories) {
    if (c.domain === 'category') usedCategoryNames.add(c.name);
    if (c.domain === 'post_tag') usedTagNames.add(c.name);
  }
}

// all distinct statuses seen
const statusSet = new Set(items.map((i) => i.status));

// all distinct postmeta keys across everything (to spot plugin-specific fields, e.g. SEO plugin, form plugin, ACF)
const allMetaKeys = new Set();
for (const it of items) for (const k of it.postmetaKeys) allMetaKeys.add(k);

const report = {
  totals: {
    totalItems: items.length,
    pages: pages.length,
    posts: posts.length,
    attachments: attachments.length,
    navMenuItems: navMenuItems.length,
    customPostTypeItems: customItems.length,
  },
  byPostType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, v])),
  customPostTypes,
  channelCategories: wpCategories,
  channelTags: wpTags,
  channelTerms: wpTerms,
  usedCategoryNames: [...usedCategoryNames],
  usedTagNames: [...usedTagNames],
  statusesSeen: [...statusSet],
  distinctPostmetaKeys: [...allMetaKeys].sort(),
  pages: pages.map((p) => ({ title: p.title, slug: p.post_name, link: p.link, status: p.status, parent: p.post_parent, id: p.post_id })),
  posts: posts.map((p) => ({ title: p.title, slug: p.post_name, link: p.link, status: p.status, date: p.post_date, categories: p.categories.filter(c=>c.domain==='category').map(c=>c.name), tags: p.categories.filter(c=>c.domain==='post_tag').map(c=>c.name), id: p.post_id })),
  attachmentsSample: attachments.slice(0, 30).map((a) => ({ title: a.title, url: a.attachment_url, parent: a.post_parent, id: a.post_id })),
  customItemsSample: customItems.slice(0, 50).map((c) => ({ title: c.title, post_type: c.post_type, slug: c.post_name, link: c.link, status: c.status, id: c.post_id })),
};

const outPath = process.argv[3];
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log('WROTE REPORT TO', outPath);
console.log('--- SUMMARY ---');
console.log('total items:', items.length);
console.log('pages:', pages.length, 'posts:', posts.length, 'attachments:', attachments.length, 'nav_menu_item:', navMenuItems.length);
console.log('post types found:', Object.keys(byType).join(', '));
console.log('custom post types:', customPostTypes.join(', ') || '(none)');
console.log('statuses seen:', [...statusSet].join(', '));
console.log('channel categories:', wpCategories.length, 'channel tags:', wpTags.length, 'channel wp:term entries:', wpTerms.length);
console.log('distinct postmeta keys count:', allMetaKeys.size);
