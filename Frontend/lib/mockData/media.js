// Mirrors ui_kits/vyoma-org/Media.jsx and its sub-pages (Press, Events,
// Testimonials, Newsletter, Gallery, Resources). Feeds services/mediaService.js
// and getMediaContent() in services/pageService.js. Blog moved out to its own
// dedicated lib/mockData/blog.js in Phase E — see that file.

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

// Real newspaper clipping coverage, grouped exactly as the live WordPress
// Media page groups them (same headings, same items, same order) — see
// Backend/scripts/wordpress/import/press-media-migration.mjs for the source
// mapping. Populated by that migration script; empty here only until it
// has run against a given database.
export const PRESS_CLIPPING_SECTIONS = [];

export const PRESS_RADIO = [
  { title: 'Benefits and Courses of Learning Sanskrit', duration: '3:07', url: '' },
  { title: 'Introduction to Vyoma Labs', duration: '2:24', url: '' },
  { title: 'Sanskrit: A Magic Medicine', duration: '3:10', url: '' },
];

// --- Events -----------------------------------------------------------------

export const EVENT_CATEGORIES = ['All', 'Workshop', 'Talk', 'Meeting', 'Parayanam', 'Vyoma Products', 'General'];

export const UPCOMING_EVENTS = [];

export const PAST_EVENTS = [
  { type: "Parayanam", date: "23 May 2024 – 16 Jul 2024", title: "Rāma-Sevā-Yātrā in the USA, by ‘Vyoma Sanskrit Brothers’", note: "Dr. Venkatasubramanian and Vid. CA Viswanathan ('Vyoma Sanskrit Brothers') toured the USA (Texas, Bay Area, Boston/NJ/NY) with Rāmāyaṇa recitation, devotional discourses, and talks on Rāmarājya.", imageUrl: "http://vyoma.org/wp-content/uploads/2024/05/USA_MasterFlyer_1920x1080.png", active: true },
  { type: "Parayanam", date: "21 Mar 2026 – 29 Mar 2026", title: "Śrīmad Vālmīki Rāmāyaṇa Navāha Pārāyaṇa Pravacana Yajñaḥ", note: "A 9-day online Rāmāyaṇa Pārāyaṇa and Pravacana by Dr. Venkatasubramanian P and Dr. Viswanathan P, preceded by a pūrvaṅga-pūjā on 20 March.", imageUrl: "http://vyoma.org/wp-content/uploads/2026/03/Rev-1.jpeg", link: "https://www.sanskritfromhome.org/course-details/SrimadValmikiRamayanaNavahaOnlineParayanaPravacana-49025", active: true },
  { type: "General", date: "Feb 2026", title: "Swami Parmarthananda, Astika Bhakta Samaj", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/WhatsApp-Image-2026-04-05-at-3.14.10-PM-1.jpeg", active: true },
  { type: "Vyoma Products", date: "", title: "Website release by Sringeri Jagadguru @ Sringeri", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image-1-2.png", active: true },
  { type: "Vyoma Products", date: "", title: "Samarpanam of Vyoma publications to Jagadguru", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/Samarpanam-of-Vyoma-publications-to-Jagadguru-3.jpeg", active: true },
  { type: "General", date: "Sep 2023", title: "Sri Ramanacharanatirtha Nochur Venkataraman at Narayaneeyam Valedictory function", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/Screenshot-2024-02-06-125159.jpg", active: true },
  { type: "Vyoma Products", date: "", title: "Release of Vocabulary 1 & 2 @ Udupi by Pejawar Mutt Swamiji", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image-4.png", active: true },
  { type: "General", date: "", title: "Sri Ranganji exploring the Bhagavad Gita book of Vyoma", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/bok-fair5.jpeg", active: true },
  { type: "Meeting", date: "", title: "Meeting with Sri Sri Guruji @ Bangalore", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image-1.png", active: true },
  { type: "Meeting", date: "", title: "Fruitful meeting with Swami Baba Ramdev @ Haridwar", imageUrl: "https://vyoma.org/wp-content/uploads/2024/09/Fruitful-meeting-with-Swami-Baba-Ramdev-@-Haridwar.png", active: true },
  { type: "Vyoma Products", date: "", title: "Bhagavad Gita product release by Swami Tejomayananda @ Pune", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image-2.png", active: true },
  { type: "General", date: "Jul 2019", title: "VSB with Swami Brahmananda of Chinmaya Mission", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/104eventimage.jpg", active: true },
  { type: "General", date: "", title: "Prof. Mani Dravid Sastrigal visits Vyoma stall", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_134919-scaled.jpg", active: true },
  { type: "General", date: "", title: "Sri. Srirama Ghanapati, Veda Bhavanam visits Vyoma stall", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/IMG_20230628_105833-scaled.jpg", active: true },
  { type: "General", date: "Feb 2023", title: "World conference on Contribution of Indian Knowledge & Sanskrit as Humanity", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/puraskara1.jpeg", active: true },
  { type: "General", date: "Jul 2022", title: "Surasaraswathi Sabha 50th Anniversary", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Surasaraswathi-Sabha-50th-Anniversary-2.jpeg", active: true },
  { type: "Talk", date: "Sep 2025", title: "A talk at \"National Seminar on Indian Knowledge Systems – Leadership Lessons from Ancient Indian Wisdom\" in association with IQAC, NSB Academy", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/NSB-Seminar-1.jpg", active: true },
  { type: "Talk", date: "Oct 2025", title: "Lecture on \"IKS concept – Management Priniciples from the Ramayana\" at Surana College", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Sir.-Vishwam-at-Surana-4.jpeg", active: true },
  { type: "Talk", date: "Sep 2024", title: "Vedanta Shravana – Essential Vedanta", imageUrl: "https://vyoma.org/wp-content/uploads/2024/09/Vedanta-Shravana-Essential-Vedanta-22-Sep-2024.png", active: true },
  { type: "General", date: "Jul 2024", title: "Conference about Gurukula shiksha", imageUrl: "https://vyoma.org/wp-content/uploads/2024/09/Conference-about-Gurukula-shiksha-on-6th-July-2024.png", active: true },
  { type: "Talk", date: "Aug 2024", title: "Yogas in Bhagavad Gita at Yogavijnana", imageUrl: "https://vyoma.org/wp-content/uploads/2024/09/Yogas-in-Bhagavad-Gita-at-Yogavijnana-on-Jul-20th-Aug11th-2024.png", active: true },
  { type: "Parayanam", date: "Feb 2024", title: "In-person Valmiki Ramayana Navaha Upanyasam at Agastya Gurukulam", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/image-10.png", active: true },
  { type: "Talk", date: "Nov 2025", title: "Lecture – \"Indian Knowledge System – an Overview\" at MES Institute of Management, Bangalore", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/MES.png", active: true },
  { type: "Talk", date: "Oct 2025", title: "Keynote speech at Sindhi College on \"Sanskrit Language Lab for University Students\"", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Sindhi-College-2.png", active: true },
  { type: "Talk", date: "Jan 2024", title: "Online lecture on Unveiling Timeless Insights from Puranas through Indica", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/image-9.png", active: true },
  { type: "Talk", date: "Sep 2023", title: "Talk on Timeless Gita Endless Bliss at JP Nagar, Bangalore", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/WhatsApp-Image-2023-10-31-at-3.27.53-PM-1.jpeg", active: true },
  { type: "Talk", date: "2023", title: "Presentation by Viswanathan P during World Sanskrit Conference 2023", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/lectures2.jpeg", active: true },
  { type: "Talk", date: "2023", title: "Smt. Maheswari presenting in World Sanskrit Conference 2023", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/lectures1.jpeg", active: true },
  { type: "Talk", date: "", title: "Power of Sanskrit Lecture at Sheshadripuram College", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/Power-of-Sanskrit-Lecture-at-Sheshadripuram-College-2.jpeg", active: true },
  { type: "General", date: "Dec 2025", title: "2nd Ayurveda World Summit", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/2ND-WORLD-AYURVEDA-SUMMIT.jpeg", active: true },
  { type: "General", date: "Dec 2025", title: "INCOFYRA conference", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/INCOFYRA.png", active: true },
  { type: "General", date: "Nov 2025", title: "Vyoma's Participation at Akhila Bharatiyam Adhiveshanam", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/AKHILA-BHARATIYA-ADHIVESHANAM.jpeg", active: true },
  { type: "General", date: "Nov 2025", title: "Adani Global Indology Conclave", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/ADANI-GLOBAL-INDOLOGY-CONCLAVE.jpeg", active: true },
  { type: "General", date: "Jun 2025", title: "Vyoma's offerings at 19th World Sanskrit Conference, Kathmandu, Nepal", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/WORLD-SANSKRIT-CONFERENCE-2025-NEPAL.png", active: true },
  { type: "General", date: "Feb 2024", title: "Vyoma Labs participated in the New Delhi World Book Fair", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/image-12.png", active: true },
  { type: "General", date: "Nov 2023", title: "Vyoma Stall at Namasmaran", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/image-13.png", active: true },
  { type: "General", date: "Nov 2023", title: "Vyoma book stall in National seminar on Bharatiya 64 Arts organised by Samskriti Foundation", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/book-fairs.jpeg", active: true },
  { type: "General", date: "Dec 2018", title: "Bangalore Book Fair", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Bangalore-Book-Fair-1.jpg", active: true },
  { type: "General", date: "Jan 2018", title: "Vyoma Labs participated in Hindu Spiritual Service Fair", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-4.jpg", active: true },
  { type: "General", date: "", title: "Rama Sivaraman, Chairperson of Vyoma visiting our book stall", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Hindu-spiritual-service-fair-1.jpg", active: true },
  { type: "General", date: "", title: "Chamrajpete Pratibha Puraskara", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Chamrajpete-Pratibha-Puraskara-4.jpeg", active: true },
  { type: "General", date: "30 Mar 2026", title: "Prof Ganti Murthy Visit", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Prof-Ganti-Murthy.png", active: true },
  { type: "General", date: "Feb 2026", title: "Honorable Vice Chancellor Srinivas Varkhedi from CSU", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/HONORABLE-VICE-CHANCELLOR-SRINIVASA-VARKHEDI-of-CSU.jpeg", active: true },
  { type: "General", date: "Nov 2025", title: "Padmashri Award 2020 recipient Sri Ramakrishnan S from Amar Seva Sangam", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Sri.-Ramakrishnan-from-Amar-Seva-Sangam.png", active: true },
  { type: "General", date: "Nov 2025", title: "Sree Ram Iyer – COO and Head of Group Capability Centres, visited Vyoma", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Sree-Ram-Iyer-scaled.jpeg", active: true },
  { type: "General", date: "", title: "Students of Dr. Sowmya Krishnapur visit office", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/visit1.jpeg", active: true },
  { type: "General", date: "Dec 2023", title: "Visit of Chairman – BKM Sir", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Visit-of-Chairman-BKM-Sir-1.jpg", active: true },
  { type: "General", date: "Feb 2024", title: "Shri. Yashodeep Deodhar, CEO of 21notes.com visited the Vyoma Office", imageUrl: "https://vyoma.org/wp-content/uploads/2024/03/image-14.png", active: true },
  { type: "General", date: "Jul 2023", title: "MM Dorbala Prabhakara Sharma visit to office", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/visit3.jpeg", active: true },
  { type: "General", date: "Dec 2022", title: "Sri Tirunarayanan's visit", imageUrl: "https://vyoma.org/wp-content/uploads/2022/12/Sri-Tirunarayanan_s-visit-1.jpeg", active: true },
  { type: "General", date: "Jan 2026", title: "BBMP Bhartiya Vidya Bhavan School RTG inauguration", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/BBMP-Bhartiya-Vidya-Bhavan-school-RTG-school-students-enrichment-session-Inauguration.jpeg", active: true },
  { type: "General", date: "", title: "Enrichment Session at BR hills (RTG-Launch)", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/RTG-Enrichment-Session-at-BR-HIlls-scaled.jpeg", active: true },
  { type: "General", date: "", title: "Volunteering at Aapatsahaaya Foundation by teaching classes in Tyamagondlu", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image1-5.png", active: true },
  { type: "General", date: "", title: "Volunteering at Aapatsahaaya Foundation by teaching classes in Hoskote", imageUrl: "https://vyoma.org/wp-content/uploads/2024/02/image-5.png", active: true },
  { type: "General", date: "Sep 2020", title: "Collaboration with Shankara Colony", imageUrl: "https://vyoma.org/wp-content/uploads/2023/07/12.jpg", active: true },
  { type: "Parayanam", date: "Mar 2026", title: "Ramayana Parayana", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Ramayana-Parayana-2026.jpg", active: true },
  { type: "General", date: "Mar 2026", title: "Holi celebration", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Holi-2026.jpg", active: true },
  { type: "General", date: "Sep 2025", title: "Navratri Celebration", imageUrl: "https://vyoma.org/wp-content/uploads/2026/04/Navratri-Celebration-1.png", active: true },
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
