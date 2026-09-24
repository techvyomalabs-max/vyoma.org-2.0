import Link from 'next/link';
import { getHomeContent } from '@/services/pageService';
import { StatCard } from '@/components/common/StatCard';
import { TopicPill } from '@/components/common/TopicPill';
import { Badge } from '@/components/common/Badge';
import { ImagePlaceholder } from '@/components/common/ImagePlaceholder';
import { HeroCarousel } from '@/components/sections/home/HeroCarousel';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { pageMetadata } from '@/lib/seo';

const active = (items) => items.filter((item) => item.active !== false);

export async function generateMetadata() {
  const { SEO } = await getHomeContent();
  const meta = pageMetadata({ path: '/', title: SEO?.title || undefined, description: SEO?.description || undefined });
  if (SEO?.ogImage?.url) {
    meta.openGraph = { images: [{ url: SEO.ogImage.url }] };
  }
  return meta;
}

export default async function HomePage() {
  const { HERO_SLIDES, STATS, TOPICS, REGISTRATIONS, HOME_ACTIVITIES, HOME_TESTIMONIALS, CSR, SPONSORS } =
    await getHomeContent();

  return (
    <div className="font-sans">
      <HeroCarousel slides={active(HERO_SLIDES)} />

      <section className="bg-vyoma-blue px-8 pb-14 pt-10">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {active(STATS).map((s) => (
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
        {active(TOPICS).map((t) => (
          <TopicPill key={t.label}>{t.label}</TopicPill>
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
            {active(REGISTRATIONS).map((r) => (
              <RegistrationCard key={r.title} r={r} />
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
            {active(HOME_ACTIVITIES).map((a, i) => (
              <ActivityCard key={a.title} a={a} i={i} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-8 text-center font-sans text-h2 font-bold text-vyoma-blue">What People Are Saying</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {active(HOME_TESTIMONIALS).map((t) => (
              <div
                key={t.name}
                className="rounded-md bg-vyoma-blue p-6 transition-all duration-[var(--duration-normal)] ease-[var(--ease-standard)] hover:scale-[1.04] hover:shadow-inverse-hover"
              >
                <div className="mb-4 h-[140px] w-[140px]">
                  <ImagePlaceholder src={t.image?.url} alt={t.image?.alt || t.name} shape="rect" caption="Photo" />
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
          <Badge tone="inverse">{CSR.badge}</Badge>
          <h3 className="mt-3.5 font-sans text-[26px] font-bold text-white">{CSR.heading}</h3>
        </div>
        <ContactCta subject={CSR.ctaSubject}>{CSR.ctaLabel}</ContactCta>
      </section>

      <section className="flex flex-col items-start gap-2.5 bg-white px-8 py-7">
        <div className="font-sans text-[13px] font-bold uppercase tracking-[0.4px] text-charcoal">Co-Sponsors</div>
        <div className="flex flex-wrap items-center gap-5">
          {active(SPONSORS).map((s) => (
            <SponsorLogo key={s.name} s={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RegistrationCard({ r }) {
  const content = (
    <div className="flex flex-col items-center gap-2.5 rounded-md bg-sky-mist px-3 py-5">
      {r.image?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image.url} alt={r.image.alt || r.title} className="h-9 w-9 rounded-full object-contain" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-vyoma-blue text-white">✓</div>
      )}
      <div className="font-sans text-[17px] font-bold text-charcoal">{r.title}</div>
      {r.supportingText && <div className="font-sans text-xs text-charcoal/70">{r.supportingText}</div>}
    </div>
  );
  if (!r.link?.href) return content;
  return r.link.external ? (
    <a href={r.link.href} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <Link href={r.link.href}>{content}</Link>
  );
}

function SponsorLogo({ s }) {
  const box = (
    <div
      title={s.name}
      className="flex items-center justify-center rounded-md border border-black/[0.08] p-0.5"
      style={{ width: s.width, height: s.height, background: s.bg }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.logo?.url} alt={s.logo?.alt || s.name} className="max-h-full max-w-full object-contain" />
    </div>
  );
  return s.website ? (
    <a href={s.website} target="_blank" rel="noopener noreferrer">
      {box}
    </a>
  ) : (
    box
  );
}

function ActivityCard({ a, i }) {
  const word = a.title.split(' ')[0];
  const inner = (
    <div className="relative isolate flex min-h-[210px] flex-col justify-end gap-4 overflow-hidden rounded-2xl bg-vyoma-blue p-6 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_rgba(23,54,120,0.3)]">
      {a.icon?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.icon.url}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-4 -z-10 h-24 w-24 object-contain opacity-20"
        />
      ) : (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -top-8 -z-10 select-none font-sans text-[150px] font-extrabold leading-none text-white opacity-[0.07]"
        >
          {word[0]}
        </span>
      )}
      <span className="font-sans text-[13px] font-bold tracking-[1.5px] text-white/55">{String(i + 1).padStart(2, '0')}</span>
      <h3 className="m-0 font-sans text-2xl font-bold text-white">{a.title}</h3>
      {a.description && <p className="m-0 font-sans text-sm text-white/75">{a.description}</p>}
      <span className="inline-flex items-center gap-2 font-sans text-[15px] font-semibold text-white">
        {a.link.label} <span>→</span>
      </span>
    </div>
  );
  return a.link.external ? (
    <a href={a.link.href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    <Link href={a.link.href}>{inner}</Link>
  );
}
