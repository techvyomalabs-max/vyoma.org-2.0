// Shared with every section that links out to a YouTube video rather than
// embedding a player (Gallery videos, and now testimonial videos) — a single
// source of truth for the ID-extraction regex so the two never drift.
// Extracts the 11-char YouTube video ID from either a youtu.be/ID or
// youtube.com/watch?v=ID URL — enough to build a thumbnail with no new
// dependency or embed player.
export function extractYouTubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
