import { getDonationSchemes } from '@/services/donationService';
import { getBlogPosts } from '@/services/blogService';

const BASE_URL = 'https://vyoma.org';

// LLD Section 11: "Generate XML sitemap from published canonical routes /
// content." Only public, indexable routes are listed — no /admin.
const STATIC_ROUTES = [
  '/',
  '/about',
  '/about/our-story',
  '/about/roadmap',
  '/about/leadership',
  '/about/core-team',
  '/about/patrons',
  '/our-work',
  '/our-work/current',
  '/our-work/all',
  '/impact',
  '/credibility',
  '/credibility/collaterals',
  '/credibility/annual-reports',
  '/credibility/social-impact-report',
  '/credibility/compliances-registrations',
  '/credibility/awards-recognition',
  '/media',
  '/media/blog',
  '/media/press',
  '/media/events',
  '/media/testimonials',
  '/media/newsletter',
  '/media/gallery',
  '/media/resources',
  '/join-us',
  '/join-us/volunteer',
  '/join-us/internship',
  '/join-us/csr-projects',
  '/join-us/corpus-fund',
  '/join-us/careers',
  '/donate',
  '/faq',
  '/contact',
  '/privacy',
  '/terms',
];

export default async function sitemap() {
  const now = new Date();

  const staticEntries = STATIC_ROUTES.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.7,
  }));

  // Task 7L: this previously imported DONATION_SCHEMES directly and
  // unconditionally from lib/mockData/donate -- always mock data, in every
  // environment, regardless of NEXT_PUBLIC_API_BASE_URL -- unlike the blog
  // entries below, which were already correctly migrated off static mock
  // data onto the real, properly-gated getBlogPosts() service. Routing this
  // through the same getDonationSchemes() service (already covered by
  // shouldUseMockData(), see lib/apiConfig.js) means a production sitemap
  // now reflects real, current donation schemes instead of a permanently
  // frozen mock list.
  const schemes = await getDonationSchemes();
  const schemeEntries = schemes.map((s) => ({
    url: `${BASE_URL}/donate/${s.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // Phase E: Blog moved off static mock data onto its own live model — the
  // sitemap now reflects real published posts instead of a frozen list.
  const { items: posts } = await getBlogPosts({ limit: 50 });
  const blogEntries = posts.map((p) => ({
    url: `${BASE_URL}/media/blog/${p.slug}`,
    lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticEntries, ...schemeEntries, ...blogEntries];
}
