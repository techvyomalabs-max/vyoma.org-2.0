import { Badge } from '@/components/common/Badge';

// The "badge + heading (+ optional subtext) on the left, action buttons on
// the right, blue band" CTA pattern closes almost every page in the source
// design system (AboutCTA, OurWorkCTA, CredibilityCTA, MediaCTA, CSRStrip,
// and the ad-hoc CTA blocks inside Roadmap/CoreTeam/OurPatrons/CurrentWork).
export function CtaStrip({ badge, heading, subtext, children }) {
  return (
    <section className="grid grid-cols-1 items-center gap-6 bg-vyoma-blue px-8 py-12 sm:grid-cols-[1fr_auto]">
      <div>
        {badge && <Badge tone="inverse">{badge}</Badge>}
        <h3 className={`font-sans text-[26px] font-bold text-white ${badge ? 'mt-3.5' : ''}`}>{heading}</h3>
        {subtext && <p className="mt-2.5 max-w-[480px] font-sans text-[17px] text-[var(--text-inverse-muted)]">{subtext}</p>}
      </div>
      <div className="flex flex-wrap gap-3">{children}</div>
    </section>
  );
}
