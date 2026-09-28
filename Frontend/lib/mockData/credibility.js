// Mirrors ui_kits/vyoma-org/Credibility.jsx, restructured for the Phase C
// admin CMS. Text preserved exactly. New: `active` everywhere; `document`
// (the ImageField/DocumentField object shape — {mediaId, url, filename})
// on every doc-list item, replacing the previously-dead "View"/"Download"
// links; `image` on Awards items, replacing the previously-decorative-only
// placeholder photo. All new fields default null/empty — nothing renders
// differently until an admin actually attaches a file.
export const CREDIBILITY_SECTIONS = [
  { title: 'Collaterals', body: 'Brochures, presentations, and catalogues that introduce Vyoma and its work.', cta: 'View collaterals', href: '/credibility/collaterals', active: true },
  { title: 'Annual Reports', body: 'A year-by-year account of our activities, reach, and finances (2021-22 to 2024-25).', cta: 'View reports', href: '/credibility/annual-reports', active: true },
  { title: 'Social Impact Report', body: 'A focused look at outcomes and the communities our work reaches.', cta: 'Read the report', href: '/credibility/social-impact-report', active: true },
  { title: 'Compliances & Registrations', body: 'Our statutory approvals and registrations, including 80G, 12AA, FCRA, CSR, and MSME.', cta: 'See registrations', href: '/credibility/compliances-registrations', active: true },
  { title: 'Awards & Recognition', body: 'Honours earned across 10+ years of Saṃskṛta-Saṃskṛti-Saṃskāra seva.', cta: 'See recognition', href: '/credibility/awards-recognition', active: true },
];

function doc(title, body, document) {
  return { title, body, document: document || null, active: true };
}

// Mirrors Backend/scripts/seedData/credibility.js's regDoc() — see that
// file's header comment for the full rationale.
const REGISTRATIONS_DOCS_BASE = '/documents/registrations';
function regDoc(storedName, originalFilename) {
  return { mediaId: null, url: `${REGISTRATIONS_DOCS_BASE}/${storedName}`, filename: originalFilename, size: null };
}

export const COLLATERALS_ITEMS = [
  doc('Company Presentation', 'A full overview of Vyoma, its mission, and its work.'),
  doc('Slip Sheet', 'Vyoma at a glance, on a single page.'),
  doc('Vyoma Brochure', "The foundation's story, programmes, and impact in brief."),
  doc('Seva Offering Catalogue', 'Ways to contribute time, skills, and seva to Vyoma.'),
  doc('Publications & Products Catalogue', 'Books, courses, and digital products from Vyoma.'),
  doc('Digital Sanskrit Language Lab Brochure', 'Our Sanskrit Language Lab and its research work.'),
  doc('DSLL Ayurveda Brochure', "The Language Lab's Ayurveda-focused programme."),
  doc('Digital Sanskrit OTT', 'Our streaming platform for Sanskrit content on demand.'),
  doc('Kids Persona Brochure', 'Foundational value education offerings for children.'),
];

export const ANNUAL_REPORTS_ITEMS = [
  doc('Annual Report 2024-25', 'Our most recent year of activities, reach, and financials.'),
  doc('Annual Report 2023-24', 'A full account of the 2023-24 year.'),
  doc('Annual Report 2022-23', 'A full account of the 2022-23 year.'),
  doc('Annual Report 2021-22', 'A full account of the 2021-22 year.'),
];

export const SOCIAL_IMPACT_ITEMS = [
  doc('Social Impact Report 2024-25', 'Outcomes and community impact for 2024-25.'),
  doc('Social Impact Report 2023-24', 'Outcomes and community impact for 2023-24.'),
];

export const COMPLIANCES_ITEMS = [
  doc('FCRA Registration', 'Approval to legally receive foreign contributions.', regDoc('fcra-registration.pdf', 'FCRA-Registration.pdf')),
  doc('FCRA Renewal', 'The current renewal of that foreign-contribution approval.', regDoc('fcra-renewal-2022.pdf', 'FCRA-Renewal_2022.pdf')),
  doc('IT 80G Renewal', 'Lets Indian donors claim a tax deduction on gifts to Vyoma.', regDoc('80g-renewal.pdf', '80G-Renewal.pdf')),
  doc('IT 12AA Renewal', 'Our income-tax exemption as a registered charitable body.', regDoc('12a-renewal.pdf', '12A_Renewal_Document.pdf')),
  doc('NGO Darpan', "Listing on the Government of India's NITI Aayog NGO portal.", regDoc('ngo-darpan.pdf', 'NGO Darpan.pdf')),
  doc('MSME Registration', 'Recognition as a registered enterprise (Udyam).', regDoc('msme-registration.pdf', 'MSME Registration.pdf')),
  doc('Section 25 Registration', 'Incorporation as a not-for-profit company.', regDoc('certificate-of-incorporation.pdf', 'Certificate of Incorporation-071212.pdf')),
  doc('CSR Registration', 'The CSR-1 filing that lets companies fund Vyoma from CSR budgets.', regDoc('csr-registration.pdf', 'CSR-Registration.pdf')),
];

function award(title, body) {
  return { title, body, image: null, active: true };
}

export const AWARDS_ITEMS = [
  award('Excellence Award (2024-25)', 'To Dr. Venkatasubramanian P, by Rotary Club Bangalore Peenya.'),
  award('Vocational Excellence Award (2024-25)', 'To Dr. Sowmya Krishnapur, by Rotary Club Bangalore Cantonment.'),
  award('Samskrta Sevavrati Award (2024)', 'Conferred jointly by three Sanskrit central universities.'),
  award('Recognition Certificate, Samskriti Foundation (2023)', 'For supporting the National Seminar on Bharatiya 64 Arts.'),
  award("'Bhageeratha Prayatna' Award (2022)", 'By Maitree Samskriti Foundation, for service to Sanskrit and culture.'),
  award("'Shikshakasammaan' Award (2022)", 'By Surasaraswathi Sabha, Sringeri, honouring four Vyoma teachers.'),
  award('Best E-learning Company of the Year (2019)', 'Named among the top 10 e-learning solution providers.'),
  award('Sevak of the Year Award (2017)', 'By SEVAK, to Dr. P. Venkatasubramanian and the foundation.'),
  award('Certificate, Karnataka Sanskrit University (2016)', "Recognising Vyoma's Sanskrit-through-technology work."),
];

export const SEO = { title: null, description: null, canonical: '/credibility', ogImage: null };
