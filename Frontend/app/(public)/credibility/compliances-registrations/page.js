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
  path: '/credibility/compliances-registrations',
  title: 'Compliances & Registrations',
  description: 'Our statutory approvals and registrations, including 80G, 12AA, FCRA, CSR, and MSME.',
});

export default async function CompliancesRegistrationsPage() {
  const { COMPLIANCES_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Compliances & Registrations"
        title="Compliances & Registrations"
        body="Vyoma's statutory approvals and registrations, in plain terms, so you can confirm exactly what we're cleared to do."
      />

      <DocBlocks items={COMPLIANCES_ITEMS} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
