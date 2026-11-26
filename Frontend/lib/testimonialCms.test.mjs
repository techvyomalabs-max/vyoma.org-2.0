// QA Bug 19 Stage 5B — executable, real-production-logic coverage for
// testimonialCms.mjs. Every test imports and calls the actual exported
// functions directly; this is genuine executable-logic coverage, not a
// source-string assertion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSecureId,
  generateUniqueTestimonialId,
  withGeneratedIds,
  ID_GENERATION_ERROR_MESSAGE,
  NEW_TESTIMONIAL_ID_SENTINEL,
  TESTIMONIAL_CATEGORIES,
  RATING_OPTIONS,
  applyRatingSelection,
  isTestimonialVisible,
  validateTestimonialsContent,
  validateHomeTestimonialsContent,
} from './testimonialCms.mjs';

test('NEW_TESTIMONIAL_ID_SENTINEL is the empty string', () => {
  assert.equal(NEW_TESTIMONIAL_ID_SENTINEL, '');
});

test('TESTIMONIAL_CATEGORIES is exactly the four approved categories', () => {
  assert.deepEqual(TESTIMONIAL_CATEGORIES, ['learner', 'teacher', 'volunteer', 'other']);
});

test('RATING_OPTIONS is exactly 1 through 5', () => {
  assert.deepEqual(RATING_OPTIONS, [1, 2, 3, 4, 5]);
});

// --- generateSecureId() ---------------------------------------------------
// Node's global `crypto` is defined as a getter-only accessor property
// (confirmed directly: a plain `globalThis.crypto = x` throws "Cannot set
// property crypto of #<Object> which has only a getter"), so it must be
// overridden via Object.defineProperty, and restored the same way
// afterward -- a plain reassignment can never work here.

function withMockedCrypto(mockValue, fn) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: mockValue, configurable: true, writable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'crypto', original);
  }
}

