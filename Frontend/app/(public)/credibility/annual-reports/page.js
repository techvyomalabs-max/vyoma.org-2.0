import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { DocBlocks } from '@/components/sections/credibility/DocBlocks';
import { pageMetadata } from '@/lib/seo';

// Task 7R.1: deferred to request time so a build-time-unreachable backend
// (DNS failure, transient outage) cannot fail `next build` — see
// Frontend/lib/apiConfig.js and services/apiClient.js's networkError
// handling for the request-time behavior this preserves.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/credibility/annual-reports',
  title: 'Annual Reports',
  description: 'A year-by-year account of our activities, reach, and finances (2021-22 to 2024-25).',
});

export default async function AnnualReportsPage() {
  const { ANNUAL_REPORTS_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Annual Reports"
        title="Annual Reports"
        body="Our year-by-year record of activities, reach, and finances, published in full for donors, partners, and grant reviewers."
      />

      <DocBlocks items={ANNUAL_REPORTS_ITEMS} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
