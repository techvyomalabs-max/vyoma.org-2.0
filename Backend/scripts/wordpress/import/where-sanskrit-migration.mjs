// WordPress -> MERN migration: Where Sanskrit (Batch A of the Where-IKS /
// What-Sanskrit / Where-Sanskrit audit).
//
// Scope (per the approved batch):
//   - Touches ONLY data.RESOURCE_CATEGORIES and data.RESOURCE_ROWS on the
//     dual Content documents {type: 'pages/media'} and {type: 'media'}
//     (same dual-type-sync pattern already proven by Newsletter/Gallery/
//     Events).
//   - Replaces the currently-fabricated placeholder data (every row's
//     `link` is literally "#", every title/desc is invented, confirmed
//     directly in MongoDB and flagged in the migration decision register)
//     with the real content extracted from the live WordPress page
//     https://vyoma.org/where-sanskrit/ (post_id 202), cross-checked
//     against its WXR export (Divi `dipl_tabs` shortcode + two embedded
//     TablePress tables, ids 6 and 7) with 100% parity confirmed between
//     the two sources — no drift.
//   - Category count/order is unchanged (8 categories, same names, same
//     order as the current fabricated data) — this migration replaces the
//     ROW data only, not the category scaffold, since the scaffold already
//     matches the live page's own 8 section headings exactly, including
//     "Blogs" as its own distinct category (confirmed from the live page's
//     own tab structure, not folded into Magazines & Journals).
//   - Does NOT invent a title, description, or URL for anything. Where the
//     live page has no description column, `desc` is an empty string, not
//     a fabricated one. Where a numbered row's single "Link" cell contains
//     more than one URL (e.g. a primary resource plus 2-3 related links),
//     the primary URL is used as `link` and every other URL is preserved
//     verbatim (label + URL) inside `desc` — never silently dropped, never
//     split into fabricated extra rows with invented titles.
//   - Two live-page display-text/href mismatches are preserved verbatim,
//     not silently corrected: the "Central Sanskrit University" eLearning
//     entry's two differently-labelled links both resolve to the same
//     href; "www.sanskritfromhome.org"'s displayed text does not match its
//     actual href (sanskritfromhome.in) — the real href is used as `link`
//     in both cases (since that's what a click actually goes to), with the
//     mismatch noted in `desc`.
//   - Link health was checked for every one of the 129 extracted URLs
//     (103 primary `link` values + 26 secondary URLs embedded in `desc`
//     text). Per the explicit business rule for this batch, NO url is
//     excluded, replaced, or "fixed" based on its health — dead/blocked/
//     unknown links are migrated exactly as published, same as every
//     other "reproduce what's live" migration in this project (see D18's
//     2017-18 audit-report link bug for precedent). Summary, for the
//     content owner's awareness only (not acted on by this script):
//       - Dead (404 / DNS failure / connection refused), primary link on
//         9 rows: C05, D12, E05, E10, E13, R10, R12, R28, B02.
//       - Blocked (403, likely bot-blocking not genuine absence), primary
//         link on 2 rows: T01, T13.
//       - Unknown (ambiguous — TLS/5xx, needs a human/browser check), 2
//         rows: D13, R14.
//       - 4 further rows have a healthy primary link but at least one
//         unhealthy secondary URL inside `desc`: R09, R31, R34, D07.
//       - The remaining 90 rows' primary links are confirmed live (200).
//   - Does NOT touch Events, Newsletter, Testimonials, Press, Gallery,
//     Credibility, SEO, or any other data key — verified unchanged both
//     before writing (baseline read) and after (deep-equal against a
//     pre-write backup).
//   - Does NOT touch Where-IKS or What-Sanskrit — those are separate,
//     larger batches (Where-IKS additionally has no usable WXR source at
//     all, per the audit; What-Sanskrit needs a new route, not this one).
//   - Does NOT add an admin CMS form for Resources — none exists today for
//     this content (confirmed: no `Frontend/app/admin/content/media*`
//     page references RESOURCE_CATEGORIES/RESOURCE_ROWS). Out of scope for
//     this data-only migration; flagged separately for a future batch.
//
// Source of truth: a full live-page + WXR cross-checked extraction
// performed for this batch (title/desc/link per row, verified against both
// the raw Divi/TablePress shortcode markup and a fresh live fetch). Nothing
// here was invented.
//
// Modes:
//   node where-sanskrit-migration.mjs            -> dry-run (default)
//   node where-sanskrit-migration.mjs --commit   -> performs the real write,
//                                                    only after validation
//                                                    passes, after writing a
//                                                    pre-change backup

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDb, disconnectDb } from '../../../src/config/db.js';
import { ContentModel } from '../../../src/modules/content/content.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../reports');

