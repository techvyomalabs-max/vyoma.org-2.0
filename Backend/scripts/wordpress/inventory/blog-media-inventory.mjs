// Phase A1 — WordPress public blog-media dry-run inventory.
//
// READ-ONLY. Does not download any file, does not call S3, does not write
// to MongoDB, does not modify BlogPost/Content documents, does not create
// Media records. There is no --commit mode in this script at all — it is
// a pure inventory/planning tool, by design (a commit mode is explicitly
// out of scope for this phase and would need separate approval).
//
// Scope: the WordPress-hosted <img> URLs still referenced inline in the 19
// already-migrated BlogPost documents' `data.body` (confirmed by
// blog-parity-audit.mjs as "MEDIA PENDING" — 11 of 19 posts, 42 unique
// URLs). This script re-derives that same 42-URL set independently (same
// extraction logic as blog-parity-audit.mjs, applied to the live Mongo
// documents) and cross-references each URL against the WXR's own
// <wp:attachment_url> records to answer: does a real WordPress attachment
// exist for this URL, and under what attachment ID.
//
// Output: Backend/scripts/wordpress/reports/blog-media-inventory.json
// (machine-readable) plus a console summary.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WXR_PATH = path.resolve(__dirname, '../../../.migration-data/vyomalinguisticlabsfoundation.WordPress.2026-09-29.xml');
const MONGO_URI = 'mongodb://127.0.0.1:27017/vyoma_migration_dryrun';
const OUT_PATH = path.resolve(__dirname, '../reports/blog-media-inventory.json');

// --- Media model's own MIME allowlist (Backend/src/modules/media/media.admin.controller.js)
// mirrored here read-only, for the "expected media kind" / UNSUPPORTED check — not imported
// directly since this script must not depend on, or risk touching, the live module.
const SUPPORTED_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']);

function clean(s) { return s == null ? null : s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim(); }
function tag(name, block) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : null;
}

// Normalizes a WordPress media URL for matching purposes only (scheme and
// host variations observed in this export: http vs https, vyoma.org vs the
// raw origin IP seen in some <guid> values) — never used as the actual
// migrated URL or storage key, purely a comparison key.
function normalizeForMatch(url) {
  return url
    .replace(/^https?:\/\/[^/]+/i, '')
    .toLowerCase();
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// --- Deterministic storage key proposal (design, see report §F/§G) -------
// Sanitizes the filename stem (lowercase, ASCII-safe, no path traversal),
// keeps the extension, and appends a short hash of the NORMALIZED SOURCE
// URL (not file content — no download happens in this phase) purely to
// guarantee collision-safety if two different WordPress paths happen to
// share a filename. This is a planning-time key; the real migration tool
// would additionally content-hash the downloaded bytes at fetch time (see
// report §G) and could choose to keep or replace this URL-based key once
// that's available.
function proposeStorageKey(sourceUrl, filename) {
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [, 'bin'])[1].toLowerCase();
  const stem = filename
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'file';
  const urlHash = sha256(normalizeForMatch(sourceUrl)).slice(0, 8);
  return `media/blog/${stem}-${urlHash}.${ext}`;
}

