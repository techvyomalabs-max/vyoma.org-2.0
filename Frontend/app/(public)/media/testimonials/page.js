import { getTestimonials } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { TestimonialCard } from '@/components/sections/media/TestimonialCard';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/media/testimonials',
  title: 'Testimonials',
  description: 'In their own words, learners across India and the world on what Vyoma has meant to them.',
});

export default async function TestimonialsPage() {
  const { featured, all } = await getTestimonials();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Media"
        title="Testimonials"
        body="In their own words, learners across India and the world on what Vyoma has meant to them."
      />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Featured</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            {featured.map((item) => (
              <TestimonialCard key={item.name} item={{ type: 'text', ...item }} featured />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">All Testimonials</h2>
          <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
            {all.map((item) => (
              <TestimonialCard key={item.name} item={item} />
            ))}
          </div>
          {/* "Load more" removed — it had no onClick/pagination logic, and
              `all.map()` above already renders every available testimonial
              unconditionally; the button was decorative and hid nothing.
              If a future batch adds enough testimonials that pagination is
              genuinely needed, implement real slicing + an onClick handler
              here rather than restoring a non-functional button. */}
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
