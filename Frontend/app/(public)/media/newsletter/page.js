import { getNewsletterIssues } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { Button } from '@/components/common/Button';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { NewsletterArchiveClient } from '@/components/sections/media/NewsletterArchiveClient';

export const metadata = { title: 'Newsletter' };

export default async function NewsletterPage() {
  const { latest, archive, special } = await getNewsletterIssues();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Newsletter"
        body="Our journey in Vyoma's own words, milestones, programmes, and moments, issue by issue since 2011."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Latest Issue</h2>
          <div
            className="grid overflow-hidden rounded-md border border-[var(--border-subtle)]"
            style={{ gridTemplateColumns: 'minmax(240px,340px) 1fr' }}
          >
            <div className="border-r-[3px] border-r-amber-gold">
              <ImagePlaceholder shape="rect" caption="Cover" />
            </div>
            <div className="p-8">
              <div className="font-sans text-sm font-bold uppercase text-charcoal">{latest.label}</div>
              <h3 className="mt-2 font-sans text-[30px] font-bold text-vyoma-blue">{latest.title}</h3>
              <p className="mt-3 font-sans text-[15px] text-charcoal">{latest.summary}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="solid">Read online</Button>
                <Button variant="outline">Download PDF</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14 text-center">
        <div className="mx-auto max-w-[640px]">
          <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Get the next issue in your inbox</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <input
              type="email"
              placeholder="Your email"
              className="w-full max-w-[320px] rounded-md border border-[var(--border-subtle)] bg-white px-3.5 py-2.5 font-sans text-sm text-charcoal"
            />
            <Button variant="solid">Subscribe</Button>
          </div>
          <p className="mt-3 font-sans text-[13px] text-charcoal/70">Occasional updates. No spam.</p>
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Browse the Archive</h2>
          <NewsletterArchiveClient archive={archive} special={special} />
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
