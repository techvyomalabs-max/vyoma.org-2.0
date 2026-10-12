// WordPress -> MERN migration: Where-IKS / O-MANTRI, A-SERIES ONLY
// (Batch C, Stage C-A of a 3-series staged migration -- B-series and
// C-series are separate, later scripts; see the additive-merge note below
// on how they can be added without overwriting this one).
//
// Scope (per the approved batch):
//   - Touches ONLY data.WHERE_IKS_SERIES (new key, full static 3-series/
//     29-category taxonomy description -- written once, stable regardless
//     of which series have real row data yet), data.WHERE_IKS_CATEGORIES
//     (new key, grows additively as each series script runs), and
//     data.WHERE_IKS_ROWS (new key, grows additively, one object key per
//     category) on the dual Content documents {type: "pages/media"} and
//     {type: "media"} (same dual-type-sync pattern as every prior batch).
//   - This script ONLY adds the 4 A-series categories' data (A1- Kosa,
//     A2 Encyclopedic Bharatiya Literature, A3 Mother Repositories, A4
//     Magazines/Journals/Articles -- 265 resource rows total). It does
//     NOT write any B-series or C-series category, and is designed so a
//     later B-series or C-series script can extend
//     WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS additively (merging new
//     category keys in) WITHOUT overwriting this script's own data, or
//     vice versa -- see the additive-merge note below.
//   - Source: all 29 category tables' real WordPress content lives in 29
//     separate `tablepress_table` WXR posts (NOT in the Where-IKS page's
//     own WXR content:encoded, which only holds a Divi tab-shortcode
//     scaffold with no resource data at all -- confirmed by direct
//     inspection). Extracted and reconciled by the companion, reproducible
//     tool `Backend/scripts/wordpress/extract-where-iks-manifest.mjs`,
//     whose output is the durable manifest at
//     `Backend/scripts/wordpress/reports/where-iks-manifest.json` -- the
//     A-series data below is copied verbatim from that manifest's
//     WHERE_IKS_ROWS (not hand-retyped), to eliminate transcription risk
//     across 265 rows.
//   - A stray, abandoned duplicate TablePress table ("Copy of A1- Kosa",
//     id 12375, only 9 rows, dated after the canonical table) was found
//     in the same WXR and deliberately excluded -- the canonical
//     "A1- Kosa" table (id 11855, 35 links) is the one actually rendered
//     on the live page, confirmed by matching its link count against an
//     independent live-page extraction. See the manifest's
//     `source.excludedDuplicate` for full detail.
//   - Preserves the real Topic (sub-)grouping within each category
//     exactly as published (forward-filled from the nearest preceding
//     non-blank Topic/Name cell, same convention as
//     Where-Sanskrit/What-Sanskrit), and the real Description text where
//     the source table has one (A1, A2, A3 do; A4's table has no
//     Description column at all -- its rows carry desc: "", not an
//     invented value).
//   - Does NOT touch Where-Sanskrit (RESOURCE_CATEGORIES/RESOURCE_ROWS)
//     or What-Sanskrit (WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS), or
//     any other data key -- verified unchanged both before writing
//     (baseline read) and after (deep-equal against a pre-write backup).
//   - Does NOT connect to, query, or depend on search-iks.vyoma.org /
//     Meilisearch in any way -- this is pure static resource-list data;
//     the new site's search/filter will be plain client-side, same
//     pattern as the existing ResourcesTable component.
//   - Does NOT download/rehost any linked resource.
//
// ADDITIVE MERGE DESIGN (so B-series/C-series scripts can follow safely):
//   Unlike every prior single-shot batch, this key is built incrementally
//   across up to 3 scripts. On each run, this script reads whatever
//   WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS currently exist (absent on the
//   very first run), computes the full next value as "existing
//   categories/rows, with the 4 A-series keys set/overwritten to the
//   approved A-series data, everything else left untouched", re-sorts
//   WHERE_IKS_CATEGORIES into the fixed canonical 29-category taxonomy
//   order (so run order of A/B/C scripts never matters), and writes that
//   complete computed value with a single $set -- never a raw MongoDB
//   $push/$addToSet, staying consistent with this project's established
//   "read full state, validate, compute full next state in JS, $set the
//   complete value" style used by every prior migration script.
//
// Modes:
//   node where-iks-a-series-migration.mjs            -> dry-run (default)
//   node where-iks-a-series-migration.mjs --commit   -> performs the real
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
// The full, static 3-series / 29-category taxonomy description. Written
// in full by this (first) series script and re-asserted unchanged by any
// later series script -- it describes the whole structure, not just
// whichever series currently has real row data, so the frontend can
// render "coming soon" for not-yet-migrated series/categories rather
// than hiding them.
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

// The 4 A-series categories this script is responsible for, in order.
const APPROVED_A_CATEGORIES = [
  "A1- Kośa",
  "A 2 - Encyclopedic Bhāratīya Literature",
  "A 3 - Mother Repositories",
  "A 4 - Magazines, Journals, Articles"
];

const EXPECTED_A_ROW_COUNTS = {
  "A1- Kośa": 35,
  "A 2 - Encyclopedic Bhāratīya Literature": 151,
  "A 3 - Mother Repositories": 31,
  "A 4 - Magazines, Journals, Articles": 48
};
const EXPECTED_A_TOTAL_ROWS = 265;

