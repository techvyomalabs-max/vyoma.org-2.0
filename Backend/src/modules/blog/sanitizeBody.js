import sanitizeHtml from 'sanitize-html';

// Phase E Decision D-BLOG1: a basic rich-text editor (Tiptap StarterKit +
// Link only — headings/paragraphs/bold/italic/links/lists, no images, no
// embeds, no scripts). This allowlist is the server-side enforcement of
// that boundary — never trust the client, even though the editor itself
// already restricts what it can produce. Every link gets a forced
// rel/target regardless of what the client sent, closing the
// window.opener/tabnabbing gap a bare `target="_blank"` would leave open.
const ALLOWED_TAGS = ['p', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'a', 'ul', 'ol', 'li', 'br', 'blockquote'];

export function sanitizeBlogBody(html) {
  if (typeof html !== 'string') return '';
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }, true),
    },
  });
}
