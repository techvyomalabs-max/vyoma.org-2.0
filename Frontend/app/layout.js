import { Noto_Serif_Devanagari, Source_Sans_3 } from 'next/font/google';
import './globals.css';
import { getPublicSettings } from '@/services/settingsService';
import { organizationJsonLd, websiteJsonLd, jsonLdScriptProps } from '@/lib/seo';

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-source-sans',
  display: 'swap',
});

const notoDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-noto-devanagari',
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL('https://vyoma.org'),
  title: {
    default: 'Vyoma Linguistic Labs Foundation',
    template: '%s | Vyoma Linguistic Labs Foundation',
  },
  description:
    "Support India's largest free Sanskrit e-learning platform, making Saṃskṛtam accessible to all, at global scale, with full financial transparency.",
  // Presence of this object (even with no title/description of its own) is
  // enough for Next.js to synthesize og:title/og:description per page from
  // each page's own title/description — no per-page duplication needed.
  openGraph: {
    type: 'website',
    siteName: 'Vyoma Linguistic Labs Foundation',
    locale: 'en_US',
  },
  // Same inheritance mechanic as openGraph above: Next.js synthesizes
  // twitter:title/description per page from each page's own title/
  // description once this object is present, even with no fields of its
  // own. `summary_large_image` degrades gracefully to a text-only card on
  // pages with no image (most pages today) — not an error, just a smaller
  // card, the same way it already behaves before any page supplies an image.
  twitter: {
    card: 'summary_large_image',
  },
};

// Async layout (Server Component) so it can read the same real,
// already-public Settings.socialLinks Footer.jsx already renders from —
// never a second, hardcoded copy of the same data. A platform with no
// configured URL (e.g. LinkedIn while null) is simply omitted from the
// Organization JSON-LD's `sameAs`, exactly like the Footer's own existing
// behavior.
export default async function RootLayout({ children }) {
  const settings = await getPublicSettings();
  const socialLinks = settings.socialLinks || {};

  return (
    <html lang="en" className={`${sourceSans.variable} ${notoDevanagari.variable}`}>
      <body>
        <script type="application/ld+json" {...jsonLdScriptProps(organizationJsonLd(socialLinks))} />
        <script type="application/ld+json" {...jsonLdScriptProps(websiteJsonLd())} />
        {children}
      </body>
    </html>
  );
}
