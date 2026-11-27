// QA Bug 19 Stage 5D — isolated, DB-free unit coverage for
// validateTestimonialContent()'s pure validation logic. Mirrors the style of
// sanitizeLegalBody.test.js (no setupTestEnv/Mongo at all -- this module has
// no DB dependency of its own); content.admin.controller.test.js's own
// pages/join-us block covers the HTTP-level wiring (draft/publish/restore,
// no-write-on-rejection, audit/revision side effects) for the equivalent
// per-type validation pattern, so this file focuses on the validation rules
// themselves, including ones the HTTP layer would be slow/awkward to drive
// directly (deep legacy-baseline diffing, every format/safety rule).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestimonialContent, TESTIMONIAL_MEDIA_TYPES, TESTIMONIAL_HOME_TYPE, isTestimonialContentType } from './validateTestimonialContent.js';

const MEDIA_TYPE = 'pages/media';

function mediaData({ featured = [], all = [] } = {}) {
  return { TESTIMONIALS_FEATURED: featured, TESTIMONIALS_ALL: all };
}

function homeData(items = []) {
  return { HOME_TESTIMONIALS: items };
}

// --- type scoping ---

test('isTestimonialContentType is true for pages/media, media and pages/home, false otherwise', () => {
  assert.equal(isTestimonialContentType('pages/media'), true);
  assert.equal(isTestimonialContentType('media'), true);
  assert.equal(isTestimonialContentType('pages/home'), true);
  assert.equal(isTestimonialContentType('pages/about'), false);
  assert.equal(TESTIMONIAL_MEDIA_TYPES.has('pages/media'), true);
  assert.equal(TESTIMONIAL_HOME_TYPE, 'pages/home');
});

test('an unrelated content type is never validated, even with the exact same field shape', () => {
  const err = validateTestimonialContent('pages/about', mediaData({ all: [{ type: 'video' }] }), null);
  assert.equal(err, null);
});

test('a non-object/null/array data payload is a no-op (the generic "data must be an object" check elsewhere already rejects it)', () => {
  assert.equal(validateTestimonialContent(MEDIA_TYPE, null, null), null);
  assert.equal(validateTestimonialContent(MEDIA_TYPE, 'x', null), null);
  assert.equal(validateTestimonialContent(MEDIA_TYPE, [], null), null);
});

test('TESTIMONIALS_FEATURED/TESTIMONIALS_ALL/HOME_TESTIMONIALS entirely absent is accepted (legacy compatibility)', () => {
  assert.equal(validateTestimonialContent(MEDIA_TYPE, {}, null), null);
  assert.equal(validateTestimonialContent(TESTIMONIAL_HOME_TYPE, {}, null), null);
});

test('a malformed array container (not an array) is rejected by name', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, { TESTIMONIALS_ALL: 'nope' }, null);
  assert.match(err, /^Testimonial must be an array of testimonials\.$/);
});

test('a malformed individual entry (null, string, number, array) is rejected, one-based', () => {
  for (const bad of [null, 'x', 42, []]) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [bad] }), null);
    assert.match(err, /^Testimonial 1 is malformed\.$/, `expected rejection for ${JSON.stringify(bad)}`);
  }
});

// --- valid testimonials of every type, including anonymous ---

test('accepts a valid new text testimonial with name/role/quote', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'Wonderful.', name: 'A', role: 'B' }] }), null);
  assert.equal(err, null);
});

test('accepts a valid new text testimonial with no name/role at all (anonymous)', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'Anonymous but real.' }] }), null);
  assert.equal(err, null);
});

test('accepts a valid new video testimonial (YouTube link) with no quote', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'video', url: 'https://www.youtube.com/watch?v=abc123' }] }), null);
  assert.equal(err, null);
});

test('accepts a valid new video testimonial (Cloudinary MP4 link) with an optional thumbnail and quote', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({
      all: [
        {
          type: 'video',
          url: 'https://res.cloudinary.com/endorsal-io/video/upload/videos/1711009621773-179148.mp4',
          videoThumbnail: { url: 'https://example.com/thumb.jpg', alt: '' },
          quote: 'Optional written quote.',
        },
      ],
    }),
    null
  );
  assert.equal(err, null);
});

