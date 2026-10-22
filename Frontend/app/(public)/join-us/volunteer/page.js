import { getJoinUsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { Button } from '@/components/common/Button';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/join-us/volunteer',
  title: 'Volunteer',
  description: "Begin your seva journey. Vyoma's mission runs on people who give their time and skills, and Sanskrit knowledge is not required.",
});

export default async function VolunteerPage() {
  const { VOLUNTEER_CATEGORIES: CATEGORIES_ALL, VOLUNTEER_FEATURED: FEATURED_ALL, VOLUNTEER_APPLY_URL } = await getJoinUsContent();
  const VOLUNTEER_CATEGORIES = CATEGORIES_ALL.filter((c) => c.active !== false);
  const VOLUNTEER_FEATURED = FEATURED_ALL.filter((v) => v.active !== false);

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
                  {v.name === 'Smt. Bhuvaneshwari Subramanian' && v.image?.url ? (
                    // Scoped fix, this photo only (not a change to the shared
                    // SmartImage/ImagePlaceholder components, and Radha Raju's
                    // card below is unaffected). Her source photo (1227x1280,
                    // nearly square) is narrower, relative to its own height,
                    // than this card's image box is tall — the standard
                    // contain+blur treatment (still used for every other
                    // photo) left a visible blurred strip at the bottom
                    // instead of filling it. Because this box is taller than
                    // 120 * (1280/1227) ≈ 125px (confirmed by that very
                    // strip having been at the BOTTOM, not split top+bottom,
                    // under the previous top-anchored contain attempt),
                    // object-fit: cover here fills the box by matching its
                    // height exactly — zero vertical crop, so her head and
                    // the full vertical framing of the photo stay completely
                    // intact. The only trade-off is a modest amount of
                    // background cropped off the left and right edges.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.image.url}
                      alt={v.image?.alt || v.name}
                      className="h-full w-full rounded-l-md object-cover"
                    />
                  ) : (
                    <ImagePlaceholder src={v.image?.url} alt={v.image?.alt || v.name} shape="rounded-left" caption="Photo" />
                  )}
                </div>
                <div className="flex flex-col items-center justify-center px-5 py-[22px] text-center">
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
        {/* No native Volunteer application form exists yet (the real form
            requires a resume + photograph upload, blocked on S3 — same gate
            as Careers). VOLUNTEER_APPLY_URL, when set via the CMS, opens the
            real external application form directly; left blank, this falls
            back to the same contact-modal flow Careers uses in the
            equivalent case, not a new form. */}
        {VOLUNTEER_APPLY_URL ? (
          <Button variant="outline-inverse" size="lg" href={VOLUNTEER_APPLY_URL} target="_blank" rel="noopener noreferrer">
            Become a Volunteer
          </Button>
        ) : (
          <ContactCta subject="Volunteering">Become a Volunteer</ContactCta>
        )}
      </CtaStrip>
    </div>
  );
}
