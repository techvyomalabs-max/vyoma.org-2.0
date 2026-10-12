// WordPress -> MERN migration: Where-IKS / O-MANTRI, C-SERIES ONLY
// (Batch C, Stage C-C -- the final series of the 3-series staged
// migration. A-series and B-series are already migrated and committed;
// this script completes the full 29-category taxonomy.)
//
// Scope (per the approved batch):
//   - Touches ONLY data.WHERE_IKS_SERIES (re-asserted unchanged -- same
//     static 3-series/29-category description the A-series script
//     already wrote), data.WHERE_IKS_CATEGORIES (grows additively, adding
//     the 9 C-series category names to the 20 already-migrated A+B
//     categories), and data.WHERE_IKS_ROWS (grows additively, adding 9
//     new object keys) on the dual Content documents {type: "pages/media"}
//     and {type: "media"}.
//   - This script ONLY adds the 9 C-series categories' data (223 rows
//     total: 204 genuine clickable links + 19 non-link informational
//     rows, all on "C 8 - Tips and Tricks" -- 19 real advice paragraphs
//     the live page presents as plain text, never as clickable links).
//     Completing this script brings the full taxonomy to 29/29
//     categories, 636 clickable links, 23 non-link informational rows,
//     659 total rows, 597 unique URLs -- the full set independently
//     verified across all three series migrations.
//   - Source: all 29 category tables' real WordPress content lives in 29
//     separate `tablepress_table` WXR posts (NOT in the Where-IKS page's
//     own WXR content:encoded). Extracted and reconciled by the
//     companion, reproducible tool
//     `Backend/scripts/wordpress/extract-where-iks-manifest.mjs`, whose
//     output is the durable manifest at
//     `Backend/scripts/wordpress/reports/where-iks-manifest.json` -- the
//     C-series data below is copied verbatim from that manifest's
//     WHERE_IKS_ROWS (not hand-retyped), to eliminate transcription risk.
//   - Three C-series categories have genuinely irregular source
//     structures, each handled deliberately (not by a generic fallback):
//       * "C 3 - AI Tools and Links": a multi-stage research-methodology
//         table where many "Name"/"Link" cells hold purely descriptive or
//         structural text (section headers like "1. AI Tools", or
//         phase-explanation paragraphs) with no link of their own. Only
//         cells containing a real <a href> become resource rows (38 of
//         them); the descriptive/structural cells are correctly excluded
//         rather than fabricated into fake non-link resources.
//       * "C 6 - Blogs": this table has a single column (header
//         ["Resource Link"]) where the column itself IS the link cell --
//         unlike every other category, the "Topic" position is absent
//         entirely. 4 links extracted directly from that one column.
//       * "C 8 - Tips and Tricks": a single column of pure informational
//         text (no links at all), structured as 19 real `<p>` paragraphs
//         (practical search tips). Each paragraph is preserved as its
//         own non-link row -- not collapsed into one blob, not dropped,
//         not fabricated into fake clickable resources.
//   - Preserves the real Topic grouping within each category exactly as
//     published (forward-filled from the nearest preceding non-blank
//     Topic cell), and the real Description text where present.
//   - Does NOT touch Where-Sanskrit (RESOURCE_CATEGORIES/RESOURCE_ROWS),
//     What-Sanskrit (WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS), or the
//     20 already-migrated A-series/B-series categories -- verified
//     unchanged both before writing (baseline read) and after
//     (deep-equal against a pre-write backup).
//   - Does NOT connect to, query, or depend on search-iks.vyoma.org /
//     Meilisearch in any way.
//   - Does NOT download/rehost any linked resource.
//
// ADDITIVE MERGE DESIGN (same contract as the A-series and B-series
// scripts): reads whatever WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS currently
// exist (expected: the 20 A+B categories already there), computes the
// full next value as "existing categories/rows, with the 9 C-series keys
// set/overwritten to the approved C-series data, everything else left
// untouched", re-sorts WHERE_IKS_CATEGORIES into the fixed canonical
// 29-category taxonomy order, and writes that complete computed value
// with a single $set.
//
// Modes:
//   node where-iks-c-series-migration.mjs            -> dry-run (default)
//   node where-iks-c-series-migration.mjs --commit   -> performs the real
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

// The 20 already-migrated A-series + B-series categories, referenced
// only so this script can positively confirm (defence in depth) that it
// never touches them -- this script does not otherwise depend on the
// A-series/B-series scripts' own internal variable names.
const APPROVED_AB_CATEGORIES_REFERENCE = [
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
  "B 16 - Edutainment Sciences"
];

