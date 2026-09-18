// Mirrors ui_kits/vyoma-org/About.jsx's hardcoded arrays.
// TEAM and TIMELINE_HIGHLIGHTS from the source file are omitted: they were
// defined but never rendered by any composed page there (dead data).
// TODO: replace with CMS-managed content (HLD Content Service) once live.

export const TIMELINE_FULL = [
  { year: '2010', text: "Vyoma's first Sanskrit self-learning product is launched." },
  { year: '2011', text: 'Launch of the sanskritfromhome website, bringing structured Sanskrit learning online.' },
  { year: 'Dec 7, 2012', text: 'Vyoma Linguistic Labs Foundation is incorporated as a non-profit in India.' },
  { year: '2012–2015', text: 'Building out e-learning products and mobile apps.' },
  { year: '2014 onwards', text: 'Supporting independent Sanskrit organisations through preparatory courses, growing both their reach and quality.' },
  { year: '2016 onwards', text: 'Introducing online webinar courses, discourses, and in-person events and workshops.' },
  { year: '2018–2019', text: 'Sharpening the e-learning model and piloting the Sanskrit language lab for institutions.' },
  { year: '2019–2021', text: 'Enhanced learning management system and a richer learner experience.' },
  { year: 'Jul 2025', text: "Launch of Digital Sanskrit, the world's first Sanskrit OTT platform." },
  { year: '[TBC]', text: 'Launch of the IKS VIKALPA centre for Indian Knowledge Systems research and application.' },
  { year: '[TBC]', text: 'Launch of Digital Sanskrit Language Labs for institutions.' },
  { year: '[TBC]', text: 'Launch of the Sandhi app, bringing Sanskrit tools to learners on the go.' },
];

export const BOARD = [
  { name: 'Dr. CA. Viswanathan P', role: 'Chief Executive Officer (CEO)' },
  { name: 'Dr. Venkatasubramanian P', role: 'Co-Founder & Chief Operating Officer (COO)' },
  { name: 'Dr. B. Krishnamurthy', role: 'Chairman & Chief Strategy Officer (CSO)', bio: 'Over 32 years of cross-sector experience; mentors the leadership team at Vyoma.' },
  { name: 'Sudhir Patavardhan', role: 'Chief Technology Officer (CTO)', bio: 'A people-friendly technologist known for finding simple solutions to complex problems.' },
  { name: 'Dr. Balaji Srinivasan', role: 'Chief Institutional Advancement Officer (CIAO)' },
  { name: 'Dr. Sowmya Krishnapur', role: 'Chief Learning Officer (CLO)', bio: 'Helping thousands learn the advanced shastras with ease.' },
];

export const ADVISORS = [
  { name: 'Dr. B. Mahadevan', role: 'Chief Advisor', bio: 'Retired Professor of Operations Management at IIM Bangalore and former Vice-Chancellor of Chinmaya Vishwavidyapeeth.' },
  { name: 'Smt. Rama Sivaraman', role: 'Chairperson, Advisory Board', bio: 'Former COO at Polaris Consulting; currently President (India Operations) at magedata.ai. A student and teacher of Vedanta.' },
  { name: 'Dr. Rajesh Bhaskaran Nair', role: 'Advisor', bio: 'Non-Executive Director and President, Indegene Inc.' },
];

export const COMMITTEE = [
  { name: 'CA. Viswanathan Ganesan', role: 'Organisation Development' },
  { name: 'B. K. Shivakumar', role: 'Fund Raising' },
  { name: 'Uma V', role: 'Fund Raising, CSR' },
  { name: 'Venkat Indrakanti', role: 'Outreach & Collaborations' },
  { name: 'Harshvardhan Khemani', role: 'Digital Presence & Promotions' },
];

export const PHASES = [
  { phase: 'Phase 1', time: '2026–2027', text: 'All seven Schools formally established, with foundational courses live across each.' },
  { phase: 'Phase 2', time: '2028–2029', text: 'Expanded course catalogue, research output, and institutional partnerships across the Schools.' },
  { phase: 'Phase 3', time: '2030–2032', text: 'The seven Schools operate as a unified Vyoma Global Virtual University, reaching a million learners.' },
];

