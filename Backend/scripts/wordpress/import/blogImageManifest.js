// Task 7F.2 — shared, read-only helpers for the staged WordPress blog image
// manifest (Backend/.local-media/blog-image-manifest.json) and its backing
// files (Backend/.local-media/blog/). Both are gitignored (see
// Backend/.gitignore) and may be absent in a fresh checkout or CI — every
// function here is written to degrade gracefully (return null / empty) on
// absence rather than throw, EXCEPT when the manifest file exists but is
// malformed, which is always a real failure (see loadBlogImageManifest()).
//
// This module performs no network access, no database access, and never
// reads environment credentials — it only ever reads two local,
// already-committed-elsewhere-reviewed artifacts: the manifest JSON and the
// image files it names. The path-safety helpers below are the single
// source of truth used by both batch1-import.mjs (production code) and its
// regression tests (Task 7F.1's blogImageManifest.integrity.test.js),
// deliberately factored out here so neither ever drifts from the other.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BLOG_MEDIA_DIR = path.resolve(__dirname, '../../../.local-media/blog');
export const MANIFEST_PATH = path.resolve(__dirname, '../../../.local-media/blog-image-manifest.json');

// Hosts the existing, unmodified sanitizer (Backend/src/modules/blog/
// sanitizeBody.js's IMAGE_ALLOWED_HOSTS) already accepts UNCONDITIONALLY —
// not gated by NODE_ENV, unlike its separate isLocalDevHost branch. An
// image whose original URL already resolves to one of these hosts needs no
// mapping or rewriting at all: it already survives sanitization, and
// already works, in every environment including production, with no S3
// and no dev-preview flag. This is a deliberately duplicated literal (not
// an import of a private constant from sanitizeBody.js, which exports no
// such list) — this module only ever needs to know whether a REWRITE is
// required at all; sanitizeBody.js's own allowlist remains the single,
// unmodified source of truth for what the sanitizer ultimately permits.
const ALREADY_SAFE_IMAGE_HOSTS = new Set(['vyoma.org', 'www.vyoma.org']);

export function isAlreadySafeImageHost(url) {
  try {
    return ALREADY_SAFE_IMAGE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

// --- Path-safety helpers (shared with Task 7F.1's regression tests) --------
// Defense against path traversal: a manifest entry's localFilename must be
// a bare filename (no directory separators, no "..", identical to its own
// path.basename()) before it is ever joined with BLOG_MEDIA_DIR, and the
// final resolved absolute path must still live inside BLOG_MEDIA_DIR.
export function isSafeLocalFilename(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.includes('..')) return false;
  if (name !== path.basename(name)) return false;
  return true;
}

export function resolveWithinBlogMediaDir(filename) {
  if (!isSafeLocalFilename(filename)) return null;
  const resolved = path.resolve(BLOG_MEDIA_DIR, filename);
  const dirWithSep = BLOG_MEDIA_DIR + path.sep;
  if (resolved !== BLOG_MEDIA_DIR && !resolved.startsWith(dirWithSep)) return null;
  return resolved;
}

// Returns null (not an error) when the manifest file is simply absent —
// that's the expected, gitignored-asset state in CI/a fresh checkout.
// Throws if the file exists but is not valid JSON, or lacks the expected
// `rows` array shape: a malformed manifest is a real problem to surface
// loudly, never to silently treat the same as "no manifest at all".
export function loadBlogImageManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);
  if (!manifest || !Array.isArray(manifest.rows)) {
    throw new Error(`Blog image manifest at ${MANIFEST_PATH} is malformed: expected an object with a "rows" array.`);
  }
  return manifest;
}

// Builds two lookup structures from a loaded manifest:
//   inlineMap:          Map<"postSlug|originalUrl", row>  — for rewriting a
//                        specific inline <img src> occurrence.
//   featuredByPostSlug: Map<postSlug, row>                — for resolving a
//                        post's single "featured"-type row, if any.
// A manifest with more than one "featured" row for the same postSlug is
// treated as ambiguous and ignored for that slug (ladder of caution: never
// guess which one is authoritative) — this has not occurred in the real,
// reviewed manifest (Task 7F.1 confirmed every postSlug has at most one
// featured row), but is handled explicitly rather than silently picking
// the first or last match.
export function buildImageUrlMap(manifest) {
  const inlineMap = new Map();
  const featuredByPostSlug = new Map();
  const ambiguousFeaturedSlugs = new Set();

  if (!manifest) return { inlineMap, featuredByPostSlug, ambiguousFeaturedSlugs };

  for (const row of manifest.rows) {
    if (row.type === 'inline') {
      inlineMap.set(`${row.postSlug}|${row.originalUrl}`, row);
    } else if (row.type === 'featured') {
      if (featuredByPostSlug.has(row.postSlug)) {
        ambiguousFeaturedSlugs.add(row.postSlug);
      } else {
        featuredByPostSlug.set(row.postSlug, row);
      }
    }
  }
  for (const slug of ambiguousFeaturedSlugs) featuredByPostSlug.delete(slug);

  return { inlineMap, featuredByPostSlug, ambiguousFeaturedSlugs };
}

// Resolves a manifest row to the local-media dev-preview URL. Returns null
// (never throws) if the row's filename is unsafe — the caller treats a
// null return as "no safe mapping available", identical to a missing row.
export function resolveLocalMediaUrl(row, devImagePreviewPort) {
  if (!row) return null;
  const resolved = resolveWithinBlogMediaDir(row.localFilename);
  if (!resolved) return null;
  return `http://localhost:${devImagePreviewPort}/local-media/blog/${row.localFilename}`;
}