// The 9 C-series categories this script is responsible for, in order.
const APPROVED_C_CATEGORIES = [
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

const EXPECTED_C_ROW_COUNTS = {
  "C 1 - Digitisation of Tools for Typing, OCR, Fonts": 52,
  "C 2 - Computational Tools": 12,
  "C 3 - AI Tools and Links": 38,
  "C 4 - E Learning": 38,
  "C 5 - YouTube Channel Based Learning": 13,
  "C 6 - Blogs": 4,
  "C 7 - Channels and Social Media": 43,
  "C 8 - Tips and Tricks": 19,
  "C 9 - Miscellaneous": 4
};
const EXPECTED_C_TOTAL_ROWS = 223;
const EXPECTED_C_LINK_ROWS = 204; // clickable resources only
const EXPECTED_C_NOTE_ROWS = 19; // non-link informational rows (all 19 on C8)

// Copied verbatim from Backend/scripts/wordpress/reports/where-iks-manifest.json
// (WHERE_IKS_ROWS, C-series keys only) -- not hand-retyped. Re-run
// Backend/scripts/wordpress/extract-where-iks-manifest.mjs against the
// WXR to reproduce this data independently.
const APPROVED_C_ROWS = {
  "C 1 - Digitisation of Tools for Typing, OCR, Fonts": [
    {
      "topic": "a. Windows",
      "title": "https://www.pramukhime.com/windows-application",
      "desc": "Windows Indic Phonetic Keyboard (built-in Microsoft) – 10 Indian Languages. Free, simple, Unicode-compliant, available in Windows 10 & 11",
      "link": "https://www.pramukhime.com/windows-application"
    },
    {
      "topic": "a. Windows",
      "title": "https://www.azhagi.com/",
      "desc": "Windows Indic Phonetic Keyboard (built-in Microsoft) – 10 Indian Languages. Free, simple, Unicode-compliant, available in Windows 10 & 11",
      "link": "https://www.azhagi.com/"
    },
    {
      "topic": "a. Windows",
      "title": "https://baraha.com/main.php",
      "desc": "Windows Indic Phonetic Keyboard (built-in Microsoft) – 10 Indian Languages. Free, simple, Unicode-compliant, available in Windows 10 & 11",
      "link": "https://baraha.com/main.php"
    },
    {
      "topic": "b. Smartphones: Android & iOS",
      "title": "https://google-indic-keyboard.en.softonic.com/android#google_vignette",
      "desc": "Google Indic Keyboard / Gboard – Best everyday typing, predictive",
      "link": "https://google-indic-keyboard.en.softonic.com/android#google_vignette"
    },
    {
      "topic": "b. Smartphones: Android & iOS",
      "title": "http://idid.in/",
      "desc": "svaracakra (Android) – Developed by IIT-B for multiple indic scripts -",
      "link": "http://idid.in/"
    },
    {
      "topic": "b. Smartphones: Android & iOS",
      "title": "https://apps.apple.com/tr/app/sanskrittypist/id6450332512",
      "desc": "SanskritTypist (iOS) – Excellent for both Devanāgarī & IAST typing",
      "link": "https://apps.apple.com/tr/app/sanskrittypist/id6450332512"
    },
    {
      "topic": "c. WEB / Browser",
      "title": "https://google-input-tools.updatestar.com/",
      "desc": ">Google Input Tools - Predictive typing, hundreds of languages supported",
      "link": "https://google-input-tools.updatestar.com/"
    },
    {
      "topic": "c. WEB / Browser",
      "title": "https://www.google.com/inputtools/",
      "desc": ">Google Input Tools - Predictive typing, hundreds of languages supported",
      "link": "https://www.google.com/inputtools/"
    },
    {
      "topic": "c. WEB / Browser",
      "title": "https://www.lexilogos.com/keyboard/",
      "desc": ">Google Input Tools - Predictive typing, hundreds of languages supported",
      "link": "https://www.lexilogos.com/keyboard/"
    },
    {
      "topic": "d. Cross-Platform Tool for IKS Work",
      "title": "https://keyman.com/",
      "desc": "Cross-Platform: Windows • macOS • Linux • Android • iOS Multiple Keyboards: Phonetic • IAST • INSCRIPT • Custom saṃskṛta layouts Unicode Output: Works in any app — Word, PPT, Browser, InDesign Expandable: Install specialized saṃskṛta/Vedic keyboards, scripts like śāradā, grantha, etc.",
      "link": "https://keyman.com/"
    },
    {
      "topic": "Direct Input - Voice Typing",
      "title": "https://bhashini.gov.in/",
      "desc": "o Hindi, Tamil, Telugu, Marathi, Kannada",
      "link": "https://bhashini.gov.in/"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://www.learnsanskrit.org/tools/sanscript/",
      "desc": "",
      "link": "https://www.learnsanskrit.org/tools/sanscript/"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://aksharamukha.appspot.com/converter",
      "desc": "",
      "link": "https://aksharamukha.appspot.com/converter"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://www.yesvedanta.com/keyswap/",
      "desc": "",
      "link": "https://www.yesvedanta.com/keyswap/"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://anuvaad.bhashini.gov.in/",
      "desc": "",
      "link": "https://anuvaad.bhashini.gov.in/"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://dharmamitra.org/",
      "desc": "",
      "link": "https://dharmamitra.org/"
    },
    {
      "topic": "Conversion – Scripts",
      "title": "https://translate.google.com/",
      "desc": "",
      "link": "https://translate.google.com/"
    },
    {
      "topic": "ISO – 15919",
      "title": "https://www.iso.org/standard/28333.html",
      "desc": "Covers Devanāgarī and all other Brahmi-derived Indic scripts, providing a unified Roman transliteration system. (Devanāgarī, Tamil, Telugu, Kannada, Malayalam, Bengali, Gurmukhi, Gujarati, Odia, Sinhala, Grantha, Sharda and many Himalayan and Southeast Asian scripts) Very similar to IAST. Additional special sounds like ḻ — Tamil “ழ” (zha) ṟ — Tamil “ற”",
      "link": "https://www.iso.org/standard/28333.html"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://ocr.sanskritdictionary.com/#",
      "desc": "",
      "link": "https://ocr.sanskritdictionary.com/#"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://www.i2ocr.com/pdf-ocr-sanskrit",
      "desc": "",
      "link": "https://www.i2ocr.com/pdf-ocr-sanskrit"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://www.adobe.com/in/acrobat/online/pdf-to-jpg",
      "desc": "",
      "link": "https://www.adobe.com/in/acrobat/online/pdf-to-jpg"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://dharmamitra.org/?view=ocr",
      "desc": "",
      "link": "https://dharmamitra.org/?view=ocr"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://tools.simonwillison.net/ocr?language=san",
      "desc": "",
      "link": "https://tools.simonwillison.net/ocr?language=san"
    },
    {
      "topic": "Conversion - Image / Pdf / Scan",
      "title": "https://piocr.com/",
      "desc": "",
      "link": "https://piocr.com/"
    },
    {
      "topic": "a. OCR (after setting up a Google Vision account)",
      "title": "https://skrutable.info/ocr",
      "desc": "Can be used by linking to your personal Google Vision account, first 1000 pages free every month, charged after that",
      "link": "https://skrutable.info/ocr"
    },
    {
      "topic": "a. OCR (after setting up a Google Vision account)",
      "title": "https://chaya.shreevatsa.net/",
      "desc": "Tesseract (Free) + Google Vision (Linked to personal account)",
      "link": "https://chaya.shreevatsa.net/"
    },
    {
      "topic": "a. For Devanāgarī",
      "title": "https://github.com/Sandhi-IITBombay/Shobhika/releases",
      "desc": "",
      "link": "https://github.com/Sandhi-IITBombay/Shobhika/releases"
    },
    {
      "topic": "a. For Devanāgarī",
      "title": "https://adishila.com/fonts/",
      "desc": "",
      "link": "https://adishila.com/fonts/"
    },
    {
      "topic": "a. For Devanāgarī",
      "title": "https://sourceforge.net/projects/devanagarimpdfsiddhantafont/",
      "desc": "",
      "link": "https://sourceforge.net/projects/devanagarimpdfsiddhantafont/"
    },
    {
      "topic": "a. For Devanāgarī",
      "title": "https://salrc.uchicago.edu/resources/fonts/available/sanskrit/sanskrit2003.shtml",
      "desc": "",
      "link": "https://salrc.uchicago.edu/resources/fonts/available/sanskrit/sanskrit2003.shtml"
    },
    {
      "topic": "a. For Devanāgarī",
      "title": "https://fontreach.com/font/aparajita",
      "desc": "",
      "link": "https://fontreach.com/font/aparajita"
    },
    {
      "topic": "b. For web (drive, canva, etc)",
      "title": "https://www.tiro.com/fonts/tiro-devanagari-sanskrit",
      "desc": "",
      "link": "https://www.tiro.com/fonts/tiro-devanagari-sanskrit"
    },
    {
      "topic": "b. For web (drive, canva, etc)",
      "title": "https://fonts.google.com/specimen/Vesper+Libre",
      "desc": "",
      "link": "https://fonts.google.com/specimen/Vesper+Libre"
    },
    {
      "topic": "b. For web (drive, canva, etc)",
      "title": "https://fonts.google.com/specimen/Eczar",
      "desc": "",
      "link": "https://fonts.google.com/specimen/Eczar"
    },
    {
      "topic": "b. For web (drive, canva, etc)",
      "title": "https://fonts.google.com/noto/specimen/Noto+Serif+Devanagari",
      "desc": "",
      "link": "https://fonts.google.com/noto/specimen/Noto+Serif+Devanagari"
    },
    {
      "topic": "c. For IAST",
      "title": "https://fonts.google.com/specimen/Charis+SIL",
      "desc": "",
      "link": "https://fonts.google.com/specimen/Charis+SIL"
    },
    {
      "topic": "c. For IAST",
      "title": "https://fonts.google.com/specimen/Gentium+Plus",
      "desc": "",
      "link": "https://fonts.google.com/specimen/Gentium+Plus"
    },
    {
      "topic": "c. For IAST",
      "title": "https://fonts.google.com/noto/specimen/Noto+Sans",
      "desc": "",
      "link": "https://fonts.google.com/noto/specimen/Noto+Sans"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.google.com/noto/specimen/Noto+Sans",
      "desc": "Noto Sans & Noto Serif - Variants are usually compatible for cross-language, Unicode compliant IKS work across languages",
      "link": "https://fonts.google.com/noto/specimen/Noto+Sans"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.adobe.com/fonts/noto-serif",
      "desc": "Noto Sans & Noto Serif - Variants are usually compatible for cross-language, Unicode compliant IKS work across languages",
      "link": "https://fonts.adobe.com/fonts/noto-serif"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://salrc.uchicago.edu/resources/fonts/available/tamil/latha.shtml",
      "desc": "Tamil - Latha and Vijaya Fonts",
      "link": "https://salrc.uchicago.edu/resources/fonts/available/tamil/latha.shtml"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "http://typingguru.net/tamil-fonts/vijaya",
      "desc": "Tamil - Latha and Vijaya Fonts",
      "link": "http://typingguru.net/tamil-fonts/vijaya"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.google.com/specimen/Baloo+Tamma+2",
      "desc": "Kannada - Baloo Tamma and Nudi Fonts",
      "link": "https://fonts.google.com/specimen/Baloo+Tamma+2"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://nudityping.com/nudi-fonts-download/",
      "desc": "Kannada - Baloo Tamma and Nudi Fonts",
      "link": "https://nudityping.com/nudi-fonts-download/"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.google.com/specimen/Mandali",
      "desc": "Telugu - Mandali and Pothana Fonts",
      "link": "https://fonts.google.com/specimen/Mandali"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://www.typingguru.net/telugu-fonts/unicode/pothana2000",
      "desc": "Telugu - Mandali and Pothana Fonts",
      "link": "https://www.typingguru.net/telugu-fonts/unicode/pothana2000"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.google.com/specimen/Manjari",
      "desc": "Malayalam - Manjari and Rachana Fonts",
      "link": "https://fonts.google.com/specimen/Manjari"
    },
    {
      "topic": "d. Good Fonts For South Indian Scripts For IKS Work",
      "title": "https://fonts.adobe.com/fonts/rachana",
      "desc": "Malayalam - Manjari and Rachana Fonts",
      "link": "https://fonts.adobe.com/fonts/rachana"
    },
    {
      "topic": "chandas Tools",
      "title": "https://www.skrutable.info/",
      "desc": "",
      "link": "https://www.skrutable.info/"
    },
    {
      "topic": "chandas Tools",
      "title": "https://sanskrit.dev/varnamala",
      "desc": "",
      "link": "https://sanskrit.dev/varnamala"
    },
    {
      "topic": "Search Engines",
      "title": "http://sandarbha.sangrah.org/",
      "desc": "",
      "link": "http://sandarbha.sangrah.org/"
    },
    {
      "topic": "Search Engines",
      "title": "http://sanskrit.uohyd.ac.in:8082/searchengine/",
      "desc": "",
      "link": "http://sanskrit.uohyd.ac.in:8082/searchengine/"
    }
  ],
  "C 2 - Computational Tools": [
    {
      "topic": "Samsādhanī",
      "title": "http://sanskrit.uohyd.ac.in",
      "desc": "This website enables one to explore Ancient Sciences and Technologies. Has many tools that provide the basic knowledge of Saṃskṛta grammar related to word formation, Sandhi, Samāsa and Kāraka. One can access the original Saṃskṛta texts with some effort.",
      "link": "http://sanskrit.uohyd.ac.in"
    },
    {
      "topic": "Online Sanskrit tools",
      "title": "https://tdil-dc.in",
      "desc": "This tool provides conversion facility among the romanised transliteration schemes into Devanāgarī and also from Devanāgarī into various romanised transliteration schemes. This site also provides tools for analysis of Sanskrit processing: morphological analysis and generation, segmentation, sandhi splitter, and parsing.",
      "link": "https://tdil-dc.in"
    },
    {
      "topic": "Saṃbhāṣā",
      "title": "https://sambhasha.ksu.ac.in",
      "desc": "The primary intent of this website is to develop various computational tools for Saṃskṛta and allied languages like - Mahākośa- a kośa data navigation tool. Āyussaṃkṛtam-Courseware for Āyurvedic Medical students. Tarkasaṅgrahaḥ Ontologicalknowledge representation Vāṅmayī-e Create text – explore the meaning. Sāṅgaṇikapāli-Pali language tools Prācīnanyāyaḥ-Ontological knowledge representation Sandhi Splitting tool Bhaṭṭikāvya-nandinī-Explore Bhattikavya with Kāraka dependency diagram Vaijayantīkośa-Knowledge net Nāmadhāturūpikā-Denominative verbs Śabdakautukam-Practice noun forms Anvayacitraṇam-tool Draw relations.",
      "link": "https://sambhasha.ksu.ac.in"
    },
    {
      "topic": "Lexical Database",
      "title": "https://cfilt.iitb.ac.in",
      "desc": "This webpage has been designed to provide a lexical database for Saṃskṛta. It is related to source materials like - Multilingual wordnets and ontologies and their linking, resolving word and attachment ambiguities, identifying correct parts of speech, named entities and non-recursive noun phrases for Marathi and Hindi, Indian language query to English and Hindi Retrieval, automatic translation involving Marathi, Hindi and English, testing if a piece text (hypothesis) is inferable from another (text), detecting polarity-positive/negative/neutral- of a given document, especially reviews, studying cognitive aspects of language processing and understanding using eye-tracking. All these are processed with help of CFILT - Computation for Indian Language Technology that primarily focuses on deep semantics and multilinguality that played a pivotal role in these activities by laying stress on semantics has led to research in the above mentioned areas.",
      "link": "https://cfilt.iitb.ac.in"
    },
    {
      "topic": "The Sanskrit Heritage Site",
      "title": "https://sanskrit.inria.fr",
      "desc": "The Sanskrit Heritage Site provides various services for the computational treatment for Sanskrit like – Dictionary Access (with morphology generator), a rich encyclopedic content about Bhāratīya Culture and other phonological tools like parser and so on.",
      "link": "https://sanskrit.inria.fr"
    },
    {
      "topic": "Digital Corpus of Sanskrit",
      "title": "https://www.sanskrit-linguistics.org",
      "desc": "This forum is a sandhi-spilt corpus of Saṃskṛta texts with morphological and lexical analysis. It has been designed for text historical research in Saṃskṛta linguistics and philology wherein the users can search for words and their collocations in a corpus of more than 48 lakh manually tagged words in 6 lakh plus text lines.",
      "link": "https://www.sanskrit-linguistics.org"
    },
    {
      "topic": "Centre of Sanskrit Studies, Jawaharlal Nehru University (JNU)",
      "title": "https://sanskrit.jnu.ac.in",
      "desc": "The website hosts a wide range of tools and resources, including online lexical resources such as the Amarakośa, searchable corpora of classical texts like the Mahābhārata, Bhagavad Gītā, Āyurveda texts, Raghuvaṃśa, and selected Upaniṣads, as well as manuscript-related resources. It provides computational linguistics tools such as morphological analyzers, sandhi splitters and generators, subanta and tiṅanta analyzers, POS tagging utilities, and other Pāṇinīyan grammar–based language-processing tools. In addition, the site includes annotated corpora, research datasets, e-learning and multimedia resources, and information on ongoing research projects, workshops, and academic initiatives, making it a key platform for researchers, students, and practitioners working in Saṃskṛta studies, digital humanities, and Indic language computing.",
      "link": "https://sanskrit.jnu.ac.in"
    },
    {
      "topic": "The Sanskrit Library – Tools and Resources",
      "title": "https://www.sanskritlibrary.org",
      "desc": "This tools page aggregates a wide range of digital resources, including text viewers, parsers, analyzers, dictionaries, corpora, and encoding standards. It supports scholarly research, teaching, and computational analysis of Saṃskṛta through standardized digital formats and open-access tools.",
      "link": "https://www.sanskritlibrary.org"
    },
    {
      "topic": "Computational Sanskrit Tools – IIT Kanpur",
      "title": "https://sanskrit.iitk.ac.in",
      "desc": "This website hosts computational tools developed at IIT Kanpur for processing Saṃskṛta texts. It includes resources such as morphological analyzers, sandhi splitters, parsers, and related language-processing tools grounded in Pāṇinīyan grammar.",
      "link": "https://sanskrit.iitk.ac.in"
    },
    {
      "topic": "Sandarbha Sangraha",
      "title": "http://sandarbha.sangrah.org",
      "desc": "It provides tools for cross-referencing, contextual lookup, and thematic navigation across classical literature. The platform is particularly useful for researchers engaged in textual analysis, intertextual studies, and traditional śāstric research supported by digital methods.",
      "link": "http://sandarbha.sangrah.org"
    },
    {
      "topic": "Sanskrit Tools",
      "title": "http://sanskrit.segal.net.br/en/index",
      "desc": "This website provides Sanskrit learning tools, including grammatical tables for noun declensions and a Sanskrit-English dictionary based on Monier-Williams lexicon resources.",
      "link": "http://sanskrit.segal.net.br/en/index"
    },
    {
      "topic": "UniLipi",
      "title": "https://ihdia.iiit.ac.in/unilipi/",
      "desc": "A Unified Multi-Script OCR for Historical Indic Manuscripts. It is a single OCR foundation model trained jointly across 13 Indic scripts. UniLipi currently processes manuscripts written in: Devanagari, Sharada, Modi, Gurmukhi, Jaini, Bengali, Odia, Grantha, Telugu, Malayalam, Kannada, Newar, and Siddham. More scripts in the pipeline. Beyond historical manuscripts, UniLipi also transfers to contemporary Indic handwriting. This project is developed at IIIT Hyderabad as part of LekhyaAI.",
      "link": "https://ihdia.iiit.ac.in/unilipi/"
    }
  ],
  "C 3 - AI Tools and Links": [
    {
      "topic": "Shaabdabodha",
      "title": "https://www.shaabdabodha.app/",
      "desc": "Provides śloka analysis, sandhi, samāsa, kāraka, anvaya, chandas, Aṣṭādhyāyī references, dhātu information, translation and conversation tools. This appears to be the most comprehensive and promising tool in the list.",
      "link": "https://www.shaabdabodha.app/"
    },
    {
      "topic": "DakshGPT",
      "title": "https://www.yeschat.ai/gpts-9t55QeGbLGc-DakshGPT",
      "desc": "Intended for Sanskrit translation, grammar, vocabulary, literature and cultural questions. The listing is working.",
      "link": "https://www.yeschat.ai/gpts-9t55QeGbLGc-DakshGPT"
    },
    {
      "topic": "Sanskrit Chat",
      "title": "https://sanskrit-chat.vercel.app/",
      "desc": "Claims to provide English/Hinglish-to-Sanskrit translation, conversation rooms, an AI study mentor, flashcards and quizzes. The landing page is working.",
      "link": "https://sanskrit-chat.vercel.app/"
    },
    {
      "topic": "Sanskrit Tutor for Hindi Speakers – ChatGPT",
      "title": "https://chatgpt.com/g/g-67687b5c00248191b63c4dbbb72ccb51-sanskrit-tutor-for-those-who-know-hindi",
      "desc": "Intended to teach Sanskrit through Hindi. The link reaches ChatGPT, but the specialised tutor requires login and could not be independently evaluated.",
      "link": "https://chatgpt.com/g/g-67687b5c00248191b63c4dbbb72ccb51-sanskrit-tutor-for-those-who-know-hindi"
    },
    {
      "topic": "AIKosh",
      "title": "https://aikosh.indiaai.gov.in/home",
      "desc": "Repository of India-specific datasets, AI models, and digital resources for research and development.",
      "link": "https://aikosh.indiaai.gov.in/home"
    },
    {
      "topic": "Vāgbodhinī",
      "title": "https://prathosh.in/vagbodhini/",
      "desc": "A vṛtta (metre) aware Sanskrit chant tutor — hear the correct chant of any śloka, then chant along and get instant per-syllable feedback.",
      "link": "https://prathosh.in/vagbodhini/"
    },
    {
      "topic": "Vāgdhenu",
      "title": "https://prathosh.in/vagdhenu/",
      "desc": "A vṛtta (meter) aware śloka-to-chant text-to-speech system for Sanskrit.",
      "link": "https://prathosh.in/vagdhenu/"
    },
    {
      "topic": "सुश्रोता",
      "title": "https://prathosh.in/sushrotaa/",
      "desc": "Speech-to-text engine for traditional Sanskrit",
      "link": "https://prathosh.in/sushrotaa/"
    },
    {
      "topic": "Shabd AI",
      "title": "https://shabdai.com/",
      "desc": "A commercial translation and localisation service covering text, voice and video in more than 22 Indian languages.",
      "link": "https://shabdai.com/"
    },
    {
      "topic": "Chitralekha – AIKosh",
      "title": "https://aikosh.indiaai.gov.in/home/toolkit/details/17",
      "desc": "An open-source video-transcreation platform providing transcription, translation, transliteration and voice-over support for Indic languages.",
      "link": "https://aikosh.indiaai.gov.in/home/toolkit/details/17"
    },
    {
      "topic": "Chitralekha – AIKosh",
      "title": "https://github.com/AI4Bharat/Chitralekha",
      "desc": "An open-source video-transcreation platform providing transcription, translation, transliteration and voice-over support for Indic languages.",
      "link": "https://github.com/AI4Bharat/Chitralekha"
    },
    {
      "topic": "Revid AI – Stotra",
      "title": "https://www.revid.ai/category/stotra",
      "desc": "Revid is a general AI video-creation platform. The Stotra link appears to be a category or gallery of devotional AI-generated videos rather than a dedicated Sanskrit tool.",
      "link": "https://www.revid.ai/category/stotra"
    },
    {
      "topic": "Vedanthajignasa",
      "title": "https://www.vedanthajignasa.in/",
      "desc": "",
      "link": "https://www.vedanthajignasa.in/"
    },
    {
      "topic": "Tattvajignasa",
      "title": "https://www.tattvajignasa.in/",
      "desc": "",
      "link": "https://www.tattvajignasa.in/"
    },
    {
      "topic": "DharmaJignasa",
      "title": "https://www.dharmajignasa.in/",
      "desc": "",
      "link": "https://www.dharmajignasa.in/"
    },
    {
      "topic": "NETSanskrit",
      "title": "https://netsanskrit.app/",
      "desc": "",
      "link": "https://netsanskrit.app/"
    },
    {
      "topic": "Yesvedānta",
      "title": "https://www.yesvedanta.com/search/",
      "desc": "Vedānta-focused AI chatbot trained on svāmī Paramārthananda’s and svāmī Dayānanda's teachings.",
      "link": "https://www.yesvedanta.com/search/"
    },
    {
      "topic": "Yesvedānta",
      "title": "https://www.yesvedanta.com/swami-paramarthananda/",
      "desc": "Vedānta-focused AI chatbot trained on svāmī Paramārthananda’s and svāmī Dayānanda's teachings.",
      "link": "https://www.yesvedanta.com/swami-paramarthananda/"
    },
    {
      "topic": "Yesvedānta",
      "title": "https://www.yesvedanta.com/dayananda/",
      "desc": "Vedānta-focused AI chatbot trained on svāmī Paramārthananda’s and svāmī Dayānanda's teachings.",
      "link": "https://www.yesvedanta.com/dayananda/"
    },
    {
      "topic": "SivaGPT",
      "title": "https://www.siva.sh/sivagpt",
      "desc": "AI responses based on scriptural sources.",
      "link": "https://www.siva.sh/sivagpt"
    },
    {
      "topic": "Revolutionizing Sanskrit Research: In-depth Applications of AI Tools in Indological Studies",
      "title": "https://www.allstudyjournal.com/article/1577/7-7-22-481.pdf",
      "desc": "A short introductory article explaining possible applications and limitations of AI in Sanskrit research.",
      "link": "https://www.allstudyjournal.com/article/1577/7-7-22-481.pdf"
    },
    {
      "topic": "Shabdabodha-LLM",
      "title": "https://www.researchgate.net/publication/407141993_SHABDABODHA-LLM_Automatic_Sentence-Level_Sabdabodha_Generation_Using_Navya-Nyaya_Prakarata-Visesyata_Relations_with_LLM",
      "desc": "A June 2026 research presentation by Tapas Khanra, Radhe Shyam Salopanthula and Malhar Kulkarni. It explores automatic sentence-level śābdabodha generation using Navya-Nyāya relations and fine-tuned language models.",
      "link": "https://www.researchgate.net/publication/407141993_SHABDABODHA-LLM_Automatic_Sentence-Level_Sabdabodha_Generation_Using_Navya-Nyaya_Prakarata-Visesyata_Relations_with_LLM"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://elicit.com/",
      "desc": "AI-assisted literature review tool for finding relevant papers, extracting key claims, methods, and conclusions.",
      "link": "https://elicit.com/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://www.connectedpapers.com/",
      "desc": "Visual graph-based exploration of related research papers to understand how studies are interconnected.",
      "link": "https://www.connectedpapers.com/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://www.scispace.com/",
      "desc": "Ask questions directly to extant literature, explore summaries, and build visual explanations from research papers.",
      "link": "https://www.scispace.com/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://gemini.google.com/",
      "desc": "Google Scholar – Citation discovery and academic reference tracking. And also useful for summarizing research articles and also extracting insights from YouTube lectures and academic videos.",
      "link": "https://gemini.google.com/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://notebooklm.google.com/",
      "desc": "Analyze defined sources, generate summaries, mind maps, and audio/video overviews from curated material.",
      "link": "https://notebooklm.google.com/"
    },
    {
      "topic": "Activities & Tools:",
      "title": "https://www.mendeley.com/",
      "desc": "Multiple citation styles supported",
      "link": "https://www.mendeley.com/"
    },
    {
      "topic": "Activities & Tools:",
      "title": "https://www.zotero.org/",
      "desc": "Multiple citation styles supported",
      "link": "https://www.zotero.org/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://quillbot.com/ai-content-detector",
      "desc": "To check AI-generated content and maintain academic integrity",
      "link": "https://quillbot.com/ai-content-detector"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://vyoma-samskritam-stt.streamlit.app/",
      "desc": "Speech-to-Text (STT) – Vyoma Sanskrit STT",
      "link": "https://vyoma-samskritam-stt.streamlit.app/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://yourvoic.com/",
      "desc": "Text-to-Speech (TTS) – YourVoic (Sanskrit)",
      "link": "https://yourvoic.com/"
    },
    {
      "topic": "Vāgbodhinī",
      "title": "https://prathosh.in/vagbodhini/",
      "desc": "A vṛtta (metre) aware Sanskrit chant tutor — hear the correct chant of any śloka, then chant along and get instant per-syllable feedback.",
      "link": "https://prathosh.in/vagbodhini/"
    },
    {
      "topic": "Vāgdhenu",
      "title": "https://prathosh.in/vagdhenu/",
      "desc": "A vṛtta (meter) aware śloka-to-chant text-to-speech system for Sanskrit.",
      "link": "https://prathosh.in/vagdhenu/"
    },
    {
      "topic": "सुश्रोता",
      "title": "https://prathosh.in/sushrotaa/",
      "desc": "Speech-to-text engine for traditional Sanskrit",
      "link": "https://prathosh.in/sushrotaa/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://app.napkin.ai/",
      "desc": "To Create visually appealing presentations from text -",
      "link": "https://app.napkin.ai/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://www.canva.com/",
      "desc": "To prepare Posters, slides, infographics, and academic visuals -",
      "link": "https://www.canva.com/"
    },
    {
      "topic": "Tools & Links:",
      "title": "https://www.figma.com/",
      "desc": "For Advanced UI/UX-based academic and research visuals -",
      "link": "https://www.figma.com/"
    }
  ],
  "C 4 - E Learning": [
    {
      "topic": "Vyoma",
      "title": "https://www.sanskritfromhome.org",
      "desc": "",
      "link": "https://www.sanskritfromhome.org"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/sanskrit_language_teaching.php",
      "desc": "",
      "link": "http://www.sanskrit.nic.in/sanskrit_language_teaching.php"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/shastra_shikshan.php",
      "desc": "",
      "link": "http://www.sanskrit.nic.in/shastra_shikshan.php"
    },
    {
      "topic": "Sanskrit Promotion Foundation",
      "title": "https://www.samskrittutorial.in",
      "desc": "",
      "link": "https://www.samskrittutorial.in"
    },
    {
      "topic": "Sanskrit Promotion Foundation",
      "title": "https://learnsanskrit.org",
      "desc": "",
      "link": "https://learnsanskrit.org"
    },
    {
      "topic": "Sanskrit Promotion Foundation",
      "title": "https://learnsanskritonline.com",
      "desc": "",
      "link": "https://learnsanskritonline.com"
    },
    {
      "topic": "Open Pathashala",
      "title": "https://openpathshala.com",
      "desc": "",
      "link": "https://openpathshala.com"
    },
    {
      "topic": "Indic Academy",
      "title": "https://indica.courses",
      "desc": "",
      "link": "https://indica.courses"
    },
    {
      "topic": "Advaita Academy",
      "title": "https://www.academy-advaita.com/en/",
      "desc": "",
      "link": "https://www.academy-advaita.com/en/"
    },
    {
      "topic": "Indica Yoga",
      "title": "https://www.indicayoga.com/",
      "desc": "",
      "link": "https://www.indicayoga.com/"
    },
    {
      "topic": "Vaidic Gurukulam",
      "title": "https://www.vaidikgurukul.in/",
      "desc": "",
      "link": "https://www.vaidikgurukul.in/"
    },
    {
      "topic": "Shaale.com – free and paid lessons in Traditional arts & literature",
      "title": "https://www.shaale.com/",
      "desc": "",
      "link": "https://www.shaale.com/"
    },
    {
      "topic": "Bhandarkar Oriental Research Institute",
      "title": "https://bori.ac.in/courses/",
      "desc": "",
      "link": "https://bori.ac.in/courses/"
    },
    {
      "topic": "Centre for Indic Studies",
      "title": "https://cisindus.org",
      "desc": "",
      "link": "https://cisindus.org"
    },
    {
      "topic": "Pushpa Dixit Courses",
      "title": "https://pushpadikshit.in",
      "desc": "",
      "link": "https://pushpadikshit.in"
    },
    {
      "topic": "Other Platforms",
      "title": "http://www.chinmayamission.com/what-we-do/courses/postal-e-vedanta-courses/easy-sanskrit-level-1/",
      "desc": "",
      "link": "http://www.chinmayamission.com/what-we-do/courses/postal-e-vedanta-courses/easy-sanskrit-level-1/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://sanskrit.today",
      "desc": "",
      "link": "https://sanskrit.today"
    },
    {
      "topic": "Other Platforms",
      "title": "http://www.acharya.gen.in:8080/sanskrit/lessons.php",
      "desc": "",
      "link": "http://www.acharya.gen.in:8080/sanskrit/lessons.php"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.sanskritmaitri.com",
      "desc": "",
      "link": "https://www.sanskritmaitri.com"
    },
    {
      "topic": "Other Platforms",
      "title": "https://classes.multibhashi.com/courses/live-sanskrit-classes-online",
      "desc": "",
      "link": "https://classes.multibhashi.com/courses/live-sanskrit-classes-online"
    },
    {
      "topic": "Other Platforms",
      "title": "https://sanskritabhyas.in/",
      "desc": "",
      "link": "https://sanskritabhyas.in/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://bala.sambhasha.ksu.ac.in/",
      "desc": "",
      "link": "https://bala.sambhasha.ksu.ac.in/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://ashtadhyayi.com/",
      "desc": "",
      "link": "https://ashtadhyayi.com/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://choomantra.com/samskrutam/",
      "desc": "",
      "link": "https://choomantra.com/samskrutam/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://zat.am/index24.html",
      "desc": "",
      "link": "https://zat.am/index24.html"
    },
    {
      "topic": "Other Platforms",
      "title": "https://sanskrit.dev/krida",
      "desc": "",
      "link": "https://sanskrit.dev/krida"
    },
    {
      "topic": "Other Platforms",
      "title": "https://samskritifoundation.org/",
      "desc": "",
      "link": "https://samskritifoundation.org/"
    },
    {
      "topic": "Other Platforms",
      "title": "http://www.acharya.gen.in:8080/",
      "desc": "",
      "link": "http://www.acharya.gen.in:8080/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.learnsanskrit.org/",
      "desc": "",
      "link": "https://www.learnsanskrit.org/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://chinfo.org/",
      "desc": "",
      "link": "https://chinfo.org/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.samskrittutorial.in/",
      "desc": "",
      "link": "https://www.samskrittutorial.in/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.chitrapurmath.net/",
      "desc": "",
      "link": "https://www.chitrapurmath.net/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://ubcsanskrit.ca/",
      "desc": "",
      "link": "https://ubcsanskrit.ca/"
    },
    {
      "topic": "Other Platforms",
      "title": "http://www.danam.co.uk/",
      "desc": "",
      "link": "http://www.danam.co.uk/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.bhishmaindics.org",
      "desc": "Bhishma School of Indic Studies",
      "link": "https://www.bhishmaindics.org"
    },
    {
      "topic": "Other Platforms",
      "title": "https://mayapurinstitute.org/course",
      "desc": "ISKCON – Mayapur Institute",
      "link": "https://mayapurinstitute.org/course"
    },
    {
      "topic": "Other Platforms",
      "title": "https://research.baps.org/education/courses/listing/",
      "desc": "BAPS Swaminarayan Research",
      "link": "https://research.baps.org/education/courses/listing/"
    },
    {
      "topic": "Other Platforms",
      "title": "https://www.sanskritlearners.club/",
      "desc": "",
      "link": "https://www.sanskritlearners.club/"
    }
  ],
  "C 5 - YouTube Channel Based Learning": [
    {
      "topic": "Vyoma",
      "title": "https://www.youtube.com/channel/UCp5mvCwXR-drTRyzNUUjdZg",
      "desc": "",
      "link": "https://www.youtube.com/channel/UCp5mvCwXR-drTRyzNUUjdZg"
    },
    {
      "topic": "Indic Academy",
      "title": "https://www.youtube.com/hashtag/indicacourses",
      "desc": "",
      "link": "https://www.youtube.com/hashtag/indicacourses"
    },
    {
      "topic": "Indica Yoga",
      "title": "https://www.youtube.com/@IndicaYoga",
      "desc": "",
      "link": "https://www.youtube.com/@IndicaYoga"
    },
    {
      "topic": "Open Pathashala",
      "title": "https://www.youtube.com/user/OpenPathshala",
      "desc": "",
      "link": "https://www.youtube.com/user/OpenPathshala"
    },
    {
      "topic": "Advaita Academy",
      "title": "https://www.youtube.com/@advaitapublications",
      "desc": "",
      "link": "https://www.youtube.com/@advaitapublications"
    },
    {
      "topic": "Geeta Govinda Samskruta Sangha",
      "title": "https://www.youtube.com/@samskrit-ggss",
      "desc": "",
      "link": "https://www.youtube.com/@samskrit-ggss"
    },
    {
      "topic": "Samskrita Bharati",
      "title": "https://www.youtube.com/@SamskritBharati",
      "desc": "",
      "link": "https://www.youtube.com/@SamskritBharati"
    },
    {
      "topic": "Dharmadhenu",
      "title": "https://www.youtube.com/@Dharmadhenu",
      "desc": "",
      "link": "https://www.youtube.com/@Dharmadhenu"
    },
    {
      "topic": "The Sanskrit Channel",
      "title": "https://www.youtube.com/c/TheSanskritChannel",
      "desc": "",
      "link": "https://www.youtube.com/c/TheSanskritChannel"
    },
    {
      "topic": "Chinmaya Vishwavidyapeeth, especially OLA series",
      "title": "https://www.youtube.com/watch?v=3H16y-XfMMc&list=PLbQHD8oHpmE15FcG2rPWejiQnGL0TC_m2",
      "desc": "",
      "link": "https://www.youtube.com/watch?v=3H16y-XfMMc&list=PLbQHD8oHpmE15FcG2rPWejiQnGL0TC_m2"
    },
    {
      "topic": "Shaale.com – free and paid lessons in Traditional arts & literature",
      "title": "https://www.youtube.com/@shaaledotcom/featured",
      "desc": "",
      "link": "https://www.youtube.com/@shaaledotcom/featured"
    },
    {
      "topic": "Vaidic Gurukulam",
      "title": "https://www.youtube.com/@vaidikgurukulonline",
      "desc": "",
      "link": "https://www.youtube.com/@vaidikgurukulonline"
    },
    {
      "topic": "NPTEL IIT Khargapur Course - Introduction to Basic Spoken Sanskrit by Prof Anuradha Choudry",
      "title": "https://www.youtube.com/watch?v=wnHNokBn22g",
      "desc": "",
      "link": "https://www.youtube.com/watch?v=wnHNokBn22g"
    }
  ],
  "C 6 - Blogs": [
    {
      "topic": "",
      "title": "https://sanskritlinks.blogspot.com/",
      "desc": "",
      "link": "https://sanskritlinks.blogspot.com/"
    },
    {
      "topic": "",
      "title": "https://hariprasadvarma.substack.com/",
      "desc": "",
      "link": "https://hariprasadvarma.substack.com/"
    },
    {
      "topic": "",
      "title": "https://www.esamskriti.com/default.aspx",
      "desc": "",
      "link": "https://www.esamskriti.com/default.aspx"
    },
    {
      "topic": "",
      "title": "https://jayasreesaranathan.blogspot.com/",
      "desc": "",
      "link": "https://jayasreesaranathan.blogspot.com/"
    }
  ],
  "C 7 - Channels and Social Media": [
    {
      "topic": "Facebook",
      "title": "http://facebook.com/prachyam",
      "desc": "",
      "link": "http://facebook.com/prachyam"
    },
    {
      "topic": "Facebook",
      "title": "http://facebook.com/sankritpeeyoosham",
      "desc": "",
      "link": "http://facebook.com/sankritpeeyoosham"
    },
    {
      "topic": "Facebook",
      "title": "http://facebook.com/profile.php?id=100008151318722",
      "desc": "",
      "link": "http://facebook.com/profile.php?id=100008151318722"
    },
    {
      "topic": "Facebook",
      "title": "http://facebook.com/thesanskritchannel",
      "desc": "",
      "link": "http://facebook.com/thesanskritchannel"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/CIFKochi/",
      "desc": "",
      "link": "https://www.facebook.com/CIFKochi/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/sanskritresearchinstitute",
      "desc": "",
      "link": "https://www.facebook.com/sanskritresearchinstitute"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/sanskrit1001/",
      "desc": "",
      "link": "https://www.facebook.com/sanskrit1001/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/sanskrithk/",
      "desc": "",
      "link": "https://www.facebook.com/sanskrithk/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/PracticalSanskrit/",
      "desc": "",
      "link": "https://www.facebook.com/PracticalSanskrit/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/gaieasanskrit/",
      "desc": "",
      "link": "https://www.facebook.com/gaieasanskrit/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/mdssanskritcollege/",
      "desc": "",
      "link": "https://www.facebook.com/mdssanskritcollege/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/people/Sanskrit-and-Philosophy-Study-Group/100064625622016/#",
      "desc": "",
      "link": "https://www.facebook.com/people/Sanskrit-and-Philosophy-Study-Group/100064625622016/#"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/sanskritforkids/",
      "desc": "",
      "link": "https://www.facebook.com/sanskritforkids/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/NamasteJnana/",
      "desc": "",
      "link": "https://www.facebook.com/NamasteJnana/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/resanskrit/",
      "desc": "",
      "link": "https://www.facebook.com/resanskrit/"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/openpathshala",
      "desc": "",
      "link": "https://www.facebook.com/openpathshala"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/samskrittutorials",
      "desc": "",
      "link": "https://www.facebook.com/samskrittutorials"
    },
    {
      "topic": "Facebook",
      "title": "https://www.facebook.com/SanskritKaUday",
      "desc": "",
      "link": "https://www.facebook.com/SanskritKaUday"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@thevedantachannel",
      "desc": "",
      "link": "https://youtube.com/@thevedantachannel?si=Kat8TVPm5sf3gWDc"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@samskritbharati",
      "desc": "",
      "link": "https://youtube.com/@samskritbharati?si=fnilwHB4QfBZ1UA"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@thesanskritchannel",
      "desc": "",
      "link": "https://youtube.com/@thesanskritchannel?si=lZZtFzp2JTGHv9Im"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@prachyam",
      "desc": "",
      "link": "https://youtube.com/@prachyam?si=5E8SRxfiHIwui9mI"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@dr.avdhesh_vidyalankar",
      "desc": "",
      "link": "https://youtube.com/@dr.avdhesh_vidyalankar?si=iA_GAnE9Bj3xOG10"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@vevishosam",
      "desc": "",
      "link": "https://youtube.com/@vevishosam?si=C7anhggaSnPZeVDN"
    },
    {
      "topic": "YouTube",
      "title": "https://youtube.com/@projectshivoham",
      "desc": "",
      "link": "https://youtube.com/@projectshivoham?si=n3btgN7LlAXjO6zR"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/user/ChinfoChannel",
      "desc": "",
      "link": "https://www.youtube.com/user/ChinfoChannel"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/channel/UCX7OXni4F1oPV15DSeCe3FA",
      "desc": "",
      "link": "https://www.youtube.com/channel/UCX7OXni4F1oPV15DSeCe3FA"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@resanskrit_",
      "desc": "",
      "link": "https://www.youtube.com/@resanskrit_"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/c/SamskritTutorials",
      "desc": "",
      "link": "https://www.youtube.com/c/SamskritTutorials"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@SanskritKaUday",
      "desc": "",
      "link": "https://www.youtube.com/@SanskritKaUday"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@authoramish",
      "desc": "",
      "link": "https://www.youtube.com/@authoramish"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@gipaliveevents",
      "desc": "",
      "link": "https://www.youtube.com/@gipaliveevents"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@sanskritlearnersclub/featured",
      "desc": "",
      "link": "https://www.youtube.com/@sanskritlearnersclub/featured"
    },
    {
      "topic": "YouTube",
      "title": "https://www.youtube.com/@parankushacharinstituteofvedic/playlists",
      "desc": "",
      "link": "https://www.youtube.com/@parankushacharinstituteofvedic/playlists"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/thesanskritchannel/",
      "desc": "",
      "link": "https://www.instagram.com/thesanskritchannel/"
    },
    {
      "topic": "Instagram",
      "title": "http://instagram.com/samskritbharati",
      "desc": "",
      "link": "http://instagram.com/samskritbharati"
    },
    {
      "topic": "Instagram",
      "title": "http://instagram.com/prachyam7",
      "desc": "",
      "link": "http://instagram.com/prachyam7"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/vedavijnanagurukulam/",
      "desc": "",
      "link": "https://www.instagram.com/vedavijnanagurukulam/?utm_source=ig_web_button_share_sheet"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/projectshivoham/",
      "desc": "",
      "link": "https://www.instagram.com/projectshivoham/?utm_source=ig_web_button_share_sheet"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/cif_official_",
      "desc": "",
      "link": "https://www.instagram.com/cif_official_"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/resanskrit/",
      "desc": "",
      "link": "https://www.instagram.com/resanskrit/"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/samskrittutorials/",
      "desc": "",
      "link": "https://www.instagram.com/samskrittutorials/"
    },
    {
      "topic": "Instagram",
      "title": "https://www.instagram.com/sanskritkauday_",
      "desc": "",
      "link": "https://www.instagram.com/sanskritkauday_"
    }
  ],
  "C 8 - Tips and Tricks": [
    {
      "topic": "",
      "title": "1. Choose the appropriate script and transliteration Use all 3 input methods – devanāgarī, IAST, and general English to find varied results and choose the best amongst the same.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "2. Begin with standard and authoritative websites Start your research using well-established \"master\" or reference websites before moving to secondary or derivative sources.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "3. Use precise and infrequent keywords Prefer specific technical terms and apply selective or advanced search techniques to avoid generic or irrelevant results.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "4. Perform iterative searches Refine and repeat your searches by modifying keywords, scripts, and platforms to progressively improve accuracy and depth.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "5. Combine multiple repositories for completeness Use a combination of digital libraries and repositories to obtain a comprehensive and reliable picture; prioritize major or \"mother\" repositories wherever possible.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "6. Verify rigorously before concluding Do not finalize findings until they are fully confirmed; when possible, validate references by consulting a Guru or subject-matter scholar.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "Other general tips and tricks",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "1. Use the \"related:\" search operator to find similar websites. Enter related:chinmaya.org in the search bar to discover multiple websites associated with or similar to the Chinmaya network.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "2. Select the language and script strategically Choose Sanskrit or English based on the nature of the content you are searching for.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "3. Search basic texts (mūlam) in Devanagari For original Sanskrit sources and primary texts, always search using Devanagari script.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "4. Search translations and explanations in English or IAST For commentaries, translations, and secondary literature, use English keywords or IAST transliteration.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "5. Use advanced search options Click on the \"Advanced Search\" option to apply filters such as exact phrases, site-specific searches, or file types.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "6. Apply time filters to refine results After performing a search, use the \"Tools\" option to limit results to a specific time period for recent or historical relevance.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "7. Combine multiple content types Use a mix of images, videos, news, and text-based results to gain broader context and deeper insight into the topic.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "8. Use exact phrases within quotation marks Place keywords inside inverted commas to search for an exact phrase, e.g., \"Chinmaya bhagavad-gītā\", to obtain precise and relevant results.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "9. Use plus, minus, and Boolean operators Force inclusion or exclusion of terms using + and –, or apply Boolean logic such as AND, OR, XOR, and NOT (where supported) to refine searches in academic databases.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "10. Search by document type Use file extensions like doc, pdf, or xls, or apply the command filetype:pdf, to locate specific types of documents.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "11. Restrict searches to specific websites Combine your search term with site:www.abc.org to find relevant content within a particular website or domain.",
      "desc": "",
      "link": ""
    },
    {
      "topic": "",
      "title": "12. Use an asterisk (*) for unknown words Insert an asterisk in place of missing or uncertain words; the search engine may automatically fill in the gap and return relevant variations.",
      "desc": "",
      "link": ""
    }
  ],
  "C 9 - Miscellaneous": [
    {
      "topic": "IKS Related Articles",
      "title": "https://organiser.org/2026/04/26/349371/bharat/inclusion-of-indian-knowledge-systemiks-in-the-contemporary-curriculum-of-the-nation/",
      "desc": "These are magazines where there are many IKS related articles.",
      "link": "https://organiser.org/2026/04/26/349371/bharat/inclusion-of-indian-knowledge-systemiks-in-the-contemporary-curriculum-of-the-nation/?fbclid=IwdGRjcARcN75jbGNrBFw01mV4dG4DYWVtAjExAHNydGMGYXBwX2lkDDM1MDY4NTUzMTcyOAABHkC4FMYPsgks6umGIDwQ72CuaSXLn-n4GALQQAvPKJaRoyG3mUt4oKlRM8T1_aem_x09F3zM2EKi6HnF25VGjHQ"
    },
    {
      "topic": "IKS Related Articles",
      "title": "https://swarajyamag.com/ideas/how-ancient-india-predicted-rains-before-the-arrogance-of-modern-science",
      "desc": "These are magazines where there are many IKS related articles.",
      "link": "https://swarajyamag.com/ideas/how-ancient-india-predicted-rains-before-the-arrogance-of-modern-science"
    },
    {
      "topic": "IKS Related Articles",
      "title": "https://stephen-knapp.com/articles_to_read.htm",
      "desc": "These are magazines where there are many IKS related articles.",
      "link": "https://stephen-knapp.com/articles_to_read.htm"
    },
    {
      "topic": "IKS Related Articles",
      "title": "https://www.vedanet.com/knowledge-center/",
      "desc": "These are magazines where there are many IKS related articles.",
      "link": "https://www.vedanet.com/knowledge-center/"
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

  if (APPROVED_C_CATEGORIES.length !== 9) {
    errors.push(`Expected exactly 9 C-series categories, found ${APPROVED_C_CATEGORIES.length}.`);
  }

  let total = 0;
  let linkRows = 0;
  for (const cat of APPROVED_C_CATEGORIES) {
    const rows = APPROVED_C_ROWS[cat];
    const expected = EXPECTED_C_ROW_COUNTS[cat];
    if (!Array.isArray(rows)) {
      errors.push(`Category "${cat}" has no row array in APPROVED_C_ROWS.`);
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

  if (total !== EXPECTED_C_TOTAL_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_C_TOTAL_ROWS} total C-series rows, found ${total}.`);
  }
  if (linkRows !== EXPECTED_C_LINK_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_C_LINK_ROWS} clickable C-series links, found ${linkRows}.`);
  }
  const noteRows = total - linkRows;
  if (noteRows !== EXPECTED_C_NOTE_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_C_NOTE_ROWS} non-link C-series informational rows, found ${noteRows}.`);
  }
  // C8 specifically must contain all 19 of the non-link rows, and nothing else should.
  const c8 = APPROVED_C_ROWS['C 8 - Tips and Tricks'];
  if (!c8 || c8.length !== 19 || !c8.every((r) => !r.link)) {
    errors.push('Expected "C 8 - Tips and Tricks" to contain exactly 19 non-link rows.');
  }
  const nonC8NoteRows = APPROVED_C_CATEGORIES.filter((c) => c !== 'C 8 - Tips and Tricks').reduce((s, c) => s + APPROVED_C_ROWS[c].filter((r) => !r.link).length, 0);
  if (nonC8NoteRows !== 0) {
    errors.push(`Expected 0 non-link rows outside "C 8 - Tips and Tricks", found ${nonC8NoteRows}.`);
  }

  if (WHERE_IKS_SERIES.length !== 3) {
    errors.push(`Expected exactly 3 series in WHERE_IKS_SERIES, found ${WHERE_IKS_SERIES.length}.`);
  }
  if (ALL_29_CATEGORIES_IN_ORDER.length !== 29) {
    errors.push(`Expected exactly 29 categories in the canonical order list, found ${ALL_29_CATEGORIES_IN_ORDER.length}.`);
  }
  for (const cat of APPROVED_C_CATEGORIES) {
    if (!ALL_29_CATEGORIES_IN_ORDER.includes(cat)) errors.push(`C-series category "${cat}" is not present in the canonical 29-category order list.`);
  }

  return { errors, total, linkRows, noteRows };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Where-IKS C-series migration (Batch C, Stage C-C) -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: data.WHERE_IKS_SERIES (re-asserted, unchanged), data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (C-series keys only, additive) on pages/media + media.');
  console.log('Source: 29 separate tablepress_table WXR posts -- see Backend/scripts/wordpress/reports/where-iks-manifest.json.');
  console.log('Does NOT touch the 20 already-migrated A-series/B-series categories, Where-Sanskrit, or What-Sanskrit.');
  console.log('This completes the full 29-category taxonomy: 636 clickable links + 23 non-link informational rows across A+B+C.');
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
  console.log(`[OK] Manifest self-check passed: 9 C-series categories, ${total} total rows (expected ${EXPECTED_C_TOTAL_ROWS}) = ${linkRows} clickable links + ${noteRows} non-link informational rows (all on C8).`);
  for (const [cat, expected] of Object.entries(EXPECTED_C_ROW_COUNTS)) {
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

      // Expect the 20 A-series + B-series categories to already be present
      // and intact -- this script depends on Stages C-A and C-B having run
      // first.
      for (const abCat of APPROVED_AB_CATEGORIES_REFERENCE) {
        if (!currentCategories.includes(abCat) || currentRows[abCat] === undefined) {
          errors.push(`Content "${type}" is missing expected already-migrated category "${abCat}" -- Stage C-A/C-B does not appear to have completed successfully; aborting rather than proceeding out of order.`);
        }
      }

      let cAlreadyMigrated = true;
      for (const cat of APPROVED_C_CATEGORIES) {
        if (!currentCategories.includes(cat) || !deepEqual(currentRows[cat], APPROVED_C_ROWS[cat])) {
          cAlreadyMigrated = false;
          break;
        }
      }
      for (const cat of APPROVED_C_CATEGORIES) {
        if (currentRows[cat] !== undefined && !deepEqual(currentRows[cat], APPROVED_C_ROWS[cat])) {
          errors.push(`Content "${type}"'s data.WHERE_IKS_ROWS["${cat}"] already exists but does not match the approved C-series data -- unexpected state, aborting rather than overwriting unknown existing content.`);
        }
      }

      plan[type] = { currentCategories, currentRows, cAlreadyMigrated };
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (WHERE_IKS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    const allAlreadyMigrated = MEDIA_CONTENT_TYPES.every((t) => plan[t].cAlreadyMigrated);
    const anyAlreadyMigrated = MEDIA_CONTENT_TYPES.some((t) => plan[t].cAlreadyMigrated);
    if (anyAlreadyMigrated && !allAlreadyMigrated) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other for the C-series portion -- this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    if (allAlreadyMigrated) {
      console.log('\n[OK] Both Content documents already show the approved C-series data -- nothing to do (safe re-run / already migrated). The full 29-category taxonomy is complete.');
      return;
    }
    console.log('[OK] Baseline confirmed: the 20 A-series/B-series categories are present and intact; C-series data is not yet present (or absent entirely) on both documents.');

    // --- Compute the full next value for each type, additively -------------
    const nextState = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const { currentCategories, currentRows } = plan[type];
      const mergedCategories = sortByCanonicalOrder([...new Set([...currentCategories, ...APPROVED_C_CATEGORIES])]);
      const mergedRows = { ...currentRows, ...APPROVED_C_ROWS };
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
      // Also explicitly confirm the 20 A-series/B-series categories' rows
      // are byte-identical in the computed next state (defence in depth).
      for (const abCat of APPROVED_AB_CATEGORIES_REFERENCE) {
        if (!deepEqual(nextState[type].rows[abCat], docs[type].data.WHERE_IKS_ROWS[abCat])) {
          console.error(`\nABORT: computed next state would change already-migrated category "${abCat}" on "${type}". Aborting rather than risk it.`);
          process.exitCode = 1;
          return;
        }
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key, including the 20 A-series/B-series categories, Where-Sanskrit\'s and What-Sanskrit\'s data, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set data.WHERE_IKS_SERIES (re-asserted, unchanged) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log(`Add/merge 9 C-series categories into data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (${total} rows: ${linkRows} links + ${noteRows} notes) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    for (const [cat, rows] of Object.entries(APPROVED_C_ROWS)) {
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
    const backupPath = path.join(BACKUP_DIR, `where-iks-c-series-migration-backup-${timestamp}.json`);
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
    console.log(`[COMMIT] Set data.WHERE_IKS_SERIES and merged C-series into data.WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const seriesMatch = deepEqual(after.data.WHERE_IKS_SERIES, WHERE_IKS_SERIES);
      const categoriesMatch = deepEqual(after.data.WHERE_IKS_CATEGORIES, nextState[type].categories);
      let rowsMatch = true;
      for (const cat of APPROVED_C_CATEGORIES) {
        if (!deepEqual(after.data.WHERE_IKS_ROWS[cat], APPROVED_C_ROWS[cat])) rowsMatch = false;
      }
      let abStillIntact = true;
      for (const abCat of APPROVED_AB_CATEGORIES_REFERENCE) {
        if (!deepEqual(after.data.WHERE_IKS_ROWS[abCat], docs[type].data.WHERE_IKS_ROWS[abCat])) abStillIntact = false;
      }
      console.log(`[verify] "${type}" WHERE_IKS_SERIES matches exactly: ${seriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" WHERE_IKS_CATEGORIES matches the computed next state exactly: ${categoriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" all 9 C-series WHERE_IKS_ROWS entries match the approved data exactly: ${rowsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" the 20 A-series/B-series WHERE_IKS_ROWS entries remain exactly as before: ${abStillIntact ? 'YES' : 'NO'}`);
      if (!seriesMatch || !categoriesMatch || !rowsMatch || !abStillIntact) ok = false;

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

    console.log('\n--- COMMIT complete, all verifications passed. Full 29-category Where-IKS taxonomy is now migrated. ---');
  } finally {
    await disconnectDb();
  }
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