export const CORE_TEAMS = [
  { heading: "CXO's Office", people: [
    { name: 'Sripriya Krishnamoorthy', role: 'Senior Linguist Assistant', bio: 'Attention to detail' },
    { name: 'Amogha Rao', role: "CXO's Support & PME", bio: 'Available for work till the last mile' },
    { name: 'Vasudha Srinath', role: "CXO's Support, Head, RTG & Events", bio: 'Helps Vyoma reach the unreached' },
  ] },
  { heading: 'Systems & Processes', people: [
    { name: 'Srilatha Sriram', role: 'Deputy Director, Systems & Processes', bio: 'A disciplined leader ensuring rigorous follow-up and volunteer management' },
    { name: 'M Manish', role: 'Project Executive, IT / Systems & Processes' },
  ] },
  { heading: 'Linguists & Publications', people: [
    { name: 'Dr. Sathyanarayana C T', role: 'Head, School of Shastras', bio: 'Ph.D in Advaita Vedanta; Nyaya and Mimamsa scholar' },
    { name: 'Dr. Leena Doshi', role: 'Senior Linguist Scholar', bio: 'Approachable & committed' },
    { name: 'Shankararama Sharma', role: 'Associate Director, AI Solutions', bio: 'Blends artificial intelligence with the shastras and teaching' },
    { name: 'Shreevalli Bhat', role: 'Senior Linguist', bio: 'Committed scholar' },
    { name: 'Sriranjani V', role: 'Manager, Linguistics', bio: 'A promising teacher and scholar' },
    { name: 'Namana S M', role: 'Linguist' },
    { name: 'Ramya Mangala Lakshmi', role: 'Linguist' },
    { name: 'Kalyani Mahesh', role: 'Project Executive, Publications' },
    { name: 'Smt. Padmavathi B R', role: 'Linguist' },
    { name: 'Vamsi Sudha', role: 'Linguist', bio: 'Budding techno-linguist leader' },
    { name: 'Sindhoora C', role: 'Linguist' },
    { name: 'Sivakami B', role: 'Linguist' },
    { name: 'Rohit Kumar', role: 'Linguist' },
    { name: 'Jishnu Suresh', role: 'Head, Publications' },
    { name: 'Sreedath Padh T S', role: 'Linguist' },
  ] },
  { heading: 'Kids Persona Team', people: [
    { name: 'Sowmya Nagaraj', role: 'Deputy Director, Learning', bio: 'Enabler of continuous improvement at Vyoma' },
    { name: 'Archana Rao', role: 'E-learning Administrator', bio: 'Children in safe hands' },
    { name: 'Rajeshwari Kamath', role: 'E-learning Administrator', bio: 'High energy person' },
  ] },
  { heading: 'IKS (Indian Knowledge Systems)', people: [
    { name: 'Dr. Vinayak Rajat Bhat', role: 'Senior Subject Matter Expert, IKS' },
    { name: 'Brunda Karanam', role: 'SME, IKS Law & Jurisprudence', bio: 'Integrates Dharma, Samskritam, Samskriti & Law' },
    { name: 'Battu Bhargava Sai', role: 'Research Associate, IKS' },
    { name: 'Javali Battu', role: 'Executive, IKS' },
  ] },
  { heading: 'Technology, AI & Language Lab', people: [
    { name: 'Sandhya L S', role: 'Head, Language Labs', bio: 'Calm & composed leader' },
    { name: 'Prasanna M', role: 'General Manager, Technological Solutions', bio: "The 'Doctor' of systems" },
    { name: 'Shubhashree Bhat', role: 'Manager, Quality Assurance' },
    { name: 'Kavya C V', role: 'Senior Software Engineer', bio: 'Go-getter' },
    { name: 'Sapna Patil', role: 'Software Engineer' },
    { name: 'Deepalakshmi S', role: 'Software Engineer' },
    { name: 'Deepika H S', role: 'Software Engineer', bio: 'Team player' },
    { name: 'Shashank Rao', role: 'Software Engineer (AI)' },
  ] },
  { heading: 'E-learning', people: [
    { name: 'Deepthi Rao', role: 'Senior Consultant, E-learning' },
    { name: 'Nagashree Arun', role: 'Senior E-learning Administrator', bio: 'Ready for continuous improvement' },
    { name: 'Shrinidhi C', role: 'E-learning Administrator', bio: 'Good learnability' },
    { name: 'Archana K V', role: 'E-learning Administrator', bio: 'Strong communicator' },
    { name: 'Shwetha B K', role: 'E-learning Administrator', bio: 'Silent achiever' },
    { name: 'Bharathi', role: 'E-learning Executive', bio: 'Silent performer' },
    { name: 'Iswarya S', role: 'E-learning Administrator' },
    { name: 'Shubham Ramashankar Kanaujiya', role: 'Data Engineer' },
  ] },
  { heading: 'Promotion, Events & Digital Marketing', people: [
    { name: 'Kesavan Sekar', role: 'Manager, Marketing & Analytics', bio: 'Humble, despite achievements' },
    { name: 'Vandana Bellur', role: 'Branding & Marketing Consultant' },
    { name: 'Pratiksha Bharadwaj', role: 'Multi-Tasking Resource (MTR)' },
    { name: 'Sonika', role: 'Digital Marketing Executive', bio: 'Dedicated team player' },
    { name: 'Pallavi V', role: 'Executive, Promotions & Marketing', bio: 'Dedicated team player' },
  ] },
  { heading: 'Sales', people: [
    { name: 'Phaneendra', role: 'Sales & Marketing Executive', bio: 'Always willing to learn; great bhajan singer' },
    { name: 'Kiran M', role: 'Executive, Sales & Order Fulfilment' },
    { name: 'Pallavi Shenoy', role: 'Executive, Dispatch' },
  ] },
  { heading: 'RTG & Customer Seva', people: [
    { name: 'Shubha Prasad', role: 'Customer Seva', bio: 'High level of patience with diverse customers' },
    { name: 'Smt. Nalini S Prasad', role: 'Teacher, RTG Services & Coordinator' },
  ] },
  { heading: 'Finance, Fundraising & Legal', people: [
    { name: 'Shivaramakrishnan M N', role: 'Senior Consultant, Fundraising & Finance' },
    { name: 'D Govindarajan', role: 'Senior Consultant, Fundraising' },
    { name: 'CA. Raksha Sankaranarayanan', role: 'Manager, IKS & Finance' },
    { name: 'Chaitra', role: 'Manager, Finance', bio: 'Committed to 100% compliant NPO status' },
    { name: 'Sudha Krishnan', role: 'Executive, Donor Service', bio: 'Takes care of donors' },
    { name: 'Deepika M', role: 'Accountant' },
    { name: 'Monisha R', role: 'Finance Executive' },
  ] },
  { heading: 'HR & Admin', people: [
    { name: 'Manjula N', role: 'Manager, HR' },
    { name: 'Jayashankar S', role: 'Manager, Admin', bio: 'Willing to do any work' },
    { name: 'Karthik Sarangan', role: 'Project Executive', bio: 'Blue-eyed boy of Vyoma' },
    { name: 'Lakshmi', role: 'Project Executive', bio: 'Blue-eyed girl of Vyoma' },
  ] },
  { heading: 'Associates In Our Journey', people: [
    { name: 'CA. Uday Kumar (Hon.)', role: 'Partner, Advisory Services', bio: 'Business analytics and process review support' },
    { name: 'Edmingle (Ascorb Technologies Pvt. Ltd)', role: 'Technology Partner', bio: 'Developer and maintainer of the sanskritfromhome.org website, with the Edmingle LMS at the backend' },
    { name: 'Sri Ranga (iQode Technologies)', role: 'Web Designer & Digital Marketer', bio: 'Founder of iQode Technologies, supporting our online presence' },
    { name: 'Pranava (Pranava Studios)', role: 'Melody Partner', bio: 'Audio product recording' },
    { name: 'K. Raghavendra Rao', role: 'Associate' },
    { name: 'Vishnu Daya & Co (Chartered Accountants)', role: 'Our Auditors' },
    { name: 'Artha Viveka', role: 'Our Financial Advisors' },
  ] },
];

