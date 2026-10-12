import { getWhereIks } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { WhereIksExplorer } from '@/components/sections/media/WhereIksExplorer';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/media/where-iks',
  title: 'Where IKS',
  description: 'O-MANTRI — a curated directory of Indian Knowledge Systems resources, organised into Universal, Domain Specific, and Auxiliary Tools series.',
});

export default async function WhereIksPage() {
  const { series, categories, rows } = await getWhereIks();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Where IKS"
        body="O-MANTRI: a curated directory of resources for Indian Knowledge Systems, organised into Universal, Domain Specific, and Auxiliary Tools series."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <WhereIksExplorer series={series} categories={categories} rows={rows} />
        </div>
      </section>
    </div>
  );
}
