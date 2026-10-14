import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { Badge } from '@/components/common/Badge';
import { PatronTierTable } from '@/components/sections/about/PatronTierTable';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/about/patrons',
  title: 'Our Patrons',
  description: "Vyoma's patrons, donors, and well-wishers help keep authentic Sanskrit learning free and accessible to all.",
});

export default async function OurPatronsPage() {
  const {
    PATRON_CATEGORIES: CATEGORIES_ALL,
    GOLDEN_WALL,
    PATRON_TESTIMONIAL_GALLERY: GALLERY_ALL,
    PATRON_MATCHING_PARTNERS: PARTNERS_ALL,
  } = await getAboutContent();
  // Categories an admin created/renamed/reordered and published show up
  // here automatically — no hardcoded tier list.
  const PATRON_CATEGORIES = CATEGORIES_ALL.filter((c) => c.active !== false);
  const PATRON_TESTIMONIAL_GALLERY = GALLERY_ALL.filter((t) => t.active !== false);
  const PATRON_MATCHING_PARTNERS = PARTNERS_ALL.filter((t) => t.active !== false);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Our supporters"
        title="Our Patrons"
        body="Vyoma's work is made possible by the generosity of those who believe in our mission. Our patrons, donors, and well-wishers help keep authentic Sanskrit learning free and accessible to all, and we are deeply grateful for their trust and support."
      />

      <section className="bg-white px-8 py-16">
        <h2 className="mb-9 text-center font-sans text-h2 font-bold text-vyoma-blue">Patron tiers</h2>
        <div className="mx-auto grid max-w-[1100px] gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
          {PATRON_CATEGORIES.map((c) => (
            <div key={c.sanskrit} className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-sky-mist px-[22px] py-6">
              <div className="font-sans text-xl font-bold text-vyoma-blue">{c.sanskrit}</div>
              <div className="my-1 font-sans text-sm font-bold uppercase tracking-[0.4px] text-charcoal">{c.meaning}</div>
              <div className="mb-2.5 font-sans text-[15px] leading-normal text-charcoal">{c.note}</div>
              <div className="font-sans text-[13px] italic text-charcoal/60">Giving level TBC</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sky-mist px-8 pb-16">
        <PatronTierTable categories={PATRON_CATEGORIES} />
      </section>

      <section className="bg-sky-mist px-8 py-16 text-center">
        <Badge tone="amber">Golden Wall</Badge>
        <h2 className="my-3.5 font-sans text-h2 font-bold text-vyoma-blue">Paripālakāḥ, All-round Supporters</h2>
        <p className="mx-auto mb-8 max-w-[640px] font-sans text-base leading-normal text-charcoal">
          A featured honour band recognising our most steadfast supporters.
        </p>
        <div className="mx-auto grid max-w-[1100px] gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {GOLDEN_WALL.map((p, i) => (
            <div
              key={i}
              className="flex min-h-[90px] items-center justify-center rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-[18px] py-5"
            >
              <div className="font-sans text-[15px] font-bold leading-normal text-vyoma-blue">{p}</div>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-6 max-w-[460px] rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-vyoma-blue bg-white px-[22px] py-6">
          <div className="font-sans text-lg font-bold leading-normal text-vyoma-blue">Our Parents, Gurus and Ācāryas</div>
        </div>
      </section>

      <section className="bg-white px-8 py-16 text-center">
        <h2 className="mb-3 font-sans text-h2 font-bold text-vyoma-blue">Our Matching Patrons</h2>
        <p className="mx-auto mb-8 max-w-[640px] font-sans text-[17px] leading-normal text-charcoal">
          Companies whose employee matching-gift programmes multiply our supporters&apos; generosity.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-5">
          {PATRON_MATCHING_PARTNERS.map((p) => (
            <div key={p.name} className="flex h-[70px] w-40 items-center justify-center rounded-lg bg-sky-mist p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.logo.url} alt={p.name} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-16">
        <h2 className="mb-9 text-center font-sans text-h2 font-bold text-vyoma-blue">What our Patrons have to say…</h2>
        <div className="mx-auto grid max-w-[1100px] gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          {PATRON_TESTIMONIAL_GALLERY.filter((item) => item.image?.url).map((item) => (
            <div key={item.image.url} className="aspect-[4/3] overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image.url} alt="Patron testimonial" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      </section>

      <CtaStrip heading="Join our circle of patrons." subtext="Your support keeps Sanskrit free and accessible for the next generation.">
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
