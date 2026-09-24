// Mirrors ui_kits/vyoma-org/Media.jsx and its sub-pages (Press, Events,
// Testimonials, Newsletter, Gallery, Resources). Feeds services/mediaService.js
// and getMediaContent() in services/pageService.js. Blog moved out to its own
// dedicated seedData/blog.js + BlogPostModel in Phase E — it no longer shares
// this module's 'blog'/'media' Content-type dataset.

export const MEDIA_SECTIONS = [
  { title: 'Blog', body: 'Long-form stories and updates from classrooms, research, and the field.', href: '/media/blog' },
  { title: 'Press', body: 'Press mentions and media coverage of Vyoma in national and regional outlets.', href: '/media/press' },
  { title: 'Events', body: 'Upcoming and past camps, workshops, and public events.', href: '/media/events' },
  { title: 'Testimonials', body: 'Voices from learners, volunteers, and partners on their experience with Vyoma.', href: '/media/testimonials' },
  { title: 'Newsletter', body: 'Subscribe for periodic updates on programs and impact.', href: '/media/newsletter' },
  { title: 'Gallery', body: 'Photographs from our work, events, and recognition.', href: '/media/gallery' },
];

// --- Press ----------------------------------------------------------------

export const PRESS_PUBLICATIONS = ['The Hindu', 'Udayavani', 'Vijaya Karnataka', 'Kannada Prabha', 'Sudharma', 'Andhra Jyothi'];

export const PRESS_FEATURED = [
  { pub: 'The Hindu', date: '12 Aug 2026', note: 'A full-page feature on Vyoma’s decade of Sanskrit teaching.' },
  { pub: 'Udayavani', date: '28 Jul 2026', note: 'Coverage of the rural Sanskrit camp initiative in Karnataka.' },
  { pub: 'Vijaya Karnataka', date: '15 Jul 2026', note: 'Interview with Vyoma’s founders on preserving the language.' },
];

export const PRESS_CLIPPINGS = [
  { pub: 'Kannada Prabha', date: '02 Jul 2026', note: 'Report on the annual scholars’ gathering.' },
  { pub: 'Sudharma', date: '20 Jun 2026', note: 'Sanskrit-daily coverage of Vyoma’s online courses.' },
  { pub: 'Andhra Jyothi', date: '08 Jun 2026', note: 'Feature on multimedia Sanskrit learning products.' },
  { pub: 'The Hindu', date: '25 May 2026', note: 'Op-ed on the role of Sanskrit in modern education.' },
  { pub: 'Udayavani', date: '11 May 2026', note: 'Photo story from a village teaching camp.' },
  { pub: 'Vijaya Karnataka', date: '30 Apr 2026', note: 'Note on Vyoma’s volunteer network.' },
];

export const PRESS_RADIO = [
  { title: 'Benefits and Courses of Learning Sanskrit', duration: '3:07' },
  { title: 'Introduction to Vyoma Labs', duration: '2:24' },
  { title: 'Sanskrit: A Magic Medicine', duration: '3:10' },
];

// --- Events -----------------------------------------------------------------

export const EVENT_CATEGORIES = ['All', 'Workshop', 'Talk', 'Meeting', 'Parayanam', 'Vyoma Products', 'General'];

export const UPCOMING_EVENTS = [];

export const PAST_EVENTS = [
  { type: 'Workshop', date: '16 Jul 2026', title: 'Faculty Training Program on Indian Knowledge Systems (MSFDA)', note: 'A training program for college faculty on integrating IKS into teaching.' },
  { type: 'Talk', date: '28 Jun 2026', title: 'The Relevance of Sanskrit in the Digital Age', note: 'A public talk on why the language still matters for modern learners.' },
  { type: 'Parayanam', date: '10 Jun 2026', title: 'Ramayana Parayanam and Discourse', note: 'A community recitation and discourse over the course of a weekend.' },
  { type: 'Meeting', date: '22 May 2026', title: 'Annual Volunteers’ Meet', note: 'Vyoma volunteers gather to review the year and plan ahead.' },
  { type: 'Vyoma Products', date: '05 May 2026', title: 'Launch of New Multimedia Sanskrit Kit', note: 'Introducing the latest learning product for young students.' },
  { type: 'General', date: '18 Apr 2026', title: 'Open House at the Vyoma Center', note: 'A day for the public to visit, observe classes, and meet our scholars.' },
];

