// Read-only Blog Redirect Manifest builder. No Redirect records created, no
// MongoDB writes, no BlogPost changes — only a fresh WXR parse plus a
// read-only existence check against the current BlogPost collection.
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

const xml = fs.readFileSync(WXR_PATH, 'utf8');
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
const posts = items
  .filter((b) => tag('wp:post_type', b) === 'blog_post')
  .map((b) => {
    const oldSlug = tag('wp:post_name', b);
    const finalSlug = SLUG_OVERRIDES.get(oldSlug) || oldSlug;
    return {
      postId: tag('wp:post_id', b),
      title: tag('title', b),
      oldSlug,
      finalSlug,
      slugChanged: oldSlug !== finalSlug,
      legacyUrl: `/blog-post/${oldSlug}/`,
      finalUrl: `/media/blog/${finalSlug}`,
    };
  });

console.log('Parsed', posts.length, 'blog_post items from WXR (expected 19).\n');

// --- Landing-page redirects, added on top ---
const landingRedirects = [
  { source: '/blog/', destination: '/media/blog' },
  { source: '/blog-2/', destination: '/media/blog' },
  { source: '/blogs/', destination: '/media/blog' },
  { source: '/blog-post/', destination: '/media/blog' },
];

const postRedirects = posts.map((p) => ({
  postId: p.postId,
  title: p.title,
  legacyUrl: p.legacyUrl,
  legacySlug: p.oldSlug,
  finalSlug: p.finalSlug,
  finalUrl: p.finalUrl,
  slugChanged: p.slugChanged,
  source: p.legacyUrl,
  destination: p.finalUrl,
  statusCode: 301,
}));

const allRedirects = [...postRedirects.map((r) => ({ source: r.source, destination: r.destination })), ...landingRedirects];

console.log('='.repeat(100));
console.log('BLOG POST REDIRECTS (19)');
console.log('='.repeat(100));
for (const r of postRedirects) {
  console.log(`${r.postId} | ${r.title}`);
  console.log(`  legacy: ${r.legacyUrl}  (slug: ${r.legacySlug})`);
  console.log(`  final:  ${r.finalUrl}  (slug: ${r.finalSlug})`);
  console.log(`  slug changed: ${r.slugChanged} | status: ${r.statusCode}`);
}

console.log('\n' + '='.repeat(100));
console.log('LANDING-PAGE REDIRECTS (4)');
console.log('='.repeat(100));
for (const r of landingRedirects) console.log(`  ${r.source} -> ${r.destination}  (301)`);

// --- Duplicate/conflict checks ---
console.log('\n' + '='.repeat(100));
console.log('DUPLICATE / CONFLICT CHECK');
console.log('='.repeat(100));
const sources = allRedirects.map((r) => r.source);
const destinations = allRedirects.map((r) => r.destination);
const dupeSources = sources.filter((s, i) => sources.indexOf(s) !== i);
const dupeDestinations = [...new Set(destinations.filter((d, i) => destinations.indexOf(d) !== i))];
console.log('Duplicate sources:', dupeSources.length ? [...new Set(dupeSources)] : 'none');
console.log(
  'Destinations shared by more than one redirect (expected for the 4 landing-page rules, all pointing at /media/blog):',
  dupeDestinations
);

// --- Loop check: source === destination, or A->B and B->A ---
console.log('\nLOOP CHECK');
const selfLoops = allRedirects.filter((r) => r.source === r.destination);
console.log('Self-loops (source === destination):', selfLoops.length ? selfLoops : 'none');
const bySource = new Map(allRedirects.map((r) => [r.source, r.destination]));
const reversals = allRedirects.filter((r) => bySource.get(r.destination) === r.source);
console.log('Direct two-rule reversals (A->B and B->A):', reversals.length ? reversals : 'none');

// --- Destination validation: does each final slug resolve to a real BlogPost? ---
console.log('\n' + '='.repeat(100));
console.log('DESTINATION VALIDATION (against current BlogPost collection)');
console.log('='.repeat(100));
await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;
const dbSlugs = new Set((await db.collection('blogposts').find({}, { projection: { slug: 1 } }).toArray()).map((d) => d.slug));
let allResolve = true;
for (const r of postRedirects) {
  const resolves = dbSlugs.has(r.finalSlug);
  if (!resolves) { allResolve = false; console.log('  MISSING TARGET:', r.finalUrl, '(slug not found in BlogPost collection)'); }
}
console.log('All 19 destinations resolve to a real BlogPost document:', allResolve ? 'YES' : 'NO — see above');
console.log('Note: /media/blog (landing-page destination) is a static listing route, not a BlogPost document — not checked against the collection.');
await mongoose.disconnect();

console.log('\n' + '='.repeat(100));
console.log('TOTAL REDIRECT COUNT:', allRedirects.length, '(19 post + 4 landing-page)');
console.log('='.repeat(100));
