// Read-only verification only. No writes, no seed, no publish/restore.
import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';
const FIELDS = [
  'TESTIMONIALS_FEATURED', 'TESTIMONIALS_ALL', 'EVENT_CATEGORIES', 'UPCOMING_EVENTS',
  'PAST_EVENTS', 'GALLERY_ALBUMS', 'NEWSLETTER_LATEST', 'NEWSLETTER_ARCHIVE', 'NEWSLETTER_SPECIAL',
];

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;

const pagesMedia = await db.collection('contents').findOne({ type: 'pages/media' });
const media = await db.collection('contents').findOne({ type: 'media' });

console.log('='.repeat(90));
console.log('DOCUMENT-LEVEL STATUS');
console.log('='.repeat(90));
console.log('pages/media: status =', pagesMedia.status, '| has draftData =', pagesMedia.draftData != null, '| updatedAt =', pagesMedia.updatedAt);
console.log('media:       status =', media.status, '| has draftData =', media.draftData != null, '| updatedAt =', media.updatedAt);

console.log('\n' + '='.repeat(90));
console.log('A. PUBLISHED DATA (`data`) — pages/media vs media, field by field');
console.log('='.repeat(90));
for (const f of FIELDS) {
  const a = pagesMedia.data?.[f];
  const b = media.data?.[f];
  console.log(f.padEnd(22), '->', deepEqual(a, b) ? 'IDENTICAL' : 'DIFFERENT');
}
console.log('\nFull-object published data identical (all fields, not just the 9 above):', deepEqual(pagesMedia.data, media.data));

console.log('\n' + '='.repeat(90));
console.log('B. DRAFT DATA (`draftData`) — pages/media vs media, field by field');
console.log('='.repeat(90));
if (pagesMedia.draftData == null && media.draftData == null) {
  console.log('Neither document has draftData set (both null) — no draft is pending on either.');
} else {
  console.log('pages/media draftData present:', pagesMedia.draftData != null);
  console.log('media draftData present:', media.draftData != null);
  for (const f of FIELDS) {
    const a = pagesMedia.draftData?.[f];
    const b = media.draftData?.[f];
    console.log(f.padEnd(22), '-> pages/media has:', a !== undefined, '| media has:', b !== undefined, '| identical:', deepEqual(a, b));
  }
  console.log('\nFull-object draftData identical:', deepEqual(pagesMedia.draftData, media.draftData));
}

console.log('\n' + '='.repeat(90));
console.log('C. Effect of the Testimonials "Save Draft" click — detail');
console.log('='.repeat(90));
console.log('pages/media.draftData.TESTIMONIALS_FEATURED === pages/media.data.TESTIMONIALS_FEATURED (i.e. no real change was saved):',
  deepEqual(pagesMedia.draftData?.TESTIMONIALS_FEATURED, pagesMedia.data?.TESTIMONIALS_FEATURED));
console.log('pages/media.draftData.TESTIMONIALS_ALL === pages/media.data.TESTIMONIALS_ALL:',
  deepEqual(pagesMedia.draftData?.TESTIMONIALS_ALL, pagesMedia.data?.TESTIMONIALS_ALL));
console.log('media.draftData.TESTIMONIALS_FEATURED === media.data.TESTIMONIALS_FEATURED:',
  deepEqual(media.draftData?.TESTIMONIALS_FEATURED, media.data?.TESTIMONIALS_FEATURED));
console.log('media.draftData.TESTIMONIALS_ALL === media.data.TESTIMONIALS_ALL:',
  deepEqual(media.draftData?.TESTIMONIALS_ALL, media.data?.TESTIMONIALS_ALL));

console.log('\nAre the two documents\' draftData.TESTIMONIALS_FEATURED identical to EACH OTHER (pages/media vs media)?',
  deepEqual(pagesMedia.draftData?.TESTIMONIALS_FEATURED, media.draftData?.TESTIMONIALS_FEATURED));
console.log('Are the two documents\' draftData.TESTIMONIALS_ALL identical to EACH OTHER?',
  deepEqual(pagesMedia.draftData?.TESTIMONIALS_ALL, media.draftData?.TESTIMONIALS_ALL));

console.log('\n' + '='.repeat(90));
console.log('D. Did any unrelated (non-9-field) media data change?');
console.log('='.repeat(90));
const ALL_MEDIA_KEYS = new Set([...Object.keys(pagesMedia.data || {}), ...Object.keys(media.data || {})]);
const unrelatedKeys = [...ALL_MEDIA_KEYS].filter((k) => !FIELDS.includes(k));
console.log('Unrelated top-level keys present:', unrelatedKeys);
for (const k of unrelatedKeys) {
  console.log(' ', k, '-> pages/media.data vs media.data identical:', deepEqual(pagesMedia.data?.[k], media.data?.[k]));
}
if (pagesMedia.draftData) {
  console.log('\nUnrelated keys present in pages/media.draftData (should exist if draftData is a full copy, per the app\'s own PUT semantics):');
  for (const k of unrelatedKeys) {
    const inDraft = pagesMedia.draftData[k] !== undefined;
    const sameAsPublished = deepEqual(pagesMedia.draftData[k], pagesMedia.data?.[k]);
    console.log(' ', k, '-> present in draft:', inDraft, '| unchanged vs published:', sameAsPublished);
  }
}

console.log('\n' + '='.repeat(90));
console.log('Revision history (read-only) for both types');
console.log('='.repeat(90));
const revPagesMedia = await db.collection('contentrevisions').find({ contentType: 'pages/media' }).sort({ version: -1 }).toArray();
const revMedia = await db.collection('contentrevisions').find({ contentType: 'media' }).sort({ version: -1 }).toArray();
console.log('pages/media revisions:', revPagesMedia.length);
revPagesMedia.forEach((r) => console.log('  v' + r.version, '|', r.action, '|', r.createdAt, '|', r.publishedByEmail));
console.log('media revisions:', revMedia.length);
revMedia.forEach((r) => console.log('  v' + r.version, '|', r.action, '|', r.createdAt, '|', r.publishedByEmail));

// also check AuditLog for any recorded action on these types, read-only
const auditHits = await db.collection('auditlogs').find({ targetType: 'Content', targetId: { $in: ['pages/media', 'media'] } }).sort({ createdAt: -1 }).limit(10).toArray();
console.log('\nAuditLog entries mentioning these types (most recent 10):', auditHits.length);
auditHits.forEach((a) => console.log('  ', a.action, '| targetId:', a.targetId, '|', a.createdAt, '|', JSON.stringify(a.details)));

await mongoose.disconnect();

console.log('\n' + '='.repeat(90));
console.log('E/F: See script output above for defect analysis — no writes were made by this script.');
console.log('='.repeat(90));
