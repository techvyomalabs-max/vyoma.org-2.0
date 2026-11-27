// Task 7D.34 (Phase 2D) — read-only Atlas testing-database preflight for the
// Patrons/Leadership/Awards restoration (patrons-migration.mjs,
// patron-categories-unify-migration.mjs, leadership-awards-images-migration.mjs).
//
// This script NEVER writes anything -- no ContentModel.updateOne()/create()/
// deleteMany(), no ContentRevisionModel.create(), no backup file, no
// recordMigrationRevision() call. It exists purely to answer, before anyone
// runs any of the three scripts with --commit: is this really the intended
// database, and is it in the shape those scripts expect?
//
// Database targeting: reuses migrationTargetGuard.mjs's
// connectToExplicitMigrationTarget() unchanged -- the exact same
// MIGRATION_TARGET_MONGODB_URI + MIGRATION_TARGET_CONFIRM + exact-name
// allowlist + post-connection identity re-verification the write-capable
// migration scripts use. Never reads env.mongodbUri, never calls
// connectDb(), never falls back to Backend/.env or any ambient value.
//
// Privacy: never logs a connection string or credential (same convention as
// every other script here -- only the resolved database NAME is printed).
// Also never logs actual Patron row content (names/places/products) or
// actual staff/award names -- only counts and structural facts (tier/
// category names like "Prayojakas" are a fixed taxonomy label, not personal
// data, and are the only "names" this script ever prints).
import { disconnectDb } from '../../../src/config/db.js';
import { connectToExplicitMigrationTarget } from './migrationTargetGuard.mjs';
import { pathToFileURL } from 'node:url';
import { ContentModel } from '../../../src/modules/content/content.model.js';
import { ContentRevisionModel } from '../../../src/modules/content/contentRevision.model.js';

const ABOUT_TYPE = 'pages/about';
const CREDIBILITY_TYPE = 'pages/credibility';
const EXPECTED_TIER_ORDER = ['Prayojakas', 'Rakshakas', 'Samrakshakas', 'Poshakas', 'Mahaposhakas', 'Paripalakas'];

function countImages(list) {
  if (!Array.isArray(list)) return { total: 0, withImage: 0, withoutImage: 0 };
  const withImage = list.filter((p) => p?.image != null).length;
  return { total: list.length, withImage, withoutImage: list.length - withImage };
}

