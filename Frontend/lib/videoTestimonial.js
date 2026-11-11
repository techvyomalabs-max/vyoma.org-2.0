import { extractYouTubeId } from './youtube.js';

// Manual-testing bug fix (video testimonials not playing): kept as a plain,
// JSX-free module (not inline in TestimonialCard.jsx) specifically so this
// logic is directly importable and unit-testable with `node --test` — Node
// refuses to load a bare `.jsx` file at all (confirmed directly: "Unknown
// file extension .jsx"), which is why this project's existing React
// component tests fall back to static source-text assertions instead (see
// Header.a11y.test.mjs). Pulling the one genuinely logical decision out into
// its own pure function avoids needing that weaker fallback for it.
//
// Decides whether a "video" testimonial has anything real to link to, and
// whether a real YouTube thumbnail can be shown for it. Never invents a
// URL: an item with no `url` at all (true today for the two seeded video
// testimonials — see Backend/scripts/seedData/media.js) simply has no
// playable video, and the caller must not render a functional-looking play
// button for it.
export function resolveVideoTestimonialMedia(item) {
  const hasPlayableVideo = Boolean(item?.url);
  const videoId = hasPlayableVideo ? extractYouTubeId(item.url) : null;
  const thumbnail = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  return { hasPlayableVideo, thumbnail };
}