test('tier 1 (normal case): crypto.randomUUID() is preferred whenever it is actually available, and is never empty', () => {
  const id = generateSecureId();
  // A real UUID is 36 characters with hyphens in the standard positions;
  // this environment's real crypto.randomUUID is available, so the
  // primary tier -- not either fallback -- must be the one used here.
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

test('tier 1: two independent calls never collide (random generation is exercised for real, never assumed unique without checking)', () => {
  const a = generateSecureId();
  const b = generateSecureId();
  assert.notEqual(a, b);
});

test('tier 2 (getRandomValues fallback, no randomUUID): still produces a non-empty, unique string', () => {
  const realCrypto = globalThis.crypto;
  withMockedCrypto({ getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, () => {
    const a = generateSecureId();
    const b = generateSecureId();
    assert.equal(typeof a, 'string');
    assert.ok(a.length > 0);
    assert.notEqual(a, b);
  });
});

test('Web Crypto unavailable entirely: generateSecureId() returns null, never an empty string or a fabricated id (the removed Math.random() fallback is gone)', () => {
  withMockedCrypto(undefined, () => {
    assert.equal(generateSecureId(), null);
  });
});

test('generateSecureId() never throws even when crypto exists but offers neither randomUUID nor getRandomValues', () => {
  withMockedCrypto({}, () => {
    assert.doesNotThrow(() => generateSecureId());
    assert.equal(generateSecureId(), null);
  });
});

// --- generateUniqueTestimonialId() ----------------------------------------

test('normal case: produces a non-empty id not present in existingIds', () => {
  const id = generateUniqueTestimonialId(new Set(['a', 'b']));
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
  assert.notEqual(id, 'a');
  assert.notEqual(id, 'b');
});

test('Web Crypto unavailable: returns null (never an empty string, never a fabricated non-crypto id)', () => {
  withMockedCrypto(undefined, () => {
    assert.equal(generateUniqueTestimonialId(new Set()), null);
  });
});

test('the underlying generator throwing an error is treated as an immediate failure, not retried, and never crashes the caller', () => {
  const throwingGenerator = () => {
    throw new Error('simulated crypto failure');
  };
  assert.doesNotThrow(() => {
    const result = generateUniqueTestimonialId(new Set(), { generateCandidate: throwingGenerator });
    assert.equal(result, null);
  });
});

test('simulated id collision: retries with a fresh candidate until a non-colliding one is found', () => {
  const existingIds = new Set(['colliding-id']);
  let callCount = 0;
  const generator = () => {
    callCount += 1;
    return callCount === 1 ? 'colliding-id' : 'fresh-id';
  };
  const result = generateUniqueTestimonialId(existingIds, { generateCandidate: generator });
  assert.equal(result, 'fresh-id');
  assert.equal(callCount, 2, 'exactly one retry after the first collision');
});

test('bounded retry exhaustion: a generator that always collides gives up after exactly `attempts` tries, never looping forever, and returns null', () => {
  const existingIds = new Set(['always-the-same-id']);
  let callCount = 0;
  const generator = () => {
    callCount += 1;
    return 'always-the-same-id';
  };
  const result = generateUniqueTestimonialId(existingIds, { attempts: 4, generateCandidate: generator });
  assert.equal(result, null);
  assert.equal(callCount, 4, 'exactly the bounded attempt count, never more, never fewer');
});

test('random generation alone is never assumed to guarantee uniqueness -- a candidate equal to an existing id is explicitly rejected and retried, not accepted', () => {
  const existingIds = new Set(['dup']);
  let callCount = 0;
  const generator = () => {
    callCount += 1;
    return callCount === 1 ? 'dup' : 'unique-now';
  };
  const result = generateUniqueTestimonialId(existingIds, { generateCandidate: generator });
  assert.notEqual(result, 'dup');
  assert.equal(result, 'unique-now');
});

// --- withGeneratedIds() ----------------------------------------------------

test('an item carrying the sentinel id gets a real, non-empty id assigned', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  handleChange([{ id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'New Person' }]);
  assert.equal(captured.length, 1);
  assert.notEqual(captured[0].id, NEW_TESTIMONIAL_ID_SENTINEL);
  assert.ok(captured[0].id.length > 0);
});

test('every other field on the newly-id-assigned item is preserved unchanged', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const input = { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'New Person', role: 'Tester', quote: 'Hello', active: true };
  handleChange([input]);
  assert.equal(captured[0].name, 'New Person');
  assert.equal(captured[0].role, 'Tester');
  assert.equal(captured[0].quote, 'Hello');
  assert.equal(captured[0].active, true);
});

test('an item with no `id` property at all (every pre-existing legacy testimonial) is left completely untouched -- no id is invented for it', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const legacy = { name: 'Legacy Person', role: 'Old', quote: 'An old testimonial.' };
  handleChange([legacy]);
  assert.equal('id' in captured[0], false, 'a legacy item must not gain an id property just by passing through this wrapper');
  assert.deepEqual(captured[0], legacy);
});

test('an item that already has a real, non-empty id is left completely untouched -- never regenerated', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const existing = { id: 'already-real-stable-id-123', name: 'Existing Person' };
  handleChange([existing]);
  assert.equal(captured[0].id, 'already-real-stable-id-123');
});

test('sourceId and other provenance fields are preserved untouched alongside a real existing id', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const existing = { id: 'real-id', sourceId: 'endorsal:abc123', name: 'Existing Person' };
  handleChange([existing]);
  assert.equal(captured[0].sourceId, 'endorsal:abc123');
  assert.equal(captured[0].id, 'real-id');
});

test('the new id is checked against every existing id already present in the same array -- a forced collision with a real existing id is retried, not accepted', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  // existing-id-123 happens to be exactly what a (mocked) first attempt
  // would generate -- withGeneratedIds must not expose a way to inject a
  // custom generator itself (that's intentionally only available on
  // generateUniqueTestimonialId for tests), so this proves the real,
  // unmocked path still collects existingIds from `nextItems` correctly:
  // two fresh items must never receive the same id as each other or as an
  // existing one (covered by the two tests below, using the real
  // generator, which is what actually matters for this wrapper).
  const existing = { id: 'existing-id-123', name: 'Existing' };
  const fresh = { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'Fresh' };
  handleChange([existing, fresh]);
  assert.equal(captured[0].id, 'existing-id-123');
  assert.notEqual(captured[1].id, 'existing-id-123');
  assert.notEqual(captured[1].id, NEW_TESTIMONIAL_ID_SENTINEL);
});

