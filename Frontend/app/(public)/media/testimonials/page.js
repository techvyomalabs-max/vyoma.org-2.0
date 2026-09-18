import { getTestimonials } from '@/services/mediaService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { TestimonialCard } from '@/components/sections/media/TestimonialCard';

export const metadata = {
  title: 'Testimonials',
  description: 'In their own words, learners across India and the world on what Vyoma has meant to them.',
};

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
          <div className="mt-8 text-center">
            <button
              type="button"
              className="rounded-md border border-vyoma-blue px-[22px] py-[11px] font-sans text-base font-semibold text-vyoma-blue"
            >
              Load more
            </button>
          </div>
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
