'use client';

import { useEffect, useRef, useState } from 'react';

export function MetricCard({ value, label }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef(null);
  const animated = useRef(false);

  useEffect(() => {
    const numMatch = String(value).match(/[\d,]+/);
    if (!numMatch) return;
    const target = parseInt(numMatch[0].replace(/,/g, ''), 10);
    const prefix = String(value).slice(0, numMatch.index);
    const suffix = String(value).slice(numMatch.index + numMatch[0].length);
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !animated.current) {
            animated.current = true;
            const duration = 1200;
            const start = performance.now();
            const step = (now) => {
              const p = Math.min((now - start) / duration, 1);
              const eased = 1 - Math.pow(1 - p, 3);
              const current = Math.round(target * eased);
              setDisplay(prefix + current.toLocaleString() + suffix);
              if (p < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
        });
      },
      { threshold: 0.4 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [value]);

  return (
    <div
      ref={ref}
      className="rounded-md border border-vyoma-blue bg-vyoma-blue p-[18px] transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)] hover:scale-[1.06] hover:bg-vyoma-blue-deep hover:shadow-hover"
    >
      <div className="font-sans text-[22px] font-bold text-white">{display}</div>
      <div className="mt-1 font-sans text-[17px] text-[var(--text-inverse-muted)]">{label}</div>
    </div>
  );
}
