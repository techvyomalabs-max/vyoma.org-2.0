import Link from 'next/link';
import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';

export const metadata = { title: 'Roadmap' };

const SCHOOLS_TEXT =
  'core linguistics, advanced shastras, distance learning, IKS research, applied AI, inclusive learning, and value education for children';

export default async function RoadmapPage() {
  const { PHASES } = await getAboutContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Our roadmap"
        title="From a Sanskrit ecosystem to a global virtual university."
        body={[
          "Vyoma's seven Schools are growing, step by step, into a Vyoma Global Virtual University for Sanskrit and Indian Knowledge Systems.",
          'Our journey is far from over. The road ahead takes Vyoma from a Sanskrit e-learning ecosystem towards a full Vyoma Global Virtual University, built on seven Schools of Sanskrit and Indian Knowledge Systems. Here is where we are headed, and how we plan to get there.',
        ]}
      />

      <section className="mx-auto max-w-[800px] bg-white px-8 py-16 text-center">
        <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Where we&apos;re headed</h2>
        <p className="font-sans text-[17px] leading-normal text-charcoal">
          Vyoma&apos;s future is built on seven Schools, spanning {SCHOOLS_TEXT}. Together they form the foundation
          of a full virtual university. See what each School covers on our{' '}
          <Link href="/our-work" className="font-bold text-vyoma-blue">
            Our Work
          </Link>{' '}
          page.
        </p>
      </section>

      <section className="bg-sky-mist px-8 py-16">
        <h2 className="mb-9 text-center font-sans text-h2 font-bold text-vyoma-blue">The phased journey</h2>
        <div className="mx-auto grid max-w-[1100px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PHASES.map((p) => (
            <div key={p.phase} className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-6">
              <div className="mb-1 font-sans text-[17px] font-bold text-vyoma-blue">{p.phase}</div>
              <div className="mb-3 font-sans text-base font-bold text-charcoal">{p.time}</div>
              <div className="font-sans text-base leading-normal text-charcoal">{p.text}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[700px] bg-white px-8 py-16 text-center">
        <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">The bigger picture</h2>
        <p className="font-sans text-[17px] leading-normal text-charcoal">
          Every course, tool, and partnership we build today is a step towards one goal: a world-class virtual
          university keeping Sanskrit and Indian Knowledge Systems alive for generations to come.
        </p>
      </section>

      <CtaStrip badge="Build the future with us" heading="Help us bring the Vyoma Global Virtual University to life.">
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
