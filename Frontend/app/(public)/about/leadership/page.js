import { getAboutContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/about/leadership',
  title: 'Leadership',
  description: 'Vyoma is led by a team of scholars, technologists, and institution-builders, guided by an experienced advisory board.',
});

// Detects a background-removed photo purely from its URL (local-dev
// processed-photo storage), never by name — so this automatically covers
// every processed photo, present or future, and automatically excludes
// anyone still on their original source URL (Sri Ranga, both logos)
// without needing a maintained exclusion list.
const isProcessedPhoto = (url) => typeof url === 'string' && url.includes('/local-media/processed/');

function PeopleGroup({ heading, people, bg }) {
  return (
    <section className={`px-8 py-16 ${bg}`}>
      <h2 className="mb-9 text-center font-sans text-h2 font-bold text-vyoma-blue">{heading}</h2>
      <div className="mx-auto grid max-w-[1100px] gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        {people.filter((p) => p.active !== false).map((p) => (
          <div key={p.name} className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-[22px] py-6 text-center">
            <div className="mx-auto mb-4 h-[170px] w-[170px]">
              {(p.name === 'Sudhir Patavardhan' || p.name === 'Dr. Balaji Srinivasan') && p.image?.url ? (
                // Scoped local test (Option 3, approved for these two people
                // only): their source photos are portrait enough that the
                // shared fit="auto" logic correctly keeps them in
                // contain+blur to avoid any crop. This bypasses that for
                // just these two, trading the visible side blur for a
                // top-anchored edge-to-edge crop -- cropping only ever
                // comes from the BOTTOM of the photo (object-position: top
                // means the top of the frame is always fully kept), never
                // the top/head. Not a change to SmartImage/ImagePlaceholder
                // or to any other person's photo.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.image.url}
                  alt={p.image?.alt || p.name}
                  className="h-full w-full rounded-md object-cover object-top"
                />
              ) : (
                <ImagePlaceholder
                  src={p.image?.url}
                  alt={p.image?.alt || p.name}
                  shape="rounded"
                  caption="Photo"
                  fit={isProcessedPhoto(p.image?.url) ? 'flat' : 'auto'}
                />
              )}
            </div>
            <div className="mb-1 font-sans text-[17px] font-bold text-vyoma-blue">{p.name}</div>
            <div className={`font-sans text-sm font-bold uppercase tracking-[0.4px] text-charcoal ${p.bio ? 'mb-2.5' : ''}`}>
              {p.role}
            </div>
            {p.bio && <div className="font-sans text-[15px] leading-normal text-charcoal">{p.bio}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function LeadershipPage() {
  const { BOARD, ADVISORS, COMMITTEE } = await getAboutContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Our leadership"
        title="The people guiding Vyoma"
        body={[
          'Vyoma is led by a team of scholars, technologists, and institution-builders, guided by an experienced advisory board.',
          'Vyoma is guided by scholars, technologists, and institution-builders who bring together deep traditional knowledge and modern expertise. Together, our management board and advisory council shape the vision, integrity, and direction of everything we do.',
        ]}
      />
      <PeopleGroup heading="Company Management Board" people={BOARD} bg="bg-white" />
      <PeopleGroup heading="Advisory Board" people={ADVISORS} bg="bg-sky-mist" />
      <PeopleGroup heading="Executive Working Committee" people={COMMITTEE} bg="bg-white" />
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
