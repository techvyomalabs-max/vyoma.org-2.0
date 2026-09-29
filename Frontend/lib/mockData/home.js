// Mirrors ui_kits/vyoma-org/Homepage.jsx's hardcoded arrays, restructured for
// the Phase B admin CMS. Every default below preserves the exact current
// public output (same text, same links, `active: true` everywhere, empty
// image/link fields where none existed before) — nothing changes on the
// live site until an admin actually edits something through the new forms.

// Mirrors Backend/scripts/seedData/home.js — see that file's comment.
function heroImage(storedName, alt) {
  return { mediaId: null, url: `/images/${storedName}`, alt };
}

export const HERO_SLIDES = [
  {
    heading: "Support India's largest free Sanskrit e-learning platform",
    body: 'Making Saṃskṛtam accessible to all, at global scale, with full financial transparency.',
    image: heroImage('hero-1.png', "Students learning Sanskrit on Vyoma's e-learning platform"),
    cta: { label: 'Explore our work', href: '/about', external: false },
    active: true,
  },
  {
    heading: "Launch of the World's first E-Learning Platform in OTT Format",
    body: 'July 2025 — bringing Sanskrit learning to a familiar, binge-friendly format.',
    image: heroImage('hero-2.png', 'Launch of the Digital Sanskrit OTT e-learning platform'),
    cta: { label: 'Explore our work', href: '/about', external: false },
    active: true,
  },
  {
    heading: 'In rural Tyamagondlu, the school year begins with puppet shows',
    body: 'Sanskrit chants, not textbooks — free for every child.',
    image: heroImage('hero-3.png', 'Children in rural Tyamagondlu at a puppet-show Sanskrit class'),
    cta: { label: 'Explore our work', href: '/about', external: false },
    active: true,
  },
  {
    heading: 'Inauguration of our IKS VIKALPA Library',
    body: 'By Prof. Ganti S. Murthy, March 2026.',
    image: heroImage('hero-4.png', 'Inauguration of the IKS VIKALPA Library'),
    cta: { label: 'Explore our work', href: '/about', external: false },
    active: true,
  },
  {
    heading: 'Follow your passion for seva',
    body: 'Become a Vyoma volunteer.',
    image: heroImage('hero-5.jpg', 'Vyoma volunteers engaged in seva'),
    cta: { label: 'Volunteer', href: '/join-us/volunteer', external: false },
    active: true,
  },
];

export const STATS = [
  { value: '124,193', label: 'Transformed Individuals', active: true },
  { value: '17.8M+', label: 'Touch-Prints', active: true },
  { value: '136', label: 'Dedicated Teachers & Scholars', active: true },
  { value: '49,642', label: 'Volunteering Hours', active: true },
  { value: '485,680', label: 'E-Learning Man-Hours', active: true },
  { value: '18', label: 'Direct Benefited Organizations', active: true },
];

export const TOPICS = [
  { label: 'Core Linguistics', active: true },
  { label: 'Shastras', active: true },
  { label: 'Sabha Revival', active: true },
  { label: 'VIKALPA Research', active: true },
  { label: 'AI & Language Lab', active: true },
  { label: 'Inclusive Learning', active: true },
  { label: 'Value Education', active: true },
];

// Mirrors Backend/scripts/seedData/home.js — see that file's comment.
export const COMPLIANCE_STRIP = {
  items: ['80G tax benefit (India)', 'FCRA-registered for foreign gifts', 'Receipt provided'],
  ctaLabel: 'See our full transparency record',
};

export const HOME_ACTIVITIES = [
  {
    title: 'What SSS?',
    description: null,
    icon: null,
    link: { label: 'Explore Now', href: 'https://iks.vyoma.org/explore_iks.html', external: true },
    active: true,
  },
  {
    title: 'Why SSS?',
    description: null,
    icon: null,
    link: { label: 'View Videos', href: 'https://www.youtube.com/playlist?list=PL_power_of_sanskrit', external: true },
    active: true,
  },
  {
    title: 'How SSS?',
    description: null,
    icon: null,
    link: { label: 'Click to Learn', href: 'https://sanskritfromhome.org/something-for-everyone', external: true },
    active: true,
  },
  {
    title: 'Where SSS?',
    description: null,
    icon: null,
    link: { label: 'Explore Now', href: '/media/resources', external: false },
    active: true,
  },
];

export const HOME_TESTIMONIALS = [
  {
    name: 'Dr Jaya Tyagi',
    role: 'Retd. Professor & HoD, Biotechnology, AIIMS New Delhi',
    quote: "Vyoma’s scholarship and pedagogy are of a rare quality. Learning here reshaped how I read our classical texts.",
    image: null,
    active: true,
  },
  {
    name: 'Dr Ramakrishnarao Rebbapragada',
    role: 'Retired Doctor, Cambridge University Hospitals, UK',
    quote: 'Namaste, I am so delighted with your classes and bowled out by your knowledge and presentation. I had a passion all my life to learn Sanskrit. The learning process itself is giving me so much joy, or ananda. Thank you!',
    image: null,
    active: true,
  },
  {
    name: 'Sri Siddhartha Jayanti',
    role: 'Boston, USA',
    quote: 'The clarity and structure of the teaching is exceptional. It respects both the tradition and the learner.',
    image: null,
    active: true,
  },
];

// Previously hardcoded directly in page.js (badge/heading/button text) — no
// data source fed this section at all. Extracted here, unchanged, so it
// becomes editable; nothing about the public page's appearance changes.
export const CSR = {
  badge: 'For Corporates & CSR Partners',
  heading: 'Partner with us through CSR',
  ctaLabel: 'Get CSR details',
  ctaSubject: 'CSR partnership',
};

export const SPONSORS = [
  {
    name: 'Guru Krupa Foundation Inc',
    logo: { url: '/images/sponsors/guru-krupa.png', alt: 'Guru Krupa Foundation Inc' },
    website: null,
    bg: '#fff',
    width: 220,
    height: 90,
    active: true,
  },
  {
    name: 'Pythagoras',
    logo: { url: '/images/sponsors/pythagoras.jpg', alt: 'Pythagoras' },
    website: null,
    bg: '#0b3a4a',
    width: 176,
    height: 100,
    active: true,
  },
  {
    name: 'Pratiksha',
    logo: { url: '/images/sponsors/pratiksha.png', alt: 'Pratiksha' },
    website: null,
    bg: '#fff',
    width: 220,
    height: 90,
    active: true,
  },
];

// Home currently has no title/description at all (page.js only sets
// alternates.canonical) — this fills a real gap, not overriding anything
// deliberately set before.
export const SEO = { title: null, description: null, canonical: '/', ogImage: null };
