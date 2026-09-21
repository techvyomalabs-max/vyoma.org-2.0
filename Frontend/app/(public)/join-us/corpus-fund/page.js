import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { CorpusDonateWidget } from '@/components/sections/joinUs/CorpusDonateWidget';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/join-us/corpus-fund',
  title: 'Corpus Fund',
  description: "Vyoma's endowment, invested so its returns fund our work year after year, keeping Sanskrit open to all long into the future.",
});

export default function CorpusFundPage() {
  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Join Us"
        title="Corpus Fund"
        body="Some gifts are spent once. This one keeps giving. The Corpus Fund is Vyoma's endowment, invested so its returns fund our work year after year, keeping Sanskrit open to all long into the future."
        maxWidth="max-w-[720px]"
      />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto grid max-w-[1100px] items-start gap-12" style={{ gridTemplateColumns: 'minmax(280px,1fr) auto' }}>
          <div>
            <h2 className="mb-[18px] font-sans text-h2 font-bold text-vyoma-blue">A gift that outlasts the giving</h2>
            <p className="font-sans text-[17px] leading-normal text-charcoal">
              Money placed in Vyoma&apos;s Corpus Fund is invested, and its returns sustain our programmes year after year, so the mission never rests on a single donation.
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
