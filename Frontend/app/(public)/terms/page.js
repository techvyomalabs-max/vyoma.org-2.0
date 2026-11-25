import { getTermsContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { pageMetadata } from '@/lib/seo';
import { stripBlankLegalParagraphs } from '@/lib/stripBlankLegalParagraphs.mjs';

// Task 7R.1: deferred to request time so a build-time-unreachable backend
// (DNS failure, transient outage) cannot fail `next build` — see
// Frontend/lib/apiConfig.js and services/apiClient.js's networkError
// handling for the request-time behavior this preserves.
export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const { SEO, TITLE } = await getTermsContent();
  const meta = pageMetadata({
    path: '/terms',
    title: SEO?.title || TITLE,
    description: SEO?.description || undefined,
  });
  if (SEO?.ogImage?.url) meta.openGraph = { images: [{ url: SEO.ogImage.url }] };
  return meta;
}

export default async function TermsPage() {
  const { TITLE, EFFECTIVE_DATE, BODY } = await getTermsContent();

  return (
    <div className="font-sans">
      <PageHero eyebrow="Legal" eyebrowSize="text-[16px]" title={TITLE} />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto max-w-[820px]">
          {EFFECTIVE_DATE && (
            <p className="mb-6 font-sans text-sm text-charcoal/60">Effective date: {EFFECTIVE_DATE}</p>
          )}
          {/* BODY is sanitized server-side (Backend sanitizeLegalBody.js)
              before it is ever stored — same trust boundary as the blog
              post body field. Migrated verbatim from the WordPress source,
              including its own numbering/formatting quirks.
              QA Bug 15: stripBlankLegalParagraphs is a render-only
              normalization -- it never touches the stored BODY value or
              the Content document itself, only the copy rendered here. */}
          <div
            className="prose-blog legal-content font-sans text-[17px] leading-normal text-charcoal"
            dangerouslySetInnerHTML={{ __html: stripBlankLegalParagraphs(BODY) }}
          />
        </div>
      </section>
    </div>
  );
}