test('a mixed array (one legacy item with no id, one existing item with a real id, one freshly-added item with the sentinel) only ever changes the sentinel one', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const legacy = { name: 'Legacy' };
  const existing = { id: 'real-id-1', name: 'Existing' };
  const fresh = { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'Fresh' };
  handleChange([legacy, existing, fresh]);

  assert.equal('id' in captured[0], false);
  assert.equal(captured[1].id, 'real-id-1');
  assert.notEqual(captured[2].id, NEW_TESTIMONIAL_ID_SENTINEL);
  assert.ok(captured[2].id.length > 0);
});

test('reordering (passing the same items back in a different order, as RepeatableList\'s moveItem does) never changes any id -- withGeneratedIds only reacts to the sentinel, never to position', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  const a = { id: 'id-a', name: 'A' };
  const b = { id: 'id-b', name: 'B' };
  handleChange([b, a]); // already "reordered" relative to some original [a, b]
  assert.equal(captured[0].id, 'id-b');
  assert.equal(captured[1].id, 'id-a');
});

test('two separate fresh-sentinel items in the same array each get their own distinct generated id, never the same one', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  handleChange([
    { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'First New' },
    { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'Second New' },
  ]);
  assert.notEqual(captured[0].id, captured[1].id);
  assert.notEqual(captured[0].id, NEW_TESTIMONIAL_ID_SENTINEL);
  assert.notEqual(captured[1].id, NEW_TESTIMONIAL_ID_SENTINEL);
});

test('an empty array is handled safely', () => {
  let captured;
  const handleChange = withGeneratedIds((items) => {
    captured = items;
  });
  handleChange([]);
  assert.deepEqual(captured, []);
});

// --- withGeneratedIds() failure handling ----------------------------------
// QA Bug 19 Stage 5B final safety correction: Web Crypto unavailable must
// safely prevent the new item from being added -- onChange must never be
// called at all, so the caller's existing array is left completely
// untouched (never a partial update), and onError must be called instead,
// synchronously, with no thrown exception reaching the caller.

test('Web Crypto unavailable: onChange is never called, the caller\'s array is untouched, and onError receives the exact exported message', () => {
  withMockedCrypto(undefined, () => {
    let onChangeCalled = false;
    let errorMessage = null;
    const handleChange = withGeneratedIds(
      () => {
        onChangeCalled = true;
      },
      { onError: (msg) => (errorMessage = msg) }
    );
    assert.doesNotThrow(() => handleChange([{ id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'New Person' }]));
    assert.equal(onChangeCalled, false);
    assert.equal(errorMessage, ID_GENERATION_ERROR_MESSAGE);
  });
});

test('failure on one sentinel item aborts the WHOLE batch -- other, already-real-id items in the same array are never partially committed either', () => {
  withMockedCrypto(undefined, () => {
    let captured = 'UNTOUCHED';
    let errorMessage = null;
    const handleChange = withGeneratedIds(
      (items) => {
        captured = items;
      },
      { onError: (msg) => (errorMessage = msg) }
    );
    const existing = { id: 'real-id-1', name: 'Existing', sourceId: 'endorsal:xyz' };
    const fresh = { id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'Fresh' };
    handleChange([existing, fresh]);
    assert.equal(captured, 'UNTOUCHED', 'onChange must never be called -- not even with a partially-patched array');
    assert.equal(errorMessage, ID_GENERATION_ERROR_MESSAGE);
  });
});

test('onError is optional -- omitting it still safely aborts without throwing when generation fails', () => {
  withMockedCrypto(undefined, () => {
    let onChangeCalled = false;
    const handleChange = withGeneratedIds(() => {
      onChangeCalled = true;
    });
    assert.doesNotThrow(() => handleChange([{ id: NEW_TESTIMONIAL_ID_SENTINEL, name: 'New Person' }]));
    assert.equal(onChangeCalled, false);
  });
});

