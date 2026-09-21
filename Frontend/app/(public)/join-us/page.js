import Link from 'next/link';
import { getJoinUsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/join-us',
  title: 'Join Us',
  description: "Whether you give your time, your skills, your company's support, or your career, there is a place for you in Vyoma's work.",
});

export default async function JoinUsPage() {
  const { TRACKS } = await getJoinUsContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Join Us"
        title="Careers, internships, and volunteering — one mission."
        body="Whether you give your time, your skills, your company's support, or your career, there is a place for you in Vyoma's work. Choose the path that fits you."
        maxWidth="max-w-[720px]"
      />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto grid max-w-[1100px] gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {TRACKS.map((t, i) => (
            <Link
              key={t.title}
              href={t.href}
              className="block rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-6 text-left"
            >
              <div className="mb-3 font-sans text-[17px] font-bold text-charcoal">{String(i + 1).padStart(2, '0')}</div>
              <div className="mb-2 font-sans text-h3 font-bold text-vyoma-blue">{t.title}</div>
              <div className="font-sans text-base leading-normal text-charcoal">{t.body}</div>
            </Link>
          ))}
        </div>
      </section>

      <CtaStrip badge="Careers, Internships & Volunteering" heading="Want to be part of this?">
        <ContactCta>Get in touch</ContactCta>
      </CtaStrip>
    </div>
  );
}
