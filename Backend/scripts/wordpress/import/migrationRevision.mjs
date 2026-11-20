// Task 7D.33 — Phase 2B revision-history hardening for the Patrons/
// Leadership/Awards restoration migration scripts.
//
// Phase 2A's finding: patrons-migration.mjs, patron-categories-unify-
// migration.mjs, and leadership-awards-images-migration.mjs all write
// directly via ContentModel.updateOne(), bypassing the Admin CMS's own
// publishContent()/restoreRevision() controller actions entirely -- the
// ONLY place a new ContentRevisionModel row is normally created (see
// contentRevision.model.js and content.admin.controller.js). Left as-is,
// an operator later using the Admin CMS's "Restore" feature could pick a
// revision from BEFORE a migration ran and silently revert pages/about or
// pages/credibility back to placeholder/null-image content, with the
// revision log giving no indication the migration had ever happened.
//
// recordMigrationRevision() closes that gap: it mirrors publishContent()'s
// exact pattern (version = last + 1, a full `data` snapshot, bounded
// retention via the SAME pruneOldRevisions() the admin controller uses) but
// as its own distinct `action: 'migration'` value (contentRevision.model.js's
// enum extended to allow it, Task 7D.33), so a migration-sourced entry is
// always clearly distinguishable from a human admin's 'publish'/'restore'.
//
// Never touches the Content document's draftData or status -- this function
// never reads or writes ContentModel at all, only the separate
// ContentRevisionModel collection, and is called by each script only AFTER
// its own ContentModel write has already succeeded and been independently
// re-verified. pruneOldRevisions() only ever deletes the OLDEST rows once a
// genuinely NEW row has pushed a type over its retention limit -- it never
// modifies or deletes any existing revision's own content, exactly as it
// already behaves for a normal admin publish.
import { ContentRevisionModel } from '../../../src/modules/content/contentRevision.model.js';
import { pruneOldRevisions } from '../../../src/modules/content/content.admin.controller.js';

export async function recordMigrationRevision({ contentType, data, scriptName, details = {} }) {
  const lastRevision = await ContentRevisionModel.findOne({ contentType }).sort({ version: -1 }).lean();
  const nextVersion = (lastRevision?.version || 0) + 1;

  await ContentRevisionModel.create({
    contentType,
    version: nextVersion,
    data,
    action: 'migration',
    publishedBy: null,
    publishedByEmail: null,
    details: { source: 'migration-script', scriptName, ...details },
  });
  await pruneOldRevisions(contentType);

  return nextVersion;
}