// --- Testimonials -----------------------------------------------------------

export const TESTIMONIALS_FEATURED = [
  { quote: 'Vyoma’s scholarship and pedagogy are of a rare quality. Learning here reshaped how I read our classical texts.', name: 'Dr Jaya Tyagi', role: 'Retd. Professor & HoD, Biotechnology, AIIMS New Delhi' },
  { quote: 'Namaste, I am so delighted with your classes and bowled out by your knowledge and presentation. I had a passion all my life to learn Sanskrit. The learning process itself is giving me so much joy, or ananda. Thank you!', name: 'Dr Ramakrishnarao Rebbapragada', role: 'Retired Doctor, Cambridge University Hospitals, UK' },
  { quote: 'The clarity and structure of the teaching is exceptional. It respects both the tradition and the learner.', name: 'Sri Siddhartha Jayanti', role: 'Boston, USA' },
];

export const TESTIMONIALS_ALL = [
  { type: 'text', quote: 'I started with no background at all, and within months I could read simple verses on my own.', name: 'Anjali Rao', role: 'Bengaluru, India' },
  { type: 'video', name: 'Ravi Menon', role: 'Chennai, India' },
  { type: 'text', quote: 'The teachers are patient and deeply knowledgeable. Every doubt was answered with care.', name: 'Meera Krishnan', role: 'Pune, India' },
  { type: 'text', quote: 'Vyoma made it possible for me to teach Sanskrit to my own students with real confidence.', name: 'Suresh Iyer', role: 'Coimbatore, India' },
  { type: 'video', name: 'Lakshmi Narayanan', role: 'Singapore' },
  { type: 'text', quote: 'A wonderful community of learners. I looked forward to every single class.', name: 'Priya Sharma', role: 'London, UK' },
];

// --- Newsletter ---------------------------------------------------------

export const NEWSLETTER_LATEST = {
  label: 'Dec 2025 · Vol. 8, Issue 2',
  title: 'A Year of Learning, Together',
  summary: 'Our year in review: new courses, camps across three states, and the milestones our community reached together.',
};

export const NEWSLETTER_ARCHIVE = [
  { year: '2025', issues: [{ label: 'Dec 2025 · Vol. 8, Issue 2', title: 'A Year of Learning, Together' }, { label: 'Jun 2025 · Vol. 8, Issue 1', title: 'New Beginnings' }] },
  { year: '2024', issues: [{ label: 'Dec 2024 · Vol. 7, Issue 2', title: 'Reaching Further' }, { label: 'Jun 2024 · Vol. 7, Issue 1', title: 'Roots and Wings' }] },
  { year: '2022', issues: [{ label: 'Dec 2022 · Vol. 6, Issue 1', title: 'Back Together' }] },
  { year: '2020', issues: [{ label: 'Dec 2020 · Vol. 5, Issue 2', title: 'Learning Through the Year' }, { label: 'Jun 2020 · Vol. 5, Issue 1', title: 'Adapting and Growing' }] },
  { year: '2018', issues: [{ label: 'Dec 2018 · Vol. 4, Issue 1', title: 'Widening Circles' }] },
  { year: '2017', issues: [{ label: 'Dec 2017 · Vol. 3, Issue 1', title: 'Steady Progress' }] },
  { year: '2015', issues: [{ label: 'Dec 2015 · Vol. 2, Issue 1', title: 'Growing Roots' }] },
  { year: '2011', issues: [{ label: 'Dec 2011 · Vol. 1, Issue 1', title: 'Our First Issue' }] },
];

export const NEWSLETTER_SPECIAL = [
  { label: 'Special Issue', title: 'Our 10 Year Journey' },
  { label: 'Special Issue · April 2020', title: 'Our 7 Year Journey' },
];

// --- Gallery ------------------------------------------------------------

