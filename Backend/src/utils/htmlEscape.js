const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// Escapes text for safe interpolation into HTML (e.g. an email body built
// from user-submitted values). A single combined regex/replace pass, so an
// `&` introduced by escaping `<`/`>`/etc. is never re-escaped on a later
// pass -- each matched character maps independently, once.
export function escapeHtml(input) {
  return String(input).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}
