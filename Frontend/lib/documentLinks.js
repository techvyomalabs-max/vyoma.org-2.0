// Shared helpers for any page that links out to an externally-hosted
// document (Credibility's DocBlocks, Newsletter's archive/latest issue).
//
// Some entries point at an online flipbook viewer (an external CDN
// `index.html` page) rather than an actual PDF file. Detected by file
// extension (the only reliable signal already present in the data, no new
// field needed): a URL ending in `.pdf` is a genuine PDF; anything else
// (flipbook viewers, any other non-PDF external link) is not, and must
// never be labeled "Download" — the HTML `download` attribute has no
// effect on it regardless, so doing so just reopens the same viewer,
// silently mislabeling it as a downloadable document.
import { resolveApiBase } from './apiConfig.js';
export function isPdfUrl(url) {
  return /\.pdf($|\?)/i.test(url || '');
}

// Even for a genuine PDF, `download` is silently ignored by every browser
// when the href is cross-origin (every document here is hosted on
// vyoma.org or a CDN, never this site's own origin) — a plain `<a download>`
// just reopens the PDF in a new tab, identical to "View". Routing through
// the backend's download-proxy (Backend/src/modules/documents) makes it
// fetch the file server-side and stream it back with a real
// Content-Disposition: attachment header, which is the only way to force a
// save-as download of a cross-origin file.
// Task 7L: uses the same resolveApiBase() every other caller uses
// (lib/apiConfig.js) instead of its own independent copy of the
// `process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'` fallback -- in
// production, a missing configuration now throws a clear error instead of
// silently building a download link against the wrong origin.
export function downloadUrlFor(url) {
  const apiBase = resolveApiBase();
  return `${apiBase}/public/documents/download?url=${encodeURIComponent(url)}`;
}
