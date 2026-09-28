import Link from 'next/link';
import { getEvents } from '@/services/mediaService';
import { EVENT_CATEGORIES } from '@/lib/mockData/media';
import { PageHero } from '@/components/sections/PageHero';
import { MediaCta } from '@/components/sections/media/MediaCta';
import { EventCard } from '@/components/sections/media/EventCard';
import { EventsPastClient } from '@/components/sections/media/EventsPastClient';
import { pageMetadata } from '@/lib/seo';

// EVENT_CATEGORIES is static filter-chip config, not fetched content —
// mediaService.getEvents() only returns { upcoming, past } (LLD content
// items), so this constant is imported directly.
export const metadata = pageMetadata({
  path: '/media/events',
  title: 'Events',
  description: "Where Vyoma's work meets people — talks, workshops, visits, and gatherings through the year.",
});

export default async function EventsPage() {
  const { upcoming, past } = await getEvents();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Events"
        body="Where Vyoma's work meets people, talks, workshops, visits, and gatherings through the year."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Upcoming</h2>
          {upcoming.length === 0 ? (
            <div className="rounded-md bg-sky-mist p-6 font-sans text-[15px] text-charcoal">
              No upcoming events right now. Check back soon, or{' '}
              <Link href="/media/newsletter" className="font-bold text-vyoma-blue">
                subscribe to our newsletter
              </Link>
              .
            </div>
          ) : (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              {upcoming.map((e) => (
                <EventCard key={e.title} event={e} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Past Events</h2>
          <EventsPastClient events={past} categories={EVENT_CATEGORIES} />
        </div>
      </section>

      <MediaCta />
    </div>
  );
}
