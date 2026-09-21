import { getOurWorkContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { SchoolsGrid } from '@/components/sections/ourWork/SchoolsGrid';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/our-work',
  title: 'Our Work',
  description: "From phonetics to applied AI, from children's value education to advanced research — the Seven Schools of Vyoma, backed by scholarship and built to reach millions.",
});

export default async function OurWorkPage() {
  const { SCHOOLS } = await getOurWorkContent();

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
      <CtaStrip badge="Institutional & Academic Partners" heading="Interested in collaborating with one of our Schools?">
        <ContactCta subject="Institutional partnership">Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