export const PATRON_TIERS = [
  { sanskrit: 'Prayojakas', meaning: 'Initiators', note: "Those who helped set Vyoma's mission in motion." },
  { sanskrit: 'Rakshakas', meaning: 'Protectors', note: 'Supporters who safeguard and strengthen our work.' },
  { sanskrit: 'Samrakshakas', meaning: 'Sustainers', note: 'Patrons whose steady support keeps our mission alive.' },
  { sanskrit: 'Poshakas', meaning: 'Nourishers', note: 'Those who help our work grow and flourish.' },
  { sanskrit: 'Mahaposhakas', meaning: 'Major Supporters', note: 'Patrons whose generosity powers Vyoma at scale.' },
  { sanskrit: 'Paripalakas', meaning: 'Caretakers', note: 'Our all-round supporters, who stand with Vyoma across every need.' },
];

// Read-only seed for the patron tier table. The source design system's
// client-side "staff login" (a hardcoded password unlocking add/remove rows,
// persisted to localStorage) was NOT ported: it is an insecure pattern —
// unauthenticated client code should never gate writes — superseded by the
// real Admin Portal (HLD Section 5) once auth (LLD Section 5) exists.
export const PATRON_TIER_ROWS = {
  Prayojakas: [
    { name: 'Sandhya N S', place: 'Bangalore', product: 'Sahasranama' },
    { name: 'Rajesh A', place: 'Bangalore', product: '' },
    { name: 'Rama Sivaraman', place: 'Chennai', product: 'Grammar Products' },
    { name: 'Krishnamurthy B', place: 'Bangalore', product: 'Saptāhastotra Sāṅgrahaṇya & iOS App' },
    { name: 'Sumanth Suresh', place: 'USA', product: 'Replenishment of old products' },
  ],
  Rakshakas: [],
  Samrakshakas: [],
  Poshakas: [],
  Mahaposhakas: [],
  Paripalakas: [],
};

