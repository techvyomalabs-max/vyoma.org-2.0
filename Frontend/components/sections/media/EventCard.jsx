import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

export function EventCard({ event }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
      <div className="h-[190px] border-b-[3px] border-b-amber-gold">
        <ImagePlaceholder shape="rect" caption="Photo" />
      </div>
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="inline-block rounded-sm bg-sky-mist px-2.5 py-1 font-sans text-xs font-bold uppercase text-charcoal">
            {event.type}
          </span>
          <span className="font-sans text-[13px] text-charcoal/70">{event.date}</span>
        </div>
        <h3 className="mt-3 font-sans text-lg font-bold text-vyoma-blue">{event.title}</h3>
        <p className="mt-2 font-sans text-[15px] text-charcoal">{event.note}</p>
        <a href="#" className="mt-3 inline-block font-sans text-[15px] font-bold text-vyoma-blue">
          More Details →
        </a>
      </div>
    </div>
  );
}
