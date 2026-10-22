import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/about/core-team',
  title: 'Core Team',
  description: 'Behind every course, tool, and initiative is a dedicated team of teachers, technologists, and coordinators who bring Sanskrit to learners across the world.',
});

// Detects a background-removed photo purely from its URL (local-dev
// processed-photo storage), never by name — so this automatically covers
// every processed photo, present or future, and automatically excludes
// anyone still on their original source URL (Sri Ranga, both logos)
// without needing a maintained exclusion list.
const isProcessedPhoto = (url) => typeof url === 'string' && url.includes('/local-media/processed/');

export default async function CoreTeamPage() {
  const { CORE_TEAMS: CORE_TEAMS_ALL } = await getAboutContent();
  const CORE_TEAMS = CORE_TEAMS_ALL.filter((g) => g.active !== false);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Our people"
        title="Core Team"
        body="Behind every course, tool, and initiative is a dedicated team of teachers, technologists, and coordinators. These are the people who bring Sanskrit to learners across the world, day after day."
      />

      {CORE_TEAMS.map((t, gi) => (
        // `t.heading` alone isn't guaranteed unique -- the live CMS content
        // can (and currently does) contain more than one group sharing a
        // heading. Pairing it with its index keeps a stable, content-based
        // key while guaranteeing uniqueness regardless of upstream data.
        <section key={`${t.heading}-${gi}`} className={`px-8 py-14 ${gi % 2 === 0 ? 'bg-white' : 'bg-sky-mist'}`}>
          <h2 className="mb-8 text-center font-sans text-h2 font-bold text-vyoma-blue">{t.heading}</h2>
          <div
            className="mx-auto grid max-w-[1100px] gap-5"
            style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}
          >
            {t.people.filter((p) => p.active !== false).map((p, i) => (
              <div key={p.name} className="text-center">
                <div className="mx-auto mb-2.5 h-[170px] w-[170px]">
                  <ImagePlaceholder
                    src={p.image?.url}
                    alt={p.image?.alt || p.name}
                    shape="rounded"
                    caption="Photo"
                    fit={isProcessedPhoto(p.image?.url) ? 'flat' : 'auto'}
                  />
                </div>
                <div className="font-sans text-base font-bold text-vyoma-blue">{p.name}</div>
                <div className="font-sans text-sm text-charcoal">{p.role}</div>
                {p.bio && <div className="mt-1 font-sans text-[13px] italic text-charcoal/75">{p.bio}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <CtaStrip
        badge="Support our mission"
        heading="Help keep Sanskrit alive for the next generation."
        subtext="Your support brings free, authentic Sanskrit learning to people who could never otherwise access it."
      >
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
