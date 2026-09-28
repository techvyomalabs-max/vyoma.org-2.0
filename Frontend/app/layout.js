import { Noto_Serif_Devanagari, Source_Sans_3 } from 'next/font/google';
import './globals.css';

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
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${notoDevanagari.variable}`}>
      <body>{children}</body>
    </html>
  );
}
