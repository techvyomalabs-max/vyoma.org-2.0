import { getWhatSanskrit } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { WhatSanskritTabs } from '@/components/sections/media/WhatSanskritTabs';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/media/what-sanskrit',
  title: 'What Sanskrit?',
  description: 'An illustrative representation of the knowledge repository in Sanskrit, organised by traditional shastra.',
});

export default async function WhatSanskritPage() {
  const { categories, rows } = await getWhatSanskrit();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="What Sanskrit ???"
        body={[
          'Illustrative representation of Knowledge repository in Sanskrit',
          'A few of the Vyoma courses & videos which introduce some of the topics from the above knowledge repository are listed below:',
        ]}
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <WhatSanskritTabs categories={categories} rows={rows} />
        </div>
      </section>
    </div>
  );
}