test('accepts a valid new image testimonial, anonymous, with no quote', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ type: 'image', testimonialImage: { url: '/uploads/t1.jpg', alt: '' } }] }),
    null
  );
  assert.equal(err, null);
});

test('accepts an image testimonial referencing an absolute managed-media https URL', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ type: 'image', testimonialImage: { mediaId: 'm1', url: 'https://cdn.vyoma.org/media/t1.jpg', alt: '' } }] }),
    null
  );
  assert.equal(err, null);
});

// --- missing/blank required fields per type (Tier B) ---

test('rejects a new text testimonial with a blank/whitespace-only/absent quote', () => {
  for (const quote of ['', '   ', undefined]) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote }] }), null);
    assert.match(err, /Testimonial 1: a quote is required for a new text testimonial\./, `quote=${JSON.stringify(quote)}`);
  }
});

test('rejects a new video testimonial with no url at all', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'video', name: 'New Person' }] }), null);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('rejects a new image testimonial with no testimonialImage at all', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'image', name: 'New Person' }] }), null);
  assert.match(err, /Testimonial 1: a testimonial image is required for a new image testimonial\./);
});

// --- unsafe/invalid URLs and image references (Tier A, always enforced) ---

test('rejects an unsafe video URL (javascript:, data:, protocol-relative, credentials, malformed scheme) even if a thumbnail/quote is also present', () => {
  const unsafe = [
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    '//evil.example.com/x.mp4',
    'https://user:pass@evil.example.com/x.mp4',
    'https:evil.example.com/x.mp4',
    'https:///evil.example.com/x.mp4',
  ];
  for (const url of unsafe) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'video', url }] }), null);
    assert.match(err, /Testimonial 1: video URL must be a safe, absolute http:\/\/ or https:\/\/ link\./, `url=${url}`);
  }
});

test('rejects an unsafe testimonialImage/videoThumbnail/photo reference (bad scheme, malformed shape, missing url)', () => {
  const badRefs = ['not-an-object', { url: 'javascript:alert(1)' }, { url: '//evil.example.com/x.jpg' }, {}];
  for (const testimonialImage of badRefs) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'image', testimonialImage }] }), null);
    assert.match(err, /Testimonial 1 testimonial image must be a safe http\(s\) URL or an existing managed media reference\./, `ref=${JSON.stringify(testimonialImage)}`);
  }
});

test('a null image/videoThumbnail/testimonialImage reference is accepted (means "none selected")', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ type: 'video', url: 'https://www.youtube.com/watch?v=abc123', videoThumbnail: null }] }),
    null
  );
  assert.equal(err, null);
});

// --- type/category/rating/active format (Tier A) ---

test('rejects an invalid type value, but allows type to be entirely absent', () => {
  const invalid = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'bogus', quote: 'x' }] }), null);
  assert.match(invalid, /Testimonial 1: type must be one of text, video, image\./);

  const absent = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ quote: 'Legacy text, no type field.' }] }), null);
  assert.equal(absent, null);
});

test('TESTIMONIALS_FEATURED and HOME_TESTIMONIALS reject video/image types -- text-only by design', () => {
  const featuredErr = validateTestimonialContent(MEDIA_TYPE, mediaData({ featured: [{ type: 'video', quote: 'x' }] }), null);
  assert.match(featuredErr, /Featured testimonial 1: type "video" is not supported here\./);

  const homeErr = validateTestimonialContent(TESTIMONIAL_HOME_TYPE, homeData([{ type: 'image', quote: 'x' }]), null);
  assert.match(homeErr, /Home testimonial 1: type "image" is not supported here\./);
});

test('rejects an invalid category, accepts each valid one and an absent category', () => {
  const invalid = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', category: 'bogus' }] }), null);
  assert.match(invalid, /Testimonial 1: category must be one of learner, teacher, volunteer, other\./);

  for (const category of ['learner', 'teacher', 'volunteer', 'other']) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', category }] }), null);
    assert.equal(err, null, `category=${category}`);
  }
  assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x' }] }), null), null);
});

