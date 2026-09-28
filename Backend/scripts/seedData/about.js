// Mirrors ui_kits/vyoma-org/About.jsx's hardcoded arrays, restructured for
// the Phase C admin CMS. Every text/link value is preserved exactly from
// before; only `active` (default true) and, for people, `image` (replacing
// the earlier plain `imageUrl` string with the ImageField object shape —
// {mediaId, url, alt} — both were empty/unset for every person already, so
// this is a shape upgrade, not a data change) are new.
// TEAM and TIMELINE_HIGHLIGHTS from the source file are omitted: they were
// defined but never rendered by any composed page there (dead data).

export const TIMELINE_FULL = [
  { year: '2010', text: "Vyoma's first Sanskrit self-learning product is launched.", active: true },
  { year: '2011', text: 'Launch of the sanskritfromhome website, bringing structured Sanskrit learning online.', active: true },
  { year: 'Dec 7, 2012', text: 'Vyoma Linguistic Labs Foundation is incorporated as a non-profit in India.', active: true },
  { year: '2012–2015', text: 'Building out e-learning products and mobile apps.', active: true },
  { year: '2014 onwards', text: 'Supporting independent Sanskrit organisations through preparatory courses, growing both their reach and quality.', active: true },
  { year: '2016 onwards', text: 'Introducing online webinar courses, discourses, and in-person events and workshops.', active: true },
  { year: '2018–2019', text: 'Sharpening the e-learning model and piloting the Sanskrit language lab for institutions.', active: true },
  { year: '2019–2021', text: 'Enhanced learning management system and a richer learner experience.', active: true },
  { year: 'Jul 2025', text: "Launch of Digital Sanskrit, the world's first Sanskrit OTT platform.", active: true },
  { year: '[TBC]', text: 'Launch of the IKS VIKALPA centre for Indian Knowledge Systems research and application.', active: true },
  { year: '[TBC]', text: 'Launch of Digital Sanskrit Language Labs for institutions.', active: true },
  { year: '[TBC]', text: 'Launch of the Sandhi app, bringing Sanskrit tools to learners on the go.', active: true },
];

export const BOARD = [
  { name: 'Dr. CA. Viswanathan P', role: 'Chief Executive Officer (CEO)', bio: null, image: null, active: true },
  { name: 'Dr. Venkatasubramanian P', role: 'Co-Founder & Chief Operating Officer (COO)', bio: null, image: null, active: true },
  { name: 'Dr. B. Krishnamurthy', role: 'Chairman & Chief Strategy Officer (CSO)', bio: 'Over 32 years of cross-sector experience; mentors the leadership team at Vyoma.', image: null, active: true },
  { name: 'Sudhir Patavardhan', role: 'Chief Technology Officer (CTO)', bio: 'A people-friendly technologist known for finding simple solutions to complex problems.', image: null, active: true },
  { name: 'Dr. Balaji Srinivasan', role: 'Chief Institutional Advancement Officer (CIAO)', bio: null, image: null, active: true },
  { name: 'Dr. Sowmya Krishnapur', role: 'Chief Learning Officer (CLO)', bio: 'Helping thousands learn the advanced shastras with ease.', image: null, active: true },
];

export const ADVISORS = [
  { name: 'Dr. B. Mahadevan', role: 'Chief Advisor', bio: 'Retired Professor of Operations Management at IIM Bangalore and former Vice-Chancellor of Chinmaya Vishwavidyapeeth.', image: null, active: true },
  { name: 'Smt. Rama Sivaraman', role: 'Chairperson, Advisory Board', bio: 'Former COO at Polaris Consulting; currently President (India Operations) at magedata.ai. A student and teacher of Vedanta.', image: null, active: true },
  { name: 'Dr. Rajesh Bhaskaran Nair', role: 'Advisor', bio: 'Non-Executive Director and President, Indegene Inc.', image: null, active: true },
];

