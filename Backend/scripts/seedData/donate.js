// DONATION_SCHEMES: the seed source for DonationSchemeModel ONLY (see
// runSeed.js) — Phase D made DonationSchemeModel the sole source of truth
// for scheme identity/content; this array is no longer merged into the
// pages/donate Content document. Slugs, names, and order here are
// preserved exactly as before the migration — array index becomes each
// scheme's initial `displayOrder`.
export const DONATION_SCHEMES = [
  { slug: 'guru-dakshina', name: 'Guru Dakṣiṇā', body: "Sponsor a teacher's monthly remuneration, in the tradition of honouring the guru who imparts knowledge." },
  { slug: 'vidya-danam', name: 'Vidyā Dānam', body: 'Fund free Sanskrit e-learning courses — ₹1,000 sponsors one student, one course, one month.' },
  { slug: 'grantha-danam', name: 'Grantha Dānam', body: 'Sponsor the publishing and printing of Sanskrit learning materials, including in memory of a loved one.' },
  { slug: 'vidyarthi-nidhi', name: 'Vidyārthi Nidhi', body: "Reward and scholarship top-performing Sanskrit students across board exams and Vyoma's own courses." },
  { slug: 'sabha-ujjivanam', name: 'Sabhā Ujjīvanam', body: 'Support grassroots Sanskrit learning through five established Samskrita Sabhas — ₹10,000/month per sponsorship.' },
  { slug: 'anna-danam', name: 'Anna Dānam', body: 'Sponsor daily meals for volunteers and staff serving at the Vyoma office.' },
  { slug: 'bala-gurukulam', name: 'Vyoma Bāla Gurukulam', body: 'Fund an after-school Sanskrit, culture, and values programme for children — ₹2,500/student/month.', note: 'Confirm current duration before finalizing — live site says 3 years, noted as now 1.' },
  { slug: 'events-and-projects', name: 'Events & Projects', body: "Sponsor Vyoma's events — Parayanams, book releases, and knowledge-sharing initiatives." },
  { slug: 'general-donation', name: 'General Donation', body: "An open, unrestricted gift — funds go wherever Vyoma's work needs it most." },
];

// Everything below is genuine page copy for the generic Content model
// (type: 'pages/donate') — text/links that were previously hardcoded
// directly in donate/page.js, now editable. Bank account details
// themselves come from Settings.donationBankDetails (already existed,
// previously unused by any page) — only the surrounding copy lives here.
export const HERO = {
  verse: 'शतहस्त समाहार सहस्रहस्त सं किर',
  citation: 'Atharva Saṃhitā 5.30.5',
  title: 'Earn with a hundred hands, give with a thousand.',
  body: 'Your gift keeps Sanskrit education free and open to all across India.',
  ctaLabel: 'Donate Now',
};

export const OTHER_WAYS = {
  subscriptionHeading: 'Annual Subscription Plan',
  subscriptionBody: 'Give regularly through the year.',
  subscriptionCtaLabel: 'Set up a plan',
  csrHeading: 'CSR & Corpus',
  csrBody: 'For companies and endowment gifts.',
};

export const BANK_TRANSFER = {
  heading: 'Direct bank transfer',
  foreignNote: 'Foreign donors: please follow the FCRA guidelines and email your transfer details to the address below for a receipt.',
};

export const COMPLIANCE_STRIP = {
  items: ['80G tax benefit (India)', 'FCRA-registered for foreign gifts', 'Receipt provided'],
  ctaLabel: 'See our full transparency record',
};

export const CLOSING_TAGLINE = 'Support Sanskrit. Support mankind.';

export const SEO = { title: null, description: null, canonical: '/donate', ogImage: null };
