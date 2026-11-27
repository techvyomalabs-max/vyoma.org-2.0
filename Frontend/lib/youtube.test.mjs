// Regression coverage for extractYouTubeId() — shared by Gallery videos
// (components/sections/media/GalleryLightbox.jsx) and testimonial videos
// (components/sections/media/TestimonialCard.jsx), extracted into this
// module during the testimonial-video playback bug fix so the two never
// drift. Pure function, no network, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractYouTubeId } from './youtube.js';

test('extracts the video id from a youtu.be short URL', () => {
  assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extracts the video id from a youtube.com/watch?v= URL', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('extracts the video id from a youtube.com/watch?v= URL with extra query params', () => {
  assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL123'), 'dQw4w9WgXcQ');
});

test('returns null for a non-YouTube URL (a different, still-valid video provider)', () => {
  assert.equal(extractYouTubeId('https://vimeo.com/123456789'), null);
  assert.equal(extractYouTubeId('https://example.com/videos/testimonial.mp4'), null);
});

test('returns null for a missing/empty/non-string value, never throws', () => {
  assert.equal(extractYouTubeId(undefined), null);
  assert.equal(extractYouTubeId(null), null);
  assert.equal(extractYouTubeId(''), null);
});

test('returns null for a malformed/garbage string', () => {
  assert.equal(extractYouTubeId('not a url at all'), null);
  assert.equal(extractYouTubeId('https://youtube.com/watch?v=tooshort'), null);
});
