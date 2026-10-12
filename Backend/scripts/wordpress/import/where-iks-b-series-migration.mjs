// WordPress -> MERN migration: Where-IKS / O-MANTRI, B-SERIES ONLY
// (Batch C, Stage C-B of a 3-series staged migration -- A-series is
// already migrated and committed; C-series is a separate, later script.
// See the additive-merge note below for how this extends A-series data
// without overwriting it, and how C-series can follow this one safely).
//
// IMPORTANT, FLAGGED DISCREPANCY (read before trusting any "207" figure
// elsewhere): a planning-stage count for B-series clickable links was
// stated as 207 in this batch's task brief. Independent verification --
// both via the reproducible extraction tool
// (`Backend/scripts/wordpress/extract-where-iks-manifest.mjs`) and a
// second, completely separate raw `<a href>` tag count directly against
//  the WXR -- both agree exactly: B-series has **167 clickable links**, not 207.
// This was cross-checked twice before writing this script and is not a
// tool bug (the same tool's A-series output was independently verified
// correct and used for the already-committed A-series migration). The
//  167 figure (+ 4 non-link placeholder notes on the 4 genuinely
//  empty categories = 171 total B-series rows) is what this script uses, as it is
// what the live WordPress content actually, verifiably contains.
//
// Scope (per the approved batch):
//   - Touches ONLY data.WHERE_IKS_SERIES (re-asserted unchanged -- same
//     static 3-series/29-category description the A-series script
//     already wrote), data.WHERE_IKS_CATEGORIES (grows additively, adding
//     the 16 B-series category names to the 4 already-migrated A-series
//     ones), and data.WHERE_IKS_ROWS (grows additively, adding 16 new
//     object keys) on the dual Content documents {type: "pages/media"}
//     and {type: "media"}.
//   - This script ONLY adds the 16 B-series categories' data (171 rows
//     total: 167 genuine clickable links + 4 non-link informational
//     "no links available yet" notices on the 4 categories WordPress
//     itself currently shows as empty -- B11 Mechanical & Digital Design
//     & Engineering, B13 Fine Arts and Sculpture, B15 Fashion and
//     Interior Design, B16 Edutainment Sciences). It does NOT touch
//     A-series or C-series category data, and is designed so a later
//     C-series script (or a rerun of the A-series script) can extend
//     WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS additively without overwriting
//     this script's own data -- see the additive-merge note below.
//   - Source: all 29 category tables' real WordPress content lives in 29
//     separate `tablepress_table` WXR posts (NOT in the Where-IKS page's
//     own WXR content:encoded). Extracted and reconciled by the
//     companion, reproducible tool
//     `Backend/scripts/wordpress/extract-where-iks-manifest.mjs`, whose
//     output is the durable manifest at
//     `Backend/scripts/wordpress/reports/where-iks-manifest.json` -- the
//     B-series data below is copied verbatim from that manifest's
//     WHERE_IKS_ROWS (not hand-retyped), to eliminate transcription risk.
//   - The 4 placeholder-note rows are preserved exactly as published
//     ("Note - Currently, no links are available. We welcome suggestions
//     from users."), each as a single row with an empty `link` field --
//     never silently dropped, never counted as a clickable resource, and
//     never replaced with invented content.
//   - Preserves the real Topic grouping within each category exactly as
//     published (forward-filled from the nearest preceding non-blank
//     Topic cell), and the real Description text where present.
//   - Does NOT touch Where-Sanskrit (RESOURCE_CATEGORIES/RESOURCE_ROWS),
//     What-Sanskrit (WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS), or the
//     4 already-migrated A-series categories -- verified unchanged both
//     before writing (baseline read) and after (deep-equal against a
//     pre-write backup).
//   - Does NOT connect to, query, or depend on search-iks.vyoma.org /
//     Meilisearch in any way.
//   - Does NOT download/rehost any linked resource.
//
// ADDITIVE MERGE DESIGN (same contract as the A-series script):
//   On each run, this script reads whatever WHERE_IKS_CATEGORIES/
//   WHERE_IKS_ROWS currently exist (expected: the 4 A-series categories
//   already there), computes the full next value as "existing
//   categories/rows, with the 16 B-series keys set/overwritten to the
//   approved B-series data, everything else left untouched", re-sorts
//   WHERE_IKS_CATEGORIES into the fixed canonical 29-category taxonomy
//   order, and writes that complete computed value with a single $set.
//
// Modes:
//   node where-iks-b-series-migration.mjs            -> dry-run (default)
//   node where-iks-b-series-migration.mjs --commit   -> performs the real
//                                                        write, only
//                                                        after validation
//                                                        passes, after
//                                                        writing a
//                                                        pre-change
//                                                        backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];
// The full, static 3-series / 29-category taxonomy description -- same
// value the A-series script already wrote; re-asserted unchanged here.
const WHERE_IKS_SERIES = [
  {
    "key": "A",
    "label": "A-Series: Universal",
    "categories": [
      "A1- Kośa",
      "A 2 - Encyclopedic Bhāratīya Literature",
      "A 3 - Mother Repositories",
      "A 4 - Magazines, Journals, Articles"
    ]
  },
  {
    "key": "B",
    "label": "B-Series: Domain Specific",
    "categories": [
      "B1 - Vedic Philosophical and Cognitive Sciences",
      "B2 - Historical and Civilizational Sciences",
      "B 3 - Contemporary Social/ Cultural Sciences",
      "B 4 - Mathematical, Physical and Astronomical Sciences",
      "B 5 - Speech and Linguistics",
      "B 6 - Political, Economic and Strategic sciences",
      "B 7 - Medical and Health Sciences",
      "B 8 - Culinary, Nutritional and Pharmacological Sciences",
      "B 9 - Agricultural Science, Veterinary and Animal Husbandry",
      "B 10 - Performing Arts",
      "B 11 - Mechanical & Digital Design & Engineering",
      "B 12 - Civil and Architectural Science",
      "B 13 - Fine Arts and Sculpture",
      "B 14 - Chemical, Metallurgical & Material Sciences",
      "B 15 - Fashion and Interior Design",
      "B 16 - Edutainment Sciences"
    ]
  },
  {
    "key": "C",
    "label": "C-Series: Auxiliary Tools",
    "categories": [
      "C 1 - Digitisation of Tools for Typing, OCR, Fonts",
      "C 2 - Computational Tools",
      "C 3 - AI Tools and Links",
      "C 4 - E Learning",
      "C 5 - YouTube Channel Based Learning",
      "C 6 - Blogs",
      "C 7 - Channels and Social Media",
      "C 8 - Tips and Tricks",
      "C 9 - Miscellaneous"
    ]
  }
];

