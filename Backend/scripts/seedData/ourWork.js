// Mirrors ui_kits/vyoma-org/OurWork.jsx's hardcoded arrays, restructured for
// the Phase C admin CMS. All text/link values preserved exactly; only
// `active` (default true) is new.
export const SCHOOLS = [
  { name: 'School of Phonetics, Linguistics and Scriptural Experience', tag: 'Core', body: 'Safeguards the correct pronunciation, grammar, and recitation tradition that anchors all authentic Sanskrit learning.', active: true },
  { name: 'School of Advanced Traditional Wisdom', tag: 'Shastras', body: 'Carries forward rigorous study of classical shastric texts for the most advanced scholarship.', active: true },
  { name: 'School of Distance & Informal Learning', tag: 'Sabha Revival', body: 'Revives community sabha-style learning circles through distance and informal formats.', active: true },
  { name: 'School of IKS Research & Application', tag: 'VIKALPA', body: 'Translates Indian Knowledge Systems into contemporary research, practice, and policy.', active: true },
  { name: 'School of Applied IKS Intelligence', tag: 'AI & Language Lab', body: 'Applies IKS methods to modern language technology, AI, and computational linguistics.', active: true },
  { name: 'School of Inclusive Learning', tag: 'Reach the Unreached', body: 'Extends Sanskrit education to underserved and remote communities across India.', active: true },
  { name: 'School of Foundational Value Education', tag: 'Children', body: 'Builds value-based foundations for children, rooted in Sanskrit and Indian civilizational thought.', active: true },
];

export const CW_PLATFORMS = [
  { n: 'SFH', t: 'Sanskrit From Home', d: '400+ free Sanskrit courses, from basics to śāstras.', u: 'https://sanskritfromhome.org', ul: 'sanskritfromhome.org', soc: ['facebook', 'x', 'instagram', 'youtube'], active: true },
  { n: 'OTT', t: 'Digital Sanskrit (OTT)', d: 'Sanskrit talks, stories, and series, streamed on demand.', u: 'https://digitalsanskrit.com', ul: 'digitalsanskrit.com', soc: ['facebook', 'instagram', 'whatsapp'], active: true },
  { n: 'DSG', t: 'Digital Sanskrit Guru', d: 'Sanskrit books, digital products, and publications.', u: 'https://digitalsanskritguru.com', ul: 'digitalsanskritguru.com', soc: ['facebook', 'instagram'], active: true },
  { n: 'DSLL', t: 'Sanskrit Language Lab', d: 'Curriculum-mapped Sanskrit e-learning tools for schools, colleges, and institutions.', u: 'https://sanskritlanguagelab.com', ul: 'sanskritlanguagelab.com', active: true },
  { n: 'IKS', t: 'IKS / VIKALPA Centre', d: 'Research and real-world application of Indian Knowledge Systems.', u: 'https://iks.vyoma.org', ul: 'iks.vyoma.org', active: true },
  { n: 'USA', t: 'Vyoma USA', d: 'Our US arm, supporting donors and learners abroad.', u: 'https://vyomausa.org', ul: 'vyomausa.org', soc: ['facebook', 'x', 'linkedin'], active: true },
  { n: 'App', t: 'Sandhi App', d: 'A free Sanskrit learning app, 50,000+ downloads.', u: '#', ul: 'Google Play', active: true },
];

export const CW_PROGRAMMES = [
  { n: 'Bāla', t: 'Vyoma Bāla Gurukulam', d: 'An immersive after-school SSS course for children aged 6-12.', active: true },
  { n: 'Sabhā', t: 'Sabhā Revival', d: "Reviving India's traditional informal Sanskrit learning sabhas.", active: true },
  { n: 'HEARTS', t: 'HEARTS', d: 'Education and therapy through Sanskrit for children with special needs.', active: true },
  { n: 'Rural', t: 'Rural, Tribal & Govt.', d: 'Sanskrit and value education for underserved communities, including Language Labs in BR Hills and Tyamagondlu.', active: true },
  { n: 'Senior', t: 'Spirituality for Seniors', d: 'Sanskrit and spirituality programmes for seniors.', active: true },
];

export const SEO = { title: null, description: null, canonical: '/our-work', ogImage: null };