test('rejects a rating outside 1-5, a non-integer rating, and a string rating; accepts each valid 1-5 and an absent rating', () => {
  for (const rating of [0, 6, 3.5, '3', true]) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', rating }] }), null);
    assert.match(err, /Testimonial 1: rating must be a whole number from 1 to 5\./, `rating=${JSON.stringify(rating)}`);
  }
  for (const rating of [1, 2, 3, 4, 5]) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', rating }] }), null);
    assert.equal(err, null, `rating=${rating}`);
  }
  assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x' }] }), null), null);
});

test('rejects a non-boolean active value, accepts true/false and an absent active', () => {
  for (const active of ['true', 1, 0, 'false']) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', active }] }), null);
    assert.match(err, /Testimonial 1: active must be true or false\./, `active=${JSON.stringify(active)}`);
  }
  for (const active of [true, false]) {
    assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', active }] }), null), null);
  }
  assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x' }] }), null), null);
});

// --- stable id validation and duplicate detection ---

test('rejects a blank/whitespace-only id, accepts a real id and an absent id (legacy)', () => {
  for (const id of ['', '   ']) {
    const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', id }] }), null);
    assert.match(err, /Testimonial 1: id must be a non-blank string\./, `id=${JSON.stringify(id)}`);
  }
  assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x', id: 'real-id' }] }), null), null);
  assert.equal(validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [{ type: 'text', quote: 'x' }] }), null), null);
});

test('rejects a duplicate id within the same array, reporting the second occurrence', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({
      all: [
        { type: 'text', quote: 'a', id: 'dup-1' },
        { type: 'text', quote: 'b', id: 'dup-1' },
      ],
    }),
    null
  );
  assert.match(err, /Testimonial: duplicate id "dup-1" at entry 2\./);
});

test('multiple legacy entries with no id at all never collide with each other', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ type: 'text', quote: 'a' }, { type: 'text', quote: 'b' }, { type: 'text', quote: 'c' }] }),
    null
  );
  assert.equal(err, null);
});

test('the same id appearing in TESTIMONIALS_FEATURED and TESTIMONIALS_ALL is never treated as a cross-array duplicate', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({
      featured: [{ quote: 'a', id: 'shared-id' }],
      all: [{ type: 'text', quote: 'b', id: 'shared-id' }],
    }),
    null
  );
  assert.equal(err, null);
});

// --- legacy compatibility: unchanged baseline items are exempt from Tier B ---

const LEGACY_VIDEO_NO_URL = { type: 'video', name: 'Ravi Menon', role: 'Chennai, India' };
const LEGACY_TEXT_NO_TYPE = { quote: 'A genuine legacy quote.', name: 'Anjali Rao', role: 'Bengaluru, India' };

test('an existing, UNCHANGED legacy video testimonial with no url is accepted when diffed against a baseline that already contains it byte-for-byte', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL] }), baseline);
  assert.equal(err, null);
});

test('reordering unchanged legacy items (and editing an unrelated field on one of them) never triggers Tier B for the untouched ones', () => {
  const second = { type: 'video', name: 'Lakshmi Narayanan', role: 'Singapore' };
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL, second] });
  // reordered, and `second`'s role field is corrected -- only `second` changed
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ ...second, role: 'Singapore (corrected)' }, LEGACY_VIDEO_NO_URL] }),
    baseline
  );
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./, 'only the actually-modified entry should be rejected, by its own position');
});

test('a legacy text testimonial with no type/id/active/category/rating at all is fully valid on its own merits (Tier A has nothing to reject, Tier B is satisfied by its real quote)', () => {
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_TEXT_NO_TYPE] }), null);
  assert.equal(err, null);
});

