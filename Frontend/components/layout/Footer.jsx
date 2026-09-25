import Link from 'next/link';
import { FOOTER_LINKS, PLATFORM_LINKS } from '@/lib/navConfig';
import { getPublicSettings } from '@/services/settingsService';

const SOCIAL_ICON_PATHS = {
  facebook:
    'M13 3h4v4h-2c-.6 0-1 .4-1 1v2h3v4h-3v7h-4v-7H8v-4h2V7c0-2.2 1.8-4 4-4z',
  youtube:
    'M23 8s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C17 4.5 12 4.5 12 4.5s-5 0-8.1.2c-.4.1-1.3.1-2.1 1C1.2 6.4 1 8 1 8S.8 9.9.8 11.8v.4C.8 14.1 1 16 1 16s.2 1.6.8 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.3.2 7.8.2s5-.1 8.1-.2c.4-.1 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.8v-.4C23.2 9.9 23 8 23 8zM9.7 15V9l6 3-6 3z',
  x: 'M18.9 3H22l-7 8 7.7 10h-6l-4.7-6.2L6.6 21H3.4l7.5-8.6L3 3h6.1l4.3 5.7z',
  instagram:
    'M12 2.2c3.2 0 3.6 0 4.9.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8 0 3.2 0 3.6-.1 4.8-.1 3.3-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.9.1-3.2 0-3.6 0-4.8-.1-3.3-.1-4.8-1.7-4.9-4.9-.1-1.3-.1-1.6-.1-4.8 0-3.2 0-3.6.1-4.8.1-3.3 1.7-4.8 4.9-4.9C8.4 2.2 8.8 2.2 12 2.2zm0 3.5a6.3 6.3 0 1 0 0 12.6 6.3 6.3 0 0 0 0-12.6zm0 10.4a4.1 4.1 0 1 1 0-8.2 4.1 4.1 0 0 1 0 8.2zm6.4-10.6a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0z',
  linkedin:
    'M4.1 8.7h3.7V20H4.1zM5.9 3.4c1.2 0 2.1.9 2.1 2s-.9 2-2.1 2-2.1-.9-2.1-2 .9-2 2.1-2zM10 8.7h3.6v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.2 4.4 5.1V20h-3.7v-5.8c0-1.4 0-3.1-2-3.1s-2.2 1.5-2.2 3v5.9H10z',
};

// The Settings-backed social platforms this footer knows how to render —
// WhatsApp was dropped (no approved URL, no Settings field for it, and a
// dead placeholder is worse than omitting it). LinkedIn stays listed here
// but only ever renders once settings.socialLinks.linkedin is a real,
// approved URL — until then it's simply absent, never fabricated.
const SOCIAL_PLATFORMS = [
  { slug: 'facebook', name: 'Facebook' },
  { slug: 'youtube', name: 'YouTube' },
  { slug: 'instagram', name: 'Instagram' },
  { slug: 'x', name: 'X' },
  { slug: 'linkedin', name: 'LinkedIn' },
];

function FooterLink({ label, href, external }) {
  const className =
    'font-sans text-base text-vyoma-blue transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:text-charcoal';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

// Server Component — reads socialLinks from Settings (same source of truth
// the Contact page already uses) rather than any hardcoded/duplicated URL.
export async function Footer() {
  const settings = await getPublicSettings();
  const socialLinks = settings.socialLinks || {};

  return (
    <footer className="flex flex-col items-end gap-5 bg-sky-mist px-8 py-7">
      <div className="flex w-full flex-wrap items-start justify-between gap-6">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <span className="mr-1 font-sans text-xs font-bold uppercase tracking-wide text-charcoal/60">Our Platforms</span>
          {PLATFORM_LINKS.map((l) => (
            <FooterLink key={l.label} label={l.label} href={l.href} external={l.external} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-5">
          {FOOTER_LINKS.map((l) => (
            <FooterLink key={l.label} label={l.label} href={l.href} external={l.external} />
          ))}
          <div className="ml-2 flex gap-3">
            {SOCIAL_PLATFORMS.filter((p) => socialLinks[p.slug]).map((p) => (
              <a
                key={p.slug}
                href={socialLinks[p.slug]}
                target="_blank"
                rel="noopener noreferrer"
                title={p.name}
                className="block h-[18px] w-[18px]"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--color-vyoma-blue)">
                  <path d={SOCIAL_ICON_PATHS[p.slug]} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full self-start break-words font-sans text-sm text-charcoal">
        © 2026 Vyoma Linguistic Labs Foundation. All rights reserved.
      </div>
    </footer>
  );
}
