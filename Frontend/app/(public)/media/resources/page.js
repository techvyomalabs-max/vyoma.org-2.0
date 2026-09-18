import { getResources } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { ResourcesTable } from '@/components/sections/media/ResourcesTable';

export const metadata = {
  title: 'Resources',
  description:
    'A curated collection of Sanskrit resources from across the web, compiled as a service to learners, researchers, and knowledge enthusiasts.',
};

export default async function ResourcesPage() {
  const { categories, rows } = await getResources();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Resources"
        body="A curated collection of Sanskrit resources from across the web, compiled as a service to learners, researchers, and knowledge enthusiasts everywhere."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <ResourcesTable categories={categories} rows={rows} />

          <div className="mt-8 rounded-md bg-sky-mist p-6 font-sans text-[15px] text-charcoal">
            Any organization or individual who wants their page, blog, or link added can write to us. We usually
            update the details once a quarter. Anyone who wants their link removed can also email us, and
            we&apos;ll update once a quarter.
          </div>

          <p className="mt-6 font-sans text-[13px] text-charcoal/70">
            The information provided by Vyoma Linguistic Labs Foundation is for general informational purposes
            only. Vyoma makes no representation or warranty as to the accuracy or completeness of information on
            this page, and does not endorse or take responsibility for content on third-party sites linked here.
          </p>
        </div>
      </section>
    </div>
  );
}
