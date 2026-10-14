import { getNewsletterIssues } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { Button } from '@/components/common/Button';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { NewsletterArchiveClient } from '@/components/sections/media/NewsletterArchiveClient';
import { NewsletterSubscribeForm } from '@/components/sections/media/NewsletterSubscribeForm';
import { pageMetadata } from '@/lib/seo';
import { isPdfUrl, downloadUrlFor } from '@/lib/documentLinks';

export const metadata = pageMetadata({
  path: '/media/newsletter',
  title: 'Newsletter',
  description: "Our journey in Vyoma's own words — milestones, programmes, and moments, issue by issue since 2011.",
});

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
              {latest.url && (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button variant="solid" href={latest.url} target="_blank" rel="noopener noreferrer">
                    Read online
                  </Button>
                  {isPdfUrl(latest.url) && (
                    // A plain <a>, not <Button href=...> — Button's href goes
                    // through next/link, which does client-side route
                    // interception; that breaks a real file download (this
                    // path isn't a page route; next/link's intercept hits a
                    // dead end instead of letting the browser handle the
                    // Content-Disposition response). Same reasoning already
                    // applied in DocBlocks.jsx's Download link.
                    <a
                      href={downloadUrlFor(latest.url)}
                      className="font-sans text-[15px] font-bold text-vyoma-blue underline-offset-2 hover:underline"
                    >
                      Download PDF
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14 text-center">
        <div className="mx-auto max-w-[640px]">
          <h2 className="mb-4 font-sans text-h2 font-bold text-vyoma-blue">Get the next issue in your inbox</h2>
          <NewsletterSubscribeForm />
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
