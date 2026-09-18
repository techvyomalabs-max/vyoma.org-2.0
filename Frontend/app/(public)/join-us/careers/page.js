import { getJoinUsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { CareersBoard } from '@/components/sections/joinUs/CareersBoard';

export const metadata = { title: 'Careers' };

export default async function CareersPage() {
  const { CAREER_ROLES, CAREER_STEPS } = await getJoinUsContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Work @ Vyoma"
        title="Build free Sanskrit education at scale."
        body="Would you like to work with a purpose-driven team building free Sanskrit education at scale? Explore our open roles."
        maxWidth="max-w-[720px]"
      />

      <CareersBoard roles={CAREER_ROLES} />

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">How we hire</h2>
          <div className="mb-5 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
            {CAREER_STEPS.map((s) => (
              <div key={s.n} className="rounded-md border border-[var(--border-subtle)] bg-white px-5 py-[22px]">
                <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-full bg-vyoma-blue font-sans text-[17px] font-bold text-white">
                  {s.n}
                </div>
                <div className="mb-1.5 font-sans text-[17px] font-bold text-vyoma-blue">{s.t}</div>
                <p className="m-0 font-sans text-[15px] leading-normal text-charcoal">{s.d}</p>
              </div>
            ))}
          </div>
          <div className="font-sans text-[15px] font-semibold text-charcoal">
            Please note: most roles are on-site at our Bengaluru office; work-from-home is not available.
          </div>
        </div>
      </section>

      <CtaStrip
        badge="Careers"
        heading="Stay in touch."
        subtext="Not the right role today? Send an open application and we'll keep you in mind."
      >
        <ContactCta subject="Careers">Send an open application</ContactCta>
      </CtaStrip>
    </div>
  );
}
