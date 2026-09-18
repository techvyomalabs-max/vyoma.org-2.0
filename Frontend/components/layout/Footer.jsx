import Link from 'next/link';
import { FOOTER_LINKS, SOCIAL_LINKS } from '@/lib/navConfig';

const SOCIAL_ICON_PATHS = {
  facebook:
    'M13 3h4v4h-2c-.6 0-1 .4-1 1v2h3v4h-3v7h-4v-7H8v-4h2V7c0-2.2 1.8-4 4-4z',
  youtube:
    'M23 8s-.2-1.6-.8-2.3c-.8-.9-1.7-.9-2.1-1C17 4.5 12 4.5 12 4.5s-5 0-8.1.2c-.4.1-1.3.1-2.1 1C1.2 6.4 1 8 1 8S.8 9.9.8 11.8v.4C.8 14.1 1 16 1 16s.2 1.6.8 2.3c.8.9 1.9.9 2.4 1 1.7.2 7.3.2 7.8.2s5-.1 8.1-.2c.4-.1 1.3-.1 2.1-1 .6-.7.8-2.3.8-2.3s.2-1.9.2-3.8v-.4C23.2 9.9 23 8 23 8zM9.7 15V9l6 3-6 3z',
  x: 'M18.9 3H22l-7 8 7.7 10h-6l-4.7-6.2L6.6 21H3.4l7.5-8.6L3 3h6.1l4.3 5.7z',
  linkedin:
    'M4.1 8.7h3.7V20H4.1zM5.9 3.4c1.2 0 2.1.9 2.1 2s-.9 2-2.1 2-2.1-.9-2.1-2 .9-2 2.1-2zM10 8.7h3.6v1.6h.1c.5-.9 1.7-1.9 3.5-1.9 3.7 0 4.4 2.2 4.4 5.1V20h-3.7v-5.8c0-1.4 0-3.1-2-3.1s-2.2 1.5-2.2 3v5.9H10z',
  whatsapp:
    'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.87.5 3.62 1.44 5.13L2 22l5.13-1.53a9.85 9.85 0 0 0 4.91 1.32h.01c5.46 0 9.9-4.45 9.9-9.9C21.96 6.45 17.5 2 12.04 2zm5.79 14.1c-.24.68-1.4 1.31-1.93 1.4-.5.08-1.13.11-1.83-.11-.42-.13-.96-.31-1.65-.6-2.9-1.25-4.79-4.16-4.93-4.35-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.02-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .56.01.18.01.42-.07.65.5.24.58.81 2 .89 2.14.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.14-.3.3-.13.6.17.3.77 1.28 1.65 2.07 1.13 1.01 2.09 1.32 2.39 1.47.3.14.48.12.65-.07.18-.19.75-.87.95-1.17.19-.3.39-.25.65-.15.27.1 1.68.79 1.97.93.29.15.48.22.55.34.08.13.08.7-.16 1.38z',
};

export function Footer() {
  return (
    <footer className="flex flex-col items-end gap-4 bg-sky-mist px-8 py-7">
      <div className="flex items-center justify-end gap-5">
        {FOOTER_LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="font-sans text-base text-vyoma-blue transition-colors duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:text-charcoal"
          >
            {l.label}
          </Link>
        ))}
        <div className="ml-2 flex gap-3">
          {SOCIAL_LINKS.map((s) => (
            <a key={s.slug} href="#" title={s.name} className="block h-[18px] w-[18px]">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="var(--color-vyoma-blue)">
                <path d={SOCIAL_ICON_PATHS[s.slug]} />
              </svg>
            </a>
          ))}
        </div>
      </div>
      <div className="w-full self-start break-words font-sans text-sm text-charcoal">
        © 2026 Vyoma Linguistic Labs Foundation. All rights reserved.
      </div>
    </footer>
  );
}
