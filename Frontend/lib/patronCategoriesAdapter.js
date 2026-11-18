// Task 7D.31 — temporary, read-only compatibility adapter.
//
// The Render test backend's live `pages/about` document still has the
// pre-unification PATRON_TIERS + PATRON_TIER_ROWS shape (it was seeded
// before Backend/scripts/seedData/about.js was corrected to export
// PATRON_CATEGORIES, and runSeed()'s $setOnInsert-only upsert never touches
// an already-existing document -- see Backend/scripts/wordpress/import/
// patron-categories-unify-migration.mjs, the real, reviewed, in-place
// migration for this, which has not yet been run against that database).
// Frontend/app/(public)/about/patrons/page.js only reads PATRON_CATEGORIES,
// so until that migration runs, the live API response alone leaves the
// Patron tiers section empty.
//
// This adapter bridges that gap ENTIRELY IN MEMORY, on the Frontend's own
// copy of an already-fetched response -- it never modifies the request, the
// API response on the wire, or any database. Mirrors the migration script's
// own transform exactly (same hasProductField rule, same per-category
// shape) so the two never disagree, and is meant to be removed once that
// migration has actually been run against every environment that still has
// the legacy shape.
const PRODUCT_FIELD_TIERS = new Set(['Prayojakas']);

export function withPatronCategoriesCompat(data) {
  if (!data || typeof data !== 'object') return data;

  // A real PATRON_CATEGORIES value already exists (even an empty array, if
  // an admin deliberately removed every category) -- never overwrite it.
  if ('PATRON_CATEGORIES' in data) return data;

  const tiers = data.PATRON_TIERS;
  const rows = data.PATRON_TIER_ROWS;
  // No legacy shape to convert from either (e.g. a document with neither
  // field at all) -- nothing this adapter can safely do, so it leaves the
  // data untouched rather than inventing an empty PATRON_CATEGORIES.
  if (!Array.isArray(tiers) || typeof rows !== 'object' || rows === null) return data;

  const PATRON_CATEGORIES = tiers.map((tier) => ({
    sanskrit: tier?.sanskrit,
    meaning: tier?.meaning,
    note: tier?.note,
    hasProductField: PRODUCT_FIELD_TIERS.has(tier?.sanskrit),
    active: tier?.active,
    rows: Array.isArray(rows[tier?.sanskrit]) ? rows[tier.sanskrit] : [],
  }));

  // Purely additive: every other field (GOLDEN_WALL, PATRON_TESTIMONIALS,
  // the legacy PATRON_TIERS/PATRON_TIER_ROWS themselves, BOARD, etc.) is
  // carried over exactly as received -- nothing is removed or altered.
  return { ...data, PATRON_CATEGORIES };
}
