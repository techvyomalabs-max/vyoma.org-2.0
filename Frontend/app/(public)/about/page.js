import Link from 'next/link';
import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/about',
  title: 'About',
  description: "Founded in Bengaluru, Vyoma Linguistic Labs Foundation has grown into the organisation behind India's largest free Sanskrit e-learning ecosystem, serving over a lakh learners worldwide.",
});

export default async function AboutPage() {
  const { EXPLORE_MORE_LINKS } = await getAboutContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="About Vyoma"
        title="A nonprofit dedicated to keeping Saṃskṛtam a living, learnable language."
      />

      <section className="mx-auto max-w-[800px] bg-white px-8 py-16">
        <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Who we are</h2>
        <p className="mb-4 font-sans text-[17px] leading-normal text-charcoal">
          Founded in Bengaluru, Vyoma Linguistic Labs Foundation has grown into the organisation behind India&apos;s
          largest free Sanskrit e-learning ecosystem, serving over a lakh learners across the world. Our work spans
          structured online courses, digital libraries, language technology, research, and outreach, all built on
          the SSS framework: Saṃskṛtam (knowledge tradition), Saṃskṛtiḥ (culture and heritage), and Saṃskāraḥ
          (values and virtues).
        </p>
        <p className="font-sans text-[17px] leading-normal text-charcoal">
          What sets Vyoma apart is a rare combination: deep traditional scholarship, measurable digital-scale
          impact, and full financial transparency. From a young learner in a rural classroom to a researcher in a
          university, we make authentic Sanskrit accessible to anyone who wants it, at no cost wherever we can.
        </p>
      </section>

      <section className="mx-auto grid max-w-[1000px] gap-12 bg-sky-mist px-8 py-16 sm:grid-cols-2">
        <div className="h-[280px] w-full">
          <ImagePlaceholder shape="rounded" caption="Drop a real photo of Vyoma's classes or scholars here" />
        </div>
        <div>
          <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Our mission</h2>
          <p className="mb-4 font-sans text-[17px] leading-normal text-charcoal">
            Vyoma Linguistic Labs Foundation builds free, scholarship-backed Sanskrit education and language
            technology at global scale — grounded in authentic tradition, delivered through modern digital
            infrastructure.
          </p>
          <p className="font-sans text-[17px] leading-normal text-charcoal">
            We report our impact with real, dated numbers and full financial transparency to every donor, CSR
            partner, and grant body we work with.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-[1000px] bg-white px-8 py-16">
        <h2 className="mb-4 text-center font-sans text-h2 font-bold text-vyoma-blue">Our vision</h2>
        <p className="mx-auto mb-10 max-w-[700px] text-center font-sans text-[17px] leading-normal text-charcoal">
          To transform every individual through &apos;3S&apos; consciousness: Saṃskṛtam (knowledge tradition),
          Saṃskṛtiḥ (wellness, culture, and heritage), and Saṃskāraḥ (values and virtues).
        </p>
        <div className="mb-12 grid gap-6 sm:grid-cols-3">
          {[
            { term: 'Saṃskṛtam', text: 'The knowledge tradition — a living language, not a relic, carried forward through rigorous scholarship.' },
            { term: 'Saṃskṛtiḥ', text: "Culture and heritage — India's intellectual and artistic inheritance, made accessible to anyone curious about it." },
            { term: 'Saṃskāraḥ', text: 'Values and virtues — the character-building dimension of traditional learning, relevant far beyond the classroom.' },
          ].map((p, i) => (
            <div key={p.term} className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-6">
              <div className="mb-3 font-sans text-[17px] font-bold text-amber-gold">{String(i + 1).padStart(2, '0')}</div>
              <div className="mb-2 font-sans text-h3 font-bold leading-tight text-vyoma-blue">{p.term}</div>
              <div className="font-sans text-base leading-normal text-charcoal">{p.text}</div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <div className="mb-2 font-sans text-eyebrow font-bold uppercase tracking-eyebrow text-charcoal">Our goal</div>
          <div className="font-sans text-[56px] font-extrabold leading-none text-vyoma-blue">1 Million</div>
          <div className="mt-2 font-sans text-lg text-charcoal">people reached by 2032</div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-16">
        <h2 className="mb-9 text-center font-sans text-h2 font-bold text-vyoma-blue">Explore more</h2>
        <div className="mx-auto grid max-w-[1200px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {EXPLORE_MORE_LINKS.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="block rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-6"
            >
              <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{l.label}</div>
              <div className="font-sans text-base leading-normal text-charcoal">{l.text}</div>
            </Link>
          ))}
        </div>
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