async function main() {
  console.log('='.repeat(78));
  console.log('Blog media dry-run inventory — READ-ONLY, no writes, no downloads, no S3 calls');
  console.log('='.repeat(78));

  // ---- 1. Extract the 42-URL set from the live, migrated BlogPost docs ----
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const posts = await db.collection('blogposts').find({}).project({ slug: 1, 'data.body': 1 }).toArray();
  console.log(`[OK] Read ${posts.length} migrated BlogPost documents (expect 19).`);

  const urlToSlugs = new Map(); // normalized url -> { rawUrl, slugs: Set, count }
  for (const post of posts) {
    const body = post.data?.body || '';
    const imgs = [...body.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]);
    for (const url of imgs) {
      if (!/vyoma\.org\/wp-content\/uploads/i.test(url)) continue;
      const key = normalizeForMatch(url);
      if (!urlToSlugs.has(key)) urlToSlugs.set(key, { rawUrl: url, slugs: new Set(), count: 0 });
      const entry = urlToSlugs.get(key);
      entry.slugs.add(post.slug);
      entry.count++;
    }
  }
  console.log(`[OK] Found ${urlToSlugs.size} unique WordPress-hosted image URL(s) across the migrated posts (expect 42).`);

  // ---- 2. Parse WXR attachments ----
  const xml = fs.readFileSync(WXR_PATH, 'utf8');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const attachments = items
    .filter((b) => tag('wp:post_type', b) === 'attachment')
    .map((b) => ({
      postId: tag('wp:post_id', b),
      url: tag('wp:attachment_url', b),
      title: tag('title', b),
      parent: tag('wp:post_parent', b),
    }))
    .filter((a) => a.url);
  console.log(`[OK] Parsed ${attachments.length} WXR attachment record(s).`);

  const attachmentsByNormUrl = new Map();
  for (const a of attachments) {
    const key = normalizeForMatch(a.url);
    if (!attachmentsByNormUrl.has(key)) attachmentsByNormUrl.set(key, []);
    attachmentsByNormUrl.get(key).push(a);
  }

  // ---- 3. Build per-URL inventory rows ----
  const filenameGroups = new Map(); // filename (lowercased) -> [normUrl,...] — duplicate-candidate detection
  const rows = [];
  for (const [normUrl, entry] of urlToSlugs) {
    const filename = decodeURIComponent(normUrl.split('/').pop() || 'unknown');
    const ext = (filename.match(/\.([a-z0-9]+)$/i) || [, null])[1]?.toLowerCase() || null;
    const kind = ext && SUPPORTED_IMAGE_EXT.has(ext) ? 'image' : 'unsupported';

    const matches = attachmentsByNormUrl.get(normUrl) || [];
    let status;
    if (matches.length === 0) {
      status = 'MISSING SOURCE';
    } else if (kind === 'unsupported') {
      status = 'UNSUPPORTED';
    } else if (matches.length > 1) {
      status = 'MANUAL REVIEW'; // more than one WXR attachment record claims this exact URL
    } else {
      status = 'READY';
    }

    if (!filenameGroups.has(filename)) filenameGroups.set(filename, []);
    filenameGroups.get(filename).push(normUrl);

    rows.push({
      sourceUrl: entry.rawUrl,
      referencedBySlugs: [...entry.slugs].sort(),
      referenceCount: entry.count,
      wxrAttachmentMatch: matches.length > 0,
      wxrAttachmentId: matches.length === 1 ? matches[0].postId : matches.map((m) => m.postId),
      wxrAttachmentUrl: matches.length === 1 ? matches[0].url : matches.map((m) => m.url),
      filename,
      extension: ext,
      expectedMediaKind: kind,
      proposedStorageKey: proposeStorageKey(entry.rawUrl, filename),
      migrationStatus: status,
    });
  }

  // Flag duplicate-filename candidates (e.g. WordPress responsive-size
  // variants like image.jpg / image-1024x576.jpg) — reported, never merged
  // or assumed identical.
  const duplicateCandidates = [...filenameGroups.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([filename, urls]) => ({ filename, count: urls.length, urls }));

  // Also flag same-stem-different-size variants (common WordPress pattern:
  // foo-1024x576.jpg vs foo.jpg vs foo-150x150.jpg) by stripping a trailing
  // WxH suffix — a weaker, separately-reported signal, not merged into the
  // exact-filename duplicate list above.
  const stemGroups = new Map();
  for (const row of rows) {
    const stem = row.filename.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, '');
    if (!stemGroups.has(stem)) stemGroups.set(stem, []);
    stemGroups.get(stem).push(row.filename);
  }
  const sizeVariantCandidates = [...stemGroups.entries()]
    .filter(([stem, files]) => files.length > 1 && new Set(files).size > 1)
    .map(([stem, files]) => ({ stem, files: [...new Set(files)] }));

  rows.sort((a, b) => a.filename.localeCompare(b.filename));

  // ---- 4. Console summary ----
  const byStatus = {};
  for (const r of rows) byStatus[r.migrationStatus] = (byStatus[r.migrationStatus] || 0) + 1;
  console.log('\n--- Migration status breakdown ---');
  console.log(JSON.stringify(byStatus, null, 2));
  console.log('\n--- Exact-filename duplicate candidates (different source URL, same filename) ---');
  console.log(duplicateCandidates.length ? JSON.stringify(duplicateCandidates, null, 2) : '(none)');
  console.log('\n--- WordPress responsive-size-variant candidates (same stem, different size suffix) ---');
  console.log(sizeVariantCandidates.length ? JSON.stringify(sizeVariantCandidates, null, 2) : '(none)');

  const output = {
    generatedAt: new Date().toISOString(),
    totalUniqueUrls: rows.length,
    byStatus,
    duplicateFilenameCandidates: duplicateCandidates,
    sizeVariantCandidates,
    rows,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n[OK] Wrote ${OUT_PATH}`);
  console.log('\nThis was a read-only dry-run. No file was downloaded, no S3 call was made, no MongoDB write occurred.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nUNEXPECTED ERROR:', err);
  process.exitCode = 1;
});