// Canonical 29-category order -- used to re-sort WHERE_IKS_CATEGORIES
// after every merge, so the final array is always in taxonomy order
// regardless of which order the A/B/C series scripts happen to run in.
const ALL_29_CATEGORIES_IN_ORDER = [
  "A1- Kośa",
  "A 2 - Encyclopedic Bhāratīya Literature",
  "A 3 - Mother Repositories",
  "A 4 - Magazines, Journals, Articles",
  "B1 - Vedic Philosophical and Cognitive Sciences",
  "B2 - Historical and Civilizational Sciences",
  "B 3 - Contemporary Social/ Cultural Sciences",
  "B 4 - Mathematical, Physical and Astronomical Sciences",
  "B 5 - Speech and Linguistics",
  "B 6 - Political, Economic and Strategic sciences",
  "B 7 - Medical and Health Sciences",
  "B 8 - Culinary, Nutritional and Pharmacological Sciences",
  "B 9 - Agricultural Science, Veterinary and Animal Husbandry",
  "B 10 - Performing Arts",
  "B 11 - Mechanical & Digital Design & Engineering",
  "B 12 - Civil and Architectural Science",
  "B 13 - Fine Arts and Sculpture",
  "B 14 - Chemical, Metallurgical & Material Sciences",
  "B 15 - Fashion and Interior Design",
  "B 16 - Edutainment Sciences",
  "C 1 - Digitisation of Tools for Typing, OCR, Fonts",
  "C 2 - Computational Tools",
  "C 3 - AI Tools and Links",
  "C 4 - E Learning",
  "C 5 - YouTube Channel Based Learning",
  "C 6 - Blogs",
  "C 7 - Channels and Social Media",
  "C 8 - Tips and Tricks",
  "C 9 - Miscellaneous"
];

// The 4 already-migrated A-series categories, referenced only so this
// script can positively confirm (defence in depth) that it never touches
// them -- this script does not otherwise depend on the A-series script.
const APPROVED_A_CATEGORIES_REFERENCE = [
  "A1- Kośa",
  "A 2 - Encyclopedic Bhāratīya Literature",
  "A 3 - Mother Repositories",
  "A 4 - Magazines, Journals, Articles"
];

// The 16 B-series categories this script is responsible for, in order.
const APPROVED_B_CATEGORIES = [
  "B1 - Vedic Philosophical and Cognitive Sciences",
  "B2 - Historical and Civilizational Sciences",
  "B 3 - Contemporary Social/ Cultural Sciences",
  "B 4 - Mathematical, Physical and Astronomical Sciences",
  "B 5 - Speech and Linguistics",
  "B 6 - Political, Economic and Strategic sciences",
  "B 7 - Medical and Health Sciences",
  "B 8 - Culinary, Nutritional and Pharmacological Sciences",
  "B 9 - Agricultural Science, Veterinary and Animal Husbandry",
  "B 10 - Performing Arts",
  "B 11 - Mechanical & Digital Design & Engineering",
  "B 12 - Civil and Architectural Science",
  "B 13 - Fine Arts and Sculpture",
  "B 14 - Chemical, Metallurgical & Material Sciences",
  "B 15 - Fashion and Interior Design",
  "B 16 - Edutainment Sciences"
];

const EXPECTED_B_ROW_COUNTS = {
  "B1 - Vedic Philosophical and Cognitive Sciences": 12,
  "B2 - Historical and Civilizational Sciences": 21,
  "B 3 - Contemporary Social/ Cultural Sciences": 5,
  "B 4 - Mathematical, Physical and Astronomical Sciences": 20,
  "B 5 - Speech and Linguistics": 18,
  "B 6 - Political, Economic and Strategic sciences": 41,
  "B 7 - Medical and Health Sciences": 13,
  "B 8 - Culinary, Nutritional and Pharmacological Sciences": 1,
  "B 9 - Agricultural Science, Veterinary and Animal Husbandry": 11,
  "B 10 - Performing Arts": 6,
  "B 11 - Mechanical & Digital Design & Engineering": 1,
  "B 12 - Civil and Architectural Science": 15,
  "B 13 - Fine Arts and Sculpture": 1,
  "B 14 - Chemical, Metallurgical & Material Sciences": 4,
  "B 15 - Fashion and Interior Design": 1,
  "B 16 - Edutainment Sciences": 1
};
const EXPECTED_B_TOTAL_ROWS = 171;
const EXPECTED_B_LINK_ROWS = 167; // clickable resources only
const EXPECTED_B_NOTE_ROWS = 4; // non-link "no links available yet" notices

