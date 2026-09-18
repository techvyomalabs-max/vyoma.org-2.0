import { getGalleryAlbums } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { GalleryLightbox } from '@/components/sections/media/GalleryLightbox';

export const metadata = { title: 'Gallery' };

export default async function GalleryPage() {
  const albums = await getGalleryAlbums();

  return (
    <div className="font-sans">
      <PageHero eyebrow="Media" title="Gallery" body="Moments from Vyoma's work, events, outreach, and recognition." />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1200px]">
          <GalleryLightbox albums={albums} />
        </div>
      </section>

      <CtaStrip badge="Gallery" heading="Want to see more of our work?">
        <ContactCta>Contact our team</ContactCta>
      </CtaStrip>
    </div>
  );
}
