// Task 7D.30 — a Content document's `data` blob is free-form JSON
// (Backend/src/modules/content/content.model.js stores it as
// Schema.Types.Mixed), so a field a page expects can be absent, null, or
// malformed on any given document: a stale seed that predates the field
// (exactly what left PATRON_CATEGORIES undefined for a database bootstrapped
// from Backend/scripts/seedData/about.js, crashing /about/patrons with
// "Cannot read properties of undefined (reading 'filter')"), an admin edit
// gone wrong, or a content type whose contract grew a new field after the
// document was last saved.
//
// Every public page that destructures one of these fields and immediately
// calls `.filter()`/`.map()` on it should route it through one of these two
// helpers first, so a missing/malformed field degrades that section to
// empty instead of crashing the whole page.
export function toContentArray(value) {
  return Array.isArray(value) ? value : [];
}

// Same tolerance as toContentArray(), plus the `active !== false` convention
// shared by every admin-editable list in this CMS (an item is visible unless
// explicitly marked inactive). Uses optional chaining on each item so one
// malformed (null/non-object) entry in an otherwise-valid array is skipped
// rather than throwing.
export function toActiveContentArray(value) {
  return toContentArray(value).filter((item) => item != null && item.active !== false);
}
