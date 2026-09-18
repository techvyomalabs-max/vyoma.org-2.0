import { getOurWorkContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { SchoolsGrid } from '@/components/sections/ourWork/SchoolsGrid';
import { CurrentWorkStage } from '@/components/sections/ourWork/CurrentWorkStage';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';

// PENDING ROUTE: not in the LLD route table (Phase 1 conflict). Preserved per
// instruction until final route approval; see lib/navConfig.js.
export const metadata = {
  title: 'Our Work — Seven Schools & Current Work',
  description:
    "The Seven Schools of Vyoma alongside everything Vyoma runs today — platforms and programmes carrying Sanskrit into classrooms, homes, and communities.",
};

export default async function OurWorkAllPage() {
  const { SCHOOLS, CW_PLATFORMS, CW_PROGRAMMES } = await getOurWorkContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Our Work"
        pill="Provisional — the Seven Schools are under review and may change."
        title="The Seven Schools of Vyoma"
        body="From phonetics to applied AI, from children's value education to advanced research, each School advances one facet of a living tradition, backed by scholarship and built to reach millions."
        maxWidth="max-w-[760px]"
      />
      <SchoolsGrid schools={SCHOOLS} />
      <CurrentWorkStage platforms={CW_PLATFORMS} programmes={CW_PROGRAMMES} headingLevel="h2" />
      <CtaStrip badge="Support & Partnerships" heading="Want to support this work?">
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
