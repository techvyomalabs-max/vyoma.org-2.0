import Link from 'next/link';
import { getDonateContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { DonateCta } from '@/components/sections/CtaButtons';
import { Button } from '@/components/common/Button';
import { QuickDonate } from '@/components/sections/donate/QuickDonate';
import { SchemesGrid } from '@/components/sections/donate/SchemesGrid';

export const metadata = { title: 'Donate' };

export default async function DonatePage() {
  const { DONATION_SCHEMES } = await getDonateContent();

  return (
    <div className="font-sans">
      <section className="bg-vyoma-blue px-8 py-16 text-center">
        <div className="mb-1.5 font-sans text-xl text-white">{'शतहस्त समाहार सहस्रहस्त सं किर'}</div>
        <h1 className="mx-auto max-w-[760px] font-sans text-h1 font-bold leading-tight text-white">
          Earn with a hundred hands, give with a thousand.
        </h1>
        <div className="mt-2.5 font-sans text-sm italic text-[var(--text-inverse-muted)]">Atharva Saṃhitā 5.30.5</div>
        <p className="mx-auto mt-[18px] max-w-[620px] font-sans text-lg leading-normal text-[var(--text-inverse-muted)]">
          Your gift keeps Sanskrit education free and open to all across India.
        </p>
        <div className="mt-[26px]">
          <DonateCta>Donate Now</DonateCta>
        </div>
      </section>

      <QuickDonate />
      <SchemesGrid schemes={DONATION_SCHEMES} />

      <section className="bg-white px-8 py-14">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-6 font-sans text-h2 font-bold text-vyoma-blue">Other ways to give</h2>
          <div className="mb-8 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
            <div className="rounded-md border border-[var(--border-subtle)] px-[22px] py-6">
              <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">Annual Subscription Plan</div>
              <p className="mb-[18px] font-sans text-[15px] leading-normal text-charcoal">Give regularly through the year.</p>
              <Button variant="outline">Set up a plan</Button>
            </div>
            <div className="rounded-md border border-[var(--border-subtle)] px-[22px] py-6">
              <div className="mb-2 font-sans text-lg font-bold text-vyoma-blue">CSR & Corpus</div>
              <p className="mb-[18px] font-sans text-[15px] leading-normal text-charcoal">For companies and endowment gifts.</p>
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
          <div className="rounded-md bg-sky-mist px-[26px] py-7">
            <div className="mb-4 font-sans text-lg font-bold text-vyoma-blue">Direct bank transfer</div>
            <div className="mb-4 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
              <div>
                <div className="mb-1.5 font-sans text-sm font-bold text-charcoal">Indian account — City Union Bank</div>
                <div className="font-sans text-sm leading-[1.7] text-charcoal">
                  Account name: Vyoma Linguistic Labs Foundation
                  <br />
                  Bank: City Union Bank
                  <br />
                  Branch & IFSC: provided on request
                </div>
              </div>
              <div>
                <div className="mb-1.5 font-sans text-sm font-bold text-charcoal">FCRA account — State Bank of India</div>
                <div className="font-sans text-sm leading-[1.7] text-charcoal">
                  Account name: Vyoma Linguistic Labs Foundation
                  <br />
                  Bank: State Bank of India (FCRA)
                  <br />
                  Branch & SWIFT: provided on request
                </div>
              </div>
            </div>
            <p className="font-sans text-sm text-charcoal">
              Foreign donors: please follow the FCRA guidelines and email your transfer details to{' '}
              <a href="mailto:accounts@vyomalabs.in" className="font-bold text-vyoma-blue">
                accounts@vyomalabs.in
              </a>{' '}
              for a receipt.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-vyoma-blue px-8 py-6">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-center gap-5 font-sans text-lg text-white">
          <span>80G tax benefit (India)</span>
          <span className="opacity-50">·</span>
          <span>FCRA-registered for foreign gifts</span>
          <span className="opacity-50">·</span>
          <span>Receipt provided</span>
          <Link
            href="/credibility/compliances-registrations"
            className="inline-flex items-center justify-center rounded-md border-[1.5px] border-white px-4 py-1.5 font-sans text-xs font-semibold text-white hover:bg-white hover:text-vyoma-blue"
          >
            See our full transparency record
          </Link>
        </div>
      </section>

      <section className="bg-white px-8 py-10 text-center">
        <div className="font-sans text-[22px] font-bold text-vyoma-blue">Support Sanskrit. Support mankind.</div>
      </section>
    </div>
  );
}
