import sanitizeHtml from 'sanitize-html';

// Batch 2 (Privacy/Terms migration): a dedicated sanitizer for long-form
// legal-document bodies, separate from blog's sanitizeBody.js — deliberately
// not shared, since the two documents' real WordPress source content uses
// tags (h1, u) that blog's allowlist intentionally excludes, and loosening
// the blog sanitizer to accommodate legal content would widen what a blog
// post can contain too. Allowlist matches exactly what the real Privacy/
// Terms source uses (verified against the WXR export), so migrated content
// round-trips through this sanitizer unchanged; nothing wider is needed and
// nothing narrower would fit the source.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'p', 'ol', 'ul', 'li', 'strong', 'b', 'em', 'i', 'u', 'a', 'br', 'blockquote'];

// Links keep whatever target/rel the source actually had — this sanitizer
// does not force every link to open in a new tab (unlike blog's, which
// does). The only enforcement is the tabnabbing guard: WHEN a link already
// targets "_blank" (from the source or a future admin edit), its rel is
// widened to include noopener/noreferrer if not already present — existing
// rel values (e.g. "nofollow") are kept, not overwritten. A link with no
// target, or target="_self", is left exactly as-is.
function preserveLinkTarget(tagName, attribs) {
  const next = { ...attribs };
  if (next.target === '_blank') {
    const relTokens = new Set((next.rel || '').split(/\s+/).filter(Boolean));
    relTokens.add('noopener');
    relTokens.add('noreferrer');
    next.rel = [...relTokens].join(' ');
  }
  return { tagName, attribs: next };
}

export function sanitizeLegalBody(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // ol.start carries the source's actual section numbering (each numbered
    // section is its own single-item <ol start="N">, not literal "N." text)
    // — without it, every section silently renders as "1." Found via a
    // post-commit read-only check, not caught before the first commit.
    allowedAttributes: { a: ['href', 'rel', 'target'], ol: ['start'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: preserveLinkTarget },
  });
}
