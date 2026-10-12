// Reproducible extraction tool: builds the durable Where-IKS (O-MANTRI)
// source manifest from the WordPress WXR export.
//
// WHY THIS EXISTS: the Where-IKS page's resource-link content is NOT in the
// page's own WXR <content:encoded> (that only holds a Divi `dipl_tabs`
// shortcode scaffold). The real data lives in 29 separate TablePress
// `tablepress_table` WXR items (one per category), each storing its table
// as a directly JSON-parseable array of arrays. This script locates those
// 29 items by their exact WXR title, parses each table, and reconstructs
// one flat {topic, title, desc, link} row per actual resource link
// (splitting any table cell that contains more than one <a href>, and
// forward-filling a blank Topic/Name cell from the nearest preceding
// non-blank one — the same convention already used for the Where-Sanskrit
// and What-Sanskrit migrations).
//
// Run: node Backend/scripts/wordpress/extract-where-iks-manifest.mjs
// Output: Backend/scripts/wordpress/reports/where-iks-manifest.json
// This is a read-only tool — it only reads the WXR and writes the manifest
// JSON file; it never touches MongoDB.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WXR_PATH = path.resolve(__dirname, '../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml');
const OUTPUT_PATH = path.resolve(__dirname, '../reports/where-iks-manifest.json');

// The 29 canonical categories, in taxonomy order, matched by their EXACT
// WXR title string (confirmed by direct inspection — spacing/punctuation
// is inconsistent between categories in the source itself, e.g. "A1- Kośa"
// vs "A 2 - Encyclopedic...", and is preserved verbatim, not normalized).
const CATEGORY_DEFS = [
  ['A', 'A1- Kośa'],
  ['A', 'A 2 - Encyclopedic Bhāratīya Literature'],
  ['A', 'A 3 - Mother Repositories'],
  ['A', 'A 4 - Magazines, Journals, Articles'],
  ['B', 'B1 - Vedic Philosophical and Cognitive Sciences'],
  ['B', 'B2 - Historical and Civilizational Sciences'],
  ['B', 'B 3 - Contemporary Social/ Cultural Sciences'],
  ['B', 'B 4 - Mathematical, Physical and Astronomical Sciences'],
  ['B', 'B 5 - Speech and Linguistics'],
  ['B', 'B 6 - Political, Economic and Strategic sciences'],
  ['B', 'B 7 - Medical and Health Sciences'],
  ['B', 'B 8 - Culinary, Nutritional and Pharmacological Sciences'],
  ['B', 'B 9 - Agricultural Science, Veterinary and Animal Husbandry'],
  ['B', 'B 10 - Performing Arts'],
  ['B', 'B 11 - Mechanical & Digital Design & Engineering'],
  ['B', 'B 12 - Civil and Architectural Science'],
  ['B', 'B 13 - Fine Arts and Sculpture'],
  ['B', 'B 14 - Chemical, Metallurgical & Material Sciences'],
  ['B', 'B 15 - Fashion and Interior Design'],
  ['B', 'B 16 - Edutainment Sciences'],
  ['C', 'C 1 - Digitisation of Tools for Typing, OCR, Fonts'],
  ['C', 'C 2 - Computational Tools'],
  ['C', 'C 3 - AI Tools and Links'],
  ['C', 'C 4 - E Learning'],
  ['C', 'C 5 - YouTube Channel Based Learning'],
  ['C', 'C 6 - Blogs'],
  ['C', 'C 7 - Channels and Social Media'],
  ['C', 'C 8 - Tips and Tricks'],
  ['C', 'C 9 - Miscellaneous'],
];

const SERIES_META = [
  { key: 'A', label: 'A-Series: Universal' },
  { key: 'B', label: 'B-Series: Domain Specific' },
  { key: 'C', label: 'C-Series: Auxiliary Tools' },
];

// A known, confirmed-stray duplicate found in the same WXR (dated after the
// canonical table, but with far fewer rows than the live page actually
// shows) — deliberately excluded. Recorded here, not silently dropped.
const EXCLUDED_DUPLICATE = {
  title: 'Copy of A1- Kośa',
  tablePressPostId: '12375',
  reason: 'Stray/abandoned duplicate, not referenced by the live page. Its row count (9 resource links) does not match the live-rendered A1 category (35 links); the canonical table (id 11855, 35 links) does match.',
};

