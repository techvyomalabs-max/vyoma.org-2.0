import Link from 'next/link';
import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';

export const metadata = {
  title: 'Our Story',
  description:
    "Vyoma began in 2010 with a single Sanskrit self-learning product. This is the story of how it grew into India's largest free Sanskrit e-learning ecosystem, year by year.",
};

export default async function OurStoryPage() {
  const { TIMELINE_FULL } = await getAboutContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="About Vyoma"
        title="Our story"
        body="Vyoma began in 2010 with a single Sanskrit self-learning product and a simple conviction: that this profound language belongs to everyone, not just a few. What started as an experiment in digital learning has grown into India's largest free Sanskrit e-learning ecosystem. This is the story of how we got here, year by year."
      />

      <section className="bg-white px-8 py-[72px]">
        <div className="relative mx-auto max-w-[900px]">
          <div className="absolute bottom-0 left-1/2 top-0 w-0.5 -translate-x-1/2 bg-amber-gold" />
          {TIMELINE_FULL.map((t, i) => {
            const left = i % 2 === 0;
            return (
              <div key={i} className="relative mb-10 grid grid-cols-2">
                <div className="absolute left-1/2 top-1 z-[1] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-[3px] border-white bg-amber-gold shadow-[0_0_0_2px_var(--color-amber-gold)]" />
                <div
                  className={`${left ? 'col-start-1 pr-10 text-right' : 'col-start-2 pl-10 text-left'}`}
                >
                  <div className="mb-1.5 font-sans text-xl font-bold text-vyoma-blue">{t.year}</div>
                  <div className="font-sans text-base leading-normal text-charcoal">{t.text}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mx-auto mt-12 max-w-[700px] text-center font-sans text-[17px] leading-normal text-charcoal">
          The journey ahead is our most ambitious yet: seven Schools of Sanskrit and Indian Knowledge Systems,
          growing towards a Vyoma Global Virtual University. Explore what we are building on our{' '}
          <Link href="/our-work" className="font-bold text-vyoma-blue">
            Our Work
          </Link>{' '}
          page.
        </p>
      </section>

      <CtaStrip
        badge="Support our mission"
        heading="Help keep Sanskrit alive for the next generation."
        subtext="Your support brings free, authentic Sanskrit learning to people who could never otherwise access it."
      >
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
