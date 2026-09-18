import Link from 'next/link';
import { getJoinUsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';

export const metadata = { title: 'Internship' };

// Mirrors the source's INTERNSHIP_OPENINGS = [] — intentionally empty; the
// empty-state below is the real, currently-live content, not a placeholder.
const INTERNSHIP_OPENINGS = [];

export default async function InternshipPage() {
  const { INTERNSHIP_REASONS } = await getJoinUsContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Join Us"
        title="Internship"
        body="Work on real projects at the meeting point of Sanskrit, Indian Knowledge Systems, education, and technology."
        maxWidth="max-w-[720px]"
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Why intern at Vyoma?</h2>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {INTERNSHIP_REASONS.map((r, i) => (
              <div key={i} className="flex gap-3.5 rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-[22px] py-6">
                <div className="flex-shrink-0 font-sans text-[17px] font-bold text-vyoma-blue">{String(i + 1).padStart(2, '0')}</div>
                <p className="m-0 font-sans text-[15px] leading-normal text-charcoal">{r}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Current Internship Opportunities</h2>
          {INTERNSHIP_OPENINGS.length === 0 ? (
            <div className="rounded-md border border-[var(--border-subtle)] bg-white px-8 py-10 text-center font-sans text-base leading-normal text-charcoal">
              No internships open right now. Check back soon, or{' '}
              <Link href="/join-us/careers" className="font-bold text-vyoma-blue">
                apply through Careers
              </Link>
              .
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {INTERNSHIP_OPENINGS.map((o, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--border-subtle)] bg-white px-6 py-5"
                >
                  <div>
                    <div className="font-sans text-[17px] font-bold text-vyoma-blue">{o.role}</div>
                    <div className="mt-[3px] font-sans text-sm text-charcoal">Skill required: {o.skill}</div>
                  </div>
                  <span className="flex-shrink-0 font-sans text-sm font-bold text-vyoma-blue">Apply →</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <CtaStrip badge="Internship" heading="Ready to contribute?">
        <ContactCta subject="Internships">Apply Now</ContactCta>
      </CtaStrip>
    </div>
  );
}
