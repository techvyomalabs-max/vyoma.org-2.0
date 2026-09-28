import { notFound } from 'next/navigation';
import { getDonationSchemes, getDonationSchemeBySlug } from '@/services/donationService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { QuickDonate } from '@/components/sections/donate/QuickDonate';

// Phase D: only ACTIVE schemes are statically pre-rendered — an inactive
// scheme's page still works (see below), it's just rendered on-demand at
// request time (Next's default dynamicParams behavior) rather than at
// build time, since the active-only list is the only one this build step
// can safely call without auth.
export async function generateStaticParams() {
  const schemes = await getDonationSchemes();
  return schemes.map((s) => ({ schemeSlug: s.slug }));
}

export async function generateMetadata({ params }) {
  const { schemeSlug } = await params;
  try {
    const scheme = await getDonationSchemeBySlug(schemeSlug);
    return { title: scheme.name, description: scheme.body, alternates: { canonical: `/donate/${schemeSlug}` } };
  } catch {
    return { title: 'Donate' };
  }
}

export default async function DonationSchemePage({ params }) {
  const { schemeSlug } = await params;
  let scheme;
  try {
    scheme = await getDonationSchemeBySlug(schemeSlug);
  } catch (err) {
    if (err.status === 404) notFound();
    throw err;
  }

  const isActive = scheme.status !== 'inactive';

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

      {isActive ? (
        <QuickDonate schemeSlug={scheme.slug} />
      ) : (
        // Phase D decision: a distinct, donor-friendly unavailable state —
        // never a silent fallback to "not found" and never an active
        // checkout action for a scheme that can't actually accept a
        // donation right now (createDonationOrder already rejects
        // inactive schemes server-side; this is the honest UI to match).
        <section className="bg-white px-8 py-14 text-center">
          <div className="mx-auto max-w-[520px] rounded-md border border-[var(--border-subtle)] bg-sky-mist px-6 py-8">
            <p className="font-sans text-base text-charcoal">This donation scheme is currently not accepting donations.</p>
          </div>
        </section>
      )}
    </div>
  );
}
