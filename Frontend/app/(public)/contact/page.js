import { getContactContent } from '@/services/pageService';
import { PageHero } from '@/components/sections/PageHero';
import { ContactPageForm } from '@/components/sections/contact/ContactPageForm';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/contact',
  title: 'Contact Us',
  description: "We'd love to hear from you — whether you're considering a donation, exploring a CSR partnership, or simply have a question about our work.",
});

const socialIconPath = {
  facebook: 'M13 3h4v4h-2c-.6 0-1 .4-1 1v2h3v4h-3v7h-4v-7H8v-4h2V7c0-2.2 1.8-4 4-4z',
  x: 'M18.9 3H22l-7 8 7.7 10h-6l-4.7-6.2L6.6 21H3.4l7.5-8.6L3 3h6.1l4.3 5.7z',
  youtube:
    'M23 8s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C17 4.5 12 4.5 12 4.5s-5 0-8.1.2c-.4.1-1.3.1-2.1 1C1.2 6.4 1 8 1 8S.8 9.9.8 11.8v.4C.8 14.1 1 16 1 16s.2 1.6.8 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.3.2 7.8.2s5-.1 8.1-.2c.4-.1 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.8v-.4C23.2 9.9 23 8 23 8zM9.7 15V9l6 3-6 3z',
  linkedin:
    'M4.1 8.7h3.7V20H4.1zM5.9 3.4c1.2 0 2.1.9 2.1 2s-.9 2-2.1 2-2.1-.9-2.1-2 .9-2 2.1-2zM10 8.7h3.6v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.2 4.4 5.1V20h-3.7v-5.8c0-1.4 0-3.1-2-3.1s-2.2 1.5-2.2 3v5.9H10z',
  whatsapp:
    'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.5 3.62 1.44 5.13L2 22l5.13-1.53a9.85 9.85 0 0 0 4.91 1.32h.01c5.46 0 9.9-4.45 9.9-9.9C21.96 6.45 17.5 2 12.04 2zm5.79 14.1c-.24.68-1.4 1.31-1.93 1.4-.5.08-1.13.11-1.83-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.79-4.16-4.93-4.35-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.81 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.14-.3.3-.13.6.17.3.77 1.28 1.65 2.07 1.13 1.01 2.09 1.32 2.39 1.47.3.14.48.12.65-.07.18-.19.75-.87.95-1.17.19-.3.39-.25.65-.15.27.1 1.68.79 1.97.93.29.15.48.22.55.34.08.13.08.7-.16 1.38z',
};

export default async function ContactPage() {
  const { CONTACT_REASONS, CONTACT_SOCIAL } = await getContactContent();

  return (
    <div className="font-sans">
      <PageHero
        eyebrow="Get in touch"
        title="Contact Us"
        body="We'd love to hear from you — whether you're considering a donation, exploring a CSR partnership, or simply have a question about our work."
        maxWidth="max-w-[760px]"
      />

      <section className="bg-sky-mist px-8 py-14">
        <div className="mx-auto grid max-w-[1040px] items-start gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))' }}>
          <div className="flex flex-col gap-8">
            <div className="rounded-md border border-[var(--border-subtle)] border-t-[3px] border-t-amber-gold bg-white px-[26px] py-7">
              <ContactPageForm reasons={CONTACT_REASONS} />
            </div>
            <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] shadow-sm">
              <iframe
                title="Vyoma working office location"
                src="https://www.google.com/maps?q=NGEF+Layout+2nd+Block+Nagarabhavi+Bangalore+560072&output=embed"
                width="100%"
                height="280"
                className="block border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <div>
            <h2 className="mb-5 font-sans text-h3 font-bold text-vyoma-blue">Contact details</h2>
            <div className="flex flex-col gap-[18px]">
              <div>
                <div className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal/60">Email</div>
                <div className="font-sans text-base text-charcoal">
                  <a href="mailto:support@vyomalabs.in" className="font-bold text-vyoma-blue">
                    support@vyomalabs.in
                  </a>
                </div>
              </div>
              <div>
                <div className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal/60">
                  Call / SMS / WhatsApp
                </div>
                <div className="font-sans text-base leading-[1.6] text-charcoal">
                  <a href="tel:+919480865623" className="font-bold text-vyoma-blue">
                    +91-9480865623
                  </a>
                  <br />
                  10 am – 7 pm India Time
                  <br />
                  (Monday to Saturday)
                </div>
              </div>
              <div>
                <div className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal/60">
                  Registered Office
                </div>
                <div className="font-sans text-base leading-[1.6] text-charcoal">
                  #155, 2nd floor, 4th Cross, GKW Layout,
                  <br />
                  Vijayanagar, Bangalore,
                  <br />
                  Karnataka – 560040
                </div>
              </div>
              <div>
                <div className="mb-1 font-sans text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal/60">
                  Working Office
                </div>
                <div className="font-sans text-base leading-[1.6] text-charcoal">
                  #84, 3rd Cross, NGEF Layout, 2nd Block,
                  <br />
                  Opp Fortis Hospital, Nagarabhavi.
                  <br />
                  Bangalore – 560072
                  <br />
                  <a
                    href="https://maps.app.goo.gl/BTeZZDvc26LqExqK8"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-vyoma-blue"
                  >
                    View on Google Maps
                  </a>
                </div>
              </div>
            </div>

            <p className="mt-5 font-sans text-[13px] leading-normal text-charcoal/70">
              Vyoma Linguistic Labs Foundation is registered under FCRA, 80G, 12A, and CSR-1. [Insert registration
              numbers if they should be shown here.]
            </p>

            <div className="mt-6">
              <div className="mb-2.5 font-sans text-[13px] font-bold uppercase tracking-[0.04em] text-charcoal/60">
                Follow us
              </div>
              <div className="flex gap-3.5">
                {CONTACT_SOCIAL.map((slug) => (
                  <a key={slug} href="#" title={slug} className="block h-[22px] w-[22px]">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="var(--color-vyoma-blue)">
                      <path d={socialIconPath[slug]} />
                    </svg>
                  </a>
                ))}
              </div>
              <p className="mt-3 rounded-sm border border-dashed border-amber-gold bg-amber-gold/10 px-2.5 py-2 font-sans text-xs leading-normal text-[#9a6a00]">
                <strong>Handoff note:</strong> Confirm final social handles — Facebook, Twitter/X, YouTube, LinkedIn
                per the SEO audit&apos;s confirmed live accounts. No Instagram (no dedicated vyoma.org account).
              </p>
            </div>

            <p className="mt-6 border-t border-[var(--border-subtle)] pt-5 font-sans text-sm leading-normal text-charcoal">
              For Sanskrit course enrollment or learner support, visit{' '}
              <a href="https://sanskritfromhome.org" target="_blank" rel="noopener noreferrer" className="font-bold text-vyoma-blue">
                sanskritfromhome.org
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
