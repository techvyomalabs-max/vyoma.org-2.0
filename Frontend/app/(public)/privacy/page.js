import { getPrivacyContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata() {
  const { SEO, TITLE } = await getPrivacyContent();
  const meta = pageMetadata({
    path: '/privacy',
    title: SEO?.title || TITLE,
    description: SEO?.description || undefined,
  });
  if (SEO?.ogImage?.url) meta.openGraph = { images: [{ url: SEO.ogImage.url }] };
  return meta;
}

export default async function PrivacyPage() {
  const { TITLE, EFFECTIVE_DATE, BODY } = await getPrivacyContent();

  return (
    <div className="font-sans">
      <PageHero eyebrow="Legal" title={TITLE} />

      <section className="bg-white px-8 py-16">
        <div className="mx-auto max-w-[820px]">
          {EFFECTIVE_DATE && (
            <p className="mb-6 font-sans text-sm text-charcoal/60">Effective date: {EFFECTIVE_DATE}</p>
          )}
          {/* BODY is sanitized server-side (Backend sanitizeLegalBody.js)
              before it is ever stored — same trust boundary as the blog
              post body field. Migrated verbatim from the WordPress source,
              including its own numbering/formatting quirks. */}
          <div className="prose-blog font-sans text-[17px] leading-normal text-charcoal" dangerouslySetInnerHTML={{ __html: BODY }} />
        </div>
      </section>
    </div>
  );
}
