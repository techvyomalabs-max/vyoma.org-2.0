import Link from 'next/link';
import { getHomeContent } from '@/services/pageService';
import { StatCard } from '@/components/common/StatCard';
import { TopicPill } from '@/components/common/TopicPill';
import { Badge } from '@/components/common/Badge';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { HeroCarousel } from '@/components/sections/home/HeroCarousel';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';

export default async function HomePage() {
  const { HERO_SLIDES, STATS, TOPICS, REGISTRATIONS, HOME_ACTIVITIES, HOME_TESTIMONIALS, SPONSORS } =
    await getHomeContent();

  return (
    <div className="font-sans">
      <HeroCarousel slides={HERO_SLIDES} />

      <section className="bg-vyoma-blue px-8 pb-14 pt-10">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATS.map((s) => (
            <StatCard key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
        <div className="mt-5 text-center font-sans text-base text-white">
          For more metrics, please visit our{' '}
          <Link href="/impact" className="text-white underline">
            Impact page
          </Link>
          .
        </div>
      </section>

      <section className="flex flex-wrap justify-center gap-3 bg-sky-mist px-8 py-7">
        {TOPICS.map((t) => (
          <TopicPill key={t}>{t}</TopicPill>
        ))}
      </section>

      <section className="bg-white px-8 py-14 text-center">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-3 font-sans text-h2 font-bold text-vyoma-blue">Registered and Recognized</h2>
          <p className="mx-auto mb-8 max-w-[680px] font-sans text-lg text-charcoal">
            Vyoma Linguistic Labs Foundation is a fully registered non-profit, verified for both domestic and
            international giving.
          </p>
          <div className="mx-auto grid max-w-[800px] grid-cols-2 gap-4 lg:grid-cols-4">
            {REGISTRATIONS.map((r) => (
              <div key={r} className="flex flex-col items-center gap-2.5 rounded-md bg-sky-mist px-3 py-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-vyoma-blue text-white">✓</div>
                <div className="font-sans text-[17px] font-bold text-charcoal">{r}</div>
              </div>
            ))}
          </div>
          <div className="mt-7">
            <Link href="/credibility" className="font-sans text-base text-vyoma-blue underline">
              View our Credibility page
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-3 text-center font-sans text-h2 font-bold text-vyoma-blue">Vyoma&apos;s Activities</h2>
          <p className="mx-auto mb-9 max-w-[760px] text-center font-sans text-[17px] leading-normal text-charcoal">
            Comprehensively answering four questions about Saṃskṛta, Saṃskṛti and Saṃskāra (SSS).
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {HOME_ACTIVITIES.map((a, i) => (
              <ActivityCard key={a.q} a={a} i={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-8 text-center font-sans text-h2 font-bold text-vyoma-blue">What People Are Saying</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {HOME_TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-md bg-vyoma-blue p-6 transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)] hover:scale-[1.04] hover:shadow-inverse-hover"
              >
                <div className="mb-4 h-[140px] w-[140px]">
                  <ImagePlaceholder shape="rect" caption="Photo" />
                </div>
                <div className="mb-4 font-sans text-base italic leading-normal text-white">&ldquo;{t.quote}&rdquo;</div>
                <div className="font-sans font-bold text-[15px] text-white">{t.name}</div>
                <div className="font-sans text-sm text-[var(--text-inverse-muted)]">{t.role}</div>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center">
            <Link
              href="/media/testimonials"
              className="inline-flex items-center justify-center rounded-md bg-vyoma-blue px-[18px] py-2 font-sans text-sm font-semibold text-white hover:bg-vyoma-blue-deep"
            >
              Read more testimonials
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 items-center gap-6 bg-vyoma-blue px-8 py-12 sm:grid-cols-[1fr_auto]">
        <div>
          <Badge tone="inverse">For Corporates & CSR Partners</Badge>
          <h3 className="mt-3.5 font-sans text-[26px] font-bold text-white">Partner with us through CSR</h3>
        </div>
        <ContactCta subject="CSR partnership">Get CSR details</ContactCta>
      </section>

      <section className="flex flex-col items-start gap-2.5 bg-white px-8 py-7">
        <div className="font-sans text-[13px] font-bold uppercase tracking-[0.4px] text-charcoal">Co-Sponsors</div>
        <div className="flex items-center gap-5">
          {SPONSORS.map((s) => (
            <div
              key={s.id}
              title={s.name}
              className="flex items-center justify-center rounded-md border border-black/[0.08] p-0.5"
              style={{ width: s.width, height: s.height, background: s.bg }}
            >
              <img src={s.src} alt={s.name} className="max-h-full max-w-full object-contain" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActivityCard({ a, i }) {
  const word = a.q.split(' ')[0];
  const inner = (
    <div className="relative isolate flex min-h-[210px] flex-col justify-end gap-4 overflow-hidden rounded-2xl bg-vyoma-blue p-6 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_rgba(23,54,120,0.3)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1.5 -top-8 -z-10 select-none font-sans text-[150px] font-extrabold leading-none text-white opacity-[0.07]"
      >
        {word[0]}
      </span>
      <span className="font-sans text-[13px] font-bold tracking-[1.5px] text-white/55">{String(i + 1).padStart(2, '0')}</span>
      <h3 className="m-0 font-sans text-2xl font-bold text-white">{a.q}</h3>
      <span className="inline-flex items-center gap-2 font-sans text-[15px] font-semibold text-white">
        {a.label} <span>→</span>
      </span>
    </div>
  );
  return a.navHref ? (
    <Link href={a.navHref}>{inner}</Link>
  ) : (
    <a href={a.href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  );
}
