import { getPressCoverage } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { PressCard, RadioCard } from '@/components/sections/media/PressCard';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/media/press',
  title: 'Press',
  description: "Vyoma's work in the words of others, across newspapers, radio, and magazines.",
});

export default async function PressPage() {
  const { publications, featured, clippings, radio } = await getPressCoverage();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Press"
        body="Vyoma's work in the words of others, across newspapers, radio, and magazines."
      />

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-8 text-center font-sans text-eyebrow font-bold uppercase tracking-eyebrow text-charcoal">
            As featured in
          </div>
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
            {publications.map((pub) => (
              <div key={pub} className="h-[70px] rounded-md bg-white">
                <ImagePlaceholder caption={pub} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Featured Coverage</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {featured.map((item) => (
              <PressCard key={`${item.pub}-${item.date}`} item={item} large />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">In the Press</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            {clippings.map((item) => (
              <PressCard key={`${item.pub}-${item.date}`} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Radio & Audio</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
            {radio.map((item) => (
              <RadioCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
