import { getPublicContent } from './contentService';

// Media module sub-collections (LLD: press, events, testimonials, newsletter,
// gallery, resources contentItems). All mock data currently lives in one
// module, mirroring how the source design system bundled them in Media.jsx.
const loadMedia = () => getPublicContent('media', () => import('@/lib/mockData/media'));

export const getPressCoverage = async () => {
  const m = await loadMedia();
  // PRESS_CLIPPING_SECTIONS replaces the old flat PRESS_FEATURED/PRESS_CLIPPINGS
  // placeholder arrays — defensively defaulted so a not-yet-migrated Content
  // document (or the mock dataset before this key existed) renders an empty
  // state rather than crashing.
  return { publications: m.PRESS_PUBLICATIONS, clippingSections: m.PRESS_CLIPPING_SECTIONS || [], radio: m.PRESS_RADIO };
};
export const getEvents = async () => {
  const m = await loadMedia();
  return { upcoming: m.UPCOMING_EVENTS, past: m.PAST_EVENTS };
};
export const getTestimonials = async () => {
  const m = await loadMedia();
  return { featured: m.TESTIMONIALS_FEATURED, all: m.TESTIMONIALS_ALL };
};
export const getNewsletterIssues = async () => {
  const m = await loadMedia();
  return { latest: m.NEWSLETTER_LATEST, archive: m.NEWSLETTER_ARCHIVE, special: m.NEWSLETTER_SPECIAL };
};
export const getGalleryAlbums = async () => {
  const m = await loadMedia();
  return m.GALLERY_ALBUMS;
};
// GALLERY_VIDEOS is a new, separate key (added alongside the Gallery photo
// migration) — defensively defaulted to [] so neither a not-yet-migrated
// Content document nor the mock dataset (neither has this key yet) breaks.
export const getGalleryVideos = async () => {
  const m = await loadMedia();
  return m.GALLERY_VIDEOS || [];
};
export const getResources = async () => {
  const m = await loadMedia();
  return { categories: m.RESOURCE_CATEGORIES, rows: m.RESOURCE_ROWS };
};
// WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS are Batch B keys. Per
// Backend/scripts/wordpress/import/what-sanskrit-migration.mjs and the
// pre-write backup it recorded locally, this content has previously been
// migrated — the mock dataset (seedData/media.js, mockData/media.js) is
// never expected to carry it, by this project's design. The current
// real-database state has not been independently re-verified here, so the
// defaults below remain as a defensive fallback for a not-yet-migrated or
// not-yet-reachable Content document, not as a sign that migration is
// still pending.
export const getWhatSanskrit = async () => {
  const m = await loadMedia();
  return { categories: m.WHAT_SANSKRIT_CATEGORIES || [], rows: m.WHAT_SANSKRIT_ROWS || {} };
};
// WHERE_IKS_SERIES/WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS are Batch C keys. Per
// Backend/scripts/wordpress/import/where-iks-{a,b,c}-series-migration.mjs
// and the pre-write backups they recorded locally, all three series
// (A, B, and C — the full 29-category taxonomy) have previously been
// migrated — the mock dataset is never expected to carry it, by this
// project's design. The current real-database state has not been
// independently re-verified here, so the defaults below remain as a
// defensive fallback for a not-yet-migrated or not-yet-reachable Content
// document, not as a sign that migration is still pending or partial.
export const getWhereIks = async () => {
  const m = await loadMedia();
  return { series: m.WHERE_IKS_SERIES || [], categories: m.WHERE_IKS_CATEGORIES || [], rows: m.WHERE_IKS_ROWS || {} };
};