export const COMMITTEE = [
  { name: 'CA. Viswanathan Ganesan', role: 'Organisation Development', image: null, active: true },
  { name: 'B. K. Shivakumar', role: 'Fund Raising', image: null, active: true },
  { name: 'Uma V', role: 'Fund Raising, CSR', image: null, active: true },
  { name: 'Venkat Indrakanti', role: 'Outreach & Collaborations', image: null, active: true },
  { name: 'Harshvardhan Khemani', role: 'Digital Presence & Promotions', image: null, active: true },
];

export const PHASES = [
  { phase: 'Phase 1', time: '2026–2027', text: 'All seven Schools formally established, with foundational courses live across each.', active: true },
  { phase: 'Phase 2', time: '2028–2029', text: 'Expanded course catalogue, research output, and institutional partnerships across the Schools.', active: true },
  { phase: 'Phase 3', time: '2030–2032', text: 'The seven Schools operate as a unified Vyoma Global Virtual University, reaching a million learners.', active: true },
];

function person(name, role, bio) {
  return { name, role, bio: bio || null, image: null, active: true };
}

export const CORE_TEAMS = [
  { heading: "CXO's Office", active: true, people: [
    person('Sripriya Krishnamoorthy', 'Senior Linguist Assistant', 'Attention to detail'),
    person('Amogha Rao', "CXO's Support & PME", 'Available for work till the last mile'),
    person('Vasudha Srinath', "CXO's Support, Head, RTG & Events", 'Helps Vyoma reach the unreached'),
  ] },
  { heading: 'Systems & Processes', active: true, people: [
    person('Srilatha Sriram', 'Deputy Director, Systems & Processes', 'A disciplined leader ensuring rigorous follow-up and volunteer management'),
    person('M Manish', 'Project Executive, IT / Systems & Processes'),
  ] },
  { heading: 'Linguists & Publications', active: true, people: [
    person('Dr. Sathyanarayana C T', 'Head, School of Shastras', 'Ph.D in Advaita Vedanta; Nyaya and Mimamsa scholar'),
    person('Dr. Leena Doshi', 'Senior Linguist Scholar', 'Approachable & committed'),
    person('Shankararama Sharma', 'Associate Director, AI Solutions', 'Blends artificial intelligence with the shastras and teaching'),
    person('Shreevalli Bhat', 'Senior Linguist', 'Committed scholar'),
    person('Sriranjani V', 'Manager, Linguistics', 'A promising teacher and scholar'),
    person('Namana S M', 'Linguist'),
    person('Ramya Mangala Lakshmi', 'Linguist'),
    person('Kalyani Mahesh', 'Project Executive, Publications'),
    person('Smt. Padmavathi B R', 'Linguist'),
    person('Vamsi Sudha', 'Linguist', 'Budding techno-linguist leader'),
    person('Sindhoora C', 'Linguist'),
    person('Sivakami B', 'Linguist'),
    person('Rohit Kumar', 'Linguist'),
    person('Jishnu Suresh', 'Head, Publications'),
    person('Sreedath Padh T S', 'Linguist'),
  ] },
  { heading: 'Kids Persona Team', active: true, people: [
    person('Sowmya Nagaraj', 'Deputy Director, Learning', 'Enabler of continuous improvement at Vyoma'),
    person('Archana Rao', 'E-learning Administrator', 'Children in safe hands'),
    person('Rajeshwari Kamath', 'E-learning Administrator', 'High energy person'),
  ] },
  { heading: 'IKS (Indian Knowledge Systems)', active: true, people: [
    person('Dr. Vinayak Rajat Bhat', 'Senior Subject Matter Expert, IKS'),
    person('Brunda Karanam', 'SME, IKS Law & Jurisprudence', 'Integrates Dharma, Samskritam, Samskriti & Law'),
    person('Battu Bhargava Sai', 'Research Associate, IKS'),
    person('Javali Battu', 'Executive, IKS'),
  ] },
  { heading: 'Technology, AI & Language Lab', active: true, people: [
    person('Sandhya L S', 'Head, Language Labs', 'Calm & composed leader'),
    person('Prasanna M', 'General Manager, Technological Solutions', "The 'Doctor' of systems"),
    person('Shubhashree Bhat', 'Manager, Quality Assurance'),
    person('Kavya C V', 'Senior Software Engineer', 'Go-getter'),
    person('Sapna Patil', 'Software Engineer'),
    person('Deepalakshmi S', 'Software Engineer'),
    person('Deepika H S', 'Software Engineer', 'Team player'),
    person('Shashank Rao', 'Software Engineer (AI)'),
  ] },
  { heading: 'E-learning', active: true, people: [
    person('Deepthi Rao', 'Senior Consultant, E-learning'),
    person('Nagashree Arun', 'Senior E-learning Administrator', 'Ready for continuous improvement'),
    person('Shrinidhi C', 'E-learning Administrator', 'Good learnability'),
    person('Archana K V', 'E-learning Administrator', 'Strong communicator'),
    person('Shwetha B K', 'E-learning Administrator', 'Silent achiever'),
    person('Bharathi', 'E-learning Executive', 'Silent performer'),
    person('Iswarya S', 'E-learning Administrator'),
    person('Shubham Ramashankar Kanaujiya', 'Data Engineer'),
  ] },
  { heading: 'Promotion, Events & Digital Marketing', active: true, people: [
    person('Kesavan Sekar', 'Manager, Marketing & Analytics', 'Humble, despite achievements'),
    person('Vandana Bellur', 'Branding & Marketing Consultant'),
    person('Pratiksha Bharadwaj', 'Multi-Tasking Resource (MTR)'),
    person('Sonika', 'Digital Marketing Executive', 'Dedicated team player'),
    person('Pallavi V', 'Executive, Promotions & Marketing', 'Dedicated team player'),
  ] },
  { heading: 'Sales', active: true, people: [
    person('Phaneendra', 'Sales & Marketing Executive', 'Always willing to learn; great bhajan singer'),
    person('Kiran M', 'Executive, Sales & Order Fulfilment'),
    person('Pallavi Shenoy', 'Executive, Dispatch'),
  ] },
  { heading: 'RTG & Customer Seva', active: true, people: [
    person('Shubha Prasad', 'Customer Seva', 'High level of patience with diverse customers'),
    person('Smt. Nalini S Prasad', 'Teacher, RTG Services & Coordinator'),
  ] },
  { heading: 'Finance, Fundraising & Legal', active: true, people: [
    person('Shivaramakrishnan M N', 'Senior Consultant, Fundraising & Finance'),
    person('D Govindarajan', 'Senior Consultant, Fundraising'),
    person('CA. Raksha Sankaranarayanan', 'Manager, IKS & Finance'),
    person('Chaitra', 'Manager, Finance', 'Committed to 100% compliant NPO status'),
    person('Sudha Krishnan', 'Executive, Donor Service', 'Takes care of donors'),
    person('Deepika M', 'Accountant'),
    person('Monisha R', 'Finance Executive'),
  ] },
  { heading: 'HR & Admin', active: true, people: [
    person('Manjula N', 'Manager, HR'),
    person('Jayashankar S', 'Manager, Admin', 'Willing to do any work'),
    person('Karthik Sarangan', 'Project Executive', 'Blue-eyed boy of Vyoma'),
    person('Lakshmi', 'Project Executive', 'Blue-eyed girl of Vyoma'),
  ] },
  { heading: 'Associates In Our Journey', active: true, people: [
    person('CA. Uday Kumar (Hon.)', 'Partner, Advisory Services', 'Business analytics and process review support'),
    person('Edmingle (Ascorb Technologies Pvt. Ltd)', 'Technology Partner', 'Developer and maintainer of the sanskritfromhome.org website, with the Edmingle LMS at the backend'),
    person('Sri Ranga (iQode Technologies)', 'Web Designer & Digital Marketer', 'Founder of iQode Technologies, supporting our online presence'),
    person('Pranava (Pranava Studios)', 'Melody Partner', 'Audio product recording'),
    person('K. Raghavendra Rao', 'Associate'),
    person('Vishnu Daya & Co (Chartered Accountants)', 'Our Auditors'),
    person('Artha Viveka', 'Our Financial Advisors'),
  ] },
];