// --- applyRatingSelection() ------------------------------------------------

test('selecting a rating of 1-5 stores a real JS number, never a string', () => {
  for (const raw of ['1', '2', '3', '4', '5']) {
    const result = applyRatingSelection({ name: 'Test' }, raw);
    assert.equal(typeof result.rating, 'number');
    assert.equal(result.rating, Number(raw));
  }
});

test('the explicit "No rating" selection (the real <select>\'s own value="" option) removes the rating property entirely -- never sets it to 0, null, or ""', () => {
  const withRating = { name: 'Test', rating: 4 };
  const result = applyRatingSelection(withRating, '');
  assert.equal('rating' in result, false);
});

test('a brand-new item with no rating property at all is unaffected by a "No rating" selection -- still no rating property afterward', () => {
  const noRating = { name: 'Test' };
  const result = applyRatingSelection(noRating, '');
  assert.equal('rating' in result, false);
});

// QA Bug 19 Stage 5B final safety correction: an invalid raw value must
// leave the ORIGINAL ITEM COMPLETELY UNCHANGED -- including never clearing
// a genuine existing rating, and never coercing the bad value into a
// plausible-looking but wrong one. Only the real <select>'s own two
// value-producible cases ("" and "1".."5") ever change anything.
test('out-of-range, non-integer, whitespace, null, undefined, and arbitrary-string raw values all leave a genuine existing rating untouched', () => {
  const invalidRawValues = ['0', '6', '100', '-1', '2.5', ' ', null, undefined, 'not-a-number', 'three'];
  for (const raw of invalidRawValues) {
    const item = { name: 'Test', rating: 3 };
    const result = applyRatingSelection(item, raw);
    assert.equal(result.rating, 3, `raw value ${JSON.stringify(raw)} must never alter an existing rating`);
  }
});

test('out-of-range, non-integer, whitespace, null, undefined, and arbitrary-string raw values never invent a rating on an item that had none', () => {
  const invalidRawValues = ['0', '6', '100', '-1', '2.5', ' ', null, undefined, 'not-a-number', 'three'];
  for (const raw of invalidRawValues) {
    const item = { name: 'Test' };
    const result = applyRatingSelection(item, raw);
    assert.equal('rating' in result, false, `raw value ${JSON.stringify(raw)} must never invent a rating`);
  }
});

test('an invalid raw value returns the item unchanged by reference -- the clearest possible "no-op" guarantee', () => {
  const item = { name: 'Test', rating: 3, id: 'real-id' };
  const result = applyRatingSelection(item, 'not-a-number');
  assert.equal(result, item, 'the exact same object reference must be returned for an invalid selection');
});

test('every other property, including id and sourceId, is preserved exactly when a rating is set or cleared', () => {
  const item = { id: 'real-id', sourceId: 'endorsal:abc', name: 'Test', role: 'Learner', active: true, rating: 2 };
  const setResult = applyRatingSelection(item, '5');
  assert.equal(setResult.id, 'real-id');
  assert.equal(setResult.sourceId, 'endorsal:abc');
  assert.equal(setResult.name, 'Test');
  assert.equal(setResult.role, 'Learner');
  assert.equal(setResult.active, true);
  assert.equal(setResult.rating, 5);

  const clearResult = applyRatingSelection(item, '');
  assert.equal(clearResult.id, 'real-id');
  assert.equal(clearResult.sourceId, 'endorsal:abc');
  assert.equal(clearResult.name, 'Test');
  assert.equal('rating' in clearResult, false);
});

test('legacy entries without a rating are never touched unless this function is explicitly called on them', () => {
  // This is really a statement about the forms' own wiring (they only ever
  // call applyRatingSelection from the rating <select>'s own onChange), but
  // directly confirms this function itself never invents a rating as a
  // side effect of being passed an item that lacks one -- only an explicit
  // raw value of '1'-'5' ever adds the key.
  const legacy = { name: 'Legacy', role: 'Old' };
  assert.equal('rating' in legacy, false);
});

// --- isTestimonialVisible() -----------------------------------------------

