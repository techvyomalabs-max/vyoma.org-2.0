import { getOurWorkContent } from '@/services/pageService';
import { getPublicSettings } from '@/services/settingsService';
import { CurrentWorkStage } from '@/components/sections/ourWork/CurrentWorkStage';
import { CtaStrip } from '@/components/sections/CtaStrip';
import { DonateCta, ContactCta } from '@/components/sections/CtaButtons';
import { pageMetadata } from '@/lib/seo';

// PENDING ROUTE: not in the LLD route table (Phase 1 conflict — LLD defines a
// single /our-work page). Preserved per instruction until final route
// approval; see lib/navConfig.js.
// Task 7R.1: deferred to request time so a build-time-unreachable backend
// (DNS failure, transient outage) cannot fail `next build` — see
// Frontend/lib/apiConfig.js and services/apiClient.js's networkError
// handling for the request-time behavior this preserves.
export const dynamic = 'force-dynamic';

export const metadata = pageMetadata({
  path: '/our-work/current',
  title: 'Current Work',
  description: 'Everything Vyoma runs today — the platforms that make Sanskrit accessible to all, and the programmes that carry it into classrooms, homes, and communities.',
});

export default async function CurrentWorkPage() {
  const [{ CW_PLATFORMS, CW_PROGRAMMES }, settings] = await Promise.all([getOurWorkContent(), getPublicSettings()]);

  return (
    <div className="font-sans">
      <CurrentWorkStage platforms={CW_PLATFORMS} programmes={CW_PROGRAMMES} socialLinks={settings.socialLinks} />
      <CtaStrip badge="Support & Partnerships" heading="Want to support this work?">
        <DonateCta />
        <ContactCta subject="Institutional partnership">Partner with us</ContactCta>
      </CtaStrip>
    </div>
  );
}
