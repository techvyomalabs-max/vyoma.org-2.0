import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

// Shared grid layout for the Awards & Recognition sub-page: a card with an
// image on top and doc-style view/download links below. Mirrors the
// AwardBlocks pattern in ui_kits/vyoma-org/Credibility.jsx.
export function AwardBlocks({ items }) {
  return (
    <section className="bg-white px-8 py-16">
      <div
        className="mx-auto grid max-w-[1100px] gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}
      >
        {items.map((item) => (
          <div
            key={item.title}
            className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white"
          >
            <div className="h-[220px] w-full border-b-[3px] border-b-amber-gold">
              <ImagePlaceholder shape="rect" caption="Photo" />
            </div>
            <div className="p-[20px_22px]">
              <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
              <div className="mt-1 font-sans text-[15px] text-charcoal">{item.body}</div>
              <div className="mt-4 flex gap-4">
                <a href="#" className="font-sans text-[15px] font-bold text-vyoma-blue">
                  View
                </a>
                <a href="#" className="font-sans text-[15px] font-bold text-vyoma-blue">
                  Download
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
