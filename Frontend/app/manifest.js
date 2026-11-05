// Task 7J — Web App Manifest, via Next.js's App Router metadata-file
// convention (a default-exported function here is auto-served at
// /manifest.webmanifest and auto-linked into every page's <head>; no manual
// wiring in layout.js is needed or added).
//
// Icon asset: the only existing, approved Vyoma brand asset in this repo is
// public/images/logo-white.png (already used by Header.jsx and
// lib/seo.js's organizationJsonLd()) -- reused here by reference, not
// duplicated. KNOWN LIMITATION, not fixed here (explicit instruction: reuse
// existing assets, never invent or redesign the logo): this file is white
// artwork on a transparent background, 2100x1021 (not square), with a fine
// tagline baked into the image. It was designed to sit on the site's own
// vyoma-blue header background (see Header.jsx), not as a standalone app
// icon/favicon -- rendered on a light home-screen or browser-chrome
// background it will likely appear faint or blank, and any OS that scales
// it to a small square icon will crop or distort the wide aspect ratio.
// `background_color` below is set to the same vyoma-blue the logo is
// designed against (app/globals.css's --color-vyoma-blue), so at minimum
// the PWA splash screen itself (which briefly shows before CSS loads)
// renders the mark the way it actually looks in production. A dedicated
// square icon mark from Vyoma's design/brand owner would resolve this
// properly; flagged in the Task 7J report rather than approximated here.
export default function manifest() {
  return {
    name: 'Vyoma Linguistic Labs Foundation',
    short_name: 'Vyoma',
    description:
      "Support India's largest free Sanskrit e-learning platform, making Saṃskṛtam accessible to all, at global scale, with full financial transparency.",
    start_url: '/',
    display: 'standalone',
    background_color: '#0f62b3',
    theme_color: '#0f62b3',
    icons: [
      {
        src: '/images/logo-white.png',
        type: 'image/png',
        sizes: '2100x1021',
      },
    ],
  };
}