export const GOLDEN_WALL = [
  'Shri. B Krishnamurthy — Coimbatore',
  'Prof. B Mahadevan — Bangalore',
  'Smt. Rama Sivaraman — Chennai',
  'Shri. Sudhir Patavardhan — Bangalore',
  'Dr. Rajesh Nair — India',
  'Shri. Visvanathan Ganesan — Bangalore',
  'Smt. Malathi M, Shri. Shivashankar — Bangalore',
  "Shri. Rajesh Anandaramu, Smt. Sandhya Rajesh & Family — Bangalore",
  'Late Shri. Kuppuswamy; Shri Nagesh, Smt. Kamakshi; Shri Sarangan, Smt. Gomati; Shri Ananda, Smt. Prema; Shri Harish, Smt. Janani; Shri Mahesh, Smt. Aishwarya',
];

export const PATRON_TESTIMONIALS = [
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.' },
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.' },
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.' },
];

export const EXPLORE_MORE_LINKS = [
  { label: 'Our Story', href: '/about/our-story', text: 'From a single self-learning product in 2010 to a global Sanskrit ecosystem. See how Vyoma grew, year by year.' },
  { label: 'Roadmap', href: '/about/roadmap', text: 'Seven Schools of Sanskrit and Indian Knowledge Systems, growing towards a Vyoma Global Virtual University. See where we are headed.' },
  { label: 'Leadership', href: '/about/leadership', text: 'Meet the founders and leaders whose vision and scholarship guide everything Vyoma does.' },
  { label: 'Core Team', href: '/about/core-team', text: 'The scholars, technologists, and coordinators who bring Sanskrit to learners every day.' },
  { label: 'Our Patrons', href: '/about/patrons', text: 'The donors, partners, and well-wishers whose support makes free Sanskrit education possible.' },
];