export const GALLERY_ALBUMS = [
  { title: 'Blessings of Gurus', count: 11 },
  { title: 'Awards & Recognition', count: 6 },
  { title: 'Paper Presentations & Invited Lectures', count: 12 },
  { title: 'Book Fairs & Stalls', count: 12 },
  { title: 'Visits of Dignitaries', count: 10 },
  { title: 'CSR Activities', count: 5 },
  { title: 'Office Culture', count: 8 },
  { title: 'Sanskrit as Medicine', count: null },
];

// --- Resources ------------------------------------------------------------

export const RESOURCE_CATEGORIES = [
  'Repositories of Sanskrit Texts',
  'Video Based Learning',
  'Magazines & Journals',
  'Blogs',
  'Dictionaries',
  'Computational Tools',
  'Tools for Typing, OCR, Fonts',
  'eLearning',
];

export const RESOURCE_ROWS = {
  'Repositories of Sanskrit Texts': [
    { title: 'Portal to Sanskrit Resources', desc: '100+ links across various headings', link: '#' },
    { title: 'Sanskrit Library', desc: 'Vast collection of texts in IAST format, proofread and tagged', link: '#' },
    { title: 'eBooks and Texts – Internet Archive', desc: 'Scanned printed books as PDF, audio books, manuscript images', link: '#' },
  ],
  'Video Based Learning': [
    { title: 'Vyoma Sanskrit Learning Channel', desc: 'Structured video lessons for beginner to advanced learners', link: '#' },
    { title: 'Samskrita Bharati Video Series', desc: 'Spoken Sanskrit lessons through immersive video', link: '#' },
    { title: 'Sanskrit Grammar Explained', desc: 'Lecture series covering core grammar concepts', link: '#' },
  ],
  'Magazines & Journals': [
    { title: 'Sanskrit Vimarshah', desc: 'Peer-reviewed journal on Sanskrit studies and linguistics', link: '#' },
    { title: 'Indological Journal Archive', desc: 'Digitised back issues of leading Indology journals', link: '#' },
    { title: 'Samskrita Pratibha', desc: 'Quarterly magazine on contemporary Sanskrit writing', link: '#' },
  ],
  'Blogs': [
    { title: 'Sanskrit Documents Blog', desc: 'Notes and updates on newly digitised Sanskrit texts', link: '#' },
    { title: 'Learning Sanskrit Blog', desc: 'Personal essays and tips from long-time learners', link: '#' },
    { title: 'Indic Studies Notes', desc: 'Short-form posts on Sanskrit grammar and literature', link: '#' },
  ],
  'Dictionaries': [
    { title: 'Monier-Williams Online', desc: 'Searchable digitised Sanskrit-English dictionary', link: '#' },
    { title: 'Apte’s Practical Dictionary', desc: 'Full-text searchable practical Sanskrit-English dictionary', link: '#' },
    { title: 'Amarakosha Online', desc: 'Classical Sanskrit thesaurus with searchable entries', link: '#' },
  ],
  'Computational Tools': [
    { title: 'Sanskrit Heritage Reader', desc: 'Morphological parser and sandhi splitter for Sanskrit text', link: '#' },
    { title: 'SanskritNLP', desc: 'Open-source NLP toolkit for Sanskrit corpus processing', link: '#' },
    { title: 'Sandhi Analyzer', desc: 'Automated tool for splitting and analysing sandhi joins', link: '#' },
  ],
  'Tools for Typing, OCR, Fonts': [
    { title: 'Google Input Tools – Sanskrit', desc: 'Transliteration-based typing tool for Sanskrit script', link: '#' },
    { title: 'Sanskrit OCR', desc: 'Optical character recognition for Devanagari manuscripts', link: '#' },
    { title: 'Devanagari Unicode Fonts Pack', desc: 'Curated collection of free Unicode-compliant fonts', link: '#' },
  ],
  'eLearning': [
    { title: 'Vyoma Courses Platform', desc: 'Self-paced structured courses from beginner to scholar level', link: '#' },
    { title: 'Samskrita Bharati eLearning', desc: 'Online spoken Sanskrit certificate programs', link: '#' },
    { title: 'IGNOU Sanskrit Courses', desc: 'Distance-learning diploma and degree programs in Sanskrit', link: '#' },
  ],
};