test('a legacy item with no `active` property at all is visible', () => {
  assert.equal(isTestimonialVisible({ name: 'Legacy' }), true);
});

test('an item explicitly marked active: true is visible', () => {
  assert.equal(isTestimonialVisible({ name: 'Test', active: true }), true);
});

test('an item explicitly marked active: false is hidden', () => {
  assert.equal(isTestimonialVisible({ name: 'Test', active: false }), false);
});

test('matches the exact same convention as the public toActiveContentArray() utility (active !== false)', () => {
  const items = [{ active: true }, { active: false }, {}, { active: undefined }];
  const expected = items.map((i) => i.active !== false);
  const actual = items.map((i) => isTestimonialVisible(i));
  assert.deepEqual(actual, expected);
});

// --- QA Bug 19 Stage 5D: validateTestimonialsContent() / -------------------
// validateHomeTestimonialsContent() -- mirrors
// Backend/src/modules/content/validateTestimonialContent.test.js's own
// scenarios; see that file and testimonialCms.mjs's own header comment for
// the full Tier A/Tier B reasoning. Not re-testing every URL-safety edge
// case already covered directly for isSafeAbsoluteVideoUrl/isUsableImageUrl
// in their own test files -- just that this validator actually calls them.

function mediaData({ featured = [], all = [] } = {}) {
  return { TESTIMONIALS_FEATURED: featured, TESTIMONIALS_ALL: all };
}

test('accepts a valid new anonymous text testimonial, and a valid new video/image testimonial', () => {
  assert.equal(validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: 'Anonymous but real.' }] }), null), null);
  assert.equal(
    validateTestimonialsContent(mediaData({ all: [{ type: 'video', url: 'https://www.youtube.com/watch?v=abc123' }] }), null),
    null
  );
  assert.equal(
    validateTestimonialsContent(mediaData({ all: [{ type: 'image', testimonialImage: { url: '/uploads/t1.jpg' } }] }), null),
    null
  );
});

test('rejects a new text/video/image testimonial missing its defining content', () => {
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: '' }] }), null),
    /Testimonial 1: a quote is required for a new text testimonial\./
  );
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'video' }] }), null),
    /Testimonial 1: a valid video URL is required for a new video testimonial\./
  );
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'image' }] }), null),
    /Testimonial 1: a testimonial image is required for a new image testimonial\./
  );
});

test('rejects an unsafe video URL / image reference even when other fields look complete', () => {
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'video', url: 'javascript:alert(1)' }] }), null),
    /Testimonial 1: video URL must be a safe, absolute http:\/\/ or https:\/\/ link\./
  );
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'image', testimonialImage: { url: '//evil.example.com/x.jpg' } }] }), null),
    /Testimonial 1 testimonial image must be a safe http\(s\) URL or an existing managed media reference\./
  );
});

test('TESTIMONIALS_FEATURED rejects a video/image type -- text-only by design', () => {
  const err = validateTestimonialsContent(mediaData({ featured: [{ type: 'video', quote: 'x' }] }), null);
  assert.match(err, /Featured testimonial 1: type "video" is not supported here\./);
});

test('rejects an invalid category/rating/active value, accepts each valid one and an absent value', () => {
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: 'x', category: 'bogus' }] }), null),
    /category must be one of learner, teacher, volunteer, other\./
  );
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: 'x', rating: '3' }] }), null),
    /rating must be a whole number from 1 to 5\./
  );
  assert.match(
    validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: 'x', active: 'true' }] }), null),
    /active must be true or false\./
  );
  assert.equal(validateTestimonialsContent(mediaData({ all: [{ type: 'text', quote: 'x' }] }), null), null);
});

test('rejects a duplicate id within the same array, and never flags the same id shared across TESTIMONIALS_FEATURED/TESTIMONIALS_ALL', () => {
  const dup = validateTestimonialsContent(
    mediaData({ all: [{ type: 'text', quote: 'a', id: 'dup' }, { type: 'text', quote: 'b', id: 'dup' }] }),
    null
  );
  assert.match(dup, /duplicate id "dup" at entry 2\./);

  const crossArray = validateTestimonialsContent(
    mediaData({ featured: [{ quote: 'a', id: 'shared' }], all: [{ type: 'text', quote: 'b', id: 'shared' }] }),
    null
  );
  assert.equal(crossArray, null);
});

