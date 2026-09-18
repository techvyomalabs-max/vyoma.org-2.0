// Mirrors ui_kits/vyoma-org/Donate.jsx. `slug` is new — the source never had
// individual scheme detail pages (LLD: /donate/[schemeSlug] has no source
// component) so slugs are derived here for the new dynamic route.
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