export const PATRON_TIERS = [
  { sanskrit: 'Prayojakas', meaning: 'Initiators', note: "Those who helped set Vyoma's mission in motion.", active: true },
  { sanskrit: 'Rakshakas', meaning: 'Protectors', note: 'Supporters who safeguard and strengthen our work.', active: true },
  { sanskrit: 'Samrakshakas', meaning: 'Sustainers', note: 'Patrons whose steady support keeps our mission alive.', active: true },
  { sanskrit: 'Poshakas', meaning: 'Nourishers', note: 'Those who help our work grow and flourish.', active: true },
  { sanskrit: 'Mahaposhakas', meaning: 'Major Supporters', note: 'Patrons whose generosity powers Vyoma at scale.', active: true },
  { sanskrit: 'Paripalakas', meaning: 'Caretakers', note: 'Our all-round supporters, who stand with Vyoma across every need.', active: true },
];

// Read-only seed for the patron tier table. The source design system's
// client-side "staff login" (a hardcoded password unlocking add/remove rows,
// persisted to localStorage) was NOT ported: it is an insecure pattern —
// unauthenticated client code should never gate writes — superseded by the
// real Admin Portal (this CMS) now that auth exists. Kept as a fixed set of
// 6 tier keys (matching PATRON_TIERS) rather than a repeatable list of tiers
// themselves, since the tier names are a fixed taxonomy, not admin-editable.
export const PATRON_TIER_ROWS = {
  Prayojakas: [
    { name: 'Sandhya N S', place: 'Bangalore', product: 'Sahasranama', active: true },
    { name: 'Rajesh A', place: 'Bangalore', product: '', active: true },
    { name: 'Rama Sivaraman', place: 'Chennai', product: 'Grammar Products', active: true },
    { name: 'Krishnamurthy B', place: 'Bangalore', product: 'Saptāhastotra Sāṅgrahaṇya & iOS App', active: true },
    { name: 'Sumanth Suresh', place: 'USA', product: 'Replenishment of old products', active: true },
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
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.', active: true },
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.', active: true },
  { name: 'Patron Name', location: 'City, Country', quote: 'Quote placeholder — what this patron would say about supporting Vyoma.', active: true },
];

export const EXPLORE_MORE_LINKS = [
  { label: 'Our Story', href: '/about/our-story', text: 'From a single self-learning product in 2010 to a global Sanskrit ecosystem. See how Vyoma grew, year by year.', active: true },
  { label: 'Roadmap', href: '/about/roadmap', text: 'Seven Schools of Sanskrit and Indian Knowledge Systems, growing towards a Vyoma Global Virtual University. See where we are headed.', active: true },
  { label: 'Leadership', href: '/about/leadership', text: 'Meet the founders and leaders whose vision and scholarship guide everything Vyoma does.', active: true },
  { label: 'Core Team', href: '/about/core-team', text: 'The scholars, technologists, and coordinators who bring Sanskrit to learners every day.', active: true },
  { label: 'Our Patrons', href: '/about/patrons', text: 'The donors, partners, and well-wishers whose support makes free Sanskrit education possible.', active: true },
];

// About had no title/description anywhere (per the Phase 1 inventory) —
// same gap as Home before Phase B.
export const SEO = { title: null, description: null, canonical: '/about', ogImage: null };
