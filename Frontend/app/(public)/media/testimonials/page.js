import { getTestimonials } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { TestimonialCard } from '@/components/sections/media/TestimonialCard';
import { TestimonialsAllGrid } from '@/components/sections/media/TestimonialsAllGrid';
import { toActiveContentArray } from '@/lib/contentArrays';
import { pageMetadata } from '@/lib/seo';

// Task 7R.1: deferred to request time so a build-time-unreachable backend
// (DNS failure, transient outage) cannot fail `next build` — see
// Frontend/lib/apiConfig.js and services/apiClient.js's networkError
// handling for the request-time behavior this preserves.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/media/testimonials',
  title: 'Testimonials',
  description: 'In their own words, learners across India and the world on what Vyoma has meant to them.',
});

export default async function TestimonialsPage() {
  const { featured, all } = await getTestimonials();
  // QA Bug 19 Stage 5A: an `active: false` entry (admin-hidden) is excluded
  // from both sections; a legacy entry with no `active` field at all (every
  // entry in both arrays today) remains visible -- toActiveContentArray()'s
  // own `item.active !== false` convention, reused unmodified here, not
  // reimplemented. Filtering happens once, server-side, before either array
  // reaches a render path -- the Featured section (plain, unconditional
  // .map(), no client state) is therefore already fully independent of
  // whatever the All Testimonials section's Load More interaction does.
  const activeFeatured = toActiveContentArray(featured);
  const activeAll = toActiveContentArray(all);

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        eyebrowSize="text-[16px]"
        title="Testimonials"
        body="In their own words, learners across India and the world on what Vyoma has meant to them."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Featured</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {activeFeatured.map((item) => (
              // QA Bug 19 Stage 5C: prefers the Stage 5B stable `id` when
              // present, same reasoning as TestimonialsAllGrid.jsx's
              // matching key -- falls back to `item.name` for a legacy
              // entry that has no `id` yet.
              <TestimonialCard key={item.id ?? item.name} item={{ type: 'text', ...item }} featured />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">All Testimonials</h2>
          <TestimonialsAllGrid items={activeAll} />
        </div>
      </section>

      <CtaStrip
        heading="Learned something with Vyoma?"
        subtext="Share your experience and help others discover what Vyoma offers."
      >
        <ContactCta subject="Testimonial submission">Submit your testimonial</ContactCta>
      </CtaStrip>
    </div>
  );
}
