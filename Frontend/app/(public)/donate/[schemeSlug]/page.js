import { notFound } from 'next/navigation';
import { getDonateContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { QuickDonate } from '@/components/sections/donate/QuickDonate';

// New route — LLD Section 3 specifies /donate/[schemeSlug] but the source
// design system only ever rendered a scheme summary grid (SchemesGrid),
// never an individual scheme page. Built fresh here.
export async function generateStaticParams() {
  const { DONATION_SCHEMES } = await getDonateContent();
  return DONATION_SCHEMES.map((s) => ({ schemeSlug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { schemeSlug } = await params;
  const { DONATION_SCHEMES } = await getDonateContent();
  const scheme = DONATION_SCHEMES.find((s) => s.slug === schemeSlug);
  return { title: scheme?.name || 'Donate' };
}

export default async function DonationSchemePage({ params }) {
  const { schemeSlug } = await params;
  const { DONATION_SCHEMES } = await getDonateContent();
  const scheme = DONATION_SCHEMES.find((s) => s.slug === schemeSlug);
  if (!scheme) notFound();

  return (
    <div className="font-sans">
      <PageHero eyebrow="Donate" title={scheme.name} body={scheme.body} />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[900px]">
          <div className="aspect-[2/1] w-full">
            <ImagePlaceholder shape="rect" caption={`${scheme.name} — 2:1 image`} />
          </div>
          {scheme.note && (
            <div className="mt-6 rounded-sm border border-dashed border-amber-gold bg-amber-gold/10 px-3 py-2.5 font-sans text-sm leading-normal text-[#9a6a00]">
              <strong>Handoff note:</strong> {scheme.note}
            </div>
          )}
        </div>
      </section>

      <QuickDonate />
    </div>
  );
}