// Copied verbatim from Backend/scripts/wordpress/reports/where-iks-manifest.json
// (WHERE_IKS_ROWS, B-series keys only) -- not hand-retyped. Re-run
// Backend/scripts/wordpress/extract-where-iks-manifest.mjs against the
// WXR to reproduce this data independently.
const APPROVED_B_ROWS = {
  "B1 - Vedic Philosophical and Cognitive Sciences": [
    {
      "topic": "Yoga",
      "title": "https://kymyogavaisharadi.org/",
      "desc": "The website/portal consists of principal texts like - yogasūtrā, haṭha-yoga-pradīpikā. Then Commentaries on Yoga-sūtras like - pātañjala-yogasūtra-bhāṣya, rājamārtāṇḍa, yogamaṇiprabhā, yogasiddhāntacandrikā, sūtrārthabodhinī, yogasudhākara, yogacandrikā, yogavallī-yogasūtra-vyākhyā. It also includes sub commentaries on Vyāsa's Commentary to Yogasūtras like - tattva-vaiśāradī-ṭīkā, yogavārtika, bhāsvatī. Also includes Sub-Commentary on tattva-vaiśāradī and Commentary on haṭha-yoga-pradīpikā like pātañjala-rahasyam and jyotsnā-vyākhyā respectively.",
      "link": "https://kymyogavaisharadi.org/"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://yogastudies.org/",
      "desc": "",
      "link": "https://yogastudies.org/"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://www.wisdomlib.org/yoga",
      "desc": "",
      "link": "https://www.wisdomlib.org/yoga"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://sanskritdocuments.org/sanskrit/yoga/+C24",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/yoga/+C24"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://vedicreserve.miu.edu/yoga",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/yoga"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "योगसूत्र | Gita Supersite",
      "desc": "",
      "link": "https://www.gitasupersite.iitk.ac.in/srimad?yogasutra"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://www.vedpuran.com/listenmahakavya_patanjali.asp",
      "desc": "",
      "link": "https://www.vedpuran.com/listenmahakavya_patanjali.asp"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://sacred-texts.com/hin/yogasutr.htm",
      "desc": "",
      "link": "https://sacred-texts.com/hin/yogasutr.htm"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://sacred-texts.com/hin/ysp/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/ysp/"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://sanskritdocuments.org/sanskrit/yoga/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/yoga/"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://drive.google.com/file/d/1ChAFK0ndBfUNZrmpVRSTQld_D3nhEqE3/view",
      "desc": "",
      "link": "https://drive.google.com/file/d/1ChAFK0ndBfUNZrmpVRSTQld_D3nhEqE3/view"
    },
    {
      "topic": "Centre for Yoga Studies",
      "title": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/yoga",
      "desc": "",
      "link": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/yoga"
    }
  ],
  "B2 - Historical and Civilizational Sciences": [
    {
      "topic": "Mīmāṃsā",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/mImAMsA",
      "desc": "",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/mImAMsA"
    },
    {
      "topic": "Mīmāṃsā",
      "title": "https://vedicreserve.miu.edu/karma_mimamsa.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/karma_mimamsa.htm"
    },
    {
      "topic": "Mīmāṃsā",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Mimamsa",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Mimamsa"
    },
    {
      "topic": "Mīmāṃsā",
      "title": "https://www.peterffreund.com/sankarsha/sankarsha.html",
      "desc": "",
      "link": "https://www.peterffreund.com/sankarsha/sankarsha.html"
    },
    {
      "topic": "Dharma-śāstra",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/"
    },
    {
      "topic": "Dharma-śāstra",
      "title": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/",
      "desc": "",
      "link": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/"
    },
    {
      "topic": "Dharma-śāstra",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSutra",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSutra"
    },
    {
      "topic": "Dharma-śāstra",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#law_dharamashastra",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#law_dharamashastra"
    },
    {
      "topic": "Kāvya",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/",
      "desc": "The main Sanskrit kāvya (poetry/literary) texts available on the TITUS/Sanskrit Library classification page are - Daśakumāracarita, Meghadūta, Ṛtusaṃhāra, etc.",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/"
    },
    {
      "topic": "Kāvya",
      "title": "https://www.sanskrit.nic.in/ASSP/",
      "desc": "The Adhunik Sanskrit Sahitya Pustakalaya section of the Central Sanskrit University portal, dedicated to the promotion and dissemination of modern Sanskrit literature. The collection includes categories such as mahākāvya, khaṇḍakāvya, gadya, nāṭaka, and other literary forms.",
      "link": "https://www.sanskrit.nic.in/ASSP/"
    },
    {
      "topic": "Kāvya",
      "title": "https://www.vedpuran.com/listenpuran.asp",
      "desc": "",
      "link": "https://www.vedpuran.com/listenpuran.asp"
    },
    {
      "topic": "Kāvya",
      "title": "https://drive.google.com/file/d/1rYRlX0ealKHvU1zldrv2XBndwBfZ3E74/view",
      "desc": "",
      "link": "https://drive.google.com/file/d/1rYRlX0ealKHvU1zldrv2XBndwBfZ3E74/view"
    },
    {
      "topic": "Kāvya",
      "title": "https://drive.google.com/file/d/1OH9o7HvV74ergle7upEQLeMhdH5MjMh7/view",
      "desc": "",
      "link": "https://drive.google.com/file/d/1OH9o7HvV74ergle7upEQLeMhdH5MjMh7/view"
    },
    {
      "topic": "Kāvya",
      "title": "https://drive.google.com/file/d/1vOxdMBy-B1MN_4eh0DJ2hoFyVFBBR56o/view",
      "desc": "",
      "link": "https://drive.google.com/file/d/1vOxdMBy-B1MN_4eh0DJ2hoFyVFBBR56o/view"
    },
    {
      "topic": "Kāvya",
      "title": "https://drive.google.com/file/d/13j1uu_GLlJK_7P6zT8WcH3lTBQcTiUsl/",
      "desc": "",
      "link": "https://drive.google.com/file/d/13j1uu_GLlJK_7P6zT8WcH3lTBQcTiUsl/"
    },
    {
      "topic": "Kāvya",
      "title": "https://drive.google.com/file/d/1aXeEloW6Am5iW7aWnkAjjeg8EMiIDcdX/",
      "desc": "",
      "link": "https://drive.google.com/file/d/1aXeEloW6Am5iW7aWnkAjjeg8EMiIDcdX/"
    },
    {
      "topic": "Kāvya",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#sanskritpoetry",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#sanskritpoetry"
    },
    {
      "topic": "Kāvya",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Kavya",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Kavya"
    },
    {
      "topic": "Kāvya",
      "title": "https://sanskritdocuments.org/sanskrit/kalidasa/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/kalidasa/"
    },
    {
      "topic": "Kāvya",
      "title": "https://sanskritdocuments.org/sanskrit/sahitya/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/sahitya/"
    },
    {
      "topic": "Kāvya",
      "title": "https://www.peterffreund.com/sankarsha/sankarsha.html",
      "desc": "",
      "link": "https://www.peterffreund.com/sankarsha/sankarsha.html"
    }
  ],
  "B 3 - Contemporary Social/ Cultural Sciences": [
    {
      "topic": "Nāṭaka",
      "title": "https://www.sanskrit.nic.in/ASSP/Nataka.htm",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/ASSP/Nataka.htm"
    },
    {
      "topic": "Nāṭaka",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#sanskritdrama",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#sanskritdrama"
    },
    {
      "topic": "Nāṭaka",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Drama",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Drama"
    },
    {
      "topic": "Subhāṣita",
      "title": "https://www.sanskrit.nic.in/data/subhashitani.pdf",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/data/subhashitani.pdf"
    },
    {
      "topic": "Subhāṣita",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Subhasita",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Subhasita"
    }
  ],
  "B 4 - Mathematical, Physical and Astronomical Sciences": [
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.wisdomlib.org/ganitashastra",
      "desc": "",
      "link": "https://www.wisdomlib.org/ganitashastra"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.brhat.in/library_books/developmentofcalculusinindia",
      "desc": "",
      "link": "https://www.brhat.in/library_books/developmentofcalculusinindia"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/aryabhat",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/aryabhat"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/bhasklil",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/bhasklil"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/bhaskbij",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/bhaskbij"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://vedicheritage.gov.in/mathematics/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/mathematics/"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/vedic-maths",
      "desc": "",
      "link": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/vedic-maths"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://wilbourhall.org/pdfs/aryabhatiyaEnglish.pdf",
      "desc": "",
      "link": "https://wilbourhall.org/pdfs/aryabhatiyaEnglish.pdf"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://wilbourhall.org/pdfs/aryabhatiyawithc00arya.pdf",
      "desc": "",
      "link": "https://wilbourhall.org/pdfs/aryabhatiyawithc00arya.pdf"
    },
    {
      "topic": "Mathematics (Gaṇita, Bīja-gaṇita, Trikoṇamiti etc)",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#mathematics",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#mathematics"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://sanskritdocuments.org/sanskrit/jyotisha/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/jyotisha/"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://vedicreserve.miu.edu/jyotish",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/jyotish"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://vedicheritage.gov.in/vedangas/jyotisha/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/jyotisha/"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "ज्योतिषम् – विकिपीडिया",
      "desc": "",
      "link": "https://hi.wikipedia.org/wiki/%E0%A4%9C%E0%A5%8D%E0%A4%AF%E0%A5%8B%E0%A4%A4%E0%A4%BF%E0%A4%B7"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://wilbourhall.org/index.html#panca",
      "desc": "",
      "link": "https://wilbourhall.org/index.html#panca"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/jyotiSham",
      "desc": "",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/jyotiSham"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://vedicheritage.gov.in/astronomy/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/astronomy/"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://vedicheritage.gov.in/vedic-heritage-in-present-context/cosmology/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedic-heritage-in-present-context/cosmology/"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#astronomy",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#astronomy"
    },
    {
      "topic": "Jyotiṣya (Astronomical calculations, Geometry etc)",
      "title": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/astrology",
      "desc": "",
      "link": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/astrology"
    }
  ],
  "B 5 - Speech and Linguistics": [
    {
      "topic": "Linguistics",
      "title": "https://ashtadhyayi.com/",
      "desc": "",
      "link": "https://ashtadhyayi.com/"
    },
    {
      "topic": "Linguistics",
      "title": "https://sanskritdocuments.org/learning_tools/ashtadhyayi/",
      "desc": "",
      "link": "https://sanskritdocuments.org/learning_tools/ashtadhyayi/"
    },
    {
      "topic": "Linguistics",
      "title": "https://sanskritdocuments.org/amarakosha/",
      "desc": "",
      "link": "https://sanskritdocuments.org/amarakosha/"
    },
    {
      "topic": "Linguistics",
      "title": "व्याकरणम् – विकिपीडिया",
      "desc": "",
      "link": "https://hi.wikipedia.org/wiki/%E0%A4%B5%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%95%E0%A4%B0%E0%A4%A3"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/vyakarana/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/vyakarana/"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicreserve.miu.edu/shiksha/shiksha_vedicreserve.html",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/shiksha/shiksha_vedicreserve.html"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicreserve.miu.edu/kalp.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/kalp.htm"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicreserve.miu.edu/chhand.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/chhand.htm"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicreserve.miu.edu/nirukt.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/nirukt.htm"
    },
    {
      "topic": "Linguistics",
      "title": "https://dharmawiki.org/index.php/Category:Vyakarana",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Category:Vyakarana"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/shiksha/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/shiksha/"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/kalpa/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/kalpa/"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/vyakarana/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/vyakarana/"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/nirukta/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/nirukta/"
    },
    {
      "topic": "Linguistics",
      "title": "https://vedicheritage.gov.in/vedangas/chanda/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedangas/chanda/"
    },
    {
      "topic": "Linguistics",
      "title": "https://www.peterffreund.com/shiksha/",
      "desc": "",
      "link": "https://www.peterffreund.com/shiksha/"
    },
    {
      "topic": "Linguistics",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#vedangasans",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#vedangasans"
    },
    {
      "topic": "Linguistics",
      "title": "https://www.sanskritlibrary.org/catalogsText/niGaRwu.html",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/niGaRwu.html"
    }
  ],
  "B 6 - Political, Economic and Strategic sciences": [
    {
      "topic": "Dhanurveda",
      "title": "https://vedicreserve.miu.edu/dhanur_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/dhanur_veda"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://sanskritdocuments.org/doc_z_misc_sociology_astrology/artha.html",
      "desc": "",
      "link": "https://sanskritdocuments.org/doc_z_misc_sociology_astrology/artha.html"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.brhat.in/library_books/arthashastra",
      "desc": "",
      "link": "https://www.brhat.in/library_books/arthashastra"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.brhat.in/library_books/guildsinancientindia",
      "desc": "",
      "link": "https://www.brhat.in/library_books/guildsinancientindia"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.wisdomlib.org/arthashastra",
      "desc": "",
      "link": "https://www.wisdomlib.org/arthashastra"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://sa.wikisource.org/wiki/%E0%A4%85%E0%A4%B0%E0%A5%8D%E0%A4%A5%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D/%E0%A4%85%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3%E0%A4%AE%E0%A5%8D_%E0%A5%A7/%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%AF%E0%A4%83_%E0%A5%A7",
      "desc": "",
      "link": "https://sa.wikisource.org/wiki/%E0%A4%85%E0%A4%B0%E0%A5%8D%E0%A4%A5%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D/%E0%A4%85%E0%A4%A7%E0%A4%BF%E0%A4%95%E0%A4%B0%E0%A4%A3%E0%A4%AE%E0%A5%8D_%E0%A5%A7/%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%AF%E0%A4%83_%E0%A5%A7"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.brhat.in/library_books/arthashastra (Shama Sastry)",
      "desc": "",
      "link": "https://www.brhat.in/library_books/arthashastra"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://archive.org/details/arthasastrarangarajanl.n.penguin",
      "desc": "",
      "link": "https://archive.org/details/arthasastrarangarajanl.n.penguin"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://archive.org/details/in.ernet.dli.2015.326578/page/1/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/in.ernet.dli.2015.326578/page/1/mode/2up"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Artha",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Artha"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/niti/chanakya-niti",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/niti/chanakya-niti"
    },
    {
      "topic": "Arthaśāstra",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#political_economy",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#political_economy"
    },
    {
      "topic": "Smṛti",
      "title": "https://sanskritdocuments.org/doc_z_misc_sociology_astrology/manu.html",
      "desc": "",
      "link": "https://sanskritdocuments.org/doc_z_misc_sociology_astrology/manu.html"
    },
    {
      "topic": "Smṛti",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/manu.html",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/manu.html"
    },
    {
      "topic": "Smṛti",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/ys.html",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/ys.html"
    },
    {
      "topic": "Smṛti",
      "title": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/daksasmrti/",
      "desc": "",
      "link": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/daksasmrti/"
    },
    {
      "topic": "Smṛti",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSmrti",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSmrti"
    },
    {
      "topic": "Smṛti",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#DhNib",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#DhNib"
    },
    {
      "topic": "Smṛti",
      "title": "https://vedicreserve.miu.edu/smriti.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/smriti.htm"
    },
    {
      "topic": "Smṛti",
      "title": "https://vedicheritage.gov.in/legal-systems/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/legal-systems/"
    },
    {
      "topic": "Smṛti",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/smrti",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/smrti"
    },
    {
      "topic": "Dharmaśāstra",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/vedic/"
    },
    {
      "topic": "Dharmaśāstra",
      "title": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/",
      "desc": "",
      "link": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/"
    },
    {
      "topic": "Dharmaśāstra",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSutra",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#DhSutra"
    },
    {
      "topic": "Dharmaśāstra",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#law_dharamashastra",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#law_dharamashastra"
    },
    {
      "topic": "Tarkaśāstra",
      "title": "https://sanskrit.uohyd.ac.in/Corpus/CIIL/",
      "desc": "",
      "link": "https://sanskrit.uohyd.ac.in/Corpus/CIIL/"
    },
    {
      "topic": "Tarkaśāstra",
      "title": "https://dharmawiki.org/index.php/Tarkashastra_(%E0%A4%A4%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D)",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Tarkashastra_(%E0%A4%A4%E0%A4%B0%E0%A5%8D%E0%A4%95%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0%E0%A4%AE%E0%A5%8D)"
    },
    {
      "topic": "Tarkaśāstra",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Nyaya",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Nyaya"
    },
    {
      "topic": "Tarkaśāstra",
      "title": "https://vedicreserve.miu.edu/darshanas/nyaya.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/darshanas/nyaya.htm"
    },
    {
      "topic": "a. Pañcatantra",
      "title": "https://shreevatsa.net/panchatantra/",
      "desc": "",
      "link": "https://shreevatsa.net/panchatantra/"
    },
    {
      "topic": "a. Pañcatantra",
      "title": "https://www.panchatantra-sanskrit.com/home",
      "desc": "",
      "link": "https://www.panchatantra-sanskrit.com/home"
    },
    {
      "topic": "a. Pañcatantra",
      "title": "https://www.wisdomlib.org/hinduism/essay/panchatantra-a-reflex-of-arthashastra",
      "desc": "",
      "link": "https://www.wisdomlib.org/hinduism/essay/panchatantra-a-reflex-of-arthashastra"
    },
    {
      "topic": "b. Hitopadeśa",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/hitopad.html",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/hitopad.html"
    },
    {
      "topic": "b. Hitopadeśa",
      "title": "https://www.wisdomlib.org/hinduism/book/the-book-of-good-counsels",
      "desc": "",
      "link": "https://www.wisdomlib.org/hinduism/book/the-book-of-good-counsels"
    },
    {
      "topic": "c. Kāmandakīya nītisāra",
      "title": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/nitisara-kamandaki/",
      "desc": "",
      "link": "https://sites.utexas.edu/sanskrit/resources/dharmasastra/nitisara-kamandaki/"
    },
    {
      "topic": "c. Kāmandakīya nītisāra",
      "title": "https://archive.org/details/in.ernet.dli.2015.424377",
      "desc": "",
      "link": "https://archive.org/details/in.ernet.dli.2015.424377"
    },
    {
      "topic": "c. Kāmandakīya nītisāra",
      "title": "https://shodhganga.inflibnet.ac.in/handle/10603/335877",
      "desc": "",
      "link": "https://shodhganga.inflibnet.ac.in/handle/10603/335877"
    },
    {
      "topic": "c. Kāmandakīya nītisāra",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/niti/kamandkiya-nitisar",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/niti/kamandkiya-nitisar"
    },
    {
      "topic": "d. Śukra-nīti",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/niti/sukra-niti",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/niti/sukra-niti"
    },
    {
      "topic": "e. Vidura-nīti",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/niti/vidur-niti",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/niti/vidur-niti"
    },
    {
      "topic": "f. Nīti-śataka",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/niti/neeti-shatak",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/niti/neeti-shatak"
    }
  ],
  "B 7 - Medical and Health Sciences": [
    {
      "topic": "Āyurveda",
      "title": "https://www.carakasamhitaonline.com/",
      "desc": "",
      "link": "https://www.carakasamhitaonline.com/"
    },
    {
      "topic": "Āyurveda",
      "title": "https://www.sanskritlibrary.org/catalogsText/titus/class/vagbhahs",
      "desc": "",
      "link": "https://www.sanskritlibrary.org/catalogsText/titus/class/vagbhahs"
    },
    {
      "topic": "Āyurveda",
      "title": "https://vedicreserve.miu.edu/charak_samhita",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/charak_samhita"
    },
    {
      "topic": "Āyurveda",
      "title": "https://vedicheritage.gov.in/medicine/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/medicine/"
    },
    {
      "topic": "Āyurveda",
      "title": "https://www.brhat.in/library_books/ayurvedaadistinctiveapproachtohealthanddisease",
      "desc": "",
      "link": "https://www.brhat.in/library_books/ayurvedaadistinctiveapproachtohealthanddisease"
    },
    {
      "topic": "Āyurveda",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/AyurvedaH",
      "desc": "",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/AyurvedaH"
    },
    {
      "topic": "Āyurveda",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#medicine",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#medicine"
    },
    {
      "topic": "Āyurveda",
      "title": "https://www.veducation.world/library/Vedic-Studies-अन्‍य-वेदांग/ayurveda",
      "desc": "",
      "link": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/ayurveda"
    },
    {
      "topic": "Āyurveda",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Ayur",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Ayur"
    },
    {
      "topic": "Āyurveda",
      "title": "http://niimh.nic.in/ebooks/ecaraka",
      "desc": "Caraka Saṃhita",
      "link": "http://niimh.nic.in/ebooks/ecaraka"
    },
    {
      "topic": "Āyurveda",
      "title": "https://niimh.nic.in/ebooks/esushruta/?mod=search",
      "desc": "Śuśruta Saṃhita",
      "link": "https://niimh.nic.in/ebooks/esushruta/?mod=search"
    },
    {
      "topic": "Āyurveda",
      "title": "http://niimh.nic.in/ebooks/madhavanidana/index.php",
      "desc": "Madhava Nidana",
      "link": "http://niimh.nic.in/ebooks/madhavanidana/index.php"
    },
    {
      "topic": "Āyurveda",
      "title": "http://niimh.nic.in/ebooks/e-Nighantu/index.php",
      "desc": "Nighanṭu-s",
      "link": "http://niimh.nic.in/ebooks/e-Nighantu/index.php"
    }
  ],
  "B 8 - Culinary, Nutritional and Pharmacological Sciences": [
    {
      "topic": "Food and Dietics (Bhojana-kutūhala, Kṣema-kutūhala)",
      "title": "https://ksri.in/ebooks/books/01JRA1MQCRM0WXADVTF82QJ96H",
      "desc": "",
      "link": "https://ksri.in/ebooks/books/01JRA1MQCRM0WXADVTF82QJ96H"
    }
  ],
  "B 9 - Agricultural Science, Veterinary and Animal Husbandry": [
    {
      "topic": "Botany (Vṛkṣāyurveda)",
      "title": "https://archive.org/details/vrikshaayurvedaatreatiseonplantsciencesircarn.n.romasarkarsatgurupublications_48_v/page/n3/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/vrikshaayurvedaatreatiseonplantsciencesircarn.n.romasarkarsatgurupublications_48_v/page/n3/mode/2up"
    },
    {
      "topic": "Botany (Vṛkṣāyurveda)",
      "title": "https://archive.org/details/Vrikshayurveda/page/n5/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/Vrikshayurveda/page/n5/mode/2up"
    },
    {
      "topic": "Botany (Vṛkṣāyurveda)",
      "title": "https://archive.org/details/Lokopakara/page/n7/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/Lokopakara/page/n7/mode/2up"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://vedicheritage.gov.in/agriculture/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/agriculture/"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://archive.org/details/Kashyapiyakrishisukti/page/n3/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/Kashyapiyakrishisukti/page/n3/mode/2up"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://archive.org/details/in.ernet.dli.2015.62133/page/n1/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/in.ernet.dli.2015.62133/page/n1/mode/2up"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://books.google.co.in/books?id=FvjZVwYVmNcC&pg=PR3&source=gbs_selected_pages&cad=1#v=onepage&q&f=false",
      "desc": "",
      "link": "https://books.google.co.in/books?id=FvjZVwYVmNcC&pg=PR3&source=gbs_selected_pages&cad=1#v=onepage&q&f=false"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://ksri.in/ebooks/books/01JGXM3P97A355QGJFGYGN00JV",
      "desc": "",
      "link": "https://ksri.in/ebooks/books/01JGXM3P97A355QGJFGYGN00JV"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://archive.org/details/vrikshaayurvedaatreatiseonplantsciencesircarn.n.romasarkarsatgurupublications_48_v/page/n3/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/vrikshaayurvedaatreatiseonplantsciencesircarn.n.romasarkarsatgurupublications_48_v/page/n3/mode/2up"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://archive.org/details/Vrikshayurveda/page/n5/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/Vrikshayurveda/page/n5/mode/2up"
    },
    {
      "topic": "Kṛṣi-śāstra",
      "title": "https://archive.org/details/Lokopakara/page/n7/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/Lokopakara/page/n7/mode/2up"
    }
  ],
  "B 10 - Performing Arts": [
    {
      "topic": "Nāṭyaśāstra",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/jyotiSham",
      "desc": "",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/jyotiSham"
    },
    {
      "topic": "Nāṭyaśāstra",
      "title": "https://sanskritdocuments.org/sanskrit/natyashastra/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/natyashastra/"
    },
    {
      "topic": "Nāṭyaśāstra",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#dance",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#dance"
    },
    {
      "topic": "Nāṭyaśāstra",
      "title": "https://vedicreserve.miu.edu/gandharva_veda/natya_shastra.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/gandharva_veda/natya_shastra.pdf"
    },
    {
      "topic": "Nāṭyaśāstra",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Natya",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Natya"
    },
    {
      "topic": "Gāndharva veda",
      "title": "https://vedicreserve.miu.edu/gandharva_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/gandharva_veda"
    }
  ],
  "B 11 - Mechanical & Digital Design & Engineering": [
    {
      "topic": "",
      "title": "Note - Currently, no links are available. We welcome suggestions from users.",
      "desc": "",
      "link": ""
    }
  ],
  "B 12 - Civil and Architectural Science": [
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/manasara.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/manasara.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/mayamatam_vastu_shastra.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/mayamatam_vastu_shastra.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/vishvakarma_vastu_shastra.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/vishvakarma_vastu_shastra.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/Kashyapa_Shilpa_Shastra.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/Kashyapa_Shilpa_Shastra.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/samarangana_sutradhara.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/samarangana_sutradhara.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://vedicreserve.miu.edu/sthapatya_veda/vastusutra_upanishad.pdf",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sthapatya_veda/vastusutra_upanishad.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://www.veducation.world/library/Vedic-Studies-अन्‍य-वेदांग/vastu",
      "desc": "",
      "link": "https://www.veducation.world/library/Vedic-Studies-%E0%A4%85%E0%A4%A8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%BE%E0%A4%82%E0%A4%97/vastu"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/AgamAH",
      "desc": "",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/AgamAH"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://archive.org/details/MN003265AgamaShastraVivaranShankararyaSharadaManuscriptsAtKurukshetraUniversity/page/n5/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/MN003265AgamaShastraVivaranShankararyaSharadaManuscriptsAtKurukshetraUniversity/page/n5/mode/2up"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://archive.org/details/ythv_the-agama-shastra-by-gaudapada-edited-translated-and-annotated-by-vidhushekhara-",
      "desc": "",
      "link": "https://archive.org/details/ythv_the-agama-shastra-by-gaudapada-edited-translated-and-annotated-by-vidhushekhara-"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://archive.org/details/visvavallabha-nalini-s-ed./page/50/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/visvavallabha-nalini-s-ed./page/50/mode/2up"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://www.historyjournal.net/article/433/7-6-6-815.pdf",
      "desc": "",
      "link": "https://www.historyjournal.net/article/433/7-6-6-815.pdf"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#sculpture",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#sculpture"
    },
    {
      "topic": "Śilpa-śāstra, Vāstu-śāstra, Temple Architecture, Sthāpatya",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#architecture_and_engineering",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#architecture_and_engineering"
    }
  ],
  "B 13 - Fine Arts and Sculpture": [
    {
      "topic": "",
      "title": "Note - Currently, no links are available. We welcome suggestions from users.",
      "desc": "",
      "link": ""
    }
  ],
  "B 14 - Chemical, Metallurgical & Material Sciences": [
    {
      "topic": "Chemistry & Metallurgy (Rāsāyanika śāstra, Loha śāstra, Dravyavijñāna)",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#chemistry",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#chemistry"
    },
    {
      "topic": "Chemistry & Metallurgy (Rāsāyanika śāstra, Loha śāstra, Dravyavijñāna)",
      "title": "https://samskritifoundation.org/product/metallurgy-in-indian-through-the-ages/",
      "desc": "",
      "link": "https://samskritifoundation.org/product/metallurgy-in-indian-through-the-ages/"
    },
    {
      "topic": "Chemistry & Metallurgy (Rāsāyanika śāstra, Loha śāstra, Dravyavijñāna)",
      "title": "https://vedicheritage.gov.in/vedic-heritage-in-present-context/metallurgy/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/vedic-heritage-in-present-context/metallurgy/"
    },
    {
      "topic": "Chemistry & Metallurgy (Rāsāyanika śāstra, Loha śāstra, Dravyavijñāna)",
      "title": "https://archive.org/details/uvhc_rasa-paddhati-by-shribindhu-and-loha-sarvaswam-by-sureswar-1925-bombay-vaidya-jadavji-trikamji/page/n17/mode/2up",
      "desc": "",
      "link": "https://archive.org/details/uvhc_rasa-paddhati-by-shribindhu-and-loha-sarvaswam-by-sureswar-1925-bombay-vaidya-jadavji-trikamji/page/n17/mode/2up"
    }
  ],
  "B 15 - Fashion and Interior Design": [
    {
      "topic": "",
      "title": "Note - Currently, no links are available. We welcome suggestions from users.",
      "desc": "",
      "link": ""
    }
  ],
  "B 16 - Edutainment Sciences": [
    {
      "topic": "",
      "title": "Note - Currently, no links are available. We welcome suggestions from users.",
      "desc": "",
      "link": ""
    }
  ]
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function sortByCanonicalOrder(categories) {
  return [...categories].sort((a, b) => ALL_29_CATEGORIES_IN_ORDER.indexOf(a) - ALL_29_CATEGORIES_IN_ORDER.indexOf(b));
}

