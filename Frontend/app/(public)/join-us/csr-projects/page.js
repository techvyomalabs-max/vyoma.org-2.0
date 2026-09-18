import { getJoinUsContent } from '@/services/pageService';
import { Badge } from '@/components/common/Badge';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';
import { CSRProjectsBoard } from '@/components/sections/joinUs/CSRProjectsBoard';

export const metadata = { title: 'CSR Projects' };

export default async function CsrProjectsPage() {
  const { CSR_PROJECTS } = await getJoinUsContent();

  return (
    <div className="font-sans">
      {/* Custom hero: badge appears below the body, which PageHero doesn't support. */}
      <section className="bg-vyoma-blue px-8 py-14 text-center">
        <h1 className="mx-auto mb-3.5 font-sans text-h1 font-bold leading-tight text-white">CSR Projects</h1>
        <p className="mx-auto mb-4 max-w-[700px] font-sans text-lg leading-normal text-[var(--text-inverse-muted)]">
          Partner with Vyoma on measurable CSR impact in Sanskrit education and India&apos;s knowledge systems.
        </p>
        <Badge tone="inverse">CSR-registered with MCA · Registration No. CSR00025464</Badge>
      </section>

      <section className="bg-white px-8 py-12 text-center">
        <p className="mx-auto max-w-[780px] font-sans text-lg leading-normal text-charcoal">
          Fourteen ways to partner — from a flagship infrastructure project to focused education and heritage initiatives. Each is open for full or matching-grant CSR support.
        </p>
      </section>

      <CSRProjectsBoard projects={CSR_PROJECTS} />

      <CtaStrip badge="CSR Partnership" heading="Have a specific mandate?">
        <ContactCta subject="CSR partnership">Talk to our CSR team</ContactCta>
      </CtaStrip>
    </div>
  );
}
