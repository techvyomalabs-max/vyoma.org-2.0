'use client';

import { useState } from 'react';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';

// A handful of awards have two original WordPress photos (the old site
// rotated them as a pair); most have only one. Rendering both cases through
// one component keeps the slider chrome entirely out of the common,
// single-photo case -- it only ever appears when a second photo exists.
function AwardPhoto({ images, alt }) {
  const [index, setIndex] = useState(0);
  const photos = images.filter(Boolean);

  if (photos.length <= 1) {
    return <ImagePlaceholder src={photos[0]?.url} alt={photos[0]?.alt || alt} shape="rect" caption="Photo" />;
  }

  const go = (delta) => setIndex((i) => (i + delta + photos.length) % photos.length);

  return (
    <div className="group relative h-full w-full">
      <ImagePlaceholder src={photos[index]?.url} alt={photos[index]?.alt || alt} shape="rect" caption="Photo" />
      {/* z-20: ImagePlaceholder's own <img>/SmartImage layers render at
          z-10, which would otherwise sit above these absolutely-positioned
          controls and silently swallow every click. */}
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous photo"
        className="absolute left-1.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 font-sans text-sm font-bold text-vyoma-blue shadow-sm hover:bg-white"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => go(1)}
        aria-label="Next photo"
        className="absolute right-1.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 font-sans text-sm font-bold text-vyoma-blue shadow-sm hover:bg-white"
      >
        ›
      </button>
      <div className="absolute bottom-1.5 left-1/2 z-20 flex -translate-x-1/2 gap-1">
        {photos.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1}`}
            className={`h-1.5 w-1.5 rounded-full ${i === index ? 'bg-amber-gold' : 'bg-white/70'}`}
          />
        ))}
      </div>
    </div>
  );
}

// Shared grid layout for the Awards & Recognition sub-page: a card with an
// image on top and doc-style view/download links below. Mirrors the
// AwardBlocks pattern in ui_kits/vyoma-org/Credibility.jsx.
export function AwardBlocks({ items }) {
  const active = items.filter((item) => item.active !== false);
  return (
    <section className="bg-white px-8 py-16">
      <div
        className="mx-auto grid max-w-[1100px] gap-6"
        style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}
      >
        {active.map((item) => (
          <div
            key={item.title}
            className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-white"
          >
            <div className="h-[220px] w-full border-b-[3px] border-b-amber-gold">
              <AwardPhoto images={[item.image, item.image2]} alt={item.title} />
            </div>
            <div className="p-[20px_22px]">
              <div className="font-sans text-lg font-bold text-vyoma-blue">{item.title}</div>
              <div className="mt-1 font-sans text-[15px] text-charcoal">{item.body}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