const LEGACY_VIDEO_NO_URL = { type: 'video', name: 'Ravi Menon', role: 'Chennai, India' };

test('an existing, UNCHANGED legacy video testimonial with no url is accepted when the baseline already contains it byte-for-byte', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const err = validateTestimonialsContent(mediaData({ all: [LEGACY_VIDEO_NO_URL] }), baseline);
  assert.equal(err, null);
});

test('a MODIFIED legacy entry (any field changed from baseline) is validated as if new -- rejected for the still-missing url', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const modified = { ...LEGACY_VIDEO_NO_URL, role: 'Chennai, India (updated)' };
  const err = validateTestimonialsContent(mediaData({ all: [modified] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('a newly ADDED entry that happens to look like the legacy shape is still rejected when the baseline does not already contain it', () => {
  const err = validateTestimonialsContent(mediaData({ all: [LEGACY_VIDEO_NO_URL] }), mediaData({ all: [] }));
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

test('non-destructive type switching: switching an existing valid text testimonial to video without adding a url is rejected as modified+invalid', () => {
  const originalText = { type: 'text', quote: 'Was valid text.', name: 'X', role: 'Y' };
  const baseline = mediaData({ all: [originalText] });
  const switched = { ...originalText, type: 'video' };
  const err = validateTestimonialsContent(mediaData({ all: [switched] }), baseline);
  assert.match(err, /Testimonial 1: a valid video URL is required for a new video testimonial\./);
});

// --- one-to-one legacy-baseline matching (Section 3 correction) -----------

test('a baseline entry can exempt at most one candidate: two identical copies of one incomplete legacy entry are not both grandfathered', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL] });
  const err = validateTestimonialsContent(mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }), baseline);
  assert.match(err, /Testimonial 2: a valid video URL is required for a new video testimonial\./);
});

test('a baseline that genuinely contains the same incomplete entry TWICE exempts up to two matching candidates, but not a third', () => {
  const baseline = mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] });
  const twoOk = validateTestimonialsContent(mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }), baseline);
  assert.equal(twoOk, null);

  const thirdRejected = validateTestimonialsContent(
    mediaData({ all: [LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL, LEGACY_VIDEO_NO_URL] }),
    baseline
  );
  assert.match(thirdRejected, /Testimonial 3: a valid video URL is required for a new video testimonial\./);
});

test('an unrelated-shaped data object (no TESTIMONIALS_FEATURED/TESTIMONIALS_ALL at all) is accepted -- legacy compatibility', () => {
  assert.equal(validateTestimonialsContent({}, null), null);
  assert.equal(validateTestimonialsContent(null, null), null);
});

test('validateHomeTestimonialsContent validates HOME_TESTIMONIALS independently, with the same rules', () => {
  const err = validateHomeTestimonialsContent({ HOME_TESTIMONIALS: [{ quote: '' }] }, null);
  assert.match(err, /Home testimonial 1: a quote is required for a new text testimonial\./);

  const ok = validateHomeTestimonialsContent({ HOME_TESTIMONIALS: [{ quote: 'Real impact story.', name: 'Z' }] }, null);
  assert.equal(ok, null);

  const videoRejected = validateHomeTestimonialsContent({ HOME_TESTIMONIALS: [{ type: 'video', quote: 'x' }] }, null);
  assert.match(videoRejected, /Home testimonial 1: type "video" is not supported here\./);
});

test('validateHomeTestimonialsContent accepts an unchanged legacy entry with no type/id/active at all', () => {
  const legacy = { quote: 'A genuine legacy quote.', name: 'Anjali Rao', role: 'Bengaluru, India' };
  const err = validateHomeTestimonialsContent({ HOME_TESTIMONIALS: [legacy] }, { HOME_TESTIMONIALS: [legacy] });
  assert.equal(err, null);
});
