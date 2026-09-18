import { getImpactContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { MetricCard } from '@/components/sections/impact/MetricCard';
import { KpiDashboard } from '@/components/sections/impact/KpiDashboard';

export const metadata = {
  title: 'Impact',
  description:
    "Every number here represents a step in making Sanskrit and India's knowledge systems accessible to all — reported openly, with full financial transparency.",
};

function MetricSection({ eyebrow, title, items }) {
  return (
    <section className="bg-white px-8 py-14">
      <div className="mx-auto max-w-[1100px]">
        <div className="mb-2.5 font-sans text-eyebrow font-bold uppercase tracking-eyebrow text-charcoal">{eyebrow}</div>
        <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">{title}</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          {items.map((m) => (
            <MetricCard key={m.label} value={m.value} label={m.label} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function ImpactPage() {
  const { IMPACT, INPUT, OUTPUT } = await getImpactContent();

  return (
    <div className="font-sans">
      <section className="bg-vyoma-blue px-8 py-14 text-center">
        <div className="mb-3 font-sans text-eyebrow font-bold uppercase tracking-eyebrow text-[var(--text-inverse-muted)]">
          Impact
        </div>
        <h1 className="mx-auto mb-3 max-w-[720px] font-sans text-h1 font-bold leading-tight text-white">
          Measurable impact, timeless roots.
        </h1>
        <p className="mx-auto mb-6 max-w-[640px] font-sans text-lg leading-normal text-[var(--text-inverse-muted)]">
          Every number here represents a step in making Sanskrit and India&apos;s knowledge systems accessible to
          all. We report our work openly, the people and hours we invest, what we produce, and the lives changed,
          so donors and partners can see exactly what their support builds.
        </p>
        <DonateCta>Support this work</DonateCta>
      </section>

      <KpiDashboard />
      <MetricSection eyebrow="Impact" title="Reach at scale" items={IMPACT} />
      <MetricSection eyebrow="Input" title="What we invest" items={INPUT} />
      <MetricSection eyebrow="Output achieved" title="What we've built" items={OUTPUT} />

      <CtaStrip badge="For Corporates & CSR Partners" heading="See these numbers grow with your support">
        <ContactCta subject="CSR partnership">Get CSR details</ContactCta>
      </CtaStrip>
    </div>
  );
}
