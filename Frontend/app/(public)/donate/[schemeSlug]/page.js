import { notFound } from 'next/navigation';
import { getDonationSchemes, getDonationSchemeBySlug } from '@/services/donationService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { QuickDonate } from '@/components/sections/donate/QuickDonate';
import { getPublicSchemeFields } from '@/components/sections/donate/donationSchemePublicFields.mjs';

// Phase D: only ACTIVE schemes are statically pre-rendered — an inactive
// scheme's page still works (see below), it's just rendered on-demand at
// request time (Next's default dynamicParams behavior) rather than at
// build time, since the active-only list is the only one this build step
// can safely call without auth.
//
// Never let a build-time backend hiccup (unreachable API, a transient 5xx,
// a route briefly missing during a rolling deploy) take down the ENTIRE
// site build — every other page would fail to deploy too, not just this
// one. On any failure here, fall back to generating zero scheme pages at
// build time; every scheme still renders correctly on-demand at request
// time via Next's default dynamicParams, exactly like an inactive scheme
// already does today.
export async function generateStaticParams() {
  try {
    const schemes = await getDonationSchemes();
    return schemes.map((s) => ({ schemeSlug: s.slug }));
  } catch (err) {
    console.error('[donate/[schemeSlug]] generateStaticParams failed, falling back to on-demand rendering for all schemes:', err.message);
    return [];
  }
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
    // A transient backend/API failure (not "this scheme doesn't exist")
    // previously crashed the whole page with an unhandled exception —
    // same class of bug as the generic /donate page. Render a clear,
    // honest fallback instead.
    console.error(`[donate/${schemeSlug}] failed to load scheme:`, err.message);
    return (
      <div className="flex flex-col items-center gap-4 bg-white px-8 py-20 text-center font-sans">
        <h1 className="font-sans text-h2 font-bold text-vyoma-blue">This donation page is temporarily unavailable</h1>
        <p className="max-w-[480px] font-sans text-[15px] text-charcoal">
          We couldn&apos;t reach our server just now — this is usually temporary. Please refresh this page in a
          moment, or contact our team if you&apos;d like help completing your donation another way.
        </p>
      </div>
    );
  }

  const publicScheme = getPublicSchemeFields(scheme);
  const isActive = publicScheme.status !== 'inactive';

  return (
    <div className="font-sans">
      <PageHero eyebrow="Donate" title={publicScheme.name} body={publicScheme.body} />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[900px]">
          <div className="aspect-[2/1] w-full">
            {publicScheme.image?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={publicScheme.image.url} alt={publicScheme.name} className="h-full w-full object-cover" />
            ) : (
              <ImagePlaceholder shape="rect" caption={`${publicScheme.name} — 2:1 image`} />
            )}
          </div>
        </div>
      </section>

      {isActive ? (
        <QuickDonate schemeSlug={publicScheme.slug} />
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