const MEDIA_CONTENT_TYPES = ['pages/media', 'media'];

// ---------------------------------------------------------------------------
// The 8 categories, in the live page's own order. Identical names/order to
// the current fabricated data, so this migration replaces row content only.
// ---------------------------------------------------------------------------
const APPROVED_RESOURCE_CATEGORIES = [
  'Repositories of Sanskrit Texts',
  'Video Based Learning',
  'Magazines & Journals',
  'Blogs',
  'Dictionaries',
  'Computational Tools',
  'Tools for Typing, OCR, Fonts',
  'eLearning',
];

function row(title, desc, link) {
  return { title, desc, link };
}

const APPROVED_RESOURCE_ROWS = {
  'Repositories of Sanskrit Texts': [
    row('Portal to Sanskrit Resources', 'Has more than 100 links from on various headings – updated as of 17th March 2021', 'https://sanskrit.inria.fr/portal.html'),
    row('Sanskrit Library', 'A vast collection of texts in IAST format, accurately proofread and tagged', 'https://www.sanskritlibrary.org/textsList.html'),
    row('eBooks and Texts Internet Archive', 'Scanned versions of most printed books available as PDF. Audio books and Manuscript images are also available. Also see: archive.org - texts (https://archive.org/details/texts)', 'https://archive.org/'),
    row('Sanskrit Documents', 'Wide collection of texts available in multiple scripts. Links to many learning & dictionary resources, processing tools are also available. Also see Link-2 (https://sanskritdocuments.org/sites/) and Link-3 (https://sanskritdocuments.org/TextsElsewhere/)', 'https://sanskritdocuments.org/'),
    row('Register of Electronic Texts in Indian Languages', 'Machine-readable texts in Indian Languages. Cumulative download and individual download available', 'http://gretil.sub.uni-goettingen.de/gretil.html'),
    row('Repository of rawetexts', 'Vedas, puranas, grammar and other texts, raw form.', 'https://github.com/sanskrit/raw_etexts'),
    row('Dharma Wiki', 'Authentic curated dharmic content on Indic knowledge. Collection of articles related to Veda, Vedanta, Dharma, Sastras, Yajnas, temples, etc.', 'https://dharmawiki.org/index.php/Main_Page'),
    row('Sanskrit Wikis', 'Wikipedia articles, source texts and dictionaries in Sanskrit. Also see: wikisource (https://sa.wikisource.org/wiki/मुख्यपृष्ठम्), wikibooks (https://sa.wikibooks.org/wiki/मुख्यपृष्ठम्), wiktionary (https://sa.wiktionary.org/wiki/मुख्यपृष्ठम्)', 'https://sa.wikipedia.org/wiki/मुख्यपृष्ठम्'),
    row('Gita Supersite - IITK', 'Initially built for Bhagavadgita, now contains Ramayana, Shankara granthas and upanishads - original texts with multiple commentaries. Also see: valmiki (https://www.valmiki.iitk.ac.in/), sankara (https://www.sankara.iitk.ac.in/), upanishads (https://www.upanishads.iitk.ac.in/)', 'https://www.gitasupersite.iitk.ac.in/'),
    row('Vedic Heritage', 'One of largest repositories of audio, video and text for Vedas, Vedangas.', 'http://vedicheritage.gov.in/'),
    row('Sanskritweb', 'Fonts, Vedic texts with svara, dictionaries, Other topics', 'http://sanskritweb.net/'),
    row('Sanskrit E-Books', 'Large repository of downloadable e-books in Sanskrit', 'http://www.sanskritebooks.org/'),
    row('Sanskritworld', 'To make the scriptures available in Devanagari Unicode format which is easy to search.', 'https://www.sanskritworld.in/'),
    row('SARIT (Search & Retrieval of Indic texts)', '60 documents in XML', 'https://sarit.indology.info/'),
    row('Muktabodha Digital Library', 'Searchable texts, Paper Transcripts of the IFP,', 'https://muktabodha.org/digital-library/'),
    row('Wilbourhall (select Sanskrit) / Sansknet', 'Collaborative work of many organisations – large repository of Indic knowledge. Also see: wilbourhall - sansknet (https://www.wilbourhall.org/sansknet/), nsktu (http://nsktu.ac.in/index.php/sansknet-3/)', 'https://www.wilbourhall.org/'),
    row('Veda documents', 'Multilingual Vedic texts', 'http://vedavms.in/'),
    row('Sringeri-Advaita Sharada', 'Searchable Prasthanatrayam, prakaranagrantha, and others', 'https://advaitasharada.sringeri.net/'),
    row('Yoga Vaisharadi', 'Texts with commentaries on Yoga philosophy', 'https://kymyogavaisharadi.org/'),
    row('Upanishads', 'VMLT, SAFIC initiative – Major & Minor Upanishads', 'https://upanishads.org.in/'),
    row('Jain literature', 'ancient and contemporary Jain literature', 'https://jainelibrary.org/'),
    row('Central Sanskrit University', 'Collaborative work of many organisations – large repository of Indic knowledge. Also see: Manuscripts (http://www.sanskrit.nic.in/manuscript.php), ASSP (http://www.sanskrit.nic.in/ASSP/index.html), About Sanskrit (http://www.sanskrit.nic.in/about_sanskrit.php)', 'http://www.sanskrit.nic.in/ebooks.php'),
    row('Books - Google', 'Can search within the book, kindle or physical purchase', 'https://books.google.com/'),
    row('Master wiki of stotras', "Stotras, ashtottaras, sahasranamas, etc. Also see: sanskrit.safire.com (https://sanskrit.safire.com/Sanskrit.html)", 'http://stotrasamhita.net/wiki/Main_Page'),
    row('Multi-collection', "collaborative platform on 'Sanskrit & Indology' studies. Also see: Sanskrit-indology-directory (http://sanskrit.samskrutam.com/en.sanskrit-indology-directory.ashx)", 'http://sanskrit.samskrutam.com/en.MainPage.ashx'),
    row('Ashtadhyayi', 'Comprehensive resource for searchable hyperlinked texts on Vyakarana shastra', 'https://ashtadhyayi.com/'),
    row('Maharshi Vedic science', 'Pdf files for vidyasthaanas. Also see: Peterffreund (https://www.peterffreund.com/)', 'https://vedicreserve.miu.edu/'),
    row('BORI library', 'Subscription Model for full access', 'https://borilib.com/repository/search/searchHome'),
    row('Sanskrit at the University of Texas at Austin', 'Collection of Dharmashastra texts in English transliteration', 'http://sites.utexas.edu/sanskrit/resources/dharmasastra/'),
    row('Bhagavadgita search', 'Search word', 'http://bhagavadgita.org.in/search'),
    row('Vaishnava philosophy', 'Few links on Vaishnavism. Also see: Srivaishnava Granthams (https://srivaishnavagranthams.wordpress.com/e-books/), sadagopan.org (https://sadagopan.org/QuickSearch)', 'http://acharya.org/bk/index.php'),
    row('Ved Puran', 'Audio files in Hindi', 'http://www.vedpuran.com/#'),
    row('Vande Mataram Library', 'Searchable collection of texts', 'https://vmlt.in/books'),
    row('Itihasa Purana - Ramayaynam', 'Ramayana with peetika, padaccheda, anvaya. Also see: Raghuvamsha, Gitagovindam, Krishnakarnamritam, etc. (https://www.valmikiramayan.net/giirvaani/default.htm); includes Audio, lectures in Tamil. (https://valmikiramayanam.in/)', 'https://www.valmikiramayan.net/'),
  ],
  'Video Based Learning': [
    row('Vyoma Samskrita Patashala – Youtube channel', '', 'https://www.youtube.com/c/LearnSanskritOnlinevyomasamskrtapathasala'),
    row('The Sanskrit Channel', '', 'https://www.youtube.com/c/TheSanskritChannel'),
    row('Indic Academy', '', 'https://www.youtube.com/c/IndicAcademy'),
    row('Advaita Academy', '', 'https://www.youtube.com/c/AdvaitaAcademy'),
    row('Indica Yoga', '', 'https://www.youtube.com/c/IndicaYoga'),
    row('Chinmaya Vishwavidyapeeth, especially OLA series', '', 'https://www.youtube.com/c/ChinmayaUniversity'),
    row('Shaale.com – free and paid lessons in Traditional arts & literature', '', 'https://www.youtube.com/user/shaaledotcom'),
    row('Vaidic Gurukulam वैदिक गुरुकुलम्', '', 'https://www.youtube.com/c/VaidicGurukulam'),
  ],
  'Magazines & Journals': [
    row('Master link', '', 'https://sanskritdocuments.org/news/SanskritNewspapersandMagazines.html'),
    row('From Sanskrit University', 'Also see: http://www.sanskrit.nic.in/journals_and_periodicals.php', 'http://www.sanskrit.nic.in/sanskrit_vimarsah.php'),
    row('https://rasana.in/', '', 'https://rasana.in/'),
    row('https://sudharmasanskritdaily.in/', '', 'https://sudharmasanskritdaily.in/'),
    row('http://www.sambhashanasandesha.in/', '', 'http://www.sambhashanasandesha.in/'),
    row('https://sites.google.com/site/praachiprajnaa/antarjalapravahah-1/antarjalapatrikah', '', 'https://sites.google.com/site/praachiprajnaa/antarjalapravahah-1/antarjalapatrikah'),
  ],
  Blogs: [
    row('https://sanskritlinks.blogspot.com/', '', 'https://sanskritlinks.blogspot.com/'),
    row('https://sathvishayam.wordpress.com/2018/12/10/sanskrit-links-blogspot/', '', 'https://sathvishayam.wordpress.com/2018/12/10/sanskrit-links-blogspot/'),
  ],
  Dictionaries: [
    row('Koshadarshanam – unique course on available dictionaries for Sanskrit and how to use them to get the maximum benefit', '', 'https://www.sanskritfromhome.in/course/koshadarshanam/'),
    row('https://kosha.sanskrit.today/', '', 'https://kosha.sanskrit.today/'),
    row('https://ashtadhyayi.com/kosha/', '', 'https://ashtadhyayi.com/kosha/'),
    row('Cologne Digital Sanskrit Dictionaries (36)', '', 'https://www.sanskrit-lexicon.uni-koeln.de/'),
    row('Git Hub – Lexicons, Stardict, colordict, etc. Mobile Usage. Sanskrit koshas (74 koshas bare text)', '', 'https://github.com/sanskrit-kosha/kosha'),
    row('Sanskrit koshas (74 koshas in searchable format)', '', 'https://www.sanskritworld.in/sanskrittool/kosha-search/kosha.html'),
    row('Mobile Apps – Shabdakalpadruma, Vachaspatyam', 'Also see Vachaspatyam: https://play.google.com/store/apps/details?id=com.srujanjha.vachaspatyam&hl=en_IN&gl=US', 'https://play.google.com/store/apps/details?id=org.shrutijha.sanskrit_sanskrit&hl=en_IN&gl=US&pli=1'),
    row('Digital Dictionaries of South Asia (i.e. India)', '', 'https://dsal.uchicago.edu/dictionaries/'),
    row('Apte', '', 'https://dsal.uchicago.edu/dictionaries/apte/'),
    row('संस्कृतकोशसमुच्चयः – Andhra Bharati Team', '', 'http://www.andhrabharati.com/dictionary/sanskrit/index.php'),
    row('http://amara.aupasana.com/ (searchable amara)', '', 'http://amara.aupasana.com/'),
    row('sandic (earlier: sourceforge)', 'Earlier hosted at: http://sourceforge.net/projects/sandic/', 'https://github.com/novikovag/sandic'),
    row('Spokensanskrit.org – now learnsanskrit.cc', 'Also see: http://learnsanskrit.cc', 'https://spokensanskrit.org/'),
  ],
  'Computational Tools': [
    row('Samādhanī', 'This website enables one to explore Ancient Sciences and Technologies. Has many tools that provide the basic knowledge of Sanskrit grammar related to word formation, Sandhi, Samāsa and Kāraka. One can access the original Sanskrit texts with some effort.', 'https://sanskrit.uohyd.ac.in/scl/'),
    row('Online Sanskrit tools', 'This tool provides conversion facility among the romanised transliteration schemes into Devanagari and also from Devanagari into various romanised transliteration schemes. This site also provides tools for analysis of Sanskrit processing: morphological analysis and generation, segmentation, sandhi splitter, and parsing.', 'http://tdil-dc.in/index.php?option=com_vertical&parentid=84&lang=en'),
    row('Saṃbhāṣā', 'The primary intent of this website is to develop various computational tools for Sanskrit and allied languages like - Mahākośa (a kośa data navigation tool), Āyussaṃkṛtam (Courseware for Āyurvedic Medical students), Tarkasaṅgrahaḥ (Ontological knowledge representation), Vāṅmayī (Create text – explore the meaning), Sāṅgaṇikapāli (Pali language tools), Prācīnanyāyaḥ (Ontological knowledge representation), Sandhi Splitting tool, Bhaṭṭikāvya-nandinī (Explore Bhattikavya with Kāraka dependency diagram), Vaijayantīkośa (Knowledge net), Nāmadhāturūpikā (Denominative verbs), Śabdakautukam (Practice noun forms), Anvayacitraṇam (tool to draw relations)', 'https://sambhasha.ksu.ac.in/CompLing/'),
    row('Lexical Database', 'This webpage has been designed to provide a lexical database for Sanskrit. It is related to source materials like - Multilingual wordnets and ontologies and their linking, resolving word and attachment ambiguities, identifying correct parts of speech, named entities and non-recursive noun phrases for Marathi and Hindi, Indian language query to English and Hindi Retrieval, automatic translation involving Marathi, Hindi and English, testing if a piece text (hypothesis) is inferable from another (text), detecting polarity-positive/negative/neutral of a given document, especially reviews, studying cognitive aspects of language processing and understanding using eye-tracking. All these are processed with help of CFILT - Computation for Indian Language Technology that primarily focuses on deep semantics and multilinguality that played a pivotal role in these activities by laying stress on semantics has led to research in the above mentioned areas.', 'https://www.cfilt.iitb.ac.in/wordnet/webswn/wn.php'),
    row('Sanskrit World', 'This website consists of a wide subject-heterogeneity in Sanskrit like: collection of e-books, research papers, online computational tools – accent generator, kosha search, sandhi generator, subanta/tiṅanta generator. Additionally it also has distinct sections like – samāsa, alaṅkāra and M.Phil theses collection from different Universities of Bhārata.', 'https://www.sanskritworld.in/index/Sanskrittool'),
    row('Sanskrit Reader', 'This network contains links to linguistic and philological databases, computational tools and resources for analysing and annotating Sanskrit texts. It is named after the software "Sanskrit Reader", an integrated program for digitizing and tagging Sanskrit texts. This program has been split into the tagging software "Sanskrit Tagger" and the OCR engines. In addition, it presents an introduction into the tradition of Bhāratīya alchemy – a witchcraft that developed in medieval forerunner of Bhāratīya Chemistry, concerned with the transmutation of matter, in particular with attempts to convert base metals into gold or find a universal elixir. One such very famous alchemists in the recent times was Cherukumilli Veṅkaṭa Lakṣmī Narasiṃha Rāo (famously known as Pāmula Narasayya) who also had marvellous miraculous powers of removing the toxicity of a snake bite without even viewing/touching the patient.', 'http://www.sanskritreader.de/'),
    row('The Sanskrit Heritage Site', 'The Sanskrit Heritage Site provides various services for the computational treatment for Sanskrit like – Dictionary Access (with morphology generator), a rich encyclopaedic content about Bhāratīya Culture and other phonological tools like parser and so on.', 'https://sanskrit.inria.fr/'),
    row('Digital Corpus of Sanskrit', 'This forum is a sandhi-spilt corpus of Sanskrit texts with morphological and lexical analysis. It has been designed for text historical research in Sanskrit linguistics and philology wherein the users can search for words and their collocations in a corpus of more than 48 lakh manually tagged words in 6 lakh plus text lines.', 'http://www.sanskrit-linguistics.org/dcs/index.php'),
  ],
  'Tools for Typing, OCR, Fonts': [
    row('SanskritCR (sanskritdictionary.com)', 'OCR links', 'https://ocr.sanskritdictionary.com/#'),
    row('i2OCR - Convert Sanskrit PDF to text', 'OCR links', 'https://www.i2ocr.com/pdf-ocr-sanskrit'),
    row('Sanscript | Learn Sanskrit Online', 'Script Conversion', 'https://www.learnsanskrit.org/tools/sanscript/'),
    row('Aksharamukha', 'Script Conversion', 'http://aksharamukha.appspot.com/converter'),
    row('Keyswap (for Diacritics / IAST)', 'Script Conversion', 'https://www.yesvedanta.com/keyswap/'),
    row('Bhasha - Bhasha Tools (google.com)', 'Typing Tools', 'https://sites.google.com/site/bhashaime/'),
    row('Baraha - Download Baraha (***Official Site***)', 'Typing Tools', 'https://baraha.com/download.php'),
    row('Pramukh - PramukhIME (free) download Windows version (freedownloadmanager.org)', 'Typing Tools', 'https://en.freedownloadmanager.org/Windows-PC/PramukhIME-FREE.html'),
    row('Azhagi - Azhagi+ (free) download Windows version (freedownloadmanager.org)', 'Typing Tools', 'https://en.freedownloadmanager.org/Windows-PC/Azhagi-FREE.html'),
    row('Aksharamala - AKSHARAMALA (free) download Windows version (freedownloadmanager.org)', 'Typing Tools', 'https://en.freedownloadmanager.org/Windows-PC/AKSHARAMALA-FREE.html'),
    row('Lexilogos - Lexilogos words and wonders of the world', 'Typing Tools', 'https://www.lexilogos.com/keyboard/index.htm'),
    row('Shobhika - Releases · Sandhi-IITBombay/Shobhika · GitHub', 'Unicode Fonts for Devanagari', 'https://github.com/Sandhi-IITBombay/Shobhika/releases'),
    row('Siddhanta - Devanagari MPDF siddhanta font download | SourceForge.net', 'Unicode Fonts for Devanagari', 'https://sourceforge.net/projects/devanagarimpdfsiddhantafont/'),
    row('Adishila - Fonts – आदिशिला (adishila.com)', 'Unicode Fonts for Devanagari', 'https://adishila.com/fonts/'),
    row('Aparajita - Aparajita Font Free Download (fontreach.com)', 'Unicode Fonts for Devanagari', 'https://www.fontreach.com/aparajita-font-free-download/'),
    row('Chandas Tools', 'Chandas Tools', 'http://sanskritmetres.appspot.com/'),
  ],
  eLearning: [
    row('Central Sanskrit University', 'Note: the page’s two links for this item (displayed text "sanskrit_language_teaching.php" and "shastra_shikshan.php") both point to the same href, http://www.sanskrit.nic.in/shastra_shikshan.php', 'http://www.sanskrit.nic.in/shastra_shikshan.php'),
    row('https://www.samskrittutorial.in/', 'Also see: https://learnsamskrit.online/', 'https://www.samskrittutorial.in/'),
    row('https://learnsanskrit.org/', '', 'https://learnsanskrit.org/'),
    row('Online courses in Centre for Indic studies', '', 'https://cisindus.org/'),
    row('Online courses - Bhishma School of Indic Studies', '', 'https://www.bhishmaindics.org/'),
    row('https://openpathshala.com/', '', 'https://openpathshala.com/'),
    row('https://learnsanskritonline.com/', '', 'https://learnsanskritonline.com/'),
    row('https://sanskrit.today/', '', 'https://sanskrit.today/'),
    row('http://www.acharya.gen.in:8080/sanskrit/lessons.php', '', 'http://www.acharya.gen.in:8080/sanskrit/lessons.php'),
    row('http://www.chinmayamission.com/what-we-do/courses/postal-e-vedanta-courses/easy-sanskrit-level-1/', '', 'http://www.chinmayamission.com/what-we-do/courses/postal-e-vedanta-courses/easy-sanskrit-level-1/'),
    row('https://www.sanskritmaitri.com/', '', 'https://www.sanskritmaitri.com/'),
    row('https://classes.multibhashi.com/courses/live-sanskrit-classes-online', '', 'https://classes.multibhashi.com/courses/live-sanskrit-classes-online'),
    row('https://www.apnacourse.com/course/sanskrit-for-beginners', '', 'https://www.apnacourse.com/course/sanskrit-for-beginners'),
    row('www.sanskritfromhome.org', 'Note: displayed link text says "www.sanskritfromhome.org" but the actual href is http://www.sanskritfromhome.in/ (.in, not .org) — preserved as published (href used as link)', 'http://www.sanskritfromhome.in/'),
    row('Vidyāsthāna-s - Repositories of Indian Knowledge Systems', '', 'https://vyoma.org/wp-content/uploads/2024/11/vidyasthanas_the-vedas.pdf'),
    row('Other Resources - Samskriti Foundation', '', 'https://samskritifoundation.org/'),
  ],
};

