import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { DocBlocks } from '@/components/sections/credibility/DocBlocks';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/credibility/audit-reports',
  title: 'Audit Reports',
  description: 'Our audited annual financial statements, published in full (FY2012-13 to FY2021-22).',
});

export default async function AuditReportsPage() {
  // Defaults to [] since AUDIT_REPORTS_ITEMS is a brand-new key that won't
  // exist on the live Content document (or the mock dataset) until the
  // migration script commits — same defensive pattern used for Gallery's
  // GALLERY_VIDEOS.
  const { AUDIT_REPORTS_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Audit Reports"
        title="Audit Reports"
        body="Our audited annual financial statements, published in full for donors, partners, and grant reviewers."
      />

      <DocBlocks items={AUDIT_REPORTS_ITEMS || []} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
