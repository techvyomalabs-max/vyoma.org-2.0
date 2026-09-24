import Link from 'next/link';
import { getCredibilityContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/credibility',
  title: 'Credibility',
  description: 'Vyoma opens its record to the people who fund and partner with it — reports, registrations, and recognition, all in one place.',
});

export default async function CredibilityPage() {
  const { CREDIBILITY_SECTIONS: SECTIONS_ALL } = await getCredibilityContent();
  const CREDIBILITY_SECTIONS = SECTIONS_ALL.filter((s) => s.active !== false);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Credibility"
        title="Transparency you can verify."
        body="Vyoma opens its record to the people who fund and partner with it, our reports, registrations, and recognition, all in one place. Look as closely as you like; that's the point."
      />

      <section className="bg-white px-8 py-16">
        <div
          className="mx-auto grid max-w-[1100px] gap-6"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}
        >
          {CREDIBILITY_SECTIONS.map((s, i) => (
            <div
              key={s.title}
              className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-[28px_24px]"
            >
              <div className="mb-3 font-sans text-[17px] font-bold text-charcoal">{String(i + 1).padStart(2, '0')}</div>
              <div className="mb-2 font-sans text-h3 font-bold text-vyoma-blue">{s.title}</div>
              <p className="mb-4 font-sans text-base text-charcoal">{s.body}</p>
              <Link href={s.href} className="font-sans font-bold text-vyoma-blue">
                {s.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <CtaStrip
        heading="Evaluating Vyoma as a partner?"
        subtext="Our team can walk you through our governance, reports, and registrations, or share anything you need for due diligence."
      >
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