const EXPECTED_ROW_COUNTS = {
  'Repositories of Sanskrit Texts': 34,
  'Video Based Learning': 8,
  'Magazines & Journals': 6,
  Blogs: 2,
  Dictionaries: 13,
  'Computational Tools': 8,
  'Tools for Typing, OCR, Fonts': 16,
  eLearning: 16,
};
const EXPECTED_TOTAL_ROWS = 103;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function validateManifest() {
  const errors = [];

  if (APPROVED_RESOURCE_CATEGORIES.length !== 8) {
    errors.push(`Expected exactly 8 categories, found ${APPROVED_RESOURCE_CATEGORIES.length}.`);
  }

  let total = 0;
  for (const cat of APPROVED_RESOURCE_CATEGORIES) {
    const rows = APPROVED_RESOURCE_ROWS[cat];
    const expected = EXPECTED_ROW_COUNTS[cat];
    if (!Array.isArray(rows)) {
      errors.push(`Category "${cat}" has no row array in APPROVED_RESOURCE_ROWS.`);
      continue;
    }
    if (rows.length !== expected) {
      errors.push(`Category "${cat}": expected ${expected} rows, found ${rows.length}.`);
    }
    for (const r of rows) {
      if (typeof r.title !== 'string' || !r.title) errors.push(`Category "${cat}" has a row with a missing/empty title.`);
      if (typeof r.desc !== 'string') errors.push(`Category "${cat}" row "${r.title}" has a non-string desc.`);
      if (typeof r.link !== 'string' || !r.link) errors.push(`Category "${cat}" row "${r.title}" has a missing/empty link.`);
    }
    total += rows.length;
  }

  const extraKeys = Object.keys(APPROVED_RESOURCE_ROWS).filter((k) => !APPROVED_RESOURCE_CATEGORIES.includes(k));
  if (extraKeys.length) errors.push(`APPROVED_RESOURCE_ROWS has categories not listed in APPROVED_RESOURCE_CATEGORIES: ${extraKeys.join(', ')}`);

  if (total !== EXPECTED_TOTAL_ROWS) {
    errors.push(`Expected exactly ${EXPECTED_TOTAL_ROWS} total rows, found ${total}.`);
  }

  return { errors, total };
}

