import Link from 'next/link';
import { getDonateContent } from '@/services/pageService';
import { getDonationSchemes } from '@/services/donationService';
import { getPublicSettings } from '@/services/settingsService';
import { DonateCta } from '@/components/sections/CtaButtons';
import { Button } from '@/components/common/Button';
import { QuickDonate } from '@/components/sections/donate/QuickDonate';
import { SchemesGrid } from '@/components/sections/donate/SchemesGrid';
import { pageMetadata } from '@/lib/seo';

export async function generateMetadata() {
  const { SEO } = await getDonateContent();
  const meta = pageMetadata({ path: '/donate', title: SEO?.title || undefined, description: SEO?.description || 'Your gift keeps Sanskrit education free and open to all across India.' });
  if (SEO?.ogImage?.url) meta.openGraph = { images: [{ url: SEO.ogImage.url }] };
  return meta;
}

export default async function DonatePage() {
  const { HERO, OTHER_WAYS, BANK_TRANSFER, COMPLIANCE_STRIP, CLOSING_TAGLINE } = await getDonateContent();
  // Phase D: schemes now come from DonationSchemeModel (the same source
  // checkout validates against), not the Content model — see
  // donations.controller.js's listDonationSchemes.
  const [schemes, settings] = await Promise.all([getDonationSchemes(), getPublicSettings()]);
  const bank = settings.donationBankDetails || {};

  return (
    <div className="font-sans">
      <section className="bg-vyoma-blue px-8 py-16 text-center">
        <div className="mb-1.5 font-sans text-xl text-white">{HERO.verse}</div>
        <h1 className="mx-auto max-w-[760px] font-sans text-h1 font-bold leading-tight text-white">{HERO.title}</h1>
        <div className="mt-2.5 font-sans text-sm italic text-[var(--text-inverse-muted)]">{HERO.citation}</div>
        <p className="mx-auto mt-[18px] max-w-[620px] font-sans text-lg leading-normal text-[var(--text-inverse-muted)]">
          {HERO.body}
        </p>
        <div className="mt-[26px]">
          <DonateCta>{HERO.ctaLabel}</DonateCta>
        </div>
      </section>

      <QuickDonate />
      <SchemesGrid schemes={schemes} />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Other ways to give</h2>
          <div className="mb-8 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            <div className="rounded-md border border-[var(--border-subtle)] px-[22px] py-6">
              <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{OTHER_WAYS.subscriptionHeading}</div>
              <p className="mb-[18px] font-sans text-[15px] leading-normal text-charcoal">{OTHER_WAYS.subscriptionBody}</p>
              <Button variant="outline">{OTHER_WAYS.subscriptionCtaLabel}</Button>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] px-[22px] py-6">
              <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">{OTHER_WAYS.csrHeading}</div>
              <p className="mb-[18px] font-sans text-[15px] leading-normal text-charcoal">{OTHER_WAYS.csrBody}</p>
              <div className="flex flex-wrap gap-2.5">
                <Link href="/join-us/csr-projects" className="inline-flex items-center justify-center rounded-md border border-vyoma-blue px-[18px] py-2 font-sans text-sm font-semibold text-vyoma-blue hover:bg-vyoma-blue hover:text-white">
                  CSR Projects
                </Link>
                <Link href="/join-us/corpus-fund" className="inline-flex items-center justify-center rounded-md border border-vyoma-blue px-[18px] py-2 font-sans text-sm font-semibold text-vyoma-blue hover:bg-vyoma-blue hover:text-white">
                  Corpus Fund
                </Link>
              </div>
            </div>
          </div>
          <div id="bank-transfer" className="rounded-md bg-sky-mist px-[26px] py-7">
            <div className="mb-4 font-sans text-lg font-bold text-vyoma-blue">{BANK_TRANSFER.heading}</div>
            <div className="mb-4 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              <div>
                <div className="mb-1.5 font-sans text-sm font-bold text-charcoal">Indian account{bank.indiaBankName ? ` — ${bank.indiaBankName}` : ''}</div>
                <div className="font-sans text-sm leading-[1.7] text-charcoal">
                  Account name: {bank.indiaAccountName || 'Provided on request'}
                  <br />
                  Bank: {bank.indiaBankName || 'Provided on request'}
                  <br />
                  Branch & IFSC: provided on request
                </div>
              </div>
              <div>
                <div className="mb-1.5 font-sans text-sm font-bold text-charcoal">FCRA account{bank.fcraBankName ? ` — ${bank.fcraBankName}` : ''}</div>
                <div className="font-sans text-sm leading-[1.7] text-charcoal">
                  Account name: {bank.fcraAccountName || 'Provided on request'}
                  <br />
                  Bank: {bank.fcraBankName || 'Provided on request'}
                  <br />
                  Branch & SWIFT: provided on request
                </div>
              </div>
            </div>
            <p className="font-sans text-sm text-charcoal">
              {BANK_TRANSFER.foreignNote}
              {settings.financeContactEmail && (
                <>
                  {' '}
                  <a href={`mailto:${settings.financeContactEmail}`} className="font-bold text-vyoma-blue">
                    {settings.financeContactEmail}
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-vyoma-blue px-8 py-6">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-5 font-sans text-lg text-white">
          {COMPLIANCE_STRIP.items.map((item, i) => (
            <span key={item}>
              {item}
              {i < COMPLIANCE_STRIP.items.length - 1 && <span className="ml-5 opacity-50">·</span>}
            </span>
          ))}
          <Link
            href="/credibility/compliances-registrations"
            className="inline-flex items-center justify-center rounded-md border-[1.5px] border-white px-4 py-1.5 font-sans text-xs font-semibold text-white hover:bg-white hover:text-vyoma-blue"
          >
            {COMPLIANCE_STRIP.ctaLabel}
          </Link>
        </div>
      </section>

      <section className="bg-white px-8 py-10 text-center">
        <div className="font-sans text-[22px] font-bold text-vyoma-blue">{CLOSING_TAGLINE}</div>
      </section>
    </div>
  );
}
