import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { DocBlocks } from '@/components/sections/credibility/DocBlocks';

export const metadata = {
  title: 'Social Impact Report',
  description: 'A focused look at outcomes and the communities our work reaches.',
};

export default async function SocialImpactReportPage() {
  const { SOCIAL_IMPACT_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Social Impact Report"
        title="Social Impact Report"
        body="A closer look at outcomes, who our work reaches, and the difference it makes on the ground."
      />

      <DocBlocks items={SOCIAL_IMPACT_ITEMS} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
