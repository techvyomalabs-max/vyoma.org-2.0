import Image from 'next/image';
import { SmartImage } from './SmartImage';

// Replaces the source design system's <image-slot> (a design-tool-only custom
// element with no meaning in production). No real photography exists yet
// (see assets/README.md in the source) — every call site either passes a real
// `src` once media is supplied, or falls back to this neutral placeholder.
//
// `fit="contain"` (default) shows the whole photo via SmartImage's
// blurred-backdrop technique — the right behavior for a profile/content
// photo of unknown aspect ratio. `fit="cover"` keeps the original
// edge-to-edge crop and is reserved for full-bleed banner/decorative use
// (HeroCarousel only, by deliberate design choice, not an oversight).
// `fit="auto"` delegates to SmartImage's own per-photo runtime measurement
// (see its header comment) — cover only where provably safe for that
// photo/box pairing, contain+blur otherwise.
// `fit="flat"` delegates to SmartImage's solid-backdrop mode — for a photo
// already known to sit on a specific uniform background color (e.g.
// background-removed and recomposited onto a flat color), filling any
// leftover space with that exact color instead of a blurred copy.
// `shape="rounded-left"`: only the left corners are rounded — for a photo
// that sits flush against a straight divider/border on its right (e.g. an
// image-left/text-right card), so the divider meets a straight edge
// instead of leaving a small notch where a fully-rounded corner pulls away
// from it.
export function ImagePlaceholder({ src, alt = '', caption, shape = 'rounded', className = '', fit = 'contain', backdropColor }) {
  const radius =
    shape === 'circle' ? 'rounded-full' : shape === 'pill' ? 'rounded-pill' : shape === 'rounded-left' ? 'rounded-l-md' : 'rounded-md';

  if (src) {
    if (fit === 'cover') {
      return (
        <div className={`relative w-full h-full overflow-hidden ${radius} ${className}`}>
          <Image src={src} alt={alt} fill className="object-cover" />
        </div>
      );
    }
    return (
      <div className={`h-full w-full overflow-hidden ${radius} ${className}`}>
        <SmartImage
          src={src}
          alt={alt}
          fit={fit === 'auto' || fit === 'flat' ? fit : 'contain'}
          {...(backdropColor ? { backdropColor } : {})}
        />
      </div>
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-sky-mist text-charcoal/50 text-sm font-sans text-center px-3 ${radius} ${className}`}
    >
      {caption || 'Image coming soon'}
    </div>
  );
}
