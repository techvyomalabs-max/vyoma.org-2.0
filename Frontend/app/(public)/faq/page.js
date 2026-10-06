import { getFaqContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { FaqGroup } from '@/components/sections/faq/FaqGroup';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata() {
  const { SEO } = await getFaqContent();
  const meta = pageMetadata({
    path: '/faq',
    // Matches this page's own real, already-rendered PageHero heading below
    // — not invented copy.
    title: SEO?.title || 'Frequently Asked Questions',
    description: SEO?.description || 'Answers to common questions about donating to Vyoma, tax benefits, partnerships, and learning Sanskrit.',
  });
  if (SEO?.ogImage?.url) meta.openGraph = { images: [{ url: SEO.ogImage.url }] };
  return meta;
}

export default async function FaqPage() {
  const { FAQ_GROUPS: GROUPS_ALL } = await getFaqContent();
  const FAQ_GROUPS = GROUPS_ALL.filter((g) => g.active !== false);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Support"
        title="Frequently Asked Questions"
        body="Answers to common questions about donating to Vyoma, tax benefits, partnerships, and learning Sanskrit."
        maxWidth="max-w-[760px]"
      />

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[820px]">
          {FAQ_GROUPS.map((g) => (
            <FaqGroup key={g.group} group={g.group} items={g.items} />
          ))}
        </div>
      </section>

      <CtaStrip badge="Still have questions?" heading="We're happy to help.">
        <ContactCta>Contact us</ContactCta>
      </CtaStrip>
    </div>
  );
}
