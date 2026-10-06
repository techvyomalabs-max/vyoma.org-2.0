// Route table per LLD Section 3 (Frontend Route Design).
// Items marked pending: true are preserved from the source design system but are
// NOT in the LLD's route table (see Phase 1 conflicts). They stay live until
// product gives final route approval, per instruction: "preserve all existing
// pages and routes initially."
export const NAV = [
  { label: 'Home', href: '/' },
  {
    label: 'About',
    href: '/about',
    children: [
      { label: 'Our Story / Timeline', href: '/about/our-story' },
      { label: 'Roadmap', href: '/about/roadmap' },
      { label: 'Leadership', href: '/about/leadership' },
      { label: 'Core Team', href: '/about/core-team' },
      { label: 'Our Patrons', href: '/about/patrons' },
    ],
  },
  {
    label: 'Our Work',
    href: '/our-work',
    children: [
      { label: 'Seven Schools', href: '/our-work' },
      { label: 'Current Work', href: '/our-work/current', pending: true },
      { label: 'Seven Schools + Current Work', href: '/our-work/all', pending: true },
    ],
  },
  { label: 'Impact', href: '/impact' },
  {
    label: 'Credibility',
    href: '/credibility',
    children: [
      { label: 'Collaterals', href: '/credibility/collaterals', pending: true },
      { label: 'Annual Reports', href: '/credibility/annual-reports' },
      { label: 'Social Impact Report', href: '/credibility/social-impact-report' },
      { label: 'Compliances & Registrations', href: '/credibility/compliances-registrations' },
      { label: 'Awards & Recognition', href: '/credibility/awards-recognition' },
    ],
  },
  {
    label: 'Media',
    href: '/media',
    children: [
      { label: 'Blog', href: '/media/blog' },
      { label: 'Press', href: '/media/press' },
      { label: 'Events', href: '/media/events' },
      { label: 'Testimonials', href: '/media/testimonials' },
      { label: 'Newsletter', href: '/media/newsletter' },
      { label: 'Gallery', href: '/media/gallery' },
      { label: 'Resources', href: '/media/resources' },
    ],
  },
  {
    label: 'Join Us',
    href: '/join-us',
    children: [
      { label: 'Volunteer', href: '/join-us/volunteer' },
      { label: 'Internship', href: '/join-us/internship' },
      { label: 'CSR Projects', href: '/join-us/csr-projects' },
      { label: 'Corpus Fund', href: '/join-us/corpus-fund' },
      { label: 'Careers / Jobs', href: '/join-us/careers' },
    ],
  },
];

export const CONTACT_LINK = { label: 'Contact Us', href: '/contact' };
export const DONATE_LINK = { label: 'Donate', href: '/donate' };
export const FAQ_LINK = { label: 'FAQ', href: '/faq' };

// Privacy/Terms now point at the migrated internal routes (Batch 2) — the
// legacy vyoma.org URLs are covered by the /privacy/ and /terms/ redirects
// instead. Every entry here is a real internal route.
export const FOOTER_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Annual Report', href: '/credibility/annual-reports' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Join Us', href: '/join-us' },
];

// Footer "Our Platforms" — Vyoma's own external sites, approved exact URLs.
// IKS is deliberately not included here: it was scoped separately (Our Work
// page only) and no redirect/footer change was approved for it.
export const PLATFORM_LINKS = [
  { label: 'Sanskrit From Home', href: 'https://www.sanskritfromhome.org/', external: true },
  { label: 'Digital Sanskrit', href: 'https://digitalsanskrit.com/', external: true },
  { label: 'Digital Sanskrit Guru', href: 'https://digitalsanskritguru.com/?v=13b5bfe96f3e', external: true },
  { label: 'Vyoma USA', href: 'https://vyomausa.org/', external: true },
];
