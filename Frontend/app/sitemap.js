import { getDonationSchemes } from '@/services/donationService';
import { getBlogPosts } from '@/services/blogService';

// Task 7S.1 originally set `revalidate = 3600` here instead of full
// force-dynamic, since a sitemap has no payment/CMS-correctness stakes the
// way the donation pages do. Task 7V.2 replaced it with force-dynamic:
// `revalidate` alone still lets Next.js statically generate this route
// during `next build`, and this file's own catch blocks below (by design,
// Task 7S.1) deliberately RE-THROW a genuine misconfiguration error (e.g.
// NEXT_PUBLIC_API_BASE_URL missing) rather than silently producing an
// incomplete sitemap -- confirmed by direct testing that this combination
// crashes the entire production build the moment that var is genuinely
// unset, not just this one route. force-dynamic defers generation to
// request time instead (consistent with every other page fixed in this
// lineage, Task 7R.1's donate pages included): the build can never fail
// because of this file, and a genuine misconfiguration is still loud --
// just at request time, when a crawler/visitor actually hits /sitemap.xml,
// instead of at build time for every deploy.
export const dynamic = 'force-dynamic';

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
  //
  // Task 7R.1: a build-time-unreachable backend (DNS failure, transient
  // outage -- apiClient.js's own err.networkError flag) must not fail the
  // entire sitemap -- same reasoning as generateStaticParams in
  // donate/[schemeSlug] and media/blog/[slug]: fall back to omitting just
  // these dynamic entries, never to mock data, and log clearly so the gap
  // is visible. Anything else -- in particular resolveApiBase()'s own
  // thrown configuration error when NEXT_PUBLIC_API_BASE_URL is missing in
  // production -- is a genuine misconfiguration Task 7L deliberately made
  // loud, not a transient outage, so it is re-thrown unchanged rather than
  // silently producing an incomplete sitemap.
  let schemeEntries = [];
  try {
    const schemes = await getDonationSchemes();
    schemeEntries = schemes.map((s) => ({
      url: `${BASE_URL}/donate/${s.slug}`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch (err) {
    if (!err.networkError) throw err;
    console.error('[sitemap] failed to load donation schemes, omitting scheme entries:', err.message);
  }

  // Phase E: Blog moved off static mock data onto its own live model — the
  // sitemap now reflects real published posts instead of a frozen list.
  let blogEntries = [];
  try {
    const { items: posts } = await getBlogPosts({ limit: 50 });
    blogEntries = posts.map((p) => ({
      url: `${BASE_URL}/media/blog/${p.slug}`,
      lastModified: p.publishedAt ? new Date(p.publishedAt) : now,
      changeFrequency: 'monthly',
      priority: 0.5,
    }));
  } catch (err) {
    if (!err.networkError) throw err;
    console.error('[sitemap] failed to load blog posts, omitting blog entries:', err.message);
  }

  return [...staticEntries, ...schemeEntries, ...blogEntries];
}
