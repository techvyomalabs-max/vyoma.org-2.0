import { getDashboardMetrics, toNumber } from './kpiDashboardData.mjs';

function KpiGauge({ transformedIndividuals }) {
  const N = 40;
  const current = toNumber(transformedIndividuals);
  const goal = 1000000;
  const progress = current / goal;
  const cx = 130;
  const cy = 128;
  const rI = 78;
  const rO = 104;
  const ticks = [];
  for (let i = 0; i <= N; i++) {
    const ang = ((180 + (i / N) * 180) * Math.PI) / 180;
    const lead = i / N <= progress;
    ticks.push({
      x1: cx + rI * Math.cos(ang),
      y1: cy + rI * Math.sin(ang),
      x2: cx + rO * Math.cos(ang),
      y2: cy + rO * Math.sin(ang),
      color: lead ? 'var(--color-vyoma-blue)' : 'rgba(15,98,179,0.22)',
    });
  }
  return (
    <div className="text-center">
      <svg viewBox="0 0 260 150" className="mx-auto block w-full max-w-[260px]">
        {ticks.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.color} strokeWidth="2.5" strokeLinecap="round" />
        ))}
        <text x="130" y="118" textAnchor="middle" className="fill-vyoma-blue font-sans text-[34px] font-bold">
          {transformedIndividuals}
        </text>
      </svg>
      <div className="mt-0.5 font-sans text-xs text-charcoal/75">
        {Math.round(progress * 100)}% toward our goal of 1 million by 2032
      </div>
    </div>
  );
}

function KpiBars({ bars }) {
  const max = Math.max(...bars.map((b) => b.v), 1);
  return (
    <div>
      <div className="mb-7 font-sans text-[17px] font-bold text-vyoma-blue">The people & work behind Vyoma</div>
      <div className="flex h-[130px] items-end gap-4">
        {bars.map((b, i) => (
          <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="font-sans text-xs font-bold text-charcoal">{b.v}</div>
            <div
              className={`w-full max-w-[34px] rounded-t-[5px] ${i % 2 === 0 ? 'bg-vyoma-blue' : 'bg-amber-gold'}`}
              style={{ height: Math.max(6, (b.v / max) * 104) }}
            />
            <div className="font-sans text-xs text-charcoal/75">{b.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiStat({ value, label }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="font-sans text-[30px] font-bold leading-none text-vyoma-blue">{value}</div>
        <div className="mt-2 font-sans text-sm leading-normal text-charcoal">{label}</div>
      </div>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--color-vyoma-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </div>
  );
}

export function KpiDashboard({ input, impact }) {
  const metrics = getDashboardMetrics(input, impact);
  return (
    <section className="bg-white px-8 pb-2 pt-10">
      <div
        className="mx-auto grid max-w-[1100px] grid-cols-1 items-center gap-8 rounded-lg bg-sky-mist px-[34px] py-8
          sm:grid-cols-2
          lg:grid-cols-[minmax(260px,1.3fr)_minmax(220px,1fr)_minmax(160px,0.9fr)_minmax(160px,0.9fr)]"
      >
        <KpiBars bars={metrics.bars} />
        <KpiGauge transformedIndividuals={metrics.transformedIndividuals} />
        <KpiStat value={metrics.eLearningManHours} label="E-Learning Man-Hours" />
        <KpiStat value={metrics.touchPrints} label="Touch-Prints reached" />
      </div>
    </section>
  );
}
