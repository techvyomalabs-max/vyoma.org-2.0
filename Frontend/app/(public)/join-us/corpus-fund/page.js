import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { CorpusDonateWidget } from '@/components/sections/joinUs/CorpusDonateWidget';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/join-us/corpus-fund',
  title: 'Corpus Fund',
  description: "Vyoma's vision is to enable personal transformation in every individual through SSS consciousness (SSS = Samskrita-Samskriti-Samskara).",
});

export default function CorpusFundPage() {
  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Join Us"
        title="Corpus Fund"
        body="Vyoma's vision is to enable personal transformation in every individual through SSS consciousness (SSS = Samskrita-Samskriti-Samskara)."
        maxWidth="max-w-[720px]"
      />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto grid max-w-[1100px] items-start gap-12" style={{ gridTemplateColumns: 'minmax(280px,1fr) auto' }}>
          <div>
            <p className="font-sans text-[17px] leading-normal text-charcoal">
              For this Seva to continue, a corpus fund is needed, through the interest of which, regular activities of Vyoma can be conducted.
            </p>
          </div>
          <CorpusDonateWidget />
        </div>
      </section>

      <CtaStrip badge="Corpus Fund" heading="Questions about endowment giving?">
        <ContactCta subject="Corpus fund">Get in touch</ContactCta>
      </CtaStrip>
    </div>
  );
}
