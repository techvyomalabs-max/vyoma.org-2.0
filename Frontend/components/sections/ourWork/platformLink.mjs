// A platform/programme CMS entry (CW_PLATFORMS / CW_PROGRAMMES) uses
// `u: '#'` as an explicit "no verified link yet" placeholder -- see
// Backend/scripts/seedData/ourWork.js's "Sandhi App" entry, whose real
// Google Play URL was never on file. This is the one place that decides
// whether a given `u` value is safe to render as a clickable link, so every
// call site in CurrentWorkStage.jsx (the orbital hub's node click, its
// hover/focus detail panel, and the mobile fallback list) treats a
// placeholder identically instead of each reimplementing its own check --
// and a future placeholder convention (empty string, null) is handled
// everywhere at once.
export function hasRealLink(u) {
  return typeof u === 'string' && u.trim() !== '' && u.trim() !== '#';
}
