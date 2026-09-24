// Mirrors ui_kits/vyoma-org/ContactUs.jsx, restructured for the Phase D
// admin CMS. `CONTACT_REASONS` unchanged. `CONTACT_SOCIAL` is REMOVED —
// Phase D decision: social links are a global reusable value, sourced from
// Settings.socialLinks (GET /public/settings) instead of duplicated here,
// so there's exactly one place to change them and the icons finally point
// somewhere real instead of the previous hardcoded "#". Every other field
// below was previously hardcoded directly in contact/page.js.
export const CONTACT_REASONS = ['Donation query', 'CSR partnership', 'Volunteering', 'General', 'Media & Press'];

export const HERO = {
  title: 'Contact Us',
  body: "We'd love to hear from you — whether you're considering a donation, exploring a CSR partnership, or simply have a question about our work.",
};

export const PHONE = '+91-9480865623';

export const ADDRESS = {
  registeredOffice: '#155, 2nd floor, 4th Cross, GKW Layout,\nVijayanagar, Bangalore,\nKarnataka – 560040',
  workingOffice: '#84, 3rd Cross, NGEF Layout, 2nd Block,\nOpp Fortis Hospital, Nagarabhavi.\nBangalore – 560072',
  mapUrl: 'https://www.google.com/maps?q=NGEF+Layout+2nd+Block+Nagarabhavi+Bangalore+560072&output=embed',
  mapLink: 'https://maps.app.goo.gl/BTeZZDvc26LqExqK8',
};

export const OFFICE_HOURS = '10 am – 7 pm India Time (Monday to Saturday)';

export const REGISTRATION_NOTE =
  'Vyoma Linguistic Labs Foundation is registered under FCRA, 80G, 12A, and CSR-1. [Insert registration numbers if they should be shown here.]';

export const CLOSING_LINE = 'For Sanskrit course enrollment or learner support, visit';

export const SEO = { title: null, description: null, canonical: '/contact', ogImage: null };
