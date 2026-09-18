import Image from 'next/image';

// Replaces the source design system's <image-slot> (a design-tool-only custom
// element with no meaning in production). No real photography exists yet
// (see assets/README.md in the source) — every call site either passes a real
// `src` once media is supplied, or falls back to this neutral placeholder.
export function ImagePlaceholder({ src, alt = '', caption, shape = 'rounded', className = '' }) {
  const radius = shape === 'circle' ? 'rounded-full' : shape === 'pill' ? 'rounded-pill' : 'rounded-md';

  if (src) {
    return (
      <div className={`relative w-full h-full overflow-hidden ${radius} ${className}`}>
        <Image src={src} alt={alt} fill className="object-cover" />
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
