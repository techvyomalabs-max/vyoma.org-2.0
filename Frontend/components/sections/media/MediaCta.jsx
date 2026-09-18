import { CtaStrip } from '@/components/sections/CtaStrip';
import { ContactCta } from '@/components/sections/CtaButtons';

// The "Press & Media" CTA strip that closes almost every Media sub-page
// (landing, Blog, Blog detail, Press, Events, Newsletter). Testimonials and
// Gallery use their own distinct closing CTAs instead — see those pages.
export function MediaCta() {
  return (
    <CtaStrip badge="Press & Media" heading="Working on a story about Vyoma?">
      <ContactCta subject="Press & media">Contact our team</ContactCta>
    </CtaStrip>
  );
}