async function main() {
  const commit = process.argv.includes('--commit');

  console.log('='.repeat(72));
  console.log(`Where Sanskrit migration (Batch A) — mode: ${commit ? 'COMMIT (will write)' : 'DRY-RUN (no writes)'}`);
  console.log('Scope: ONLY data.RESOURCE_CATEGORIES and data.RESOURCE_ROWS on pages/media + media.');
  console.log('Source: live https://vyoma.org/where-sanskrit/ (post_id 202), cross-checked against its WXR export — 100% parity.');
  console.log('='.repeat(72));

  // --- Manifest self-validation (before touching the database at all) ----
  const { errors: manifestErrors, total } = validateManifest();
  if (manifestErrors.length) {
    console.error('\nVALIDATION FAILED (manifest self-check):');
    for (const e of manifestErrors) console.error(' -', e);
    console.error('\nABORT — no database connection was made.');
    process.exitCode = 1;
    return;
  }
  console.log(`[OK] Manifest self-check passed: 8 categories, ${total} total rows (expected ${EXPECTED_TOTAL_ROWS}).`);
  for (const [cat, expected] of Object.entries(EXPECTED_ROW_COUNTS)) {
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
      if (!Array.isArray(doc.data?.RESOURCE_CATEGORIES) || typeof doc.data?.RESOURCE_ROWS !== 'object' || doc.data.RESOURCE_ROWS === null) {
        errors.push(`Content "${type}" exists but data.RESOURCE_CATEGORIES/RESOURCE_ROWS are not the expected shape (array + object).`);
        continue;
      }
      if (doc.draftData != null) {
        errors.push(`Content "${type}" has a non-null draftData (an unpublished admin edit is pending) — aborting rather than risk it later overwriting this migration.`);
      }
      docs[type] = doc;
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }
    console.log('[OK] Both Content documents exist, RESOURCE_CATEGORIES/RESOURCE_ROWS have the expected shape on both, no pending draftData.');

    // --- Baseline: RESOURCE_ROWS must be either the known fabricated data
    //     (every row's link === '#', a fresh run) or already the approved
    //     real data (safe re-run / no-op). Category names must match the
    //     approved 8 in either case — this migration never touches category
    //     scaffolding, only row content.
    let anyAlreadyMigrated = false;
    let anyFreshBaseline = false;
    for (const type of MEDIA_CONTENT_TYPES) {
      const cats = docs[type].data.RESOURCE_CATEGORIES;
      if (!deepEqual(cats, APPROVED_RESOURCE_CATEGORIES)) {
        errors.push(`Content "${type}"'s data.RESOURCE_CATEGORIES does not match the expected 8 categories (names/order) — unexpected state, aborting rather than guessing. Found: ${JSON.stringify(cats)}`);
        continue;
      }
      const rowsObj = docs[type].data.RESOURCE_ROWS;
      const allRows = Object.values(rowsObj).flat();
      const allFabricated = allRows.length > 0 && allRows.every((r) => r.link === '#');
      const isApproved = deepEqual(rowsObj, APPROVED_RESOURCE_ROWS);
      if (allFabricated) {
        anyFreshBaseline = true;
      } else if (isApproved) {
        anyAlreadyMigrated = true;
      } else {
        errors.push(`Content "${type}"'s data.RESOURCE_ROWS is neither the known fabricated placeholder (all links "#") nor the approved real data — unexpected/partial state, aborting rather than guessing.`);
      }
    }
    if (errors.length) {
      console.error('\nVALIDATION FAILED (RESOURCE_ROWS baseline):');
      for (const e of errors) console.error(' -', e);
      console.error('\nABORT — no writes were made.');
      process.exitCode = 1;
      return;
    }

    if (anyAlreadyMigrated && anyFreshBaseline) {
      console.error('\nABORT: "pages/media" and "media" are out of sync with each other (one has the placeholder, the other already has the approved data) — this should be impossible; investigate before proceeding.');
      process.exitCode = 1;
      return;
    }
    if (anyAlreadyMigrated) {
      console.log('\n[OK] Both Content documents already show the approved real Where-Sanskrit data — nothing to do (safe re-run / already migrated).');
      return;
    }
    console.log('[OK] Baseline confirmed: both documents have the known fabricated placeholder data (every row\'s link is "#").');

    // --- Prove every other data key is unaffected, before writing ---------
    for (const type of MEDIA_CONTENT_TYPES) {
      const { RESOURCE_CATEGORIES: _rc, RESOURCE_ROWS: _rr, ...restBefore } = docs[type].data;
      const wouldBeAfter = { ...docs[type].data, RESOURCE_CATEGORIES: APPROVED_RESOURCE_CATEGORIES, RESOURCE_ROWS: APPROVED_RESOURCE_ROWS };
      const { RESOURCE_CATEGORIES: _rc2, RESOURCE_ROWS: _rr2, ...restAfter } = wouldBeAfter;
      if (!deepEqual(restBefore, restAfter)) {
        console.error(`\nABORT: internal check failed — some key other than RESOURCE_CATEGORIES/RESOURCE_ROWS would change on "${type}". Aborting rather than risk it.`);
        process.exitCode = 1;
        return;
      }
    }
    console.log('[OK] Confirmed (pre-write): every other data key (Events, Newsletter, Testimonials, Press, Gallery, SEO, etc.) is untouched by the planned write.');

    console.log('\n--- Intended operation ---');
    console.log(`Replace data.RESOURCE_ROWS (fabricated placeholder -> ${total} verified real rows across 8 categories) on: ${MEDIA_CONTENT_TYPES.join(', ')}`);
    console.log('data.RESOURCE_CATEGORIES is written too (identical names/order to current — re-asserted, not changed).');
    for (const [cat, rows] of Object.entries(APPROVED_RESOURCE_ROWS)) {
      console.log(`  - "${cat}": ${rows.length} rows`);
    }

    if (!commit) {
      console.log('\n--- DRY-RUN complete: no writes were made. ---');
      console.log('Re-run with --commit to perform this migration for real.');
      return;
    }

    // --- Backup: exact pre-change state of both documents' full `data` ----
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `where-sanskrit-migration-backup-${timestamp}.json`);
    const backupPayload = {};
    for (const type of MEDIA_CONTENT_TYPES) {
      backupPayload[type] = { data: docs[type].data, draftData: docs[type].draftData, status: docs[type].status };
    }
    fs.writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2) + '\n');
    console.log(`[OK] Wrote pre-change backup: ${backupPath}`);
    console.log('[REMINDER] This backup file is inside the repo (Backend/scripts/reports/) and must NOT be committed — move it outside the repo before staging anything, same as every prior migration.');

    // --- Write (targeted dot-notation $set only — never the whole `data`) -
    await ContentModel.updateMany(
      { type: { $in: MEDIA_CONTENT_TYPES } },
      { $set: { 'data.RESOURCE_CATEGORIES': APPROVED_RESOURCE_CATEGORIES, 'data.RESOURCE_ROWS': APPROVED_RESOURCE_ROWS } }
    );
    console.log(`[COMMIT] Updated data.RESOURCE_CATEGORIES and data.RESOURCE_ROWS on both: ${MEDIA_CONTENT_TYPES.join(', ')}.`);

    // --- Post-write verification -------------------------------------------
    let ok = true;
    for (const type of MEDIA_CONTENT_TYPES) {
      const after = await ContentModel.findOne({ type }).lean();
      const catsMatch = deepEqual(after.data.RESOURCE_CATEGORIES, APPROVED_RESOURCE_CATEGORIES);
      const rowsMatch = deepEqual(after.data.RESOURCE_ROWS, APPROVED_RESOURCE_ROWS);
      console.log(`[verify] "${type}" RESOURCE_CATEGORIES matches exactly: ${catsMatch ? 'YES' : 'NO'}`);
      console.log(`[verify] "${type}" RESOURCE_ROWS matches the approved data exactly: ${rowsMatch ? 'YES' : 'NO'}`);
      if (!catsMatch || !rowsMatch) ok = false;

      const { RESOURCE_CATEGORIES: _rc, RESOURCE_ROWS: _rr, ...restAfter } = after.data;
      const { RESOURCE_CATEGORIES: _rc2, RESOURCE_ROWS: _rr2, ...restBefore } = docs[type].data;
      const restSame = deepEqual(restAfter, restBefore);
      console.log(`[verify] "${type}" every other data key unchanged: ${restSame ? 'YES' : 'NO'}`);
      if (!restSame) ok = false;
    }

    if (!ok) {
      console.error('\n[WARNING] At least one verification failed — investigate before trusting this run.');
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
