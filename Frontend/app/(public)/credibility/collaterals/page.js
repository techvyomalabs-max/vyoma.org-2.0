import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { DocBlocks } from '@/components/sections/credibility/DocBlocks';

export const metadata = { title: 'Collaterals' };

export default async function CollateralsPage() {
  const { COLLATERALS_ITEMS } = await getCredibilityContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Collaterals"
        title="Collaterals"
        body="Everything that introduces Vyoma in one place, brochures, presentations, and catalogues to download, share, or bring into a partnership conversation."
      />

      <DocBlocks items={COLLATERALS_ITEMS} />

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
