import Link from 'next/link';
import { getMediaContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { MediaCta } from '@/components/sections/media/MediaCta';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const { MEDIA_SECTIONS } = await getMediaContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Stories, coverage, and updates."
        body="How Vyoma's work is seen, shared, and remembered, our writing, our press coverage, and moments from the field."
      />

      <section className="bg-white px-8 py-16">
        <div
          className="mx-auto grid max-w-[1100px] gap-5"
          style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}
        >
          {MEDIA_SECTIONS.map((s) => (
            <div key={s.title} className="rounded-md bg-sky-mist p-[24px_22px]">
              <Link href={s.href} className="font-sans text-lg font-bold text-vyoma-blue">
                {s.title}
              </Link>
              <p className="mt-2 font-sans text-[15px] text-charcoal">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
