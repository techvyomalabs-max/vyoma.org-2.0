import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { AwardBlocks } from '@/components/sections/credibility/AwardBlocks';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/credibility/awards-recognition',
  title: 'Awards & Recognition',
  description: 'Honours earned across 10+ years of Saṃskṛta-Saṃskṛti-Saṃskāra seva.',
});

export default async function AwardsRecognitionPage() {
  const { AWARDS_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Awards & Recognition"
        title="Awards & Recognition"
        body="More than ten years of Saṃskṛta-Saṃskṛti-Saṃskāra seva, recognised by universities, institutions, and peers."
      />

      <AwardBlocks items={AWARDS_ITEMS} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
