import { getJoinUsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

export const metadata = { title: 'Volunteer' };

export default async function VolunteerPage() {
  const { VOLUNTEER_CATEGORIES, VOLUNTEER_FEATURED } = await getJoinUsContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Join Us"
        title="Volunteer"
        body="Begin your seva journey. Vyoma's mission runs on people who give their time and skills, and Sanskrit knowledge is not required."
        maxWidth="max-w-[720px]"
      />

      <section className="bg-sky-mist px-8 py-10">
        <div className="mx-auto max-w-[820px] text-center font-sans text-xl font-semibold leading-normal text-vyoma-blue">
          To reach our vision, we need volunteers who can join hands with us and make a difference in others&apos; lives.
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Where you can help</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
            {VOLUNTEER_CATEGORIES.map((c) => (
              <div key={c.title} className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-[22px] py-6">
                <h3 className="mb-3.5 font-sans text-lg font-bold text-vyoma-blue">{c.title}</h3>
                <ul className="m-0 flex flex-col gap-2 pl-5">
                  {c.items.map((it) => (
                    <li key={it} className="font-sans text-[15px] leading-normal text-charcoal">
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Featured volunteers</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {VOLUNTEER_FEATURED.map((v) => (
              <div key={v.name} className="flex items-stretch gap-[18px] overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
                <div className="w-[120px] flex-shrink-0 border-r-[3px] border-r-amber-gold">
                  <ImagePlaceholder shape="rounded" caption="Photo" />
                </div>
                <div className="flex flex-col justify-center py-[22px] pr-5 pl-1">
                  <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{v.name}</div>
                  <p className="m-0 font-sans text-[15px] leading-normal text-charcoal">{v.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-8 py-8">
        <div className="mx-auto max-w-[1100px] rounded-md bg-sky-mist px-6 py-5 text-center font-sans text-base font-semibold text-vyoma-blue">
          No Sanskrit needed · Students welcome · Remote or in-office, flexible commitment
        </div>
      </section>

      <CtaStrip badge="Volunteer" heading="Ready to begin?">
        {/* Source rendered this as a non-functional button (fake-submit placeholder
            with no handler). Wired to the real contact modal instead, since this
            migration's goal is a working enquiry funnel. */}
        <ContactCta subject="Volunteering">Become a Volunteer</ContactCta>
      </CtaStrip>
    </div>
  );
}
