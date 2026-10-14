// Used for "In the Press" clipping grids on /media/press. Plain <img>, not
// next/image — matches the established pattern (see EventCard.jsx,
// TestimonialCard.jsx) for externally-hosted vyoma.org images.
export function PressCard({ item }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
      <div className="h-[180px] border-b-[3px] border-b-amber-gold">
        {item.image?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image.url} alt={item.title} className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="font-sans text-sm font-bold text-charcoal">{item.title}</div>
        {item.caption && <p className="mt-2 flex-1 font-sans text-[15px] text-charcoal">{item.caption}</p>}
        {item.image?.url && (
          <a
            href={item.image.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 font-sans text-[15px] font-bold text-vyoma-blue"
          >
            View clipping →
          </a>
        )}
      </div>
    </div>
  );
}

// "Radio & Audio" cards on /media/press. Native <audio controls> — simplest
// correct way to make Listen actually play the real recording.
export function RadioCard({ item }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-[24px_22px]">
      <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
      <div className="mt-2 font-sans text-sm font-bold text-charcoal">91.1 FM with RJ Sowjanya · {item.duration}</div>
      {item.url ? (
        <audio controls preload="none" className="mt-3 w-full">
          <source src={item.url} type="audio/mpeg" />
        </audio>
      ) : null}
    </div>
  );
}
