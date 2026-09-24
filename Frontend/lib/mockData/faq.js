// Mirrors ui_kits/vyoma-org/FAQ.jsx, restructured for the Phase D admin
// CMS. Text/grouping/order preserved exactly; only `active` (default true,
// on both groups and items) is new.
export const FAQ_GROUPS = [
  {
    group: 'About Vyoma',
    active: true,
    items: [
      { q: 'What is Vyoma Linguistic Labs Foundation?', a: 'Vyoma Linguistic Labs Foundation is a Bengaluru-based non-profit dedicated to making Sanskrit accessible to everyone. We offer structured online courses, streaming content, digital learning tools, and research support through the VIKALPA Centre for Indian Knowledge Systems.', active: true },
      { q: 'Is Vyoma a registered non-profit?', a: 'Yes. Vyoma is registered under Section 25 of the Companies Act, and holds FCRA, 80G, 12A, and CSR-1 registration, which qualifies it to receive both domestic and foreign contributions.', active: true },
      { q: 'How can I get in touch with Vyoma about a donation or partnership?', a: 'You can reach Vyoma through the Contact page on this site, or write directly to the donations team. Someone from Vyoma will respond with the details you need.', active: true },
    ],
  },
  {
    group: 'Tax & Legal',
    active: true,
    items: [
      { q: 'Is my donation to Vyoma tax-exempt in India?', a: 'Yes. Vyoma holds 80G registration, so Indian donors can claim a tax deduction on donations made to the foundation. A receipt is issued for every donation, which you can use at the time of filing your taxes.', active: true },
      { q: 'Will I get a donation receipt?', a: 'Yes. Every donation generates a receipt automatically, sent to the email address you provide at the time of donating. Keep this receipt for your tax filing.', active: true },
      { q: 'What registration numbers does Vyoma hold?', a: 'Vyoma holds FCRA, 80G, and 12A registration under Indian law.', note: 'Actual registration numbers not on file. Send them if they should be listed here for donor verification.', active: true },
    ],
  },
  {
    group: 'International Donors',
    active: true,
    items: [
      { q: "I'm a US donor. Can I get a tax receipt for my donation?", a: 'Yes. US donors can give through Vyoma USA, which is set up to route contributions and issue the appropriate US tax documentation.', active: true },
      { q: "I'm an NRI or a foreign donor outside the US. How do I donate?", a: "Foreign donors outside the US can donate through Vyoma's FCRA-registered bank account. Because this route needs a manual transfer, we ask you to email the donations team first so they can share the correct account details and confirm receipt.", active: true },
      { q: "Why can't I use the same donation button as Indian donors?", a: 'Indian tax law (FCRA) requires foreign contributions to be received into a separate, dedicated bank account, so international and domestic donations are routed differently to stay compliant.', active: true },
    ],
  },
  {
    group: 'CSR & Partnerships',
    active: true,
    items: [
      { q: 'Is Vyoma eligible for CSR funding?', a: 'Yes. Vyoma holds CSR-1 registration, which makes it an eligible implementing partner for corporate CSR funds under Indian law.', active: true },
      { q: "What is Vyoma's CSR registration number?", a: "Vyoma's CSR registration number is CSR00025464.", active: true },
      { q: 'What kind of CSR projects does Vyoma run?', a: 'Vyoma runs CSR projects centered on Sanskrit education and Indian Knowledge Systems, including scholarships, digital learning access, and research support. Specific project details and costs are listed on the CSR Projects page.', active: true },
    ],
  },
  {
    group: 'How Funds Are Used',
    active: true,
    items: [
      { q: 'How is my donation used?', a: "Donations fund Vyoma's core programmes: Sanskrit courses for learners of all levels, teacher training, digital learning tools, and research through the VIKALPA Centre.", note: 'Optional: add a rough percentage breakdown (e.g. X% programmes / Y% operations). Donors respond well to this — needs verified figures.', active: true },
      { q: 'Does Vyoma publish an annual report or impact report?', a: 'Yes. Vyoma publishes an Annual Report and a Social Impact Report, both available on the Credibility section of this site.', active: true },
    ],
  },
  {
    group: 'Ways to Give',
    active: true,
    items: [
      { q: 'What are my options for donating to Vyoma?', a: "Vyoma offers several donation schemes, including one-time and recurring gifts. You can choose a scheme that matches what you'd like to support, from general funding to a specific programme.", active: true },
      { q: 'Can I set up a recurring donation?', a: '', note: 'Answer pending: confirm whether recurring giving is supported on the current donation processor, then write the answer.', active: true },
      { q: 'Can I donate by bank transfer instead of online?', a: 'Yes. Bank transfer details are listed on the Donate page for donors who prefer this method over the online payment flow.', active: true },
    ],
  },
  {
    group: 'Learners',
    active: true,
    items: [
      { q: 'I want to learn Sanskrit. Is this the right place to sign up?', a: "Vyoma's Sanskrit courses are offered through Sanskrit From Home (SFH). Visit sanskritfromhome.org to browse courses and enroll.", active: true },
    ],
  },
];

export const SEO = { title: null, description: null, canonical: '/faq', ogImage: null };