function stripHtml(s) {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(cellHtml) {
  const out = [];
  const re = /<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(cellHtml))) {
    out.push({ href: m[1], text: stripHtml(m[2]) });
  }
  return out;
}

function main() {
  const xml = fs.readFileSync(WXR_PATH, 'utf8');
  const items = xml.split('<item>');

  const tableByTitle = new Map();
  for (const it of items) {
    const typeMatch = it.match(/<wp:post_type><!\[CDATA\[([^\]]*)\]\]><\/wp:post_type>/);
    if (!(typeMatch && typeMatch[1] === 'tablepress_table')) continue;
    const tMatch = it.match(/<title><!\[CDATA\[([^\]]*)\]\]><\/title>/);
    const idMatch = it.match(/<wp:post_id>(\d+)<\/wp:post_id>/);
    const cMatch = it.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    if (!tMatch || !cMatch) continue;
    let table;
    try {
      table = JSON.parse(cMatch[1]);
    } catch {
      continue;
    }
    tableByTitle.set(tMatch[1], { id: idMatch[1], table });
  }

  const WHERE_IKS_CATEGORIES = [];
  const WHERE_IKS_ROWS = {};
  const manifestCategories = [];
  const missing = [];
  const urlCounts = new Map();
  let totalRows = 0;
  let totalLinkRows = 0;

  for (const [series, title] of CATEGORY_DEFS) {
    const found = tableByTitle.get(title);
    if (!found) {
      missing.push(title);
      continue;
    }
    const { id, table } = found;
    const header = table[0];
    const dataRows = table.slice(1);
    const outputRows = [];

    if (header.length === 1) {
      // Single-column tables come in two real, distinct forms on this site:
      //   (a) the column itself IS the link column (e.g. "C 6 - Blogs",
      //       header ["Resource Link"]) — extract anchors directly from it.
      //   (b) the column holds pure informational text, no links at all
      //       (the empty-category placeholder note on B11/B13/B15/B16, or
      //       C8's real "tips and tricks" paragraphs) — these are genuine
      //       page content, not resources; preserved as non-link entries
      //       (link: '') rather than silently dropped or miscounted as
      //       clickable resources.
      for (const row of dataRows) {
        const cell = row[0] || '';
        const links = extractLinks(cell);
        if (links.length > 0) {
          for (const l of links) {
            outputRows.push({ topic: '', title: l.text || l.href, desc: '', link: l.href });
            urlCounts.set(l.href, (urlCounts.get(l.href) || 0) + 1);
          }
        } else {
          // Split on <p> blocks when present (C8's multiple distinct tips);
          // otherwise the whole cell is one informational note (B11-style).
          const paragraphs = cell.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [cell];
          for (const p of paragraphs) {
            const text = stripHtml(p);
            if (text) outputRows.push({ topic: '', title: text, desc: '', link: '' });
          }
        }
      }
    } else {
      // Standard 2- or 3-column format: col0 = Topic/Name, col1 = the
      // resource-link cell (may hold more than one <a href>), col2 (if
      // present) = Description. A row only becomes a resource entry if its
      // link cell actually contains a real <a href> — rows whose "link"
      // column holds only descriptive/structural text (confirmed present
      // in "C 3 - AI Tools and Links", e.g. numbered section headers like
      // "1. AI Tools" or phase-explanation paragraphs with no link of their
      // own) are skipped entirely rather than fabricated into fake
      // non-link resource rows.
      const descColIdx = header.length >= 3 ? 2 : -1;
      let lastTopic = '';
      for (const row of dataRows) {
        const rawTopic = stripHtml(row[0] || '');
        if (rawTopic) lastTopic = rawTopic;
        const topic = rawTopic || lastTopic;
        const linkCell = row[1] || '';
        const desc = descColIdx >= 0 ? stripHtml(row[descColIdx] || '') : '';
        const links = extractLinks(linkCell);
        for (const l of links) {
          outputRows.push({ topic, title: l.text || l.href, desc, link: l.href });
          urlCounts.set(l.href, (urlCounts.get(l.href) || 0) + 1);
        }
      }
    }

    WHERE_IKS_CATEGORIES.push(title);
    WHERE_IKS_ROWS[title] = outputRows;
    totalRows += outputRows.length;
    const linkRowCount = outputRows.filter((r) => r.link).length;
    totalLinkRows += linkRowCount;
    manifestCategories.push({ series, title, tablePressPostId: id, rowCount: outputRows.length, linkRowCount, noteRowCount: outputRows.length - linkRowCount });
  }

  const duplicateUrls = [...urlCounts.entries()].filter(([, c]) => c > 1).map(([url, count]) => ({ url, count }));

  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'Backend/scripts/wordpress/extract-where-iks-manifest.mjs (re-run this script against the WXR to reproduce)',
    source: {
      wxrFile: 'Backend/.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml',
      livePageCrossCheck: 'https://vyoma.org/where-iks/ (and content-identical https://vyoma.org/where-iks-2/)',
      method:
        'Parsed every WXR <item> with wp:post_type=tablepress_table; matched the 29 canonical category titles by exact string (A1-A4, B1-B16, C1-C9); each match\'s content:encoded is a JSON array-of-arrays (header row + data rows); every <a href> found in the "Resource Link" column became one output resource row, inheriting that table row\'s Topic/Name cell (forward-filled from the nearest preceding non-blank Topic cell, same convention already used for Where-Sanskrit/What-Sanskrit) and Description cell (when the table has one — some categories only have 2 columns, no description).',
      excludedDuplicate: EXCLUDED_DUPLICATE,
    },
    totals: {
      seriesCount: 3,
      categoryCount: WHERE_IKS_CATEGORIES.length,
      totalRows: totalRows,
      totalClickableLinkRows: totalLinkRows,
      totalNonLinkInformationalRows: totalRows - totalLinkRows,
      nonLinkRowsExplanation:
        '23 rows carry no link at all, by design, not by extraction error: 4 are the literal "Note - Currently, no links are available..." placeholder text on categories B11/B13/B15/B16 (confirmed empty on the live page itself), and 19 are C8 "Tips and Tricks"\' real advice paragraphs, which the live page presents as plain text, never as clickable links.',
      uniqueUrls: urlCounts.size,
      duplicateUrlCount: duplicateUrls.length,
    },
    duplicateUrls,
    missingCategories: missing,
    categories: manifestCategories,
    WHERE_IKS_SERIES: SERIES_META.map((s) => ({
      ...s,
      categories: manifestCategories.filter((c) => c.series === s.key).map((c) => c.title),
    })),
    WHERE_IKS_CATEGORIES,
    WHERE_IKS_ROWS,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log('Wrote manifest to', OUTPUT_PATH);
  console.log('Series A/B/C category counts:', ['A', 'B', 'C'].map((s) => manifestCategories.filter((c) => c.series === s).length).join('/'));
  console.log('Total categories:', WHERE_IKS_CATEGORIES.length, '(expected 29)');
  console.log('Total clickable link rows:', totalLinkRows, '(expected 636)');
  console.log('Total non-link informational rows (placeholders/tips):', totalRows - totalLinkRows, '(expected 23: 4 placeholders + 19 tips)');
  console.log('Total rows overall:', totalRows);
  console.log('Unique URLs:', urlCounts.size, '(expected 597)');
  console.log('Duplicate URLs:', duplicateUrls.length);
  console.log('Missing categories:', missing.length ? missing : 'none');
  for (const s of ['A', 'B', 'C']) {
    const total = manifestCategories.filter((c) => c.series === s).reduce((sum, c) => sum + c.rowCount, 0);
    console.log(`  ${s}-series total: ${total}`);
  }
  for (const c of manifestCategories) {
    console.log(`    [${c.series}] ${c.title} (TablePress #${c.tablePressPostId}): ${c.rowCount} rows`);
  }
}

main();
