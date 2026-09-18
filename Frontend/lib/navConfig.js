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

export const FOOTER_LINKS = [
  { label: 'Privacy', href: '#' },
  { label: 'Terms', href: '#' },
  { label: 'Annual Report', href: '/credibility/annual-reports' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Join Us', href: '/join-us' },
];

export const SOCIAL_LINKS = [
  { name: 'Facebook', slug: 'facebook' },
  { name: 'YouTube', slug: 'youtube' },
  { name: 'X', slug: 'x' },
  { name: 'LinkedIn', slug: 'linkedin' },
  { name: 'WhatsApp', slug: 'whatsapp' },
];
