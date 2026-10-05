// Phase A1 — PDF migration classification (secondary inventory only).
// READ-ONLY. Re-reads the existing pdf-inventory.json (already produced by
// an earlier, separate review) and the decision register's own open items,
// and buckets each of the 104 entries into exactly one of:
//   READY / ALREADY RESOLVED
//   MANUAL REVIEW
//   DO NOT MIGRATE / INTERNAL
//   BUSINESS DECISION REQUIRED
// No PDF is promoted to READY merely because S3 will eventually exist —
// classification is based only on this file's own prior status/destination
// fields, cross-checked against the register's still-open D-items.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = path.resolve(__dirname, '../reports/pdf-inventory.json');
const OUT_PATH = path.resolve(__dirname, '../reports/pdf-migration-classification.json');

const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));

// Narrow, explainable filename-pattern rule for newsletter/activity-report
// PDFs that were left with a plain "Other/Unknown" destination (no
// parenthetical) rather than the explicit newsletter label — found via
// manual reconciliation against the decision register's own "48" figure
// (register D26), which the destination-string-only check below originally
// missed by 5 items. Each sub-pattern is a narrow, real naming convention
// actually observed in Vyoma's own newsletter/activity-report PDFs, not a
// broad keyword match:
//   - VOLUME_RE:  "Vol" + digits (e.g. "Vol04_June2018.pdf") — standard
//     newsletter volume numbering.
//   - NL_TOKEN_RE: "NL" as its own hyphen/underscore-delimited token (e.g.
//     "30-dec-NL-1.pdf") — the project's own newsletter abbreviation, not a
//     bare substring match (so e.g. "...onl..." inside an unrelated word
//     would never match).
//   - MONTH_YEAR_RE: a month abbreviation immediately followed by a 2-4
//     digit year, with a word boundary before the month (e.g.
//     "Dec-2025-3.pdf") — rejects words that merely contain a month-like
//     substring (e.g. "Rajan" does not match "jan" here, no boundary).
// Deliberately NOT broadened further — e.g. a bare year or a generic
// "report"/"pdf" keyword alone does not qualify, specifically so files like
// vidyasthanas_the-vedas.pdf (no volume/NL/month-year pattern) are never
// pulled in.
const VOLUME_RE = /^vol\d+/i;
const NL_TOKEN_RE = /(^|[-_])nl([-_]|$)/i;
const MONTH_YEAR_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-_]?\d{2,4}/i;

function looksLikeNewsletterFilename(filename) {
  return VOLUME_RE.test(filename) || NL_TOKEN_RE.test(filename) || MONTH_YEAR_RE.test(filename);
}

function classify(item) {
  if (item.status.startsWith('ALREADY WIRED')) {
    return { bucket: 'READY / ALREADY RESOLVED', group: 'already-wired', reason: 'Already wired to a live Credibility page by filename match; only needs eventual linkage through the Media model, not a migration decision.' };
  }
  const dest = item.proposedDestination || '';
  if (dest.includes('job descriptions')) {
    return { bucket: 'DO NOT MIGRATE / INTERNAL', group: 'job-description', reason: 'Confirmed internal HR use only (register D25) — correctly out of public-site scope.' };
  }
  if (dest.includes('Annual Reports')) {
    return { bucket: 'MANUAL REVIEW', group: 'annual-report', reason: 'Blocked on D22 (which of 2 per-year uploads is authoritative) and M8 (requires opening the actual PDFs to compare) — not yet resolved.' };
  }
  if (dest.includes('Social Impact')) {
    return { bucket: 'MANUAL REVIEW', group: 'social-impact', reason: 'Blocked on D23 (duplicate-pair comparison) and M9 (requires opening the actual PDFs) — not yet resolved.' };
  }
  if (dest.includes('Audit Reports')) {
    return { bucket: 'BUSINESS DECISION REQUIRED', group: 'audit-report', reason: 'Blocked on D17 (no Audit Reports CMS section exists yet — new section vs. folding into Annual Reports) and a known data-quality issue D18 (2017-18 link mismatch) to flag, not silently fix.' };
  }
  if (dest.includes('Compliances')) {
    return { bucket: 'MANUAL REVIEW', group: 'compliances', reason: 'Not yet confirmed authoritative beyond the already-wired subset; no specific business-level blocker identified beyond standard review.' };
  }
  if (dest.includes('Collaterals')) {
    return { bucket: 'MANUAL REVIEW', group: 'collaterals', reason: 'Listed as review/review (candidate) in the source inventory; no complex ambiguity flagged, but not yet confirmed — not promoted to READY.' };
  }
  if (dest.includes('newsletters/activity reports')) {
    return { bucket: 'BUSINESS DECISION REQUIRED', group: 'newsletter-activity', reason: 'Blocked on D26 — whether a public newsletter/activity-report archive is worth building at all; no CMS section exists for this content.' };
  }
  if (dest === 'Other/Unknown' && looksLikeNewsletterFilename(item.filename)) {
    return { bucket: 'BUSINESS DECISION REQUIRED', group: 'newsletter-activity', reason: 'Blocked on D26, same as the explicitly-labeled newsletter/activity-report group — filename matches the volume/NL-token/month-year newsletter naming pattern, found via manual reconciliation against the register\'s "48" figure.' };
  }
  return { bucket: 'MANUAL REVIEW', group: 'other-unresolved', reason: 'Proposed destination unresolved ("Other/Unknown") and filename does not match the newsletter naming pattern; no specific register decision found for this item.' };
}

const classified = inventory.map((item) => ({ ...item, ...classify(item) }));
const byBucket = {};
const byGroup = {};
for (const c of classified) {
  byBucket[c.bucket] = (byBucket[c.bucket] || 0) + 1;
  byGroup[c.group] = (byGroup[c.group] || 0) + 1;
}

console.log('='.repeat(78));
console.log('PDF migration classification — READ-ONLY (secondary inventory)');
console.log('='.repeat(78));
console.log('Total PDFs:', inventory.length);
console.log('By bucket:', JSON.stringify(byBucket, null, 2));
console.log('By group:', JSON.stringify(byGroup, null, 2));

fs.writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), total: inventory.length, byBucket, byGroup, items: classified }, null, 2));
console.log(`\n[OK] Wrote ${OUT_PATH}`);
console.log('\nThis was a read-only classification pass. No PDF was downloaded, no file was moved, no decision register entry was changed.');