function validateManifest() {
  const errors = [];

  if (APPROVED_B_CATEGORIES.length !== 16) {
    errors.push(`Expected exactly 16 B-series categories, found ${APPROVED_B_CATEGORIES.length}.`);
  }

  let total = 0;
  let linkRows = 0;
  for (const cat of APPROVED_B_CATEGORIES) {
    const rows = APPROVED_B_ROWS[cat];
    const expected = EXPECTED_B_ROW_COUNTS[cat];
    if (!Array.isArray(rows)) {
      errors.push(`Category "${cat}" has no row array in APPROVED_B_ROWS.`);
      continue;
    }
    if (rows.length !== expected) {
      errors.push(`Category "${cat}": expected ${expected} rows, found ${rows.length}.`);
    }
    for (const r of rows) {
      if (typeof r.title !== 'string' || !r.title) errors.push(`Category "${cat}" has a row with a missing/empty title.`);
      if (typeof r.topic !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string topic.`);
      if (typeof r.desc !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string desc.`);
      if (typeof r.link !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string link.`);
      if (r.link) linkRows++;
    }
    total += rows.length;
  }

  if (total !== EXPECTED_B_TOTAL_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_B_TOTAL_ROWS} total B-series rows, found ${total}.`);
  }
  if (linkRows !== EXPECTED_B_LINK_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_B_LINK_ROWS} clickable B-series links, found ${linkRows}.`);
  }
  const noteRows = total - linkRows;
  if (noteRows !== EXPECTED_B_NOTE_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_B_NOTE_ROWS} non-link B-series informational rows, found ${noteRows}.`);
  }

  if (WHERE_IKS_SERIES.length !== 3) {
    errors.push(`Expected exactly 3 series in WHERE_IKS_SERIES, found ${WHERE_IKS_SERIES.length}.`);
  }
  if (ALL_29_CATEGORIES_IN_ORDER.length !== 29) {
    errors.push(`Expected exactly 29 categories in the canonical order list, found ${ALL_29_CATEGORIES_IN_ORDER.length}.`);
  }
  for (const cat of APPROVED_B_CATEGORIES) {
    if (!ALL_29_CATEGORIES_IN_ORDER.includes(cat)) errors.push(`B-series category "${cat}" is not present in the canonical 29-category order list.`);
  }

  return { errors, total, linkRows, noteRows };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Where-IKS B-series migration (Batch C, Stage C-B) -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: data.WHERE_IKS_SERIES (re-asserted, unchanged), data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (B-series keys only, additive) on pages/media + media.');
  console.log('Source: 29 separate tablepress_table WXR posts -- see Backend/scripts/wordpress/reports/where-iks-manifest.json.');
  console.log('Does NOT touch the 4 already-migrated A-series categories, Where-Sanskrit, What-Sanskrit, or any C-series Where-IKS data.');
  console.log('NOTE: independent verification found B-series has 167 clickable links, not the 207 figure stated in this batch\'s task brief -- see header comment for full detail.');
  console.log('='.repeat(72));

  // --- Manifest self-validation (before touching the database at all) ----
  const { errors: manifestErrors, total, linkRows, noteRows } = validateManifest();
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 16 B-series categories, ${total} total rows (expected ${EXPECTED_B_TOTAL_ROWS}) = ${linkRows} clickable links + ${noteRows} non-link informational notices.`);
  for (const [cat, expected] of Object.entries(EXPECTED_B_ROW_COUNTS)) {
    console.log(`     - "${cat}": ${expected} rows`);
  }

  await connectDb();
  console.log('[OK] Connected to configured MongoDB (URI value not printed).');

  try {
    const docs = {};
    const errors = [];
    for (const type of MEDIA_CONTENT_TYPES) {
      const doc = await ContentModel.findOne({ type }).lean();
      if (!doc) {
        errors.push(`No Content document found for type "${type}".`);
        continue;
      }
      if (doc.draftData != null) {
        errors.push(`Content "${type}" has a non-null draftData (an unpublished admin edit is pending) -- aborting rather than risk it later overwriting this migration.`);
      }
      docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, no pending draftData.');

    // --- Baseline + additive-merge computation ------------------------------
    const plan = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const data = docs[type].data;

      if (data.WHERE_IKS_SERIES !== undefined && !deepEqual(data.WHERE_IKS_SERIES, WHERE_IKS_SERIES)) {
        errors.push(`Content "${type}"'s data.WHERE_IKS_SERIES already exists but does not match the approved taxonomy description -- unexpected state, aborting rather than overwriting unknown existing content.`);
        continue;
      }

      const existingCategories = data.WHERE_IKS_CATEGORIES;
      const existingRows = data.WHERE_IKS_ROWS;
      if (existingCategories !== undefined && !Array.isArray(existingCategories)) {
        errors.push(`Content "${type}"'s data.WHERE_IKS_CATEGORIES exists but is not an array.`);
        continue;
      }
      if (existingRows !== undefined && (typeof existingRows !== 'object' || existingRows === null)) {
        errors.push(`Content "${type}"'s data.WHERE_IKS_ROWS exists but is not an object.`);
        continue;
      }

      const currentCategories = existingCategories || [];
      const currentRows = existingRows || {};

      // Expect the 4 A-series categories to already be present and intact --
      // this script depends on Stage C-A having run first.
      for (const aCat of APPROVED_A_CATEGORIES_REFERENCE) {
        if (!currentCategories.includes(aCat) || currentRows[aCat] === undefined) {
          errors.push(`Content "${type}" is missing expected already-migrated A-series category "${aCat}" -- Stage C-A does not appear to have completed successfully; aborting rather than proceeding out of order.`);
        }
      }

      let bAlreadyMigrated = true;
      for (const cat of APPROVED_B_CATEGORIES) {
        if (!currentCategories.includes(cat) || !deepEqual(currentRows[cat], APPROVED_B_ROWS[cat])) {
          bAlreadyMigrated = false;
          break;
        }
      }
      for (const cat of APPROVED_B_CATEGORIES) {
        if (currentRows[cat] !== undefined && !deepEqual(currentRows[cat], APPROVED_B_ROWS[cat])) {
          errors.push(`Content "${type}"'s data.WHERE_IKS_ROWS["${cat}"] already exists but does not match the approved B-series data -- unexpected state, aborting rather than overwriting unknown existing content.`);
        }
      }

      plan[type] = { currentCategories, currentRows, bAlreadyMigrated };
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (WHERE_IKS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    const allAlreadyMigrated = MEDIA_CONTENT_TYPES.every((t) => plan[t].bAlreadyMigrated);
    const anyAlreadyMigrated = MEDIA_CONTENT_TYPES.some((t) => plan[t].bAlreadyMigrated);
    if (anyAlreadyMigrated && !allAlreadyMigrated) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other for the B-series portion -- this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    if (allAlreadyMigrated) {
      console.log('\n[OK] Both Content documents already show the approved B-series data (within whatever broader WHERE_IKS state currently exists) -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed: the 4 A-series categories are present and intact; B-series data is not yet present (or absent entirely) on both documents; any existing C-series data (if present) is valid and will be preserved.');

    // --- Compute the full next value for each type, additively -------------
    const nextState = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const { currentCategories, currentRows } = plan[type];
      const mergedCategories = sortByCanonicalOrder([...new Set([...currentCategories, ...APPROVED_B_CATEGORIES])]);
      const mergedRows = { ...currentRows, ...APPROVED_B_ROWS };
      nextState[type] = { categories: mergedCategories, rows: mergedRows };
    }

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { WHERE_IKS_SERIES: _s, WHERE_IKS_CATEGORIES: _c, WHERE_IKS_ROWS: _r, ...restBefore } = docs[type].data;
      const wouldBeAfter = { ...docs[type].data, WHERE_IKS_SERIES, WHERE_IKS_CATEGORIES: nextState[type].categories, WHERE_IKS_ROWS: nextState[type].rows };
      const { WHERE_IKS_SERIES: _s2, WHERE_IKS_CATEGORIES: _c2, WHERE_IKS_ROWS: _r2, ...restAfter } = wouldBeAfter;
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed -- some key other than WHERE_IKS_SERIES/CATEGORIES/ROWS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
      // Also explicitly confirm the 4 A-series categories' rows are
      // byte-identical in the computed next state (defence in depth, on top
      // of the generic rest-key check above).
      for (const aCat of APPROVED_A_CATEGORIES_REFERENCE) {
        if (!deepEqual(nextState[type].rows[aCat], docs[type].data.WHERE_IKS_ROWS[aCat])) {
          console.error(`\nABORT: computed next state would change already-migrated A-series category "${aCat}" on "${type}". Aborting rather than risk it.`);
          process.exitCode = 1;
          return;
        }
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, including the 4 A-series categories, Where-Sanskrit\'s and What-Sanskrit\'s data, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set data.WHERE_IKS_SERIES (re-asserted, unchanged) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log(`Add/merge 16 B-series categories into data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (${total} rows: ${linkRows} links + ${noteRows} notices) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    for (const [cat, rows] of Object.entries(APPROVED_B_ROWS)) {
      console.log(`  - "${cat}": ${rows.length} rows`);
    }
    for (const type of MEDIA_CONTENT_TYPES) {
      console.log(`  "${type}" WHERE_IKS_CATEGORIES after this write (${nextState[type].categories.length} total): ${JSON.stringify(nextState[type].categories)}`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `where-iks-b-series-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed -- move it outside the repo before staging anything, same as every prior migration.');

    // --- Write (targeted dot-notation $set only -- never the whole `data`) -
    for (const type of MEDIA_CONTENT_TYPES) {
      await ContentModel.updateOne(
        { type },
        { $set: { 'data.WHERE_IKS_SERIES': WHERE_IKS_SERIES, 'data.WHERE_IKS_CATEGORIES': nextState[type].categories, 'data.WHERE_IKS_ROWS': nextState[type].rows } }
      );
    }
    console.log(`[COMMIT] Set data.WHERE_IKS_SERIES and merged B-series into data.WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const seriesMatch = deepEqual(after.data.WHERE_IKS_SERIES, WHERE_IKS_SERIES);
      const categoriesMatch = deepEqual(after.data.WHERE_IKS_CATEGORIES, nextState[type].categories);
      let rowsMatch = true;
      for (const cat of APPROVED_B_CATEGORIES) {
        if (!deepEqual(after.data.WHERE_IKS_ROWS[cat], APPROVED_B_ROWS[cat])) rowsMatch = false;
      }
      let aStillIntact = true;
      for (const aCat of APPROVED_A_CATEGORIES_REFERENCE) {
        if (!deepEqual(after.data.WHERE_IKS_ROWS[aCat], docs[type].data.WHERE_IKS_ROWS[aCat])) aStillIntact = false;
      }
      console.log(`[verify] "${type}" WHERE_IKS_SERIES matches exactly: ${seriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" WHERE_IKS_CATEGORIES matches the computed next state exactly: ${categoriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" all 16 B-series WHERE_IKS_ROWS entries match the approved data exactly: ${rowsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" the 4 A-series WHERE_IKS_ROWS entries remain exactly as before: ${aStillIntact ? 'YES' : 'NO'}`);
      if (!seriesMatch || !categoriesMatch || !rowsMatch || !aStillIntact) ok = false;

      const { WHERE_IKS_SERIES: _s, WHERE_IKS_CATEGORIES: _c, WHERE_IKS_ROWS: _r, ...restAfter } = after.data;
      const { WHERE_IKS_SERIES: _s2, WHERE_IKS_CATEGORIES: _c2, WHERE_IKS_ROWS: _r2, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key (incl. Where-Sanskrit, What-Sanskrit) unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }

    if (!ok) {
      console.error('\n[WARNING] At least one verification failed -- investigate before trusting this run.');
      process.exitCode = 1;
      return;
    }

    console.log('\n--- COMMIT complete, all verifications passed. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
