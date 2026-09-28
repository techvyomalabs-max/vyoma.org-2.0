'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/common/Button';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { useModal } from '@/components/layout/ModalProvider';

// Phase B: slide count is now data-driven (was hardcoded `const N = 5`,
// which silently ignored any slide added/removed/reordered/hidden via the
// admin CMS). `slides` is expected pre-filtered to `active` items by the
// caller (Home page.js), same as every other section.
export function HeroCarousel({ slides }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const { openDonate } = useModal();
  const n = slides.length;

  useEffect(() => {
    if (paused || hovering || n === 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % n), 7000);
    return () => clearInterval(t);
  }, [paused, hovering, n]);

  if (n === 0) return null;
  const slide = slides[idx % n];

  return (
    <section className="bg-vyoma-blue px-8 py-16">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-12">
        <div className="flex h-[480px] min-w-[280px] flex-1 basis-[320px] flex-col">
          <div className="flex flex-1 flex-col justify-center">
            <h1 key={idx} className="mb-2.5 break-words font-sans text-h1 font-semibold leading-tight text-white">
              {slide.heading}
            </h1>
            <p className="max-w-[480px] break-words font-sans text-xl text-[var(--text-inverse-muted)]">
              {slide.body}
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            {slide.cta?.label && (
              <Button
                href={slide.cta.href}
                target={slide.cta.external ? '_blank' : undefined}
                rel={slide.cta.external ? 'noopener noreferrer' : undefined}
                variant="outline-inverse"
                size="lg"
                className="whitespace-nowrap px-3.5"
              >
                {slide.cta.label}
              </Button>
            )}
            <Button variant="outline-inverse" size="lg" className="whitespace-nowrap px-3.5" onClick={openDonate}>
              Support Vyoma
            </Button>
          </div>
        </div>
        <div className="min-w-[280px] flex-[2_1_480px]">
          <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
            <div className="relative aspect-[2/1] w-full overflow-hidden rounded-lg border border-white/30">
              {slides.map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-0 transition-opacity duration-[0.6s]"
                  style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? 'auto' : 'none' }}
                >
                  <ImagePlaceholder alt={`Hero photo ${i + 1}`} caption={`Hero photo ${i + 1}`} shape="rect" />
                </div>
              ))}
              <button
                onClick={() => setIdx((i) => (i - 1 + N) % N)}
                aria-label="Previous photo"
                className="absolute bottom-2.5 left-3 z-[2] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/35 text-base text-white"
              >
                ‹
              </button>
              <button
                onClick={() => setIdx((i) => (i + 1) % N)}
                aria-label="Next photo"
                className="absolute bottom-2.5 right-3 z-[2] flex h-[30px] w-[30px] items-center justify-center rounded-full bg-black/35 text-base text-white"
              >
                ›
              </button>
            </div>
            <div className="mt-3.5 flex items-center justify-center gap-2.5">
              <button
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white/25 p-0 text-[10px] text-white"
              >
                {paused ? '▶' : '❙❙'}
              </button>
              {[0, 1, 2, 3, 4].map((i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Show photo ${i + 1}`}
                  className={`h-2.5 w-2.5 rounded-full p-0 transition-colors duration-300 ${
                    i === idx ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
