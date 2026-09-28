import { getPublicContent } from './contentService';

// Static/marketing pages (Home, About and its sub-pages, Our Work, Impact,
// Credibility, Join Us, Donate, FAQ, Contact). Each page.js calls the matching
// getXContent() below instead of importing lib/mockData directly, so swapping
// the mock for the real content API later touches only this file.
export const getHomeContent = () => getPublicContent('pages/home', () => import('@/lib/mockData/home'));
export const getAboutContent = () => getPublicContent('pages/about', () => import('@/lib/mockData/about'));
export const getOurWorkContent = () => getPublicContent('pages/our-work', () => import('@/lib/mockData/ourWork'));
export const getImpactContent = () => getPublicContent('pages/impact', () => import('@/lib/mockData/impact'));
export const getCredibilityContent = () =>
  getPublicContent('pages/credibility', () => import('@/lib/mockData/credibility'));
export const getJoinUsContent = () => getPublicContent('pages/join-us', () => import('@/lib/mockData/joinUs'));
export const getDonateContent = () => getPublicContent('pages/donate', () => import('@/lib/mockData/donate'));
export const getFaqContent = () => getPublicContent('pages/faq', () => import('@/lib/mockData/faq'));
export const getContactContent = () => getPublicContent('pages/contact', () => import('@/lib/mockData/contact'));
export const getMediaContent = () => getPublicContent('pages/media', () => import('@/lib/mockData/media'));
