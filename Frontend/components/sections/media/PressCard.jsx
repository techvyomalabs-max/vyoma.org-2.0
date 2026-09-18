import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

// Used for both "Featured Coverage" (large) and "In the Press" (regular) on
// /media/press.
export function PressCard({ item, large = false }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white">
      <div className={`border-b-[3px] border-b-amber-gold ${large ? 'h-[240px]' : 'h-[180px]'}`}>
        <ImagePlaceholder shape="rect" caption="Clipping" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="font-sans text-sm font-bold text-charcoal">
          {item.pub} · {item.date}
        </div>
        <p className="mt-2 flex-1 font-sans text-[15px] text-charcoal">{item.note}</p>
        <a href="#" className="mt-3 font-sans text-[15px] font-bold text-vyoma-blue">
          View clipping →
        </a>
      </div>
    </div>
  );
}

// "Radio & Audio" cards on /media/press.
export function RadioCard({ item }) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white p-[24px_22px]">
      <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
      <div className="mt-2 font-sans text-sm font-bold text-charcoal">91.1 FM with RJ Sowjanya · {item.duration}</div>
      <button type="button" className="mt-3 inline-flex items-center gap-2 font-sans text-[15px] font-bold text-vyoma-blue">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--color-vyoma-blue)">
          <path d="M8 5v14l11-7z" />
        </svg>
        Listen
      </button>
    </div>
  );
}