test('a newly ADDED entry that happens to look like the legacy shape (no url, type video) is still rejected when baseline does not already contain it', () => {
  const baseline = mediaData({ all: [] });
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('a MODIFIED entry (any field changed from baseline) is validated as if new -- an edited incomplete video testimonial is rejected', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const modified = { ...LEGACY_VIDEO_NO_URL, role: 'Chennai, India (updated)' };
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [modified] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('non-destructive type switching: switching an existing valid text testimonial to video without adding a url is rejected as a modified invalid entry', () => {
  const originalText = { type: 'text', quote: 'Was valid text.', name: 'X', role: 'Y' };
  const baseline = mediaData({ all: [originalText] });
  const switched = { ...originalText, type: 'video' };
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [switched] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

// --- restoreRevision's own baseline policy: doc.data (the currently-live
// published data), same two tiers as Publish -- no "restore" special case
// in this function at all; the caller (content.admin.controller.js) simply
// passes doc.data as the baseline exactly like publishContent does. ---

test('restore-equivalent call: a historical revision item that is unchanged from the CURRENT published data is accepted even though it is incomplete', () => {
  const currentlyPublished = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL] }), currentlyPublished);
  assert.equal(err, null);
});

test('restore-equivalent call: a historical revision item that is NOT in the current published data is rejected for its real completeness gap -- restoring a revision is never automatically exempt', () => {
  const currentlyPublished = mediaData({ all: [{ type: 'text', quote: 'Only this is live now.' }] });
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL] }), currentlyPublished);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('restore-equivalent call: Tier A safety is still enforced on a historical revision regardless of baseline', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [{ type: 'video', url: 'javascript:alert(1)' }] }),
    mediaData({ all: [] })
  );
  assert.match(err, /Testimonial 1: video URL must be a safe, absolute http:\/\/ or https:\/\/ link\./);
});

// --- one-to-one legacy-baseline matching (Section 3 correction) -----------

test('a baseline entry can exempt at most one candidate: two identical copies of one incomplete legacy entry are not both grandfathered', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }), baseline);
  assert.match(err, /Testimonial 2: a valid video URL is required for a new video testimonial\./, 'the first copy consumes the only baseline slot; the duplicate must stand on its own');
});

test('a baseline that genuinely contains the same incomplete entry TWICE exempts up to two matching candidates, but not a third', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] });
  const twoOk = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }), baseline);
  assert.equal(twoOk, null, 'two legitimately pre-existing duplicate baseline records must both still be manageable');

  const thirdRejected = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }),
    baseline
  );
  assert.match(thirdRejected, /Testimonial 3: a valid video URL is required for a new video testimonial\./);
});

test('removing an id from an otherwise-unchanged legacy entry does not preserve the exemption -- the resulting shape no longer matches the baseline entry (which still has the id)', () => {
  const legacyWithId = { ...LEGACY_VIDEO_NO_URL, id: 'legacy-1' };
  const baseline = mediaData({ all: [legacyWithId] });
  const { id, ...withoutId } = legacyWithId;
  const err = validateTestimonialContent(MEDIA_TYPE, mediaData({ all: [withoutId] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

// --- HOME_TESTIMONIALS scoping ---

test('HOME_TESTIMONIALS applies the same rules, independently of TESTIMONIALS_ALL/FEATURED', () => {
  const err = validateTestimonialContent(TESTIMONIAL_HOME_TYPE, homeData([{ quote: '' }]), null);
  assert.match(err, /Home testimonial 1: a quote is required for a new text testimonial\./);

  const ok = validateTestimonialContent(TESTIMONIAL_HOME_TYPE, homeData([{ quote: 'Real impact story.', name: 'Z' }]), null);
  assert.equal(ok, null);
});

// --- first-error-wins reporting across multiple entries ---

test('with multiple invalid entries, the FIRST invalid one is reported, by its own one-based position', () => {
  const err = validateTestimonialContent(
    MEDIA_TYPE,
    mediaData({
      all: [
        { type: 'text', quote: 'Valid.' },
        { type: 'video' },
        { type: 'image' },
      ],
    }),
    null
  );
  assert.match(err, /Testimonial 2: a valid video URL is required for a new video testimonial\./);
});
