// QA Bug 5, Stage 1: a static, explicitly-allowlisted registry of every
// publicly accessible, non-dynamic page route, for a future site search
// feature (not yet implemented -- see searchAggregate.js/search/page.js,
// neither of which exist yet). Every `title`/`description` pair below is
// copied verbatim from that exact page's own already-shipped, literal
// `pageMetadata({...})` call (or, for the three routes noted inline, the
// nearest equivalent already-public literal string already shipped in
// code) -- nothing here is fetched from the CMS, invented, or guessed.
// Fetching live content here would also defeat the point: this registry
// must stay available even if the backend is unreachable.
//
// Deliberately excluded:
// - Every /admin/** route (private, authenticated-only).
// - Dynamic route templates (`/donate/[schemeSlug]`, `/media/blog/[slug]`)
//   -- each resolves to a different real URL per published item, and this
//   registry only ever lists concrete URLs that exist as-is; inventing a
//   placeholder URL for a template would violate "do not invent dynamic
//   URLs." Individual blog posts/donation schemes are a separate, later
//   search-coverage concern (the full design's Phase 2 matrix), not part
//   of this static registry.
//
// Unresolved items, flagged rather than silently resolved (see Stage 1
// report for detail):
// - `/` (home): its own `generateMetadata` passes `title: SEO?.title ||
//   undefined` and `description: SEO?.description || undefined` -- i.e. no
//   literal fallback string of its own at all. The entry below instead uses
//   the root layout's own default title/description
//   (Frontend/app/layout.js's `metadata.title.default` /
//   `metadata.description`), which is the real string every visitor sees
//   whenever the CMS doesn't override it -- not an invented value.
// - `/privacy` and `/terms`: each has a literal `TITLE` constant
//   (lib/mockData/privacy.js / terms.js) but their own `description` has no
//   literal fallback (`SEO?.description || undefined`, same pattern as
//   home). The entries below reuse the same root layout default description
//   for the same reason as home, flagged here rather than left silently
//   inconsistent with every other entry's provenance.
export const SEARCH_REGISTRY = [
  { path: '/', title: 'Vyoma Linguistic Labs Foundation', description: "Support India's largest free Sanskrit e-learning platform, making Saṃskṛtam accessible to all, at global scale, with full financial transparency." },
  { path: '/about', title: 'About', description: "Founded in Bengaluru, Vyoma Linguistic Labs Foundation has grown into the organisation behind India's largest free Sanskrit e-learning ecosystem, serving over a lakh learners worldwide." },
  { path: '/about/core-team', title: 'Core Team', description: 'Behind every course, tool, and initiative is a dedicated team of teachers, technologists, and coordinators who bring Sanskrit to learners across the world.' },
  { path: '/about/leadership', title: 'Leadership', description: 'Vyoma is led by a team of scholars, technologists, and institution-builders, guided by an experienced advisory board.' },
  { path: '/about/our-story', title: 'Our Story', description: "Vyoma began in 2010 with a single Sanskrit self-learning product. This is the story of how it grew into India's largest free Sanskrit e-learning ecosystem, year by year." },
  { path: '/about/patrons', title: 'Our Patrons', description: "Vyoma's patrons, donors, and well-wishers help keep authentic Sanskrit learning free and accessible to all." },
  { path: '/about/roadmap', title: 'Roadmap', description: "Vyoma's seven Schools are growing, step by step, into a Vyoma Global Virtual University for Sanskrit and Indian Knowledge Systems." },
  { path: '/contact', title: 'Contact', description: "We'd love to hear from you — whether you're considering a donation, exploring a CSR partnership, or simply have a question about our work." },
  { path: '/credibility', title: 'Credibility', description: 'Vyoma opens its record to the people who fund and partner with it — reports, registrations, and recognition, all in one place.' },
  { path: '/credibility/annual-reports', title: 'Annual Reports', description: 'A year-by-year account of our activities, reach, and finances (2021-22 to 2024-25).' },
  { path: '/credibility/audit-reports', title: 'Audit Reports', description: 'Our audited annual financial statements, published in full (FY2012-13 to FY2021-22).' },
  { path: '/credibility/awards-recognition', title: 'Awards & Recognition', description: 'Honours earned across 10+ years of Saṃskṛta-Saṃskṛti-Saṃskāra seva.' },
  { path: '/credibility/collaterals', title: 'Collaterals', description: "Brochures, presentations, and catalogues that introduce Vyoma and its work." },
  { path: '/credibility/compliances-registrations', title: 'Compliances & Registrations', description: 'Our statutory approvals and registrations, including 80G, 12AA, FCRA, CSR, and MSME.' },
  { path: '/credibility/social-impact-report', title: 'Social Impact Report', description: 'A focused look at outcomes and the communities our work reaches.' },
  { path: '/donate', title: 'Donate', description: 'Your gift keeps Sanskrit education free and open to all across India.' },
  { path: '/faq', title: 'Frequently Asked Questions', description: 'Answers to common questions about donating to Vyoma, tax benefits, partnerships, and learning Sanskrit.' },
  { path: '/impact', title: 'Impact', description: "Every number here represents a step in making Sanskrit and India's knowledge systems accessible to all — reported openly, with full financial transparency." },
  { path: '/join-us', title: 'Join Us', description: "Whether you give your time, your skills, your company's support, or your career, there is a place for you in Vyoma's work." },
  { path: '/join-us/careers', title: 'Careers', description: 'Would you like to work with a purpose-driven team building free Sanskrit education at scale? Explore our open roles.' },
  { path: '/join-us/corpus-fund', title: 'Corpus Fund', description: "Vyoma's vision is to enable personal transformation in every individual through SSS consciousness (SSS = Samskrita-Samskriti-Samskara)." },
  { path: '/join-us/csr-projects', title: 'CSR Projects', description: "Partner with Vyoma on measurable CSR impact in Sanskrit education and India's knowledge systems." },
  { path: '/join-us/internship', title: 'Internship', description: 'Work on real projects at the meeting point of Sanskrit, Indian Knowledge Systems, education, and technology.' },
  { path: '/join-us/volunteer', title: 'Volunteer', description: "Begin your seva journey. Vyoma's mission runs on people who give their time and skills, and Sanskrit knowledge is not required." },
  { path: '/media', title: 'Media', description: "How Vyoma's work is seen, shared, and remembered — our writing, our press coverage, and moments from the field." },
  { path: '/media/blog', title: 'Blog', description: 'Long-form stories and updates from classrooms, research, and the field.' },
  { path: '/media/events', title: 'Events', description: "Where Vyoma's work meets people — talks, workshops, visits, and gatherings through the year." },
  { path: '/media/gallery', title: 'Gallery', description: "Moments from Vyoma's work, events, outreach, and recognition." },
  { path: '/media/newsletter', title: 'Newsletter', description: "Our journey in Vyoma's own words — milestones, programmes, and moments, issue by issue since 2011." },
  { path: '/media/press', title: 'Press', description: "Vyoma's work in the words of others, across newspapers, radio, and magazines." },
  { path: '/media/resources', title: 'Resources', description: 'A curated collection of Sanskrit resources from across the web, compiled as a service to learners, researchers, and knowledge enthusiasts.' },
  { path: '/media/testimonials', title: 'Testimonials', description: 'In their own words, learners across India and the world on what Vyoma has meant to them.' },
  { path: '/media/what-sanskrit', title: 'What Sanskrit?', description: 'An illustrative representation of the knowledge repository in Sanskrit, organised by traditional shastra.' },
  { path: '/media/where-iks', title: 'Where IKS', description: 'O-MANTRI — a curated directory of Indian Knowledge Systems resources, organised into Universal, Domain Specific, and Auxiliary Tools series.' },
  { path: '/our-work', title: 'Our Work', description: "From phonetics to applied AI, from children's value education to advanced research — the Seven Schools of Vyoma, backed by scholarship and built to reach millions." },
  { path: '/our-work/all', title: 'Our Work — Seven Schools & Current Work', description: 'The Seven Schools of Vyoma alongside everything Vyoma runs today — platforms and programmes carrying Sanskrit into classrooms, homes, and communities.' },
  { path: '/our-work/current', title: 'Current Work', description: "Everything Vyoma runs today — the platforms that make Sanskrit accessible to all, and the programmes that carry it into classrooms, homes, and communities." },
  { path: '/privacy', title: 'Privacy Policy', description: "Support India's largest free Sanskrit e-learning platform, making Saṃskṛtam accessible to all, at global scale, with full financial transparency." },
  { path: '/terms', title: 'Terms & Conditions', description: "Support India's largest free Sanskrit e-learning platform, making Saṃskṛtam accessible to all, at global scale, with full financial transparency." },
];