// Copied verbatim from Backend/scripts/wordpress/reports/where-iks-manifest.json
// (WHERE_IKS_ROWS, A-series keys only) -- not hand-retyped, to eliminate
// transcription risk across 265 rows. Re-run
// Backend/scripts/wordpress/extract-where-iks-manifest.mjs against the
// WXR to reproduce this data independently.
const APPROVED_A_ROWS = {
  "A1- Kośa": [
    {
      "topic": "Aggregators",
      "title": "https://kosha.sanskrit.today/",
      "desc": "Comprehensive Sanskrit dictionary portal integrating 60+ lexicons with a unified search interface.",
      "link": "https://kosha.sanskrit.today/"
    },
    {
      "topic": "Aggregators",
      "title": "https://sanskritdictionary.com/",
      "desc": "Aggregated search across multiple Sanskrit dictionaries with a unified search interface.",
      "link": "https://sanskritdictionary.com/"
    },
    {
      "topic": "Aggregators",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/",
      "desc": "Aggregation of 43 Sanskrit lexicons prepared since 1994 by the Institute of Indology and Tamil Studies, Cologne University.",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/"
    },
    {
      "topic": "Aggregators",
      "title": "https://sanskritkosha.com/",
      "desc": "Unified search interface for 50+ Sanskrit dictionaries with customizable kośa collections.",
      "link": "https://sanskritkosha.com/"
    },
    {
      "topic": "Aggregators",
      "title": "https://kosha.app/",
      "desc": "Unified search interface for 50+ Sanskrit dictionaries with customizable kośa collections.",
      "link": "https://kosha.app/"
    },
    {
      "topic": "Aggregators",
      "title": "https://www.sanskritebooks.org/category/sanskrit/dictionary-sanskrit/",
      "desc": "Download E-books of various dictionaries and kośa-s.",
      "link": "https://www.sanskritebooks.org/category/sanskrit/dictionary-sanskrit/"
    },
    {
      "topic": "Aggregators",
      "title": "https://sanskritdocuments.org/dict/",
      "desc": "Collection of links to Online Sanskrit Dictionaries and utilities.",
      "link": "https://sanskritdocuments.org/dict/"
    },
    {
      "topic": "Aggregators",
      "title": "https://mahakosha.sambhasha.ksu.ac.in/",
      "desc": "Knowledge network integrating multiple Sanskrit kośas with semantic, ontological, and lexical information.",
      "link": "https://mahakosha.sambhasha.ksu.ac.in/"
    },
    {
      "topic": "Aggregators",
      "title": "https://www.sanskritfromhome.in/course/koshadarshanam/",
      "desc": "Free Online course on understanding and effectively using major Sanskrit dictionaries.",
      "link": "https://www.sanskritfromhome.in/course/koshadarshanam/"
    },
    {
      "topic": "Aggregators",
      "title": "http://sanskritweb.net/sansdocs/reverse1.pdf",
      "desc": "Reverse Sanskrit dictionary indexing words by their endings rather than their beginnings.",
      "link": "http://sanskritweb.net/sansdocs/reverse1.pdf"
    },
    {
      "topic": "Aggregators",
      "title": "https://github.com/sanskrit/raw_etexts/tree/master/koshaH",
      "desc": "GitHub repository of Open-source raw digital texts of Sanskrit kośas for research and reuse.",
      "link": "https://github.com/sanskrit/raw_etexts/tree/master/koshaH"
    },
    {
      "topic": "Aggregators",
      "title": "https://dsal.uchicago.edu/dictionaries/",
      "desc": "Digital library providing access to numerous Sanskrit and Indological dictionaries.",
      "link": "https://dsal.uchicago.edu/dictionaries/"
    },
    {
      "topic": "Aggregators",
      "title": "http://www.andhrabharati.com/dictionary/sanskrit/index.php",
      "desc": "Search multiple Sanskrit dictionaries, including Monier-Williams, Wilson, and Cappeller.",
      "link": "http://www.andhrabharati.com/dictionary/sanskrit/index.php"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://theveda.org.in/glossary",
      "desc": "Searchable glossary of Vedic Sanskrit words, with concordance and links to Ṛgvedic occurrences.",
      "link": "https://theveda.org.in/glossary"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://sanskrit.uohyd.ac.in/scl/kosha_concordance/synset_linking/display.html",
      "desc": "A concordance aligning entries of Amarakośa with the Abhidhānacintāmaṇi tradition and its associated commentaries, showing where each lexical item occurs across these works.",
      "link": "https://sanskrit.uohyd.ac.in/scl/kosha_concordance/synset_linking/display.html"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://sacred-texts.com/hin/sktdict.txt",
      "desc": "Plain-text Sanskrit–English glossary with alphabetical word meanings and grammatical notes.",
      "link": "https://sacred-texts.com/hin/sktdict.txt"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://www.yesvedanta.com/sanskrit-glossary-1/",
      "desc": "Alphabetical glossary of Vedāntic and philosophical Sanskrit terms with concise English explanations.",
      "link": "https://www.yesvedanta.com/sanskrit-glossary-1/"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://incarnateword.in/dict/sans",
      "desc": "Glossary of Sanskrit Terms in Sri Aurobindo's Writings, with explanations and citations.",
      "link": "https://incarnateword.in/dict/sans"
    },
    {
      "topic": "Specialised Glossaries",
      "title": "https://www.swami-krishnananda.org/glossary/glossary_a.html",
      "desc": "Alphabetical glossary of Sanskrit spiritual and philosophical terms with concise English definitions, compiled from Swami Sivananda's writings.",
      "link": "https://www.swami-krishnananda.org/glossary/glossary_a.html"
    },
    {
      "topic": "Nirukta",
      "title": "https://vedicheritage.gov.in/vedangas/nirukta/",
      "desc": "Digital flipbook edition of Yāska's Nirukta with the commentary of Devaraja Yajvan on the Vedic Heritage Portal.",
      "link": "https://vedicheritage.gov.in/vedangas/nirukta/"
    },
    {
      "topic": "Nirukta",
      "title": "https://vedicreserve.miu.edu/nirukt.htm",
      "desc": "Downloadable PDF edition of Yāska's Nirukta from the Vedic Reserve.",
      "link": "https://vedicreserve.miu.edu/nirukt.htm"
    },
    {
      "topic": "Nirukta",
      "title": "https://archive.org/details/nighantuniruktao00yaskuoft/mode/2up",
      "desc": "MLBD edition of Nighantu with Nirukta, Ed. Lakshman Sarup.",
      "link": "https://archive.org/details/nighantuniruktao00yaskuoft/mode/2up"
    },
    {
      "topic": "Amarakośa",
      "title": "https://amarakosha.vyomalabs.in/",
      "desc": "Digital text of the Amarakośa with varga-wise navigation.",
      "link": "https://amarakosha.vyomalabs.in/"
    },
    {
      "topic": "Amarakośa",
      "title": "https://sanskritdocuments.org/sanskrit/amarakosha/",
      "desc": "Digital text of the Amarakośa in multiple scripts.",
      "link": "https://sanskritdocuments.org/sanskrit/amarakosha/"
    },
    {
      "topic": "Amarakośa",
      "title": "http://amara.aupasana.com/",
      "desc": "Searchable Amarakośa with multiple search modes and lexical exploration.",
      "link": "http://amara.aupasana.com/"
    },
    {
      "topic": "Amarakośa",
      "title": "https://ashtadhyayi.com/kosha/",
      "desc": "Interactive, searchable Amarakosha with verse-wise navigation, synonyms, prātipadika and gender information.",
      "link": "https://ashtadhyayi.com/kosha/"
    },
    {
      "topic": "Amarakośa",
      "title": "https://sanskrit.uohyd.ac.in/scl/amarakosha/",
      "desc": "Semantic exploration of the Amarakosha through lexical relationships and ontology.",
      "link": "https://sanskrit.uohyd.ac.in/scl/amarakosha/"
    },
    {
      "topic": "Amarakośa",
      "title": "https://www.sanskritfromhome.org/global-search?Search=Amarakosha",
      "desc": "Free online courses to learn Amarakośa systematically.",
      "link": "https://www.sanskritfromhome.org/global-search?Search=Amarakosha"
    },
    {
      "topic": "Other Kośas",
      "title": "https://learnsanskrit.cc/",
      "desc": "Beginner-friendly Spoken Sanskrit dictionary with conversational phrases and English meanings.",
      "link": "https://learnsanskrit.cc/"
    },
    {
      "topic": "Śabdakalpadruma",
      "title": "https://play.google.com/store/apps/details?id=org.shrutijha.sanskrit_sanskrit&hl=en_IN&gl=US&pli=1",
      "desc": "Offline mobile app for searching the Śabdakalpadruma Sanskrit dictionary.",
      "link": "https://play.google.com/store/apps/details?id=org.shrutijha.sanskrit_sanskrit&hl=en_IN&gl=US&pli=1"
    },
    {
      "topic": "Vācaspatyam",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/VCPScan/2020/web/index.php",
      "desc": "Searchable digital edition of Tārānātha Tarkavācaspati's Vācaspatyam at Cologne collection.",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/VCPScan/2020/web/index.php"
    },
    {
      "topic": "Abhidhānaratnamālā of Halāyudha",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/ARMHScan/2020/web/index.php",
      "desc": "Searchable digital edition of Halāyudha's Abhidhānaratnamālā at Cologne collection.",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/ARMHScan/2020/web/index.php"
    },
    {
      "topic": "Abhidhānacintāmaṇi of Hemacandrācārya",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/ABCHScan/2023/web/index.php",
      "desc": "Searchable digital edition of Hemacandra's Abhidhānacintāmaṇi at Cologne collection.",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/ABCHScan/2023/web/index.php"
    },
    {
      "topic": "Abhidhānacintāmaṇi of Hemacandrācārya",
      "title": "https://dsal.uchicago.edu/dictionaries/macdonell/",
      "desc": "Searchable interface for A practical Sanskrit dictionary by Macdonell.",
      "link": "https://dsal.uchicago.edu/dictionaries/macdonell/"
    },
    {
      "topic": "Abhidhānacintāmaṇi of Hemacandrācārya",
      "title": "https://dsal.uchicago.edu/dictionaries/apte/",
      "desc": "Searchable digital edition of V. S. Apte's Sanskrit-English Dictionary at DSAL collection.",
      "link": "https://dsal.uchicago.edu/dictionaries/apte/"
    }
  ],
  "A 2 - Encyclopedic Bhāratīya Literature": [
    {
      "topic": "a. Ṛgveda",
      "title": "https://vedicheritage.gov.in/samhitas/rigveda/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/samhitas/rigveda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://vedicheritage.gov.in/brahmanas/#",
      "desc": "",
      "link": "https://vedicheritage.gov.in/brahmanas/#"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://vedicheritage.gov.in/aranyakas/aitareyaranyaka/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/aranyakas/aitareyaranyaka/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "http://vedavms.in/",
      "desc": "",
      "link": "http://vedavms.in/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://xn--j2b3a4c.com/rigveda_info",
      "desc": "",
      "link": "https://xn--j2b3a4c.com/rigveda_info"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://texts.wara.in/vedas/rigveda/",
      "desc": "",
      "link": "https://texts.wara.in/vedas/rigveda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://sites.google.com/view/rv-pratishakhya",
      "desc": "",
      "link": "https://sites.google.com/view/rv-pratishakhya"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "http://www.detlef108.de/DetlefsSanskritDocuments.htm",
      "desc": "",
      "link": "http://www.detlef108.de/DetlefsSanskritDocuments.htm"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://sanskritdocuments.org/sanskrit/veda/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/veda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://sacred-texts.com/hin/rigveda/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/rigveda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://sacred-texts.com/hin/rvsan/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/rvsan/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/veda/rigveda",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/veda/rigveda"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "http://www.detlef108.de/Rigveda.htm",
      "desc": "",
      "link": "http://www.detlef108.de/Rigveda.htm"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://theveda.org.in/rigveda",
      "desc": "",
      "link": "https://theveda.org.in/rigveda"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://vedicscriptures.in/user/login",
      "desc": "",
      "link": "https://vedicscriptures.in/user/login"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://vedicreserve.miu.edu/rk_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/rk_veda"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "http://sanskritweb.net/rigveda/",
      "desc": "",
      "link": "http://sanskritweb.net/rigveda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://vmlt.in/rigveda",
      "desc": "",
      "link": "https://vmlt.in/rigveda"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://dharmawiki.org/index.php/Category:Rigveda",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Category:Rigveda"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://rigveda.sanatana.in/",
      "desc": "",
      "link": "https://rigveda.sanatana.in/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://iish.org/rig-veda/",
      "desc": "",
      "link": "https://iish.org/rig-veda/"
    },
    {
      "topic": "a. Ṛgveda",
      "title": "https://play.google.com/store/apps/details?id=com.vedic.chant",
      "desc": "This is a Mobile App - an assistant for chanting.",
      "link": "https://play.google.com/store/apps/details?id=com.vedic.chant"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicheritage.gov.in/samhitas/yajurveda/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/samhitas/yajurveda/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicheritage.gov.in/brahmanas/#",
      "desc": "",
      "link": "https://vedicheritage.gov.in/brahmanas/#"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicheritage.gov.in/aranyakas/brihadaranyaka/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/aranyakas/brihadaranyaka/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicheritage.gov.in/aranyakas/taittiriya-aranyaka/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/aranyakas/taittiriya-aranyaka/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "http://vedavms.in/",
      "desc": "",
      "link": "http://vedavms.in/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://xn--j2b3a4c.com/yajurveda_info",
      "desc": "",
      "link": "https://xn--j2b3a4c.com/yajurveda_info"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://texts.wara.in/vedas/yajurveda/",
      "desc": "",
      "link": "https://texts.wara.in/vedas/yajurveda/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "http://www.detlef108.de/DetlefsSanskritDocuments.htm",
      "desc": "",
      "link": "http://www.detlef108.de/DetlefsSanskritDocuments.htm"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://sacred-texts.com/hin/yv/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/yv/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/veda/yajurveda",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/veda/yajurveda"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicscriptures.in/user/login",
      "desc": "",
      "link": "https://vedicscriptures.in/user/login"
    },
    {
      "topic": "b. Yajurveda",
      "title": "http://sanskritweb.net/yajurveda/",
      "desc": "",
      "link": "http://sanskritweb.net/yajurveda/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicreserve.miu.edu/yajur_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/yajur_veda"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicreserve.miu.edu/shukl_yajur_veda_pratishakhya.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/shukl_yajur_veda_pratishakhya.htm"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://vedicreserve.miu.edu/krishn_yajur_veda_pratishakhya.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/krishn_yajur_veda_pratishakhya.htm"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://dharmawiki.org/index.php/Formation_of_Yajurveda_Shakas",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Formation_of_Yajurveda_Shakas_(%E0%A4%AF%E0%A4%9C%E0%A5%81%E0%A4%B0%E0%A5%8D%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%B6%E0%A4%BE%E0%A4%96-%E0%A4%85%E0%A4%B5%E0%A4%A4%E0%A4%B0%E0%A4%A3%E0%A4%AE%E0%A5%8D)"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://sanatana.in/yajurveda_tree",
      "desc": "",
      "link": "https://sanatana.in/yajurveda_tree"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://iish.org/krishna-yajur-veda/",
      "desc": "",
      "link": "https://iish.org/krishna-yajur-veda/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://iish.org/shukla-yajur-veda/",
      "desc": "",
      "link": "https://iish.org/shukla-yajur-veda/"
    },
    {
      "topic": "b. Yajurveda",
      "title": "https://play.google.com/store/apps/details?id=com.vedic.chant",
      "desc": "This is a Mobile App - an assistant for chanting.",
      "link": "https://play.google.com/store/apps/details?id=com.vedic.chant"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicheritage.gov.in/samhitas/samaveda-samhitas/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/samhitas/samaveda-samhitas/"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicheritage.gov.in/brahmanas/#",
      "desc": "",
      "link": "https://vedicheritage.gov.in/brahmanas/#"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicheritage.gov.in/aranyakas/talavakararanyaka/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/aranyakas/talavakararanyaka/"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "http://vedavms.in/",
      "desc": "",
      "link": "http://vedavms.in/"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://xn--j2b3a4c.com/samveda_info",
      "desc": "",
      "link": "https://xn--j2b3a4c.com/samveda_info"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://texts.wara.in/vedas/samaveda/",
      "desc": "",
      "link": "https://texts.wara.in/vedas/samaveda/"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "http://www.detlef108.de/DetlefsSanskritDocuments.htm",
      "desc": "",
      "link": "http://www.detlef108.de/DetlefsSanskritDocuments.htm"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://sacred-texts.com/hin/sv.htm",
      "desc": "",
      "link": "https://sacred-texts.com/hin/sv.htm"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/veda/samaveda",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/veda/samaveda"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicscriptures.in/user/login",
      "desc": "",
      "link": "https://vedicscriptures.in/user/login"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicreserve.miu.edu/sama_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sama_veda"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "http://sanskritweb.net/samaveda/",
      "desc": "",
      "link": "http://sanskritweb.net/samaveda/"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://vedicreserve.miu.edu/sama_veda_pratishakhya.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/sama_veda_pratishakhya.htm"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://dharmawiki.org/index.php/Samaveda",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Samaveda_(%E0%A4%B8%E0%A4%BE%E0%A4%AE%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%83)"
    },
    {
      "topic": "c. Sāmaveda",
      "title": "https://iish.org/sama-veda/",
      "desc": "",
      "link": "https://iish.org/sama-veda/"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://vedicheritage.gov.in/samhitas/atharvaveda-samhitas/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/samhitas/atharvaveda-samhitas/"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://vedicheritage.gov.in/brahmanas/#",
      "desc": "",
      "link": "https://vedicheritage.gov.in/brahmanas/#"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "http://vedavms.in/",
      "desc": "",
      "link": "http://vedavms.in/"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://xn--j2b3a4c.com/atharvaveda_info",
      "desc": "",
      "link": "https://xn--j2b3a4c.com/atharvaveda_info"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://texts.wara.in/vedas/atharvaveda/",
      "desc": "",
      "link": "https://texts.wara.in/vedas/atharvaveda/"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "http://www.detlef108.de/DetlefsSanskritDocuments.htm",
      "desc": "",
      "link": "http://www.detlef108.de/DetlefsSanskritDocuments.htm"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://sacred-texts.com/hin/av/index.htm",
      "desc": "",
      "link": "https://sacred-texts.com/hin/av/index.htm"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/veda/atharvaveda",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/veda/atharvaveda"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://vedicreserve.miu.edu/atharva_veda",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/atharva_veda"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://vedicreserve.miu.edu/atharva_veda_pratishakhya.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/atharva_veda_pratishakhya.htm"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://dharmawiki.org/index.php/Atharvaveda",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Atharvaveda_(%E0%A4%85%E0%A4%A5%E0%A4%B0%E0%A5%8D%E0%A4%B5%E0%A4%B5%E0%A5%87%E0%A4%A6%E0%A4%83)"
    },
    {
      "topic": "d. Atharvaveda",
      "title": "https://iish.org/atarva-veda/",
      "desc": "",
      "link": "https://iish.org/atarva-veda/"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://advaitasharada.sringeri.net/",
      "desc": "",
      "link": "https://advaitasharada.sringeri.net/"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://upanishads.org.in/upanishads",
      "desc": "",
      "link": "https://upanishads.org.in/upanishads"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://sanskritdocuments.org/sanskrit/upanishhat/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/upanishhat/"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#upanishads",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#upanishads"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://vedicreserve.miu.edu/upanishad.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/upanishad.htm"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://vedicheritage.gov.in/upanishads/",
      "desc": "",
      "link": "https://vedicheritage.gov.in/upanishads/"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Upan",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Upan"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://dharmawiki.org/index.php/Upanishads",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Upanishads_(%E0%A4%89%E0%A4%AA%E0%A4%A8%E0%A4%BF%E0%A4%B7%E0%A4%A6%E0%A4%83)"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://sacred-texts.com/hin/sbe01/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/sbe01/"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/upanisad",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/upanisad"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://texts.wara.in/#upanishads",
      "desc": "",
      "link": "https://texts.wara.in/#upanishads"
    },
    {
      "topic": "a. Major Upaniṣads",
      "title": "https://advaitabharati.sanatanasampatti.in/Works/",
      "desc": "",
      "link": "https://advaitabharati.sanatanasampatti.in/Works/"
    },
    {
      "topic": "b. Minor Upaniṣads",
      "title": "https://upanishads.org.in/otherupanishads",
      "desc": "",
      "link": "https://upanishads.org.in/otherupanishads"
    },
    {
      "topic": "b. Minor Upaniṣads",
      "title": "https://sacred-texts.com/hin/tmu/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/tmu/"
    },
    {
      "topic": "b. Minor Upaniṣads",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/upanisad",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/upanisad"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://digitalsanskrit.com/E-books/srimadvalmikiramayanam_sundarakandah/",
      "desc": "",
      "link": "https://digitalsanskrit.com/E-books/srimadvalmikiramayanam_sundarakandah/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://www.valmikiramayan.net/",
      "desc": "",
      "link": "https://www.valmikiramayan.net/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://valmiki.gitasupersite.in/",
      "desc": "",
      "link": "https://valmiki.gitasupersite.in/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://www.ramcharitmanas.iitk.ac.in/",
      "desc": "",
      "link": "https://www.ramcharitmanas.iitk.ac.in/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://sanskritdocuments.org/sites/valmikiramayan/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sites/valmikiramayan/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://sanskritdocuments.org/mirrors/ramayana/",
      "desc": "",
      "link": "https://sanskritdocuments.org/mirrors/ramayana/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://sanskritdocuments.org/sanskrit/adhyatmaramayana/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/adhyatmaramayana/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://vedicreserve.miu.edu/itihas.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/itihas.htm"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://www.vedpuran.com/listenmahakavya_Ramacharitamanasa.asp",
      "desc": "",
      "link": "https://www.vedpuran.com/listenmahakavya_Ramacharitamanasa.asp"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://valmikiramayanam.in/",
      "desc": "",
      "link": "https://valmikiramayanam.in/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://ambuda.org/texts/ramayanam/",
      "desc": "",
      "link": "https://ambuda.org/texts/ramayanam/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Ram",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Ram"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#epics",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#epics"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://sacred-texts.com/hin/rama/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/rama/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://sanskritsahitya.org/ramayanam/1.1",
      "desc": "",
      "link": "https://sanskritsahitya.org/ramayanam/1.1"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://bombay.indology.info/",
      "desc": "",
      "link": "https://bombay.indology.info/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://nsktu.ac.in/index.php/ramayana-on-internet/",
      "desc": "",
      "link": "https://nsktu.ac.in/index.php/ramayana-on-internet/"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/ramayana",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/ramayana"
    },
    {
      "topic": "a. Rāmāyaṇa",
      "title": "https://ramabhaktisamrajyam.in/",
      "desc": "",
      "link": "https://ramabhaktisamrajyam.in/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://sanatana.in/mahabharata/",
      "desc": "",
      "link": "https://sanatana.in/mahabharata/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://sanskritdocuments.org/mirrors/mahabharata/",
      "desc": "",
      "link": "https://sanskritdocuments.org/mirrors/mahabharata/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://mahabharata.manipal.edu/#/",
      "desc": "",
      "link": "https://mahabharata.manipal.edu/#/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://mahabharata.shreevatsa.net/",
      "desc": "",
      "link": "https://mahabharata.shreevatsa.net/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://ambuda.org/texts/mahabharatam/",
      "desc": "",
      "link": "https://ambuda.org/texts/mahabharatam/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#MBh",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#MBh"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://sacred-texts.com/hin/maha/index.htm",
      "desc": "",
      "link": "https://sacred-texts.com/hin/maha/index.htm"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/MCIScan/2020/web/index.php",
      "desc": "",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/MCIScan/2020/web/index.php"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://sanskritsahitya.org/mahabharatam",
      "desc": "",
      "link": "https://sanskritsahitya.org/mahabharatam"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://vedicreserve.miu.edu/itihas.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/itihas.htm"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://www.vedpuran.com/listenmahakavya_mahabharat1.asp",
      "desc": "",
      "link": "https://www.vedpuran.com/listenmahakavya_mahabharat1.asp"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://nsktu.ac.in/index.php/mahabharata-on-internet/",
      "desc": "",
      "link": "https://nsktu.ac.in/index.php/mahabharata-on-internet/"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#epics",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#epics"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/mahabharata",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/mahabharata"
    },
    {
      "topic": "b. Mahābhārata",
      "title": "https://vyas-mahabharat.com/",
      "desc": "",
      "link": "https://vyas-mahabharat.com/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://puranasharada.sringeri.net/",
      "desc": "",
      "link": "https://puranasharada.sringeri.net/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://sanskritdocuments.org/sanskrit/purana/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/purana/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://vedicreserve.miu.edu/puran.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/puran.htm"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.vedpuran.com/listenpuran.asp",
      "desc": "",
      "link": "https://www.vedpuran.com/listenpuran.asp"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.wisdomlib.org/purana",
      "desc": "",
      "link": "https://www.wisdomlib.org/purana"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.vyasaonline.com/maha-puranas/",
      "desc": "",
      "link": "https://www.vyasaonline.com/maha-puranas/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://bhaagavatam-firststep.org/",
      "desc": "",
      "link": "https://bhaagavatam-firststep.org/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://bhagavata.org/",
      "desc": "",
      "link": "https://bhagavata.org/"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#Pur",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#Pur"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/PUIScan/2020/web/index.php",
      "desc": "",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/PUIScan/2020/web/index.php"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.sanskrit-lexicon.uni-koeln.de/scans/PEScan/2020/web/index.php",
      "desc": "",
      "link": "https://www.sanskrit-lexicon.uni-koeln.de/scans/PEScan/2020/web/index.php"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/purana",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/purana"
    },
    {
      "topic": "a. Mahā purāṇa",
      "title": "https://www.sanskritam.world/puranas",
      "desc": "",
      "link": "https://www.sanskritam.world/puranas"
    },
    {
      "topic": "b. Upa purāṇa",
      "title": "https://vedicreserve.miu.edu/puran.htm",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/puran.htm"
    },
    {
      "topic": "Darśana",
      "title": "https://vedicreserve.miu.edu/darshanas/",
      "desc": "",
      "link": "https://vedicreserve.miu.edu/darshanas/"
    },
    {
      "topic": "Darśana",
      "title": "https://dharmawiki.org/index.php/Category:Darshanas",
      "desc": "",
      "link": "https://dharmawiki.org/index.php/Category:Darshanas"
    },
    {
      "topic": "Darśana",
      "title": "https://sanskritdocuments.org/sanskrit/vedanta/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/vedanta/"
    },
    {
      "topic": "Darśana",
      "title": "https://sanskritdocuments.org/sanskrit/shankaracharya/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/shankaracharya/"
    },
    {
      "topic": "Darśana",
      "title": "https://www.sanskrit.nic.in/about_sanskrit.php#metaphysical",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/about_sanskrit.php#metaphysical"
    },
    {
      "topic": "Darśana",
      "title": "https://www.veducation.world/library/Sastra-शास्त्र/darsana",
      "desc": "",
      "link": "https://www.veducation.world/library/Sastra-%E0%A4%B6%E0%A4%BE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%8D%E0%A4%B0/darsana"
    },
    {
      "topic": "Darśana",
      "title": "https://advaitabharati.sanatanasampatti.in/display/bhashya/BS",
      "desc": "",
      "link": "https://advaitabharati.sanatanasampatti.in/display/bhashya/BS"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://bhagavadgita.org.in/",
      "desc": "",
      "link": "https://bhagavadgita.org.in/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://www.gitasupersite.iitk.ac.in/",
      "desc": "",
      "link": "https://www.gitasupersite.iitk.ac.in/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://www.holy-bhagavad-gita.org/",
      "desc": "",
      "link": "https://www.holy-bhagavad-gita.org/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://vedabase.io/en/",
      "desc": "",
      "link": "https://vedabase.io/en/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://gretil.sub.uni-goettingen.de/gretil.html#BhG",
      "desc": "",
      "link": "https://gretil.sub.uni-goettingen.de/gretil.html#BhG"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://kymyogavaisharadi.org/display/moola/bhagavadgita/iast",
      "desc": "",
      "link": "https://kymyogavaisharadi.org/display/moola/bhagavadgita/iast"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://sanskritdocuments.org/sanskrit/bhagavadgita/",
      "desc": "",
      "link": "https://sanskritdocuments.org/sanskrit/bhagavadgita/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://sacred-texts.com/hin/sbe08/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/sbe08/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://sacred-texts.com/hin/bgs/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/bgs/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://sacred-texts.com/hin/sbg/",
      "desc": "",
      "link": "https://sacred-texts.com/hin/sbg/"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://sanskrit.safire.com/pdf/GITA.PDF",
      "desc": "",
      "link": "https://sanskrit.safire.com/pdf/GITA.PDF"
    },
    {
      "topic": "Bhagavad-gītā",
      "title": "https://advaitabharati.sanatanasampatti.in/display/bhashya/Gita",
      "desc": "",
      "link": "https://advaitabharati.sanatanasampatti.in/display/bhashya/Gita"
    }
  ],
  "A 3 - Mother Repositories": [
    {
      "topic": "Wisdom Library",
      "title": "https://www.wisdomlib.org/",
      "desc": "A large digital portal offering extensive resources on Hinduism, Buddhism, Jainism, Saṃskṛta, Ancient History, Philosophy, and related subjects, including books, articles, hymns, essays, and glossary tools — designed for research and study of Indic and world traditions.",
      "link": "https://www.wisdomlib.org/"
    },
    {
      "topic": "Vedic Reserve — Maharishi International University",
      "title": "https://vedicreserve.miu.edu/",
      "desc": "An online collection of Vedic literature in Saṃskṛta, presented as part of the Department of Maharishi Vedic Science at Maharishi International University, aimed at promoting reading and study of classical Vedic texts. The university is a private institution founded by Maharishi Mahesh Yogi in the U.S. with a focus on consciousness-based education.",
      "link": "https://vedicreserve.miu.edu/"
    },
    {
      "topic": "KSRI eBooks",
      "title": "https://ksri.in/ebooks/",
      "desc": "A large collection of ebooks and texts.",
      "link": "https://ksri.in/ebooks/"
    },
    {
      "topic": "Vedanta Spiritual Library",
      "title": "https://www.celextel.org",
      "desc": "An online Vedānta and spiritual library providing access to a wide range of texts such as the Bhagavad-gītā, Upaniṣad, Veda, Rāmāyaṇa, Vedanta literature, and spiritual works; often presented with translations or commentary. The domain is registered as a private website offering spiritual resources.",
      "link": "https://www.celextel.org"
    },
    {
      "topic": "Search & Retrieval of Indic texts",
      "title": "https://sarit.indology.info/",
      "desc": "60 documents in XML.",
      "link": "https://sarit.indology.info/"
    },
    {
      "topic": "Sanskrit eBooks",
      "title": "https://www.sanskritebooks.org/",
      "desc": "A repository of downloadable Saṃskṛta eBooks.",
      "link": "https://www.sanskritebooks.org/"
    },
    {
      "topic": "Ashtadhyayi",
      "title": "https://ashtadhyayi.com/",
      "desc": "A website dedicated to Pāṇini’s Ashtādhyāyī — the foundational text of Saṃskṛta grammar — including Sūtrā and Dhātu (root) lists, useful for Saṃskṛta learners and scholars.",
      "link": "https://ashtadhyayi.com/"
    },
    {
      "topic": "DharmaWiki",
      "title": "https://dharmawiki.org/index.php/Main_Page",
      "desc": "A wiki-style reference platform for Indian philosophies, religions, and dharmic concepts, providing community-editable articles on a wide range of traditional topics.",
      "link": "https://dharmawiki.org/index.php/Main_Page"
    },
    {
      "topic": "Bharatiya Janata Party (BJP) e-Library",
      "title": "https://library.bjp.org/jspui/simple-search?query=Artha",
      "desc": "A digital library / repository hosted by the BJP (Bharatiya Janata Party) featuring searchable resources, including books and documents (e.g., Artha and other Indic topics) prioritized by query.",
      "link": "https://library.bjp.org/jspui/simple-search?query=Artha"
    },
    {
      "topic": "Master Portal to Sanskrit links and Resources",
      "title": "https://sanskrit.inria.fr/",
      "desc": "Has more than 100 links from on various headings – updated as of 4th August 2022",
      "link": "https://sanskrit.inria.fr/"
    },
    {
      "topic": "Register of Electronic Texts in Indian Languages",
      "title": "https://gretil.sub.uni-goettingen.de/",
      "desc": "Machine-readable texts in Indian Languages. Cumulative download and individual. download available",
      "link": "https://gretil.sub.uni-goettingen.de/"
    },
    {
      "topic": "Repository of raw_etexts",
      "title": "https://github.com/sanskrit/raw_etexts",
      "desc": "Veda, Purāṇa, grammar and other texts, raw form. Usable for further processing, technological dissemination. Useful for Qualitative analysis.",
      "link": "https://github.com/sanskrit/raw_etexts"
    },
    {
      "topic": "Documents, Sites, Audio, institutions (veda paatashaala), scholars etc.",
      "title": "https://sanskritdocuments.org/",
      "desc": "Provide multilanguage support.",
      "link": "https://sanskritdocuments.org/"
    },
    {
      "topic": "Documents, Sites, Audio, institutions (veda paatashaala), scholars etc.",
      "title": "https://sanskritdocuments.org/sites/",
      "desc": "Has learning & dictionary resources.",
      "link": "https://sanskritdocuments.org/sites/"
    },
    {
      "topic": "Documents, Sites, Audio, institutions (veda paatashaala), scholars etc.",
      "title": "https://sanskritdocuments.org/TextsElsewhere/",
      "desc": "Has processing tools.",
      "link": "https://sanskritdocuments.org/TextsElsewhere/"
    },
    {
      "topic": "eBooks and Texts Internet Archive",
      "title": "https://archive.org/",
      "desc": "Contains audio files also.",
      "link": "https://archive.org/"
    },
    {
      "topic": "eBooks and Texts Internet Archive",
      "title": "https://archive.org/details/texts",
      "desc": "Contains audio files also.",
      "link": "https://archive.org/details/texts"
    },
    {
      "topic": "Wilbourhall (select Sanskrit) / Sansknet",
      "title": "https://www.wilbourhall.org/",
      "desc": "Collaborative work of many organizations – large repository of Indic knowledge.",
      "link": "https://www.wilbourhall.org/"
    },
    {
      "topic": "Wilbourhall (select Sanskrit) / Sansknet",
      "title": "https://www.wilbourhall.org/sansknet/",
      "desc": "Collaborative work of many organizations – large repository of Indic knowledge.",
      "link": "https://www.wilbourhall.org/sansknet/"
    },
    {
      "topic": "Wilbourhall (select Sanskrit) / Sansknet",
      "title": "http://nsktu.ac.in/index.php/sansknet-3/",
      "desc": "Collaborative work of many organizations – large repository of Indic knowledge.",
      "link": "http://nsktu.ac.in/index.php/sansknet-3/"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/ebooks.php",
      "desc": "Collaborative work of many organisations – large repository of Indic knowledge.",
      "link": "http://www.sanskrit.nic.in/ebooks.php"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/manuscript.php",
      "desc": "Collaborative work of many organisations – large repository of Indic knowledge.",
      "link": "http://www.sanskrit.nic.in/manuscript.php"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/ASSP/",
      "desc": "Collaborative work of many organisations – large repository of Indic knowledge.",
      "link": "http://www.sanskrit.nic.in/ASSP/"
    },
    {
      "topic": "Central Sanskrit University",
      "title": "http://www.sanskrit.nic.in/about_sanskrit.php",
      "desc": "Collaborative work of many organisations – large repository of Indic knowledge.",
      "link": "http://www.sanskrit.nic.in/about_sanskrit.php"
    },
    {
      "topic": "Bhāratīya Jñāna Saritā",
      "title": "https://bharatiya-jnana-sarita.info/",
      "desc": "A treasure trove of India's rich heritage and knowledge traditions.",
      "link": "https://bharatiya-jnana-sarita.info/"
    },
    {
      "topic": "E-bharatisampat",
      "title": "https://www.ebharatisampat.in/",
      "desc": "E-bharatisampat is an online digital library of free content textual sources in Samskrit, jointly operated by Samskrita Bharati and Samskrit Promotion Foundation. This project aims to host all forms of free Samskrit texts and translations.",
      "link": "https://www.ebharatisampat.in/"
    },
    {
      "topic": "Parāṅkuśācār Institute of Vedic Studies",
      "title": "https://parankusan.ddns.net/",
      "desc": "The comprehensive library houses 4,500+ titles including the complete collection of Late Sri. Parāṅkuśācārya's works and manuscripts, with computerized cataloguing in progress.",
      "link": "https://parankusan.ddns.net/"
    },
    {
      "topic": "Author Based Repositories",
      "title": "https://profbmahadevan.org/",
      "desc": "Prof. B. Mahadevan.",
      "link": "https://profbmahadevan.org/"
    },
    {
      "topic": "Author Based Repositories",
      "title": "https://www.bhattadri.net/",
      "desc": "Melpathūr Narāyaṇa Bhaṭṭatiri’s full works: 1. Narāyaṇīyam 2. Śrīpāda-saptati, Prabandha, Manameyodaya, etc.",
      "link": "https://www.bhattadri.net/"
    },
    {
      "topic": "Author Based Repositories",
      "title": "https://vidwannrs.in/",
      "desc": "Includes the works of Mahāmahopādhyāya Śrī Vidvān Dr. N. Ranganātha Śarma.",
      "link": "https://vidwannrs.in/"
    },
    {
      "topic": "Author Based Repositories",
      "title": "https://sriayyaval.org/",
      "desc": "Śrī Śrīdhara Veṅkaṭeśa Ayyāval.",
      "link": "https://sriayyaval.org/"
    }
  ],
  "A 4 - Magazines, Journals, Articles": [
    {
      "topic": "Master Link",
      "title": "https://sanskritdocuments.org/news/SanskritNewspapersandMagazines.html",
      "desc": "",
      "link": "https://sanskritdocuments.org/news/SanskritNewspapersandMagazines.html"
    },
    {
      "topic": "Master Link",
      "title": "https://iksindia.org/ebook.php",
      "desc": "",
      "link": "https://iksindia.org/ebook.php"
    },
    {
      "topic": "From Sanskrit University",
      "title": "http://www.sanskrit.nic.in/sanskrit_vimarsah.php",
      "desc": "",
      "link": "http://www.sanskrit.nic.in/sanskrit_vimarsah.php"
    },
    {
      "topic": "From Sanskrit University",
      "title": "http://www.sanskrit.nic.in/journals_and_periodicals.php",
      "desc": "",
      "link": "http://www.sanskrit.nic.in/journals_and_periodicals.php"
    },
    {
      "topic": "Other Links",
      "title": "http://magazines.sringeri.net",
      "desc": "",
      "link": "http://magazines.sringeri.net"
    },
    {
      "topic": "Other Links",
      "title": "https://rasana.in/",
      "desc": "",
      "link": "https://rasana.in/"
    },
    {
      "topic": "Other Links",
      "title": "https://sudharmasanskritdaily.in/",
      "desc": "",
      "link": "https://sudharmasanskritdaily.in/"
    },
    {
      "topic": "Other Links",
      "title": "http://www.sambhashanasandesha.in/",
      "desc": "",
      "link": "http://www.sambhashanasandesha.in/"
    },
    {
      "topic": "Other Links",
      "title": "https://sites.google.com/site/praachiprajnaa/antarjalapravahah-1/antarjalapatrikah",
      "desc": "",
      "link": "https://sites.google.com/site/praachiprajnaa/antarjalapravahah-1/antarjalapatrikah"
    },
    {
      "topic": "Other Links",
      "title": "https://aclanthology.org/",
      "desc": "",
      "link": "https://aclanthology.org/"
    },
    {
      "topic": "Other Links",
      "title": "https://shodhganga.inflibnet.ac.in/",
      "desc": "",
      "link": "https://shodhganga.inflibnet.ac.in/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.sanskrit.nic.in/uploads/2022_11_11_EJournals_Open_Source.pdf",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/uploads/2022_11_11_EJournals_Open_Source.pdf"
    },
    {
      "topic": "Other Links",
      "title": "https://ndl.iitkgp.ac.in/",
      "desc": "",
      "link": "https://ndl.iitkgp.ac.in/"
    },
    {
      "topic": "Other Links",
      "title": "https://svyasa.edu.in/research-publications/",
      "desc": "",
      "link": "https://svyasa.edu.in/research-publications/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.iima.ac.in/faculty-research/research-publications",
      "desc": "",
      "link": "https://www.iima.ac.in/faculty-research/research-publications"
    },
    {
      "topic": "Other Links",
      "title": "https://ideas.repec.org/s/iim/iimawp.html",
      "desc": "",
      "link": "https://ideas.repec.org/s/iim/iimawp.html"
    },
    {
      "topic": "Other Links",
      "title": "https://sanskritlinks.blogspot.com/",
      "desc": "",
      "link": "https://sanskritlinks.blogspot.com/"
    },
    {
      "topic": "Other Links",
      "title": "https://sathvishayam.wordpress.com/2018/12/10/sanskrit-links-blogspot/",
      "desc": "",
      "link": "https://sathvishayam.wordpress.com/2018/12/10/sanskrit-links-blogspot/"
    },
    {
      "topic": "Other Links",
      "title": "https://iksindia.org/",
      "desc": "",
      "link": "https://iksindia.org/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.coomaraswamyfoundation.org/other",
      "desc": "",
      "link": "https://www.coomaraswamyfoundation.org/other"
    },
    {
      "topic": "Other Links",
      "title": "https://resanskrit.com/",
      "desc": "",
      "link": "https://resanskrit.com/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.absplko.in/ajasraa/",
      "desc": "",
      "link": "https://www.absplko.in/ajasraa/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.sanskrit.nic.in/sanskrit_varta.php",
      "desc": "",
      "link": "https://www.sanskrit.nic.in/sanskrit_varta.php"
    },
    {
      "topic": "Other Links",
      "title": "https://csu-balahar.edu.in/Journals.html",
      "desc": "",
      "link": "https://csu-balahar.edu.in/Journals.html"
    },
    {
      "topic": "Other Links",
      "title": "http://www.csu-sringeri.edu.in/journals.html",
      "desc": "",
      "link": "http://www.csu-sringeri.edu.in/journals.html"
    },
    {
      "topic": "Other Links",
      "title": "https://sssu.ac.in/index.php/naac?id=220",
      "desc": "",
      "link": "https://sssu.ac.in/index.php/naac?id=220"
    },
    {
      "topic": "Other Links",
      "title": "https://gandivam.in/index.php",
      "desc": "",
      "link": "https://gandivam.in/index.php"
    },
    {
      "topic": "Other Links",
      "title": "https://haryanaakademi.ac.in/Sanskrit_Academy/magazine",
      "desc": "",
      "link": "https://haryanaakademi.ac.in/Sanskrit_Academy/magazine"
    },
    {
      "topic": "Other Links",
      "title": "https://www.anantaajournal.com/archives/",
      "desc": "",
      "link": "https://www.anantaajournal.com/archives/"
    },
    {
      "topic": "Other Links",
      "title": "https://sanskrit.today/विश्वस्य-वृत्तान्तः/",
      "desc": "",
      "link": "https://sanskrit.today/%E0%A4%B5%E0%A4%BF%E0%A4%B6%E0%A5%8D%E0%A4%B5%E0%A4%B8%E0%A5%8D%E0%A4%AF-%E0%A4%B5%E0%A5%83%E0%A4%A4%E0%A5%8D%E0%A4%A4%E0%A4%BE%E0%A4%A8%E0%A5%8D%E0%A4%A4%E0%A4%83/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.slbsrsv.ac.in/academic/lms/e-research-journal",
      "desc": "",
      "link": "https://www.slbsrsv.ac.in/academic/lms/e-research-journal"
    },
    {
      "topic": "Other Links",
      "title": "https://www.bhu.ac.in/site/UnitHomeTemplate/1_3382_6694",
      "desc": "",
      "link": "https://www.bhu.ac.in/site/UnitHomeTemplate/1_3382_6694"
    },
    {
      "topic": "Other Links",
      "title": "https://ssus.ac.in/research_publications/journals/prathyabhijna",
      "desc": "",
      "link": "https://ssus.ac.in/research_publications/journals/prathyabhijna"
    },
    {
      "topic": "Other Links",
      "title": "https://sanskritacademy.delhi.gov.in/hi/e-magazine",
      "desc": "",
      "link": "https://sanskritacademy.delhi.gov.in/hi/e-magazine"
    },
    {
      "topic": "Other Links",
      "title": "https://www.bhu.ac.in/Site/Page/0_93_578_5056_",
      "desc": "",
      "link": "https://www.bhu.ac.in/Site/Page/0_93_578_5056_"
    },
    {
      "topic": "Other Links",
      "title": "https://kksushodhasamhita.org/index.php/sdsa",
      "desc": "",
      "link": "https://kksushodhasamhita.org/index.php/sdsa"
    },
    {
      "topic": "Other Links",
      "title": "https://pracyajournal.com/",
      "desc": "",
      "link": "https://pracyajournal.com/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.bhu.ac.in/site/Page/1_3239_4515_6886_3489_Vedic-Vigyan-Kendra-Research-Journal",
      "desc": "",
      "link": "https://www.bhu.ac.in/site/Page/1_3239_4515_6886_3489_Vedic-Vigyan-Kendra-Research-Journal"
    },
    {
      "topic": "Other Links",
      "title": "https://sites.google.com/site/praachiprajnaa",
      "desc": "",
      "link": "https://sites.google.com/site/praachiprajnaa"
    },
    {
      "topic": "Other Links",
      "title": "https://journals.smsvaranasi.com/index.php/",
      "desc": "",
      "link": "https://journals.smsvaranasi.com/index.php/"
    },
    {
      "topic": "Other Links",
      "title": "https://insaindia.res.in/indian-journal-of-history-of-science/",
      "desc": "",
      "link": "https://insaindia.res.in/indian-journal-of-history-of-science/"
    },
    {
      "topic": "Other Links",
      "title": "https://bharatiya-jnana-sarita.info/library",
      "desc": "",
      "link": "https://bharatiya-jnana-sarita.info/library"
    },
    {
      "topic": "Other Links",
      "title": "https://libgen.li/",
      "desc": "",
      "link": "https://libgen.li/"
    },
    {
      "topic": "Other Links",
      "title": "https://chinfo.org/product-category/books/research-journal/",
      "desc": "",
      "link": "https://chinfo.org/product-category/books/research-journal/"
    },
    {
      "topic": "Other Links",
      "title": "https://chitrapurmath.net/site/activities-girvanaprathistha-patrika",
      "desc": "",
      "link": "https://chitrapurmath.net/site/activities-girvanaprathistha-patrika"
    },
    {
      "topic": "Other Links",
      "title": "https://book.swadharmaa.com/read/69a07fd798f790f039e6e3f3",
      "desc": "",
      "link": "https://book.swadharmaa.com/read/69a07fd798f790f039e6e3f3"
    },
    {
      "topic": "Other Links",
      "title": "https://hariprasadvarma.substack.com/",
      "desc": "",
      "link": "https://hariprasadvarma.substack.com/"
    },
    {
      "topic": "Other Links",
      "title": "https://www.esamskriti.com/default.aspx",
      "desc": "",
      "link": "https://www.esamskriti.com/default.aspx"
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

  if (APPROVED_A_CATEGORIES.length !== 4) {
    errors.push(`Expected exactly 4 A-series categories, found ${APPROVED_A_CATEGORIES.length}.`);
  }

  let total = 0;
  for (const cat of APPROVED_A_CATEGORIES) {
    const rows = APPROVED_A_ROWS[cat];
    const expected = EXPECTED_A_ROW_COUNTS[cat];
    if (!Array.isArray(rows)) {
      errors.push(`Category "${cat}" has no row array in APPROVED_A_ROWS.`);
      continue;
    }
    if (rows.length !== expected) {
      errors.push(`Category "${cat}": expected ${expected} rows, found ${rows.length}.`);
    }
    for (const r of rows) {
      if (typeof r.title !== 'string' || !r.title) errors.push(`Category "${cat}" has a row with a missing/empty title.`);
      if (typeof r.topic !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string topic.`);
      if (typeof r.desc !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string desc.`);
      if (typeof r.link !== 'string' || !r.link) errors.push(`Category "${cat}" row "${r.title}" has a missing/empty link.`);
    }
    total += rows.length;
  }

  if (total !== EXPECTED_A_TOTAL_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_A_TOTAL_ROWS} total A-series rows, found ${total}.`);
  }

  if (WHERE_IKS_SERIES.length !== 3) {
    errors.push(`Expected exactly 3 series in WHERE_IKS_SERIES, found ${WHERE_IKS_SERIES.length}.`);
  }
  if (ALL_29_CATEGORIES_IN_ORDER.length !== 29) {
    errors.push(`Expected exactly 29 categories in the canonical order list, found ${ALL_29_CATEGORIES_IN_ORDER.length}.`);
  }
  for (const cat of APPROVED_A_CATEGORIES) {
    if (!ALL_29_CATEGORIES_IN_ORDER.includes(cat)) errors.push(`A-series category "${cat}" is not present in the canonical 29-category order list.`);
  }

  return { errors, total };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Where-IKS A-series migration (Batch C, Stage C-A) -- mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: data.WHERE_IKS_SERIES (full, static), data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (A-series keys only, additive) on pages/media + media.');
  console.log('Source: 29 separate tablepress_table WXR posts (NOT the Where-IKS page\'s own content:encoded) -- see Backend/scripts/wordpress/reports/where-iks-manifest.json.');
  console.log('Does NOT touch Where-Sanskrit (RESOURCE_CATEGORIES/RESOURCE_ROWS), What-Sanskrit (WHAT_SANSKRIT_CATEGORIES/WHAT_SANSKRIT_ROWS), or any B/C-series Where-IKS data.');
  console.log('='.repeat(72));

  // --- Manifest self-validation (before touching the database at all) ----
  const { errors: manifestErrors, total } = validateManifest();
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT -- no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 4 A-series categories, ${total} total rows (expected ${EXPECTED_A_TOTAL_ROWS}), 3 series / 29 categories in the full taxonomy description.`);
  for (const [cat, expected] of Object.entries(EXPECTED_A_ROW_COUNTS)) {
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
    // For each type independently: WHERE_IKS_SERIES must be absent (fresh)
    // or already exactly the approved value (any other value is unexpected
    // -- abort). WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS may be: absent (fresh,
    // first series script ever run), OR already contain the A-series keys
    // matching the approved data exactly (safe re-run / no-op for the
    // A-series portion, REGARDLESS of whether B/C-series keys are also
    // already present from a later script run first -- this is the
    // additive-merge contract), OR contain OTHER categories only (a B or C
    // series script already ran, A-series not yet) -- in which case this
    // run adds the A-series keys alongside them. Any category claiming to
    // be "A-series" but not matching the approved data exactly aborts.
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

      let aAlreadyMigrated = true;
      for (const cat of APPROVED_A_CATEGORIES) {
        if (!currentCategories.includes(cat) || !deepEqual(currentRows[cat], APPROVED_A_ROWS[cat])) {
          aAlreadyMigrated = false;
          break;
        }
      }
      // If any A-series category is PRESENT but doesn't match approved data
      // exactly, that's an unexpected partial state -- abort rather than guess.
      for (const cat of APPROVED_A_CATEGORIES) {
        if (currentCategories.includes(cat) && !deepEqual(currentRows[cat], APPROVED_A_ROWS[cat]) && !aAlreadyMigrated) {
          // only flag if truly mismatched (not just "not yet present")
        }
        if (currentRows[cat] !== undefined && !deepEqual(currentRows[cat], APPROVED_A_ROWS[cat])) {
          errors.push(`Content "${type}"'s data.WHERE_IKS_ROWS["${cat}"] already exists but does not match the approved A-series data -- unexpected state, aborting rather than overwriting unknown existing content.`);
        }
      }

      plan[type] = { currentCategories, currentRows, aAlreadyMigrated };
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (WHERE_IKS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT -- no writes were made.');
      process.exitCode = 1;
      return;
    }

    const allAlreadyMigrated = MEDIA_CONTENT_TYPES.every((t) => plan[t].aAlreadyMigrated);
    const anyAlreadyMigrated = MEDIA_CONTENT_TYPES.some((t) => plan[t].aAlreadyMigrated);
    if (anyAlreadyMigrated && !allAlreadyMigrated) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other for the A-series portion -- this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    if (allAlreadyMigrated) {
      console.log('\n[OK] Both Content documents already show the approved A-series data (within whatever broader WHERE_IKS state currently exists) -- nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed: A-series data is not yet present (or absent entirely) on both documents; any existing B/C-series or other WHERE_IKS_SERIES data (if present) is valid and will be preserved.');

    // --- Compute the full next value for each type, additively -------------
    const nextState = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      const { currentCategories, currentRows } = plan[type];
      const mergedCategories = sortByCanonicalOrder([...new Set([...currentCategories, ...APPROVED_A_CATEGORIES])]);
      const mergedRows = { ...currentRows, ...APPROVED_A_ROWS };
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
    }
    console.log('[OK] Confirmed (pre-write): every other data key, including Where-Sanskrit\'s and What-Sanskrit\'s, is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Set data.WHERE_IKS_SERIES (3 series / 29 categories, full taxonomy) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log(`Add/merge 4 A-series categories into data.WHERE_IKS_CATEGORIES and data.WHERE_IKS_ROWS (${total} rows) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    for (const [cat, rows] of Object.entries(APPROVED_A_ROWS)) {
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
    const backupPath = path.join(BACKUP_DIR, `where-iks-a-series-migration-backup-${timestamp}.json`);
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
    console.log(`[COMMIT] Set data.WHERE_IKS_SERIES and merged A-series into data.WHERE_IKS_CATEGORIES/WHERE_IKS_ROWS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const seriesMatch = deepEqual(after.data.WHERE_IKS_SERIES, WHERE_IKS_SERIES);
      const categoriesMatch = deepEqual(after.data.WHERE_IKS_CATEGORIES, nextState[type].categories);
      let rowsMatch = true;
      for (const cat of APPROVED_A_CATEGORIES) {
        if (!deepEqual(after.data.WHERE_IKS_ROWS[cat], APPROVED_A_ROWS[cat])) rowsMatch = false;
      }
      console.log(`[verify] "${type}" WHERE_IKS_SERIES matches exactly: ${seriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" WHERE_IKS_CATEGORIES matches the computed next state exactly: ${categoriesMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" all 4 A-series WHERE_IKS_ROWS entries match the approved data exactly: ${rowsMatch ? 'YES' : 'NO'}`);
      if (!seriesMatch || !categoriesMatch || !rowsMatch) ok = false;

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