export async function main() {
  console.log('='.repeat(72));
  console.log('Atlas testing-database preflight -- READ-ONLY (no writes of any kind)');
  console.log('='.repeat(72));

  const dbName = await connectToExplicitMigrationTarget();
  try {
    // --- 1. Database identity -------------------------------------------
    console.log('\n--- 1. Database identity ---');
    console.log('Connected database name (verified against the MongoDB client\'s own actual connection, not just the configured URI text):', dbName);
    console.log('(Connection string, host, and credentials are never printed by this or any script in this project.)');

    // --- 2. Total CMS content documents and content types ----------------
    console.log('\n--- 2. CMS content overview ---');
    const totalContentDocs = await ContentModel.countDocuments({});
    const contentTypes = await ContentModel.distinct('type');
    console.log(`Total Content documents: ${totalContentDocs}`);
    console.log(`Content types present (${contentTypes.length}):`, contentTypes.sort().join(', '));

    // --- 3 & 4. pages/about Patron data structure, counts, ordering -------
    console.log('\n--- 3/4. Patrons data (pages/about) ---');
    const aboutDoc = await ContentModel.findOne({ type: ABOUT_TYPE }).lean();
    const prerequisites = {};
    if (!aboutDoc) {
      console.log(`No "${ABOUT_TYPE}" document found.`);
      prerequisites.patronsMigration = false;
      prerequisites.patronCategoriesUnify = false;
    } else {
      const hasLegacyTiers = Array.isArray(aboutDoc.data?.PATRON_TIERS);
      // Boolean(...), not a bare `&&` chain -- `x && typeof x === 'object'`
      // evaluates to `undefined` (not `false`) when x itself is undefined,
      // which would otherwise poison prerequisites.patronsMigration below
      // (`true && undefined` is `undefined`, not the intended `false`).
      const hasLegacyRows = Boolean(aboutDoc.data?.PATRON_TIER_ROWS && typeof aboutDoc.data.PATRON_TIER_ROWS === 'object');
      const hasUnifiedCategories = Array.isArray(aboutDoc.data?.PATRON_CATEGORIES);
      const hasFabricatedTestimonials = aboutDoc.data?.PATRON_TESTIMONIALS !== undefined;
      const hasRealGallery = Array.isArray(aboutDoc.data?.PATRON_TESTIMONIAL_GALLERY);
      const hasRealPartners = Array.isArray(aboutDoc.data?.PATRON_MATCHING_PARTNERS);

      console.log('Shape currently present:');
      console.log(`  Legacy PATRON_TIERS (array):`, hasLegacyTiers);
      console.log(`  Legacy PATRON_TIER_ROWS (object):`, hasLegacyRows);
      console.log(`  Unified PATRON_CATEGORIES (array):`, hasUnifiedCategories);
      console.log(`  Fabricated placeholder PATRON_TESTIMONIALS still present:`, hasFabricatedTestimonials);
      console.log(`  Real PATRON_TESTIMONIAL_GALLERY present:`, hasRealGallery);
      console.log(`  Real PATRON_MATCHING_PARTNERS present:`, hasRealPartners);

      // Counts and ordering only -- never the actual row content (no names,
      // places, or products are ever read into a variable that gets logged).
      if (hasLegacyRows) {
        const rows = aboutDoc.data.PATRON_TIER_ROWS;
        const orderedKeys = Object.keys(rows);
        const counts = Object.fromEntries(orderedKeys.map((k) => [k, Array.isArray(rows[k]) ? rows[k].length : 0]));
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        console.log(`  PATRON_TIER_ROWS per-tier row counts:`, JSON.stringify(counts));
        console.log(`  PATRON_TIER_ROWS total rows: ${total}`);
        console.log(`  PATRON_TIER_ROWS key order matches expected canonical order (${EXPECTED_TIER_ORDER.join(', ')}):`, JSON.stringify(orderedKeys) === JSON.stringify(orderedKeys.slice().sort((a, b) => EXPECTED_TIER_ORDER.indexOf(a) - EXPECTED_TIER_ORDER.indexOf(b))) && orderedKeys.length === EXPECTED_TIER_ORDER.length && EXPECTED_TIER_ORDER.every((t) => orderedKeys.includes(t)));
      }
      if (hasUnifiedCategories) {
        const cats = aboutDoc.data.PATRON_CATEGORIES;
        const names = cats.map((c) => c?.sanskrit);
        const counts = Object.fromEntries(cats.map((c) => [c?.sanskrit, Array.isArray(c?.rows) ? c.rows.length : 0]));
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        console.log(`  PATRON_CATEGORIES order:`, JSON.stringify(names));
        console.log(`  PATRON_CATEGORIES per-category row counts:`, JSON.stringify(counts));
        console.log(`  PATRON_CATEGORIES total rows: ${total}`);
        console.log(`  PATRON_CATEGORIES order matches expected canonical order:`, JSON.stringify(names) === JSON.stringify(EXPECTED_TIER_ORDER));
      }
      if (hasRealGallery) console.log(`  PATRON_TESTIMONIAL_GALLERY count: ${aboutDoc.data.PATRON_TESTIMONIAL_GALLERY.length}`);
      if (hasRealPartners) console.log(`  PATRON_MATCHING_PARTNERS count: ${aboutDoc.data.PATRON_MATCHING_PARTNERS.length}`);

      // --- Prerequisites (lightweight check only -- each script still
      // performs its own full, authoritative validation before writing) ---
      prerequisites.patronsMigration = !aboutDoc.draftData && hasLegacyRows;
      prerequisites.patronCategoriesUnify = !aboutDoc.draftData && hasLegacyTiers && hasLegacyRows && !hasUnifiedCategories;

      // --- 8. Existing content that could be overwritten/removed ---------
      console.log('\n--- 8. What a --commit run would overwrite or remove on pages/about ---');
      if (hasLegacyRows) {
        const total = Object.values(aboutDoc.data.PATRON_TIER_ROWS).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0);
        console.log(`  patrons-migration.mjs would REPLACE the current ${total} PATRON_TIER_ROWS row(s) with the full real dataset.`);
      }
      if (hasFabricatedTestimonials) console.log('  patrons-migration.mjs would REMOVE the fabricated placeholder PATRON_TESTIMONIALS.');
      if (hasLegacyTiers || hasLegacyRows) console.log('  patron-categories-unify-migration.mjs would REMOVE PATRON_TIERS and PATRON_TIER_ROWS after merging them into PATRON_CATEGORIES.');

      // --- 5. Leadership/Core Team image-field counts (counts only) ------
      console.log('\n--- 5. Leadership/Core Team image fields (pages/about) ---');
      const boardStats = countImages(aboutDoc.data?.BOARD);
      const advisorStats = countImages(aboutDoc.data?.ADVISORS);
      const committeeStats = countImages(aboutDoc.data?.COMMITTEE);
      const coreTeamFlat = Array.isArray(aboutDoc.data?.CORE_TEAMS) ? aboutDoc.data.CORE_TEAMS.flatMap((g) => g?.people || []) : [];
      const coreTeamStats = countImages(coreTeamFlat);
      for (const [label, stats] of [['BOARD', boardStats], ['ADVISORS', advisorStats], ['COMMITTEE', committeeStats], ['CORE_TEAMS (flattened)', coreTeamStats]]) {
        console.log(`  ${label}: ${stats.total} total, ${stats.withImage} with an image, ${stats.withoutImage} without.`);
        if (stats.withImage > 0) console.log(`  patrons/leadership-awards migration would overwrite ${label}'s ${stats.withImage} already-set image(s) if they differ from the approved data.`);
      }
    }

    // --- 5 (continued). Awards image-field counts (pages/credibility) ----
    console.log('\n--- 5 (continued). Awards image fields (pages/credibility) ---');
    const credDoc = await ContentModel.findOne({ type: CREDIBILITY_TYPE }).lean();
    if (!credDoc) {
      console.log(`No "${CREDIBILITY_TYPE}" document found.`);
      prerequisites.leadershipAwardsImages = false;
    } else {
      const awardsStats = countImages(credDoc.data?.AWARDS_ITEMS);
      console.log(`  AWARDS_ITEMS: ${awardsStats.total} total, ${awardsStats.withImage} with an image, ${awardsStats.withoutImage} without.`);
      prerequisites.leadershipAwardsImages = Boolean(aboutDoc) && !aboutDoc.draftData && !credDoc.draftData;
    }

    // --- 6. Existing drafts and CMS revision counts -----------------------
    console.log('\n--- 6. Drafts and revision history ---');
    const draftDocs = await ContentModel.find({ draftData: { $ne: null } }, { type: 1 }).lean();
    console.log(`Content types with a pending (unpublished) draft (${draftDocs.length}):`, draftDocs.map((d) => d.type).join(', ') || '(none)');

    const revisionCountsByType = await ContentRevisionModel.aggregate([{ $group: { _id: '$contentType', count: { $sum: 1 } } }]);
    console.log('Revision counts by content type:', JSON.stringify(Object.fromEntries(revisionCountsByType.map((r) => [r._id, r.count]))));
    const atLimit = revisionCountsByType.filter((r) => r.count >= 20);
    if (atLimit.length) {
      console.log(
        `  NOTE: ${atLimit.map((r) => r._id).join(', ')} already at or above the 20-revision retention limit -- a migration's own new revision will prune the single oldest existing one for that type (pre-existing, by-design behavior, not introduced by this migration).`
      );
    }

    // --- 7. Prerequisites summary ------------------------------------------
    console.log('\n--- 7. Migration prerequisites summary (lightweight -- each script still re-validates everything itself before any write) ---');
    console.log('  patrons-migration.mjs ready:', prerequisites.patronsMigration);
    console.log('  patron-categories-unify-migration.mjs ready:', prerequisites.patronCategoriesUnify);
    console.log('  leadership-awards-images-migration.mjs ready:', prerequisites.leadershipAwardsImages);

    console.log('\n--- Preflight complete. No data was written, created, updated, deleted, or seeded. ---');
    return { dbName, totalContentDocs, contentTypes, prerequisites };
  } finally {
    await disconnectDb();
  }
}

const isDirectCliInvocation = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectCliInvocation) {
  main().catch((err) => {
    console.error('\nUNEXPECTED ERROR:', err);
    process.exitCode = 1;
  });
}
