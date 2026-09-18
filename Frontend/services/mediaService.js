import { getPublicContent } from './contentService';

// Media module sub-collections (LLD: press, events, testimonials, newsletter,
// gallery, resources contentItems). All mock data currently lives in one
// module, mirroring how the source design system bundled them in Media.jsx.
const loadMedia = () => getPublicContent('media', () => import('@/lib/mockData/media'));

export const getPressCoverage = async () => {
  const m = await loadMedia();
  return { publications: m.PRESS_PUBLICATIONS, featured: m.PRESS_FEATURED, clippings: m.PRESS_CLIPPINGS, radio: m.PRESS_RADIO };
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
export const getResources = async () => {
  const m = await loadMedia();
  return { categories: m.RESOURCE_CATEGORIES, rows: m.RESOURCE_ROWS };
};
