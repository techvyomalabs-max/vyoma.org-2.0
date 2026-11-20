import { getPublicContent } from './contentService.js';
import { withPatronCategoriesCompat } from '@/lib/patronCategoriesAdapter';

// Static/marketing pages (Home, About and its sub-pages, Our Work, Impact,
// Credibility, Join Us, Donate, FAQ, Contact). Each page.js calls the matching
// getXContent() below instead of importing lib/mockData directly, so swapping
// the mock for the real content API later touches only this file.
export const getHomeContent = () => getPublicContent('pages/home', () => import('@/lib/mockData/home'));
// Task 7D.31 — withPatronCategoriesCompat() bridges a `pages/about`
// document still on the legacy PATRON_TIERS/PATRON_TIER_ROWS shape (see its
// own header comment) into the PATRON_CATEGORIES shape every about/* page
// now reads, entirely in memory. It is a no-op once the document itself has
// been migrated, so this wrapper can be removed at that point with no other
// change needed.
export const getAboutContent = async () => withPatronCategoriesCompat(await getPublicContent('pages/about', () => import('@/lib/mockData/about')));
export const getOurWorkContent = () => getPublicContent('pages/our-work', () => import('@/lib/mockData/ourWork'));
export const getImpactContent = () => getPublicContent('pages/impact', () => import('@/lib/mockData/impact'));
export const getCredibilityContent = () =>
  getPublicContent('pages/credibility', () => import('@/lib/mockData/credibility'));
export const getJoinUsContent = () => getPublicContent('pages/join-us', () => import('@/lib/mockData/joinUs'));
export const getDonateContent = () => getPublicContent('pages/donate', () => import('@/lib/mockData/donate'));
export const getFaqContent = () => getPublicContent('pages/faq', () => import('@/lib/mockData/faq'));
export const getContactContent = () => getPublicContent('pages/contact', () => import('@/lib/mockData/contact'));
export const getMediaContent = () => getPublicContent('pages/media', () => import('@/lib/mockData/media'));

// Task 7D.32 — a narrow, deliberate exception to lib/apiConfig.js's
// "production never silently falls back to mock data" rule (Task 7L),
// scoped to exactly these two content types and triggered only by the
// specific, unambiguous "this content type does not exist yet" signal
// (404 CONTENT_NOT_FOUND from services/apiClient.js) -- never a network
// error or any other error code, and never any other content type.
//
// Why Privacy/Terms specifically: unlike CMS-edited marketing content (which
// an admin could legitimately be mid-edit on, or have deliberately emptied),
// Privacy/Terms are fixed legal/compliance text -- the real, already-
// reviewed WordPress-migrated copy in lib/mockData/privacy.js and terms.js
// (see Backend/scripts/seedData/privacy.js and terms.js, added in this same
// task as the Backend-side seed definitions, registered in
// Backend/scripts/runSeed.js's CONTENT_SEED map but not yet run against any
// already-existing database). Until a database that predates those two
// seed entries is reseeded, GET /public/pages/privacy|terms genuinely 404s
// today, and neither page.js file has any error handling -- showing the
// known-correct legal text here is strictly safer for a visitor than a hard
// crash or a content-free generic error page on a compliance page. Remove
// this fallback once every environment's database has these two documents.
async function getContentOrKnownFallback(type, mockLoader) {
  try {
    return await getPublicContent(type, mockLoader);
  } catch (err) {
    if (err?.status === 404 && err?.code === 'CONTENT_NOT_FOUND') {
      return mockLoader();
    }
    throw err;
  }
}

export const getPrivacyContent = () => getContentOrKnownFallback('pages/privacy', () => import('@/lib/mockData/privacy'));
export const getTermsContent = () => getContentOrKnownFallback('pages/terms', () => import('@/lib/mockData/terms'));
