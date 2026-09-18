// Mirrors ui_kits/vyoma-org/JoinUs.jsx's hardcoded arrays.
// TODO: replace with CMS-managed content (HLD Content Service) once live.

export const TRACKS = [
  { title: 'Volunteer', href: '/join-us/volunteer', body: 'Seva-based volunteering for teaching, translation, events, and community outreach — no fixed time commitment required.' },
  { title: 'Internship', href: '/join-us/internship', body: 'Short-term, project-based internships for students and early-career scholars in linguistics, tech, and content.' },
  { title: 'CSR Projects', href: '/join-us/csr-projects', body: 'Partnership projects for corporates seeking measurable CSR impact in Sanskrit education and language technology.' },
  { title: 'Corpus Fund', href: '/join-us/corpus-fund', body: 'Long-term endowment giving that sustains Vyoma’s programs beyond a single project cycle.' },
  { title: 'Careers / Jobs', href: '/join-us/careers', body: 'Full-time roles across curriculum, language technology, and operations — building free Sanskrit education at scale.' },
];

export const VOLUNTEER_CATEGORIES = [
  { title: 'Content Development', items: ['Slides and teaching material', 'Translation and transcription', 'Quiz and assessment questions', 'Proofreading and product testing'] },
  { title: 'Online Platform Support', items: ['Uploading course content', 'Facilitating classes', 'Video timestamping and editing'] },
  { title: 'Technical', items: ['Framework design', 'App development', 'Typesetting and book design'] },
  { title: 'Outreach', items: ['Course promotions', 'Social media', 'Event assistance'] },
  { title: 'Students', items: ['Internships and short-term projects'] },
];

export const VOLUNTEER_FEATURED = [
  { name: 'Smt. Radha Raju', note: 'A long-standing volunteer whose work has shaped Vyoma’s teaching material and community over the years.' },
  { name: 'Smt. Bhuvaneshwari Subramanian', note: 'A dedicated contributor supporting Vyoma’s content and outreach efforts.' },
];

export const INTERNSHIP_REASONS = [
  'Work on meaningful projects that combine Sanskrit, IKS, education, and the latest technology for real-world impact.',
  'Get hands-on with modern tools, AI systems, digital platforms, and collaborative delivery.',
  'Learn directly from experienced mentors, researchers, educators, and professionals across interdisciplinary domains.',
  'Take ownership early, contribute to live initiatives, and build practical skills in communication, coordination, problem-solving, and independent execution.',
  'Join a purpose-driven team that values curiosity and innovation.',
  'Sanskrit knowledge may or may not be required, check the skill needed against each role.',
];

export const CSR_PROJECTS = [
  { name: 'Digital IKS Language Lab (RTG Schools)', category: 'Education', cost: '₹6L/school/yr; ₹18L for 3-yr curriculum', body: 'Sets up a fully digital Indian Knowledge Systems language lab inside RTG schools, giving students structured, tech-enabled Sanskrit learning.' },
  { name: 'Digital Sanskrit Language Lab', category: 'Education', cost: '₹5.5L / 100 students / 3 yrs', body: 'A scalable digital lab model bringing structured Sanskrit instruction to 100 students at a time over a three-year curriculum.' },
  { name: 'Research Center for IKS', category: 'Education', cost: '₹10L matching grant', body: 'Seeds a dedicated research centre studying and documenting Indian Knowledge Systems, matched rupee-for-rupee with CSR support.' },
  { name: 'MOOC Grade Recording Studio', category: 'Education', cost: '₹45L', body: 'Builds a professional recording studio to produce graded, broadcast-quality MOOC content for Sanskrit and IKS courses.' },
  { name: 'Vyoma OTT Platform', category: 'Education', cost: '₹45L', body: 'Funds a dedicated streaming platform to distribute Vyoma’s course library and recorded lectures at scale.' },
  { name: 'HEARTS (therapy through Sanskrit)', category: 'Education', cost: '₹16L; ₹16K/beneficiary/yr', body: 'A therapeutic program using Sanskrit chanting and recitation practices to support wellbeing, delivered per-beneficiary.' },
  { name: 'IT Infrastructure for Content Dev', category: 'Education', cost: '₹26.5L annually', body: 'Provides the hardware and software backbone needed to produce Vyoma’s digital courses and content year-round.' },
  { name: 'Virtual Nalanda University', category: 'Heritage/Education', cost: '₹65L annually', body: 'Recreates a Nalanda-style residential learning experience virtually, connecting learners worldwide to classical Indian scholarship.' },
  { name: 'Sanskrit Sabhas Revival', category: 'Heritage/Education', cost: '₹13.5L annually', body: 'Revives traditional Sanskrit sabhas — community gatherings for debate, recitation, and discourse — across partner regions.' },
  { name: 'Art and Heritage Courses', category: 'Heritage/Education', cost: '₹30L annually', body: 'Develops courses connecting Sanskrit literature to Indian art, architecture, and heritage traditions for a broader learner base.' },
  { name: 'DSLL – 108 Pathashala', category: 'Educational', cost: '₹180L; ₹1,200/beneficiary/yr', body: 'Extends the Digital Sanskrit Language Lab model to a network of 108 traditional pathashalas across India.' },
  { name: 'Data Center & Secured Connectivity', category: 'Organisation', cost: '₹60L (₹35L one-time)', body: 'Establishes secure data infrastructure and connectivity to support Vyoma’s growing digital learning operations.' },
  { name: 'ISO Certification and Upkeep', category: 'Organisation', cost: '₹35L', body: 'Funds ISO certification and its ongoing maintenance, strengthening Vyoma’s institutional governance standards.' },
];

export const CAREER_ROLES = [
  { title: 'Executive Assistant to the CEO', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru', desc: 'Support the CEO with scheduling, correspondence, travel, and day-to-day operations, acting as a key point of coordination across the organization.' },
  { title: 'AV Engineer', dept: 'Technology', type: 'Full-time', loc: 'Bengaluru', desc: 'Set up, operate, and maintain audio-visual equipment for recordings, live classes, and events, ensuring consistent production quality.' },
  { title: 'Motion Graphics & Video Creator', dept: 'Content', type: 'Full-time', loc: 'Bengaluru', desc: 'Design and produce motion graphics and edited video content for courses, campaigns, and social media.' },
  { title: 'PMO Lead', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'UI/UX Designer', dept: 'Technology', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'BCP Network Engineer', dept: 'Technology', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'Manager, Academic Affairs & Curriculum', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'Linguist', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'Senior Linguist', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'E-Learning Administrator', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'Learning Path Counsellor', dept: 'Academics', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'GM Operations', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru' },
  { title: 'Director Strategy', dept: 'Operations', type: 'Full-time', loc: 'Bengaluru' },
];

export const CAREER_STEPS = [
  { n: '1', t: 'Apply', d: "Apply through the role's application form." },
  { n: '2', t: 'Tests', d: 'Written and practical tests relevant to the role.' },
  { n: '3', t: 'Interviews', d: 'Two in-person interviews at our Bengaluru office.' },
];
