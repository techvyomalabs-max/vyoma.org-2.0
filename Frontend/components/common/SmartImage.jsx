'use client';

import { useEffect, useRef, useState } from 'react';

// `cover` only ever crops the image's axis that is RELATIVELY NARROWER than
// the box; it never touches the other axis at all. Allowing a small
// shortfall (not requiring a perfect or over-wide match) still guarantees
// that axis is cropped by at most ~10% — a deliberately conservative
// margin — while catching photos that are near-enough to the box's own
// proportions that the cropped sliver is clearly just background.
const SAFE_COVER_TOLERANCE = 0.9;

// Renders a CMS-supplied photo of ANY aspect ratio (portrait, landscape, or
// square) fully visible inside a container of a different aspect ratio,
// without cropping any part of it or stretching/distorting it. A blurred,
// enlarged copy of the SAME image fills any space the sharp image doesn't
// reach, so there is never a bare white/black letterbox bar — only the
// container's own size/shape (set by the caller) decides the layout.
//
// Both layers share one `src`, so the browser serves the blurred layer from
// the exact same cached response already fetched for the sharp layer —
// no second network request. Not meant for logos/icons/transparent
// graphics (a blurred backdrop behind a logo looks wrong); callers keep
// using a plain `object-contain` img for those, as before.
//
// `fit="auto"` (opt-in, default is `fit="contain"`, unchanged behavior for
// every existing caller): once the photo's real dimensions are known,
// compares them against the box's own measured size. If `cover` would only
// ever need to crop the box-relative-narrower axis (never the other one,
// where a head/face usually sits) within SAFE_COVER_TOLERANCE, it fills
// the box edge-to-edge with `cover` and skips the blurred layer entirely
// (nothing left for it to fill). Otherwise it falls back to the same
// contain+blur treatment as the default, so nothing is ever cropped unless
// it's been established safe for that specific photo/box pairing. This is
// a generic, per-photo runtime measurement — never a hardcoded per-person
// rule.
//
// `fit="flat"` (opt-in): for a photo that's already known to sit on a
// specific uniform background color (e.g. one that's been through
// background removal and recomposited onto a flat color) — always shows
// the full photo via `object-contain` and fills any leftover space with
// that exact solid `backdropColor`, never a blurred copy of the image.
// A blurred backdrop is a *guess* at what color looks right behind an
// arbitrary photo; when the real background color is already known
// precisely, filling with that color directly is strictly more accurate,
// and avoids a CSS `brightness` filter darkening an otherwise-correct flat
// color into a visibly different, mismatched shade.
export function SmartImage({ src, alt = '', className = '', priority = false, fit = 'contain', backdropColor = '#F1F5F9' }) {
  const containerRef = useRef(null);
  const [autoCover, setAutoCover] = useState(false);

  useEffect(() => {
    if (fit !== 'auto' || !src) return;
    setAutoCover(false); // safe default until measured (or if src changes)
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (cancelled) return;
      const box = containerRef.current;
      if (!box || !probe.naturalWidth || !probe.naturalHeight || !box.clientWidth || !box.clientHeight) return;
      const imgRatio = probe.naturalWidth / probe.naturalHeight;
      const boxRatio = box.clientWidth / box.clientHeight;
      setAutoCover(imgRatio >= boxRatio * SAFE_COVER_TOLERANCE);
    };
    probe.src = src;
    return () => {
      cancelled = true;
    };
  }, [fit, src]);

  if (!src) return null;
  const loadingProps = priority ? { loading: 'eager' } : { loading: 'lazy', decoding: 'async' };

  if (fit === 'flat') {
    return (
      <div className={`relative h-full w-full overflow-hidden ${className}`} style={{ backgroundColor: backdropColor }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="relative z-10 h-full w-full object-contain" {...loadingProps} />
      </div>
    );
  }

  const useCover = fit === 'auto' && autoCover;

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      {!useCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-75"
          {...loadingProps}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`relative z-10 h-full w-full ${useCover ? 'object-cover' : 'object-contain'}`}
        {...loadingProps}
      />
    </div>
  );
}
