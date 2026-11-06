import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { SmartImage } from '@/components/common/SmartImage';

// Handles both the text-quote variant (Featured + most of "All Testimonials")
// and the video variant (a subset of "All Testimonials"), keyed off item.type.
export function TestimonialCard({ item, featured = false }) {
  if (item.type === 'video') {
    return (
      <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
        <div className="relative h-[200px] border-b-[3px] border-b-amber-gold">
          <ImagePlaceholder shape="rect" caption="Video" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/80">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--color-vyoma-blue)">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="font-sans text-base font-bold text-vyoma-blue">{item.name}</div>
          <div className="mt-1 font-sans text-sm text-charcoal">{item.role}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white ${
        featured ? 'p-[32px_28px]' : 'p-6'
      }`}
    >
      {/* This branch previously never rendered a photo at all, regardless
          of data — only entries with a real, verified source image get
          one here (item.image?.url absent for anyone without one; no
          placeholder/invented image is ever shown instead). */}
      {item.image?.url && (
        <div className="mb-3.5 h-14 w-14 overflow-hidden rounded-full border border-[var(--border-subtle)]">
          <SmartImage src={item.image.url} alt={item.image.alt || item.name} />
        </div>
      )}
      <div className={`font-serif text-amber-gold ${featured ? 'text-[48px] leading-none' : 'text-[36px] leading-none'}`}>
        &ldquo;
      </div>
      <p className={`mt-2 font-sans italic text-charcoal ${featured ? 'text-lg' : 'text-[15px]'}`}>{item.quote}</p>
      <div className="mt-4 font-sans text-base font-bold text-vyoma-blue">{item.name}</div>
      <div className="mt-1 font-sans text-sm text-charcoal">{item.role}</div>
    </div>
  );
}
